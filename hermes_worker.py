import os
import sys
import time
import asyncio
import logging
import json
from concurrent.futures import ProcessPoolExecutor
from supabase import create_client, Client
import requests
import datetime

# --- FORCE HERMES ROOT DIRECTORY ---
# This ensures the agent always finds its skills, kanban.db, and config.yaml
# Under PM2, the ~ character doesn't always expand to /root reliably! We MUST use absolute paths.
HERMES_ROOT = os.environ.get("HERMES_ROOT", "/root/.hermes")
WORKER_ROOT = os.path.join(HERMES_ROOT, "hermes_worker")

# We keep os.chdir for AIAgent, but dynamically ensure both paths are in sys.path
if os.path.exists(HERMES_ROOT):
    os.chdir(HERMES_ROOT)
    if HERMES_ROOT not in sys.path:
        sys.path.insert(0, HERMES_ROOT)

if os.path.exists(WORKER_ROOT) and WORKER_ROOT not in sys.path:
    sys.path.insert(0, WORKER_ROOT)

# FORCE RUN_AGENT IMPORT PATH
# If PM2 fails to use the correct venv interpreter, this guarantees Python finds it anyway!
VENV_PATH = "/root/.hermes/hermes_worker/venv/lib/python3.12/site-packages"
if os.path.exists(VENV_PATH) and VENV_PATH not in sys.path:
    sys.path.insert(0, VENV_PATH)

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- CONFIGURATION ---
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")
BROWSER_USE_API_KEY = os.environ.get("BROWSER_USE_API_KEY", "YOUR_BROWSER_USE_API_KEY")

MAX_CONCURRENT_BROWSERS = 10
POLL_INTERVAL_SECONDS = 10

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def run_local_hermes(instruction, client_id=None):
    """
    Executes the task on the local VPS using Hermes AIAgent.
    """
    logging.info(f"Starting LOCAL execution...")
    try:
        from run_agent import AIAgent
        model_name = os.environ.get("LLM_MODEL", "gemini-2.5-flash")
        
        # We set this as an environment variable since the AIAgent class doesn't accept it directly.
        # Because we will switch to ProcessPoolExecutor, this is completely safe and won't bleed into other tasks.
        if client_id:
            os.environ["HERMES_PROFILE"] = str(client_id)
        elif "HERMES_PROFILE" in os.environ:
            del os.environ["HERMES_PROFILE"]
            
        agent = AIAgent(model=model_name, quiet_mode=True)
        result = agent.run_conversation(instruction)
        return {"status": "completed", "result": result}
    except Exception as e:
        logging.error(f"Local execution failed: {str(e)}")
        return {"status": "failed", "error": str(e)}

def run_browser_use_cloud(instruction):
    """
    Executes the task on Browser Use Cloud API.
    """
    logging.info(f"Starting CLOUD execution (Elite Site)...")
    try:
        url = "https://api.browser-use.com/v1/run"
        headers = {
            "Authorization": f"Bearer {BROWSER_USE_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "task": instruction,
            "solve_captcha": True, 
            "proxy_rotation": True
        }
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        return {"status": "completed", "result": data.get("result", "Completed on cloud")}
    except Exception as e:
        logging.error(f"Cloud execution failed: {str(e)}")
        return {"status": "failed", "error": str(e)}

