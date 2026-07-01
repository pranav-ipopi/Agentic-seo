import os, json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')
supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

tasks = supabase.table('tasks').select('id, title, payload, created_at').order('created_at', desc=True).limit(5).execute()
for t in tasks.data:
    print(f"Task: {t['title']}, payload keys: {list(t.get('payload', {}).keys()) if t.get('payload') else 'None'}")
