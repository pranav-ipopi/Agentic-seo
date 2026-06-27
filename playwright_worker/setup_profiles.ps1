$Chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
if (!(Test-Path $Chrome)) {
    $Chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}
if (!(Test-Path $Chrome)) {
    Write-Host "Chrome not found!"
    exit
}

$BaseDir = "C:\Users\HP\Documents\Agentic_SEO\playwright_worker\chrome_profiles"
$TotalProfiles = 20
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

Write-Host "Creating $TotalProfiles Chrome profiles..."

for ($i = 1; $i -le $TotalProfiles; $i++) {
    $ProfileName = "profile_{0:D3}" -f $i
    $ProfilePath = Join-Path $BaseDir $ProfileName
    Write-Host "Creating $ProfileName"

    $process = Start-Process -FilePath $Chrome -ArgumentList @("--user-data-dir=$ProfilePath", "--no-first-run", "--no-default-browser-check", "about:blank") -PassThru
    Start-Sleep -Seconds 5

    if (!$process.HasExited) {
        $process.CloseMainWindow() | Out-Null
        Start-Sleep 2
        if (!$process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }
    Write-Host "Done $ProfileName"
}

Write-Host "Finished!"
