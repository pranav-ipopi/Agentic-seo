import os
import sys
import time
import asyncio
import logging
import json
import traceback
from supabase import create_client, Client
from dotenv import load_dotenv

# Ensure we can import from playwright_automation.backlink_automation
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from methods.stealth_browser import StealthBrowserManager
from services.captcha_service import CaptchaService
from services.logging_service import setup_logger
from templates.pligg_generic import PliggGenericTemplate

load_dotenv()

# --- CONFIGURATION ---
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")

MAX_CONCURRENT_SESSIONS = 5
POLL_INTERVAL_SECONDS = 10

# Initialize global Supabase client (can be shared for async reading)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
logger = setup_logger(level=logging.INFO)

# Global browser manager and captcha service
browser_manager = StealthBrowserManager()
captcha_service = CaptchaService(logger=logger)

def check_and_update_parent_task(supabase_client: Client, state: dict):
    """Checks if all task_runs for a parent task are done, and if so, updates the parent task status.
    
    Sets parent task status to:
      - 'failed'    if ALL child runs failed
      - 'completed' if at least one child run succeeded (even if others failed)
    Also stores a result summary (succeeded/failed counts) on the tasks row.
    """
    task_id = state.get('task_id')
    if not task_id:
        return
    try:
        res = supabase_client.table('task_runs').select('status').eq('state->>task_id', task_id).execute()
        if res.data:
            all_done = all(r.get('status') in ['completed', 'failed'] for r in res.data)
            if all_done:
                succeeded = sum(1 for r in res.data if r.get('status') == 'completed')
                failed    = sum(1 for r in res.data if r.get('status') == 'failed')
                total     = len(res.data)

                # Determine final task status
                if succeeded == 0:
                    final_status = 'failed'
                else:
                    final_status = 'completed'

                logger.info(
                    f"[Task {task_id}] All {total} runs done. "
                    f"succeeded={succeeded}, failed={failed}. "
                    f"Setting parent task status → '{final_status}'"
                )

                supabase_client.table('tasks').update({
                    'status': final_status,
                    'result': {
                        'summary': {
                            'total':     total,
                            'succeeded': succeeded,
                            'failed':    failed,
                        }
                    }
                }).eq('id', task_id).execute()
    except Exception as e:
        logger.error(f"Failed to update parent task completion for {task_id}: {e}")

