import asyncio
import os
import json
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.redis_service import RedisService

load_dotenv()
logger = logging.getLogger("queue_feeder")
logging.basicConfig(level=logging.INFO)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "YOUR_SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

redis_service = RedisService(logger=logger)

async def feed_queue_from_supabase():
    """Pull pending task_runs from Supabase and push to Redis."""
    try:
        # Fetch pending backlink tasks
        res = supabase.table('task_runs') \
            .select('*, workflow_templates(*)') \
            .eq('status', 'pending') \
            .eq('type', 'backlink') \
            .order('created_at') \
            .limit(100) \
            .execute()
            
        task_runs = res.data or []
        if not task_runs:
            logger.info("No pending tasks found.")
            return

        logger.info(f"Found {len(task_runs)} pending tasks. Pushing to Redis...")
        
        # We need to extract IDs for the batch update
        task_ids = [t['id'] for t in task_runs]
        
        if not redis_service.client:
            logger.error("Redis client not connected.")
            return

        # Push to Redis
        for t in task_runs:
            await redis_service.client.rpush("backlink_queue", json.dumps(t))
            
        # Batch update Supabase to 'queued'
        # Since Supabase python client doesn't directly support bulk update easily without upsert,
        # we can use in_ on the update.
        supabase.table('task_runs') \
            .update({'status': 'queued'}) \
            .in_('id', task_ids) \
            .execute()
            
        logger.info(f"Successfully queued {len(task_ids)} tasks.")
        
    except Exception as e:
        logger.error(f"Error feeding queue: {e}")

async def main():
    while True:
        await feed_queue_from_supabase()
        await asyncio.sleep(300)  # Run every 5 minutes

if __name__ == "__main__":
    asyncio.run(main())
