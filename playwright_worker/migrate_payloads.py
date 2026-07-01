import os
import json
from dotenv import load_dotenv
from supabase import create_client

def main():
    load_dotenv('.env')
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        return
        
    supabase = create_client(url, key)

    # 1. Fetch all campaign tasks that lack a payload
    tasks_res = supabase.table('tasks').select('id, title, output, payload').execute()
    
    if not tasks_res.data:
        print("No tasks found.")
        return
        
    updated_count = 0
    
    for t in tasks_res.data:
        # Check if it's a campaign task
        output = t.get('output')
        if not output or not output.get('campaign_id'):
            continue
            
        # If payload already exists, skip
        if t.get('payload'):
            continue
            
        task_id = t['id']
        # 2. Fetch task_runs for this task
        runs_res = supabase.table('task_runs').select('state, workflow_template_id').eq('state->>task_id', task_id).execute()
        
        if not runs_res.data:
            continue
            
        template_id = runs_res.data[0].get('workflow_template_id')
            
        targets_map = {}
        min_da, min_pa, max_ss = 30, 30, 4
        submission_type = 'bookmarking'
        
        for r in runs_res.data:
            state = r.get('state', {})
            url = state.get('client_target_url')
            if not url: continue
            
            min_da = state.get('min_da', 30)
            min_pa = state.get('min_pa', 30)
            max_ss = state.get('max_spam_score', 4)
            submission_type = state.get('category', 'bookmarking')
            
            kw = {
                'keyword': state.get('keyword', ''),
                'description': state.get('description', ''),
                'tags': state.get('tags', '')
            }
            
            if url not in targets_map:
                targets_map[url] = {'clientTargetUrl': url, 'targetSitesCount': 50, 'keywords': []}
                
            # Avoid duplicate keywords for the same URL
            if kw['keyword'] not in [k['keyword'] for k in targets_map[url]['keywords']]:
                targets_map[url]['keywords'].append(kw)
                
        if not targets_map:
            continue
            
        # 3. Construct the payload
        payload = {
            'templateId': template_id,
            'campaignName': t['title'],
            'submissionType': submission_type,
            'minDa': min_da,
            'minPa': min_pa,
            'maxSpamScore': max_ss,
            'targets': list(targets_map.values())
        }
        
        # 4. Update the task in DB
        try:
            supabase.table('tasks').update({'payload': payload}).eq('id', task_id).execute()
            print(f"Successfully migrated payload for task {task_id} ({t['title']})")
            updated_count += 1
        except Exception as e:
            print(f"Failed to update task {task_id}: {e}")
            
    print(f"Done! Migrated {updated_count} old campaign tasks.")

if __name__ == '__main__':
    main()
