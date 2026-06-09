import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("agentic-seo/.env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

tasks = supabase.table("tasks").select("*").order("created_at", desc=True).limit(5).execute()

with open("logs_output_utf8.txt", "w", encoding="utf-8") as f:
    f.write("--- LATEST TASKS ---\n")
    for t in tasks.data:
        f.write(f"ID: {t['id']}\n")
        f.write(f"Title: {t['title']}\n")
        f.write(f"Status: {t['status']}\n")
        if 'output' in t and t['output']:
            f.write(f"Output: {t['output']}\n")
        if 'result' in t and t['result']:
            f.write(f"Result: {t['result']}\n")
        f.write("-" * 40 + "\n")