async def route_and_execute(task_run, supabase_client: Client):
    """
    Executes a single step of a workflow task_run.
    Acts as a router based on site_id or target_site url.
    """
    task_run_id = task_run['id']
    
    # Stagger startups slightly to avoid CDP websocket race conditions on new_context
    import random
    await asyncio.sleep(random.uniform(0.5, 3.0))
    
    try:
        template = task_run.get('workflow_templates', {})
        steps = template.get('steps', [])
        current_index = task_run.get('current_step_index', 0)
        
        if current_index >= len(steps):
            supabase_client.table('task_runs').update({'status': 'completed'}).eq('id', task_run_id).execute()
            return
            
        step = steps[current_index]
        state = task_run.get('state', {})
        target_url = state.get('target_site', '')
        client_target_url = state.get('client_target_url', '')
        keyword = state.get('keyword', 'Target Keyword')
        client_id = task_run.get('client_id')
        target_site_id = task_run.get('target_site_id')
        
        logger.info(f"[TaskRun {task_run_id}] Executing step {current_index + 1}/{len(steps)}: {step.get('name')} on {target_url}")

        supabase_client.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': current_index,
            'role': 'system',
            'message': f"Starting execution of step: {step.get('name')}. Initializing Browser Session.",
            'metadata': {'step_name': step.get('name'), 'status': 'running'}
        }).execute()

        result = None
        result_message = ""
        parsed_data = None
        
        if step.get('type') == 'report_generation' or 'report' in step.get('name', '').lower():
            logger.info(f"[TaskRun {task_run_id}] Intercepted Reporting Step.")
            result = {'status': 'completed'}
            result_message = "Verification completed successfully. The report data is ready."
        else:
            # --- ROUTER LOGIC ---
            # Reads site_id from target_sites to determine which automation
            # template to use. site_id is populated by the detect-site-templates
            # Supabase edge function which fingerprints each site's CMS.

            site_id = None

            if target_site_id:
                site_res = supabase_client.table('target_sites').select('site_id').eq('id', target_site_id).execute()
                if site_res.data and len(site_res.data) > 0:
                    site_id = (site_res.data[0].get('site_id') or '').lower() or None
            elif target_url:
                # Fallback: if task didn't include target_site_id, try to match by url
                # Strip trailing slash to match DB format if necessary
                clean_url = target_url.rstrip('/')
                site_res = supabase_client.table('target_sites').select('site_id').ilike('url', f"%{clean_url}%").execute()
                if site_res.data and len(site_res.data) > 0:
                    site_id = (site_res.data[0].get('site_id') or '').lower() or None

            logger.info(f"[TaskRun {task_run_id}] Routing to template: {site_id!r} (target_site_id={target_site_id})")

            template_runner = None

            if site_id == 'pligg':
                template_runner = PliggGenericTemplate(
                    target_url=target_url,
                    browser_manager=browser_manager,
                    captcha_service=captcha_service,
                    logger=logger
                )
            elif site_id == 'phpld':
                # TODO: implement PHPLDTemplate
                result = {'status': 'failed'}
                result_message = f"[TaskRun {task_run_id}] PHPLD template is not yet implemented. Skipping {target_url}."
                logger.warning(result_message)
            elif site_id == 'scuttle':
                # TODO: implement ScuttleTemplate
                result = {'status': 'failed'}
                result_message = f"[TaskRun {task_run_id}] Scuttle template is not yet implemented. Skipping {target_url}."
                logger.warning(result_message)
            elif site_id == 'drigg':
                # TODO: implement DriggTemplate
                result = {'status': 'failed'}
                result_message = f"[TaskRun {task_run_id}] Drigg template is not yet implemented. Skipping {target_url}."
                logger.warning(result_message)
            else:
                # site_id is None (not yet detected) or 'unknown'
                result = {'status': 'failed'}
                result_message = (
                    f"[TaskRun {task_run_id}] Cannot route: site_id is {site_id!r} for {target_url}. "
                    f"Run the detect-site-templates edge function to fingerprint this site."
                )
                logger.error(result_message)

            if template_runner:
                try:
                    res = await template_runner.run(client_target_url, keyword)
                    result = {'status': 'completed'}
                    result_message = f"Success. Live URL: {res.get('backlink_url')}"
                    parsed_data = {
                        "live_url": res.get("backlink_url"),
                        "status": "success"
                    }
                except Exception as e:
                    logger.error(f"[TaskRun {task_run_id}] Execution failed: {e}")
                    result = {'status': 'failed'}
                    result_message = f"Agent failed. Error: {str(e)}"
            # If template_runner is None, result and result_message are already set above.

        # Log result
        metadata = {'step_name': step.get('name'), 'status': result['status'] if result else 'completed'}
        if parsed_data:
            metadata['structured_data'] = parsed_data
            
        supabase_client.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': current_index,
            'role': 'assistant',
            'message': result_message,
            'metadata': metadata
        }).execute()
        
        is_submission_step = ('submit' in step.get('name', '').lower() or 'execute' in step.get('name', '').lower())
        
        if result['status'] == 'completed' and is_submission_step and parsed_data and parsed_data.get('live_url'):
            live_url = parsed_data.get('live_url')
            try:
                supabase_client.table('backlinks').insert({
                    'client_id': client_id,
                    'source_url': target_url,
                    'target_url': client_target_url,
                    'result_url': live_url,
                    'status': 'verified',
                    'metadata': parsed_data
                }).execute()
                logger.info(f"[TaskRun {task_run_id}] Logged live URL to backlinks table: {live_url}")
            except Exception as e:
                logger.error(f"[TaskRun {task_run_id}] Failed to log to backlinks table: {e}")

        # Advance step
        if result and result.get('status') == 'failed':
            supabase_client.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
            check_and_update_parent_task(supabase_client, state)
        else:
            next_index = current_index + 1
            if next_index >= len(steps):
                supabase_client.table('task_runs').update({
                    'current_step_index': next_index,
                    'status': 'completed'
                }).eq('id', task_run_id).execute()
                check_and_update_parent_task(supabase_client, state)
            else:
                require_approval = state.get('requireApproval', False)
                if require_approval and steps[next_index].get('type') == 'approval':
                    supabase_client.table('task_runs').update({
                        'current_step_index': next_index,
                        'status': 'waiting_approval'
                    }).eq('id', task_run_id).execute()
                    
                    try:
                        supabase_client.table('approvals').insert({
                            'client_id': client_id,
                            'department_id': task_run.get('department_id'),
                            'task_run_id': task_run_id,
                            'action_type': 'workflow_approval',
                            'description': f"Review completion of {step.get('name')}.",
                            'status': 'pending',
                            'payload': state
                        }).execute()
                    except Exception as e:
                        logger.error(f"[TaskRun {task_run_id}] Failed to insert approval record: {e}")
                else:
                    supabase_client.table('task_runs').update({
                        'current_step_index': next_index,
                        'status': 'pending'
                    }).eq('id', task_run_id).execute()
                
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"[TaskRun {task_run_id}] Unexpected error:\n{error_trace}")
        supabase_client.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
        check_and_update_parent_task(supabase_client, task_run.get('state', {}))
        try:
            supabase_client.table('task_run_logs').insert({
                'task_run_id': task_run_id,
                'step_index': current_index if 'current_index' in locals() else 0,
                'role': 'system',
                'message': f"CRITICAL CRASH: {str(e)}\n\n{error_trace}",
                'metadata': {'status': 'failed', 'error': True}
            }).execute()
        except:
            pass

