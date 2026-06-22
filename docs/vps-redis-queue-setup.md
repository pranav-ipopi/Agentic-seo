# Multi-VPS Redis Queue Setup

This document explains the architecture, setup, and deployment process for the Agentic SEO queuing system, which supports scaling out Python workers across multiple VPS instances natively and for free.

## 🏛 Architecture Overview

Our system handles high-throughput backlink jobs (e.g., 5,000+ jobs per day) using a centralized **Redis Queue** hosted on a primary VPS.

### Why Redis instead of Supabase polling?
Previously, workers polled the Supabase database directly. This caused two major issues:
1. **Race Conditions:** Two workers querying the database at the exact same time could pull the exact same job.
2. **Database Load:** Idle polling generates enormous unnecessary traffic on the database.

Redis solves this by providing **Atomic Operations**. When Next.js pushes a job into the queue, Redis mathematically guarantees that it will only ever be handed to a single worker using the `BLPOP` command, no matter how many VPS instances are listening.

### Network Topology
- **Next.js Web Server (Vercel):** When a user creates a campaign, Next.js instantly pushes all generated jobs as JSON objects directly to the Redis server via `LPUSH`.
- **VPS 1 (Master Node):** Runs both the **Redis Server** and **Python Worker 1**.
- **VPS 2+ (Worker Nodes):** Runs **only** the Python Worker. 

All web servers and worker nodes connect securely to VPS 1's public IP address via the `REDIS_URL` environment variable.

---

## 🛠 Step 1: Install & Configure Redis (VPS 1 ONLY)

You only need to install Redis on your primary VPS. Because it acts as an in-memory queue, it consumes virtually zero RAM or CPU.

### 1. Install Redis
```bash
sudo apt update
sudo apt install redis-server -y
```

### 2. Configure for External Access & Security
By default, Redis blocks external connections. You must bind it to the internet and set a strong password.

Open the config file:
```bash
sudo nano /etc/redis/redis.conf
```

Find this line and change it to `0.0.0.0`:
```text
bind 0.0.0.0
```

Find the `# requirepass` line, uncomment it, and set a strong password:
```text
requirepass YourSuperStrongPassword123!
```

Save (`Ctrl+O`, `Enter`, `Ctrl+X`) and restart the service:
```bash
sudo systemctl restart redis-server
```

### 3. Open the Firewall
Allow incoming connections on port 6379:
```bash
sudo ufw allow 6379/tcp
```
*(Optional Security: Instead of allowing the whole world, you can allow specific IPs using `sudo ufw allow from <IP_ADDRESS> to any port 6379`)*

---

## 🚀 Step 2: Configure Environment Variables

For the system to route jobs correctly, **every component** must point to the VPS 1 Redis server.

### Next.js (`agentic-seo/.env.local` or Vercel Environment Variables)
```env
REDIS_URL=redis://:YourSuperStrongPassword123!@<VPS_1_PUBLIC_IP>:6379
```

### All VPS Workers (`playwright_automation/backlink_automation/.env`)
```env
REDIS_URL=redis://:YourSuperStrongPassword123!@<VPS_1_PUBLIC_IP>:6379
```

---

## ⚙️ Step 3: Deploying a New Worker Node (VPS 2)

When spinning up a secondary VPS to handle more load, follow this checklist:

1. **Clone the Repository:** Pull your latest code containing the `redis_service.py` file.
2. **Install Dependencies:** You must install the new Python dependencies.
   ```bash
   pip install -r requirements.txt
   ```
   *(Critically, this installs the `redis` python package).*
3. **Configure the Environment:** Copy your `.env` file over. Make sure the `REDIS_URL` points to VPS 1.
4. **Start the Worker with your Virtual Environment:** 
   ```bash
   pm2 start vps_worker_playwright.py --interpreter ./venv/bin/python --name backlink-worker
   ```

### Updating Existing Workers
If you update your codebase in the future, remember to update the PM2 environment when restarting:
```bash
pm2 restart backlink-worker --update-env
```

---

## 📊 Monitoring the System

- **Checking Worker Logs:** To ensure a worker successfully pulled a job from Redis, run:
  ```bash
  pm2 logs backlink-worker
  ```
  Look for: `[INFO] Popped job <id> from Redis queue 'backlink_queue'`.
- **Checking Redis Manually:** You can log into VPS 1 and check the exact size of your queue manually:
  ```bash
  redis-cli -a YourSuperStrongPassword123!
  127.0.0.1:6379> LLEN backlink_queue
  ```
