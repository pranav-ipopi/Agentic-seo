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
logger = logging.getLogger("sync_to_supabase")
logging.basicConfig(level=logging.INFO)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "YOUR_SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

redis_service = RedisService(logger=logger)

def chunks(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

async def sync_redis_to_supabase():
    """Bulk sync Redis job_status state to Supabase."""
    if not redis_service.client:
        logger.error("Redis client not connected.")
        return
        
    try:
        # Get all job statuses from redis hash
        jobs = await redis_service.client.hgetall("job_status")
        if not jobs:
            return
            
        logger.info(f"Syncing {len(jobs)} job statuses to Supabase...")
        
        # We need to decode the byte keys/values from redis
        jobs_decoded = {k.decode('utf-8'): v.decode('utf-8') for k, v in jobs.items()}
        
        items = list(jobs_decoded.items())
        
        for chunk in chunks(items, 100):
            # Upsert requires the full row or at least the PK.
            # In Supabase, if we only provide ID and status, it will update status.
            updates = [{"id": k, "status": v} for k, v in chunk]
            
            supabase.table("task_runs").upsert(updates).execute()
            
            # Remove completed/failed jobs from Redis after sync to prevent endless accumulation
            to_delete = [k for k, v in chunk if v in ('completed', 'failed')]
            if to_delete:
                await redis_service.client.hdel("job_status", *to_delete)
                
        logger.info("Sync complete.")
    except Exception as e:
        logger.error(f"Error syncing to Supabase: {e}")

async def main():
    while True:
        await sync_redis_to_supabase()
        await asyncio.sleep(300)  # Run every 5 minutes

if __name__ == "__main__":
    asyncio.run(main())
