# Worker Management & Job Recovery Guide

This guide covers how to manage the Playwright background worker to ensure it stays online continuously and how to recover jobs that may get stuck if the worker process terminates unexpectedly.

## 1. Preventing the Worker from Stopping (PM2)

The `playwright_worker` is configured to use **PM2** via the `ecosystem.config.js` file. PM2 is a process manager that runs your Python worker in the background and will automatically restart it if it crashes, throws a fatal error, or if the server reboots.

### Starting the Worker with PM2
Instead of running `python vps_worker_playwright.py` manually, use the following commands from the `playwright_worker` directory:

```bash
# Make sure PM2 is installed globally via npm
npm install -g pm2

# Start the background worker using the ecosystem file
pm2 start ecosystem.config.js
```

### Useful PM2 Commands
- **Check Status:** `pm2 status`
- **View Logs:** `pm2 logs` (or `pm2 logs backlink-worker`)
- **Stop Worker:** `pm2 stop backlink-worker`
- **Restart Worker:** `pm2 restart backlink-worker`

### Ensure Auto-start on Reboot (Windows/Linux)
To make PM2 start automatically when the server machine restarts:
```bash
pm2 save
pm2 startup
```

---

## 2. Recovering Stuck (Zombie) Jobs

The worker uses Redis as a high-performance queue. When the worker starts processing a job, it pops (removes) the job from Redis and marks it as `running` in your Supabase database. 

If the worker crashes mid-execution (before marking the job as completed or failed), the job is lost from Redis but remains stuck as `running` in the database indefinitely. These are called **Zombie Jobs**.

### Using the Recovery Script
There is a dedicated script built to solve this exact problem: `recover_zombies.py`.

**What it does:**
1. Scans the Supabase `task_runs` table for backlink jobs stuck with the `status = 'running'`.
2. Resets their status to `pending`.
3. The `queue_feeder` service will automatically detect these `pending` jobs and push them back onto the Redis queue so they can be processed again.

**How to run it:**
From the `playwright_worker` directory, run the script using your Python environment:

```bash
# If using the virtual environment on Windows
.\venv\Scripts\python.exe recover_zombies.py

# Or if the environment is already activated
python recover_zombies.py
```

You should see output similar to this:
> INFO:recover_zombies:Looking for stuck 'running' tasks...
> INFO:recover_zombies:Found 5 jobs stuck in 'running' state. Recovering...
> INFO:recover_zombies:Successfully recovered 5 jobs! They are now 'pending' and queue_feeder will push them to Redis within 5 minutes.
