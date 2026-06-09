import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("agentic-seo/.env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if url and key:
    supabase = create_client(url, key)
    result = supabase.table("tasks").update({"status": "pending"}).eq("status", "running").execute()
    print("Reset successful:", result.data)
else:
    print("Could not find Supabase credentials")
