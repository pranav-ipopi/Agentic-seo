$src = "$env:LOCALAPPDATA\Google\Chrome\User Data"
$base_dst = "C:\Users\HP\Documents\Agentic_SEO\chrome_profiles"

Write-Host "Starting to clone 5 profiles from your real Chrome..."
Write-Host "IMPORTANT: Please make sure ALL your normal Google Chrome windows are CLOSED for the best copy result, although the script will skip locked files if it has to."
Write-Host ""

for ($i = 1; $i -le 5; $i++) {
    $dst = "$base_dst\profile_$i"
    Write-Host "Cloning profile $i to $dst ..."
    
    # Copy profile, skipping huge cache folders to speed it up and save disk space
    robocopy "$src" "$dst" /E /XD "ShaderCache" "Code Cache" "Cache" "blob_storage" /R:0 /W:0 | Out-Null
    
    # Remove Chrome's lock files so the cloned profiles don't think they are already running
    $locks = @("SingletonLock", "SingletonCookie", "SingletonSocket")
    foreach ($lock in $locks) {
        $lockPath = "$dst\$lock"
        if (Test-Path $lockPath) {
            Remove-Item $lockPath -Force
        }
    }
    Write-Host "Profile $i created successfully!"
    Write-Host "---------------------------------"
}

Write-Host "All 5 profiles have been created successfully in $base_dst!"
