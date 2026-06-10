$process = New-Object System.Diagnostics.Process
$process.StartInfo.FileName = "plink.exe"
$process.StartInfo.Arguments = "-i contabo_vps.ppk root@13.140.131.128 `"echo SSH_SUCCESS && ls -la`""
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.RedirectStandardInput = $true
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true
$process.StartInfo.CreateNoWindow = $true

$process.Start() | Out-Null
Start-Sleep -Seconds 2

# Send y for the host key caching prompt
$process.StandardInput.WriteLine("y")
Start-Sleep -Seconds 1

# Send the passphrase
$process.StandardInput.WriteLine("Ipopi@123")

$process.WaitForExit(10000) | Out-Null

$output = $process.StandardOutput.ReadToEnd()
$error = $process.StandardError.ReadToEnd()

Write-Output "STDOUT:"
Write-Output $output
Write-Output "STDERR:"
Write-Output $error
