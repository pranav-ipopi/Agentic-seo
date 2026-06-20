module.exports = {
  apps: [
    {
      name: "backlink-worker",
      script: "vps_worker_playwright.py",
      cwd: "../backlink_automation",
      interpreter: "python3",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {},
      error_file: "../logs/backlink-worker-error.log",
      out_file: "../logs/backlink-worker-out.log",
      merge_logs: true,
      time: true
    },
    {
      name: "article-worker",
      script: "article_worker.py",
      interpreter: "python3",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      cwd: ".", 
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/article-worker-error.log",
      out_file: "logs/article-worker-out.log",
      merge_logs: true,
      time: true
    }
  ]
};
