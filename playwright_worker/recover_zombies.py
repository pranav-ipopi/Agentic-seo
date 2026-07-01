import os
import asyncio
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("recover_zombies")
logging.basicConfig(level=logging.INFO)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def recover_zombie_runs():
    """
    Finds jobs that are marked as 'running' but were lost when the worker restarted.
    Resets them to 'pending' so the queue_feeder will push them back to Redis.
    """
    logger.info("Looking for stuck 'running' tasks...")
    
    # We only care about backlink jobs for this worker
    res = supabase.table('task_runs') \
        .select('id, status, type') \
        .eq('status', 'running') \
        .eq('type', 'backlink') \
        .execute()
        
    runs = res.data or []
    
    if not runs:
        logger.info("No stuck running jobs found! You are good to go.")
        return
        
    logger.info(f"Found {len(runs)} jobs stuck in 'running' state. Recovering...")
    
    run_ids = [r['id'] for r in runs]
    
    # Update them back to pending
    supabase.table('task_runs') \
        .update({'status': 'pending'}) \
        .in_('id', run_ids) \
        .execute()
        
    logger.info(f"Successfully recovered {len(run_ids)} jobs! They are now 'pending' and queue_feeder will push them to Redis within 5 minutes.")

if __name__ == "__main__":
    recover_zombie_runs()
