import os
import uuid
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("agentic-seo/.env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if url and key:
    supabase = create_client(url, key)
    
    # 1. Fetch a client_id
    clients = supabase.table("clients").select("id").limit(1).execute()
    if not clients.data:
        print("No clients found in the database. Please create a client first.")
        exit(1)
        
    client_id = clients.data[0]['id']

    # 2. Construct the task exactly as the frontend does
    # (Referencing agentic-seo/components/workflows/RunConfigurationPanel.tsx)
    task_payload = {
        "client_id": client_id,
        "title": "Test Backlink Submission (Simulated Frontend Request)",
        "description": "Submit https://client-site.com to https://target-site.com",
        "type": "backlink_submission",
        "status": "pending", # 'pending' allows Hermes to immediately pick it up
        "payload": {
            "client_target_url": "https://client-site.com",
            "target_site": "https://target-site.com",
            "category": "bookmarking",
            "min_da": 30
        }
    }
    
    # 3. Insert into Supabase
    result = supabase.table("tasks").insert(task_payload).execute()
    print("Test task inserted successfully!")
    print("Task ID:", result.data[0]['id'])
else:
    print("Could not find Supabase credentials. Make sure .env.local is set up.")