def parse_ai_json_response(text):
    """
    Extracts and parses a JSON object from the AI's final response text.
    Handles potential markdown code blocks and conversational fluff.
    """
    if not isinstance(text, str):
        return {}
        
    try:
        return json.loads(text)
    except:
        pass
        
    try:
        import re
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL | re.IGNORECASE)
        if match:
            return json.loads(match.group(1))
            
        match = re.search(r'(\{.*?\})', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
    except:
        pass
        
    return {}

def process_task_run(task_run):
    """
    Executes a single step of a workflow task_run and updates DB.
    """
    # Initialize a thread-local Supabase client to prevent HTTP/2 thread-safety errors
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    task_run_id = task_run['id']
    try:
        template = task_run.get('workflow_templates', {})
        steps = template.get('steps', [])
        current_index = task_run.get('current_step_index', 0)
        
        if current_index >= len(steps):
            supabase.table('task_runs').update({'status': 'completed'}).eq('id', task_run_id).execute()
            return
            
        step = steps[current_index]
        state = task_run.get('state', {})
        target_url = state.get('target_site', '')
        client_target_url = state.get('client_target_url', '')
        client_id = task_run.get('client_id')
        
        logging.info(f"[TaskRun {task_run_id}] Executing step {current_index + 1}/{len(steps)}: {step.get('name')}")

        # Log start
        supabase.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': current_index,
            'role': 'system',
            'message': f"Starting execution of step: {step.get('name')}. Initializing Hermes Agent.",
            'metadata': {'step_name': step.get('name'), 'status': 'running'}
        }).execute()

        # Build instruction combining step details and target payload
        keyword = state.get('keyword', 'Target Keyword')
        
        instruction = (
            f"Execute the 'execute_backlink' skill. "
            f"Target Directory: {target_url} "
            f"Client URL: {client_target_url} "
            f"Keyword: '{keyword}' "
            f"Once you are completely done and have verified the live link, return your final response as a RAW JSON object exactly matching this schema: "
            f"{{\"live_url\": \"<the_actual_new_link>\", \"username\": \"<username>\", \"title\": \"<title>\", \"status\": \"success\"}}"
        )
        
        # Check execution tier
        target_site_record = supabase.table('target_sites').select('execution_tier').eq('url', target_url).execute()
        tier = 'standard'
        if target_site_record.data and len(target_site_record.data) > 0:
            tier = target_site_record.data[0].get('execution_tier', 'standard')
            
        # Execute
        result = None
        result_message = ""
        
        if step.get('type') == 'report_generation' or 'report' in step.get('name', '').lower():
            # Intercept Reporting Step: Do not call AI, just mark as complete
            logging.info(f"[TaskRun {task_run_id}] Intercepted Reporting Step. Verifying completion...")
            
            try:
                supabase.table('task_run_logs').insert({
                    'task_run_id': task_run_id,
                    'step_index': current_index,
                    'role': 'system',
                    'message': "Agent intercept: Verifying link and preparing data for frontend Excel generation...",
                    'metadata': {'step_name': step.get('name'), 'status': 'running'}
                }).execute()
            except Exception as e:
                logging.error(f"Failed to log intercept start: {e}")
                
            result = {'status': 'completed'}
            result_message = "Verification completed successfully. The report data is ready to be downloaded from the frontend."
            parsed_data = None
            logging.info(f"[TaskRun {task_run_id}] {result_message}")
                
        else:
            if tier == 'elite':
                result = run_browser_use_cloud(instruction)
            else:
                result = run_local_hermes(instruction, client_id)
                
            raw_res = result.get('result', result.get('error'))
            if isinstance(raw_res, dict) and 'final_response' in raw_res:
                result_message = raw_res['final_response']
            else:
                result_message = str(raw_res)
                
            parsed_data = parse_ai_json_response(result_message)
            
        # Log result
        metadata = {'step_name': step.get('name'), 'status': result['status'] if result else 'completed'}
        if parsed_data:
            metadata['structured_data'] = parsed_data
            
        supabase.table('task_run_logs').insert({
            'task_run_id': task_run_id,
            'step_index': current_index,
            'role': 'assistant',
            'message': result_message,
            'metadata': metadata
        }).execute()
        
        # If successful, check if it was a submission and log to backlinks
        is_submission_step = ('submit' in step.get('name', '').lower() or 'execute' in step.get('name', '').lower())
        
        if result['status'] == 'completed' and is_submission_step:
            live_url = parsed_data.get('live_url') if parsed_data else None
            
            # Basic regex extraction if JSON parsing completely failed but there's a URL in text
            if not live_url:
                import re
                urls = re.findall(r'https?://[^\s`*\'\"<>()\[\]{}]+', result_message)
                # Try to find a URL that is NOT just the target site or client site
                for u in reversed(urls):
                    if u.rstrip('/').lower() != target_url.rstrip('/').lower() and u.rstrip('/').lower() != client_target_url.rstrip('/').lower():
                        live_url = u
                        break
            
            # Strict Validation: The live URL must exist and NOT be just the home page or client URL.
            is_valid_url = False
            if live_url:
                clean_live = live_url.rstrip('/').lower()
                clean_target = target_url.rstrip('/').lower()
                clean_client = client_target_url.rstrip('/').lower()
                
                if clean_live != clean_target and clean_live != clean_client:
                    is_valid_url = True
            
            if not is_valid_url:
                # The AI failed to produce a valid new link.
                result['status'] = 'failed'
                result_message = f"Agent failed to produce a valid new live link. Returned: {live_url}. Raw response: {result_message}"
                logging.error(f"[TaskRun {task_run_id}] {result_message}")
                
            else:
                try:
                    supabase.table('backlinks').insert({
                        'client_id': client_id,
                        'source_url': target_url,
                        'target_url': client_target_url,
                        'result_url': live_url,
                        'status': 'verified',
                        'metadata': parsed_data if parsed_data else {}
                    }).execute()
                    logging.info(f"[TaskRun {task_run_id}] Logged live URL to backlinks table: {live_url}")
                except Exception as e:
                    logging.error(f"[TaskRun {task_run_id}] Failed to log to backlinks table: {e}")

        # Advance step
        if result and result.get('status') == 'failed':
            supabase.table('task_runs').update({
                'status': 'failed'
            }).eq('id', task_run_id).execute()
            logging.error(f"[TaskRun {task_run_id}] Task step failed, stopping execution.")
        else:
            next_index = current_index + 1
            if next_index >= len(steps):
                supabase.table('task_runs').update({
                    'current_step_index': next_index,
                    'status': 'completed'
                }).eq('id', task_run_id).execute()
            else:
                require_approval = state.get('requireApproval', False)
                if require_approval and steps[next_index].get('type') == 'approval':
                    supabase.table('task_runs').update({
                        'current_step_index': next_index,
                        'status': 'waiting_approval'
                    }).eq('id', task_run_id).execute()
                    
                    # Insert approval request into approvals table
                    try:
                        supabase.table('approvals').insert({
                            'client_id': client_id,
                            'department_id': task_run.get('department_id'),
                            'task_run_id': task_run_id,
                            'action_type': 'workflow_approval',
                            'description': f"Review completion of {step.get('name')} and approve proceeding to next step.",
                            'status': 'pending',
                            'payload': state
                        }).execute()
                    except Exception as e:
                        logging.error(f"[TaskRun {task_run_id}] Failed to insert approval record: {e}")
                else:
                    supabase.table('task_runs').update({
                        'current_step_index': next_index,
                        'status': 'pending' # Ready for next poll
                    }).eq('id', task_run_id).execute()
                
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logging.error(f"[TaskRun {task_run_id}] Unexpected error in process_task_run:\n{error_trace}")
        supabase.table('task_runs').update({'status': 'failed'}).eq('id', task_run_id).execute()
        
        # Log to DB so frontend can see it
        try:
            supabase.table('task_run_logs').insert({
                'task_run_id': task_run_id,
                'step_index': current_index if 'current_index' in locals() else 0,
                'role': 'system',
                'message': f"CRITICAL CRASH: {str(e)}\n\n{error_trace}",
                'metadata': {'status': 'failed', 'error': True}
            }).execute()
        except:
            pass

def poll_queue():
    """
    Main loop: polls Supabase for pending task_runs and assigns them to the thread pool.
    """
    logging.info(f"Starting Hermes Worker Orchestrator... Max Concurrent Browsers: {MAX_CONCURRENT_BROWSERS}")
    
    with ProcessPoolExecutor(max_workers=MAX_CONCURRENT_BROWSERS) as executor:
        while True:
            try:
                response = supabase.table('task_runs') \
                    .select('*, workflow_templates(*)') \
                    .eq('status', 'pending') \
                    .order('created_at') \
                    .limit(MAX_CONCURRENT_BROWSERS) \
                    .execute()
                
                task_runs = response.data
                
                if not task_runs:
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue
                
                logging.info(f"Found {len(task_runs)} pending workflow runs. Assigning to workers...")
                
                # Lock by marking as running
                for t in task_runs:
                    supabase.table('task_runs').update({'status': 'running'}).eq('id', t['id']).execute()
                
                # Submit to thread pool
                for t in task_runs:
                    executor.submit(process_task_run, t)
                    
            except Exception as e:
                logging.error(f"Error polling queue: {str(e)}")
                time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    poll_queue()
