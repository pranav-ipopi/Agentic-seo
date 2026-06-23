# --- CONFIGURATION ---
# Replace the KeyPaths with the absolute paths to your newly converted .pem keys
$servers = @(
    @{
        Host = "root@13.140.131.128"
        KeyPath = "C:\Users\HP\Documents\contabo vps\vps1\vps1deployscript" # e.g., "C:\Users\HP\Documents\vps1-key.pem"
    },
    @{
        Host = "root@5.189.191.34"
        KeyPath = "C:\Users\HP\Documents\contabo vps\vps2\vps2deployscript" # e.g., "C:\Users\HP\Documents\vps2-key.pem"
    }
)

# The path to your worker folder on the VPS
$remote_path = "/root/playwright_worker"
# ---------------------

Write-Host "Packaging local files for deployment..." -ForegroundColor Cyan

# Remove old package if it exists
if (Test-Path "deploy.tar.gz") { Remove-Item "deploy.tar.gz" -Force }

# Use Windows native tar to zip the folder, excluding heavy and sensitive directories
tar.exe -czvf deploy.tar.gz `
    --exclude="venv" `
    --exclude=".env" `
    --exclude=".env copy" `
    --exclude=".git" `
    --exclude="__pycache__" `
    --exclude="logs" `
    --exclude="deploy.tar.gz" `
    --exclude="node_modules" `
    --exclude="article_worker.py" `
    --exclude="article_worker_env.example" `
    .

Write-Host "`nPackage created successfully!" -ForegroundColor Green

Write-Host "`nWhich server would you like to deploy to?" -ForegroundColor Yellow
Write-Host "1. VPS 1 (13.140.131.128)"
Write-Host "2. VPS 2 (5.189.191.34)"
Write-Host "3. Both Servers"
$choice = Read-Host "Enter 1, 2, or 3"

$serversToDeploy = @()
if ($choice -eq '1') {
    $serversToDeploy += $servers[0]
} elseif ($choice -eq '2') {
    $serversToDeploy += $servers[1]
} elseif ($choice -eq '3') {
    $serversToDeploy = $servers
} else {
    Write-Host "Invalid choice. Exiting deployment." -ForegroundColor Red
    Remove-Item "deploy.tar.gz" -Force
    exit
}

Write-Host "`nStarting deployment...`n" -ForegroundColor Green

foreach ($serverConfig in $serversToDeploy) {
    $server = $serverConfig.Host
    $keyPath = $serverConfig.KeyPath

    # Prepare SSH options for this specific server
    $ssh_opts = "-o StrictHostKeyChecking=no"
    if ($keyPath -ne "") {
        $ssh_opts += " -i `"$keyPath`""
    }

    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host " Deploying to $server" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan

    # 1. Upload the zip file to the server
    Write-Host "Uploading files to $server..."
    Invoke-Expression "scp $ssh_opts deploy.tar.gz `"$($server):/root/deploy.tar.gz`""

    # 2. Connect to the server, extract the files, install dependencies, and restart PM2
    Write-Host "Extracting files and restarting workers on $server..."
    
    # The ssh command runs a block of commands on the VPS automatically
    $ssh_commands = @"
mkdir -p $remote_path
cd $remote_path
tar --no-same-permissions -xzvf /root/deploy.tar.gz
rm /root/deploy.tar.gz
./venv/bin/pip install -r requirements.txt

# Safely Start or Restart the Backlink Worker
if pm2 show backlink-worker > /dev/null; then
    pm2 restart backlink-worker --update-env
else
    pm2 start vps_worker_playwright.py --name "backlink-worker" --interpreter venv/bin/python
fi

# Clean up Article Worker (not used yet)
if pm2 show article-worker > /dev/null; then
    pm2 delete article-worker
fi

pm2 save
"@

    Invoke-Expression "ssh $ssh_opts $server `"$ssh_commands`""

    Write-Host "Successfully deployed to $server!`n" -ForegroundColor Green
}

# Clean up local package
Remove-Item "deploy.tar.gz" -Force
Write-Host "ALL SERVERS UPDATED SUCCESSFULLY! 🎉" -ForegroundColor Green
