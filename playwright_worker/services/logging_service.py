"""
Logging Service for Backlink Automation Engine V1

Provides rotating file logging for all events.
Logs are stored in logs/ directory.

Events logged (as per spec):
- Worker started
- Job picked
- Registration started
- Registration completed
- Login completed
- Bookmark submitted
- Success
- Failure

Usage:
    from services.logging_service import setup_logger, log_event
    logger = setup_logger()
    log_event(logger, "worker_started", {"version": "V1"})
"""

import logging
import os
from logging.handlers import RotatingFileHandler
from datetime import datetime
from typing import Any, Dict, Optional


def setup_logger(
    name: str = "backlink_automation",
    log_dir: str = "logs",
    log_file: str = "backlink_automation.log",
    max_bytes: int = 5 * 1024 * 1024,  # 5MB
    backup_count: int = 5,
    level: int = logging.INFO
) -> logging.Logger:
    """Setup rotating file logger with console output."""
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, log_file)

    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Avoid duplicate handlers if called multiple times
    if logger.handlers:
        return logger

    # File handler with rotation
    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    file_handler.setLevel(level)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)

    # Formatter
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def log_event(
    logger: logging.Logger,
    event: str,
    details: Optional[Dict[str, Any]] = None,
    level: int = logging.INFO
) -> None:
    """Log a structured event with optional details."""
    timestamp = datetime.utcnow().isoformat() + "Z"
    msg = f"EVENT: {event}"
    if details:
        # Simple serialization for logging
        detail_str = " | ".join(f"{k}={v}" for k, v in details.items())
        msg += f" | {detail_str}"
    logger.log(level, msg)


# Pre-configured logger for convenience
logger = setup_logger()