import subprocess
import time

def run_ssh():
    p = subprocess.Popen(
        ["plink.exe", "-i", "contabo_vps.ppk", "root@13.140.131.128", "echo SSH_SUCCESS && ls -la"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # Read output non-blocking or just wait a bit and write
    time.sleep(1)
    p.stdin.write("y\n")
    p.stdin.flush()
    time.sleep(1)
    p.stdin.write("Ipopi@123\n")
    p.stdin.flush()
    time.sleep(1)
    # in case it asks again because y was taken as password
    p.stdin.write("Ipopi@123\n")
    p.stdin.flush()
    
    try:
        stdout, stderr = p.communicate(timeout=10)
        print("STDOUT:", stdout)
        print("STDERR:", stderr)
    except subprocess.TimeoutExpired:
        p.kill()
        stdout, stderr = p.communicate()
        print("KILLED. STDOUT:", stdout)
        print("KILLED. STDERR:", stderr)

if __name__ == "__main__":
    run_ssh()
