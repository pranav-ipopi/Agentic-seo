module.exports = {
  apps: [
    {
      name: "backlink-worker",
      script: "vps_worker_playwright.py",
      cwd: ".",
      interpreter: "./venv/Scripts/python.exe",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {},
      error_file: "logs/backlink-worker-error.log",
      out_file: "logs/backlink-worker-out.log",
      merge_logs: true,
      time: true
    },
    {
      name: "ocr-fuzzer",
      script: "solvemedia_ocr/ocr_fuzzer.py",
      cwd: ".",
      interpreter: "./venv/Scripts/python.exe",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {},
      error_file: "logs/ocr-fuzzer-error.log",
      out_file: "logs/ocr-fuzzer-out.log",
      merge_logs: true,
      time: true
    }
  ]
};
