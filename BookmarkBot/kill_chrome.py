import subprocess
import re

out = subprocess.check_output('wmic process where name="chrome.exe" get processid,commandline', shell=True).decode('utf-8', errors='ignore')

pids = []
for line in out.splitlines():
    if 'BookmarkBot' in line or 'worker_' in line:
        parts = line.strip().split()
        if parts:
            pids.append(parts[-1])

for pid in pids:
    print(f"Killing process {pid}")
    subprocess.call(['taskkill', '/F', '/PID', pid])