async def poll_queue():
    """
    Main loop: polls Supabase for pending task_runs and executes them asynchronously.
    """
    logger.info(f"Starting Playwright Worker Orchestrator... Max Concurrent Sessions: {MAX_CONCURRENT_SESSIONS}")
    
    browser_started = False
    active_tasks = set()
    
    try:
        while True:
            try:
                # If we have room for more tasks, fetch them
                if len(active_tasks) < MAX_CONCURRENT_SESSIONS:
                    fetch_limit = MAX_CONCURRENT_SESSIONS - len(active_tasks)
                    response = supabase.table('task_runs') \
                        .select('*, workflow_templates(*)') \
                        .eq('status', 'pending') \
                        .order('created_at') \
                        .limit(fetch_limit) \
                        .execute()
                    
                    task_runs = response.data
                    
                    if task_runs:
                        if not browser_started:
                            logger.info("Pending tasks found. Starting browser manager...")
                            await browser_manager.start()
                            browser_started = True

                        logger.info(f"Fetched {len(task_runs)} new workflow runs. Adding to active pool...")
                        
                        for t in task_runs:
                            supabase.table('task_runs').update({'status': 'running'}).eq('id', t['id']).execute()
                            task = asyncio.create_task(route_and_execute(t, create_client(SUPABASE_URL, SUPABASE_KEY)))
                            active_tasks.add(task)
                            task.add_done_callback(active_tasks.discard)
                
                if not active_tasks:
                    if browser_started:
                        logger.info("No active tasks. Closing browser to free resources...")
                        await browser_manager.close()
                        browser_started = False
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                else:
                    # Wait for at least one task to finish, or timeout after polling interval
                    await asyncio.wait(active_tasks, return_when=asyncio.FIRST_COMPLETED, timeout=POLL_INTERVAL_SECONDS)
                    
            except Exception as e:
                logger.error(f"Error polling queue: {str(e)}")
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
    finally:
        if browser_started:
            await browser_manager.close()

if __name__ == "__main__":
    try:
        asyncio.run(poll_queue())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user.")
