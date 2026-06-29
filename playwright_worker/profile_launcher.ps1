param(
    [int]$Profile = 1
)

$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"

$ProfileName = "profile_{0:D3}" -f $Profile

# ADAPTIVE PATH: Automatically links to the chrome_profiles folder next to this script
$BaseDir = Join-Path $PSScriptRoot "chrome_profiles"
$ProfilePath = Join-Path $BaseDir $ProfileName

Start-Process $Chrome -ArgumentList "--user-data-dir=$ProfilePath"
