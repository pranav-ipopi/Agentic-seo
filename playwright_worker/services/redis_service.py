import os
import json
import logging
from typing import Optional, Dict, Any
import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

class RedisService:
    def __init__(self, url: Optional[str] = None, logger: Optional[logging.Logger] = None):
        self.url = url or os.getenv("REDIS_URL")
        self.logger = logger or logging.getLogger(__name__)
        
        if not self.url:
            self.logger.critical("=====================================================")
            self.logger.critical("[CRITICAL ERROR] REDIS_URL environment variable is NOT SET.")
            self.logger.critical("Redis polling is disabled. Worker will fallback to database polling which causes high DB load!")
            self.logger.critical("=====================================================")
            self.client = None
        else:
            self.client = redis.Redis.from_url(self.url, decode_responses=True)
            self.logger.info("RedisService initialized")

    async def pop_job(self, queue_name: str = "backlink_queue", timeout: int = 0) -> Optional[Dict[str, Any]]:
        """
        Block and pop a job from the Redis queue.
        timeout=0 means it will block indefinitely until a job arrives.
        """
        if not self.client:
            return None

        try:
            # blpop returns a tuple (queue_name, popped_value)
            result = await self.client.blpop(queue_name, timeout=timeout)
            if result:
                _, job_json = result
                job = json.loads(job_json)
                self.logger.info(f"Popped job {job.get('id')} from Redis queue '{queue_name}'")
                return job
            return None
        except Exception as e:
            self.logger.error(f"Error popping job from Redis: {e}")
            return None
