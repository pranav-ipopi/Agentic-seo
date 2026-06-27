# ==========================
# Chrome Profile Generator
# ==========================

# Chrome executable
$Chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"

if (!(Test-Path $Chrome)) {
    $Chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

if (!(Test-Path $Chrome)) {
    Write-Host "Chrome not found!"
    exit
}

# Where all profiles will be stored
$BaseDir = "C:\Users\HP\Documents\Agentic_SEO\chrome_profiles"

# Number of profiles
$TotalProfiles = 20

# Create directory
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

Write-Host ""
Write-Host "Creating $TotalProfiles Chrome profiles..."
Write-Host ""

for ($i = 1; $i -le $TotalProfiles; $i++) {

    $ProfileName = "profile_{0:D3}" -f $i
    $ProfilePath = Join-Path $BaseDir $ProfileName

    Write-Host "Creating $ProfileName"

    # Launch Chrome once
    $process = Start-Process `
        -FilePath $Chrome `
        -ArgumentList @(
            "--user-data-dir=$ProfilePath",
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank"
        ) `
        -PassThru

    # Wait for initialization
    Start-Sleep -Seconds 5

    # Close Chrome gracefully
    if (!$process.HasExited) {
        $process.CloseMainWindow() | Out-Null
        Start-Sleep 2

        if (!$process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }

    Write-Host "✓ Created $ProfileName"
}

Write-Host ""
Write-Host "==================================="
Write-Host "Finished creating $TotalProfiles profiles."
Write-Host "Location:"
Write-Host $BaseDir
Write-Host "==================================="
