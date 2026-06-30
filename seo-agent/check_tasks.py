import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv('.env')

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

res = supabase.table("tasks").select("id, title, session_id").order("created_at", desc=True).limit(5).execute()
print(res.data)
