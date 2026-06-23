# Playwright Worker Setup & Deployment Guide

This document outlines the architecture, setup process, and automated deployment pipeline for the `playwright_worker` backend.

## 1. Architecture Overview
Previously, the backend was split into two separate directories (`article_automation` and `backlink_automation`). We have consolidated the architecture:

- **Single Codebase:** Both workers now live inside the unified `playwright_worker` folder.
- **Shared Resources:** They share the same `services`, `configs`, `methods`, and `templates` directories.
- **Unified Environment:** A single `venv` and a merged `requirements.txt` manages dependencies for both workers.
- **PM2 Process Management:** Both workers (`backlink-worker` and `article-worker`) are managed in the background via PM2.

## 2. Local Setup
If you are setting this up on a new local Windows machine:
1. Open PowerShell and navigate to the folder:
   ```powershell
   cd playwright_worker
   ```
2. Create and activate the virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install requirements:
   ```powershell
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and fill in your secrets.
5. Start the workers via PM2 (using the windowless Python executable):
   ```powershell
   pm2 start vps_worker_playwright.py --name "backlink-worker" --interpreter venv\Scripts\pythonw.exe
   pm2 start article_worker.py --name "article-worker" --interpreter venv\Scripts\pythonw.exe
   ```

## 3. Automated VPS Deployment (`deploy.ps1`)
We created a "one-click" deployment script that pushes your local code to multiple VPS servers simultaneously.

**How it works:**
1. It zips your local codebase (automatically excluding `.git`, `venv`, and `.env` files).
2. It connects to your VPS servers using SSH and your specified `.pem` private keys.
3. It unzips the files (forcing secure Linux file permissions).
4. It installs any new dependencies via the server's `venv/bin/pip`.
5. It smartly checks if PM2 workers are running:
   - If they are running, it restarts them with `--update-env` to apply new `.env` variables.
   - If they aren't running, it starts them automatically using the `venv` interpreter.

**Usage:**
Just run `.\deploy.ps1` in your local PowerShell terminal. It will prompt you to select which server(s) to update.

---

## 4. How to Set Up a Brand New VPS (From Scratch)
When you rent a brand new VPS (like Ubuntu/Debian), it needs some basic software installed before it can run the workers or receive deployments.

SSH into your new VPS as `root` and run the following blocks:

### Step 1: Install Node.js, PM2, and Python Venv
```bash
apt update
apt install -y nodejs npm python3-venv
npm install -g pm2
```

### Step 2: Install Google Chrome & Virtual Display (For SeleniumBase/Playwright)
```bash
# Add the official Google Chrome repository
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list

# Update packages and install Chrome + Xvfb
apt update
apt install -y google-chrome-stable xvfb dbus dbus-x11
```

### Step 3: Create the App Directory and Virtual Environment
```bash
mkdir -p /root/playwright_worker
cd /root/playwright_worker
python3 -m venv venv
```

### Step 4: Install Playwright Browser Dependencies
```bash
# We install these into the new venv so Playwright has all OS-level libraries
./venv/bin/pip install playwright
./venv/bin/playwright install chromium
./venv/bin/playwright install-deps
```

### Step 5: Setup the `.env` file
Because the automated deploy script intentionally ignores `.env` files (to prevent overwriting production secrets), you must create it manually the first time:
```bash
nano /root/playwright_worker/.env
```
*(Paste your API keys and database URLs into the file, save, and exit).*

### Step 6: Deploy!
Now go back to your **local Windows machine**, open `deploy.ps1`, add the new VPS IP and key to the `$servers` list, and run `.\deploy.ps1`. The script will handle the rest!
