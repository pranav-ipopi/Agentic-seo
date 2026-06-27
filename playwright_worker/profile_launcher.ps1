param(
    [int]$Profile = 1
)

$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"

$ProfileName = "profile_{0:D3}" -f $Profile

$ProfilePath = "C:\Users\HP\Documents\Agentic_SEO\playwright_worker\chrome_profiles\$ProfileName"

Start-Process $Chrome -ArgumentList "--user-data-dir=$ProfilePath"