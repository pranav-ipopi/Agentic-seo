import pandas as pd
import math

df = pd.read_excel('pligg_site_template.xlsx')

sql_lines = []
sql_lines.append("-- SQL script to insert bulk sites into target_sites")
sql_lines.append("INSERT INTO public.target_sites (url, category, site_id, da, pa, spam_score)")
sql_lines.append("VALUES")

values = []
for index, row in df.iterrows():
    url = str(row.get('bookmarking sites', '')).strip()
    if not url or url.lower() == 'nan':
        continue
        
    if not url.startswith('http'):
        url = 'https://' + url
        
    da = row.get('DA')
    pa = row.get('PA')
    ss = row.get('SS')
    
    da_val = "NULL" if pd.isna(da) else str(da)
    pa_val = "NULL" if pd.isna(pa) else str(pa)
    ss_val = "NULL" if pd.isna(ss) else str(ss)
    
    url_escaped = url.replace("'", "''")
    values.append(f"  ('{url_escaped}', 'bookmarking', 'pligg', {da_val}, {pa_val}, {ss_val})")

sql_lines.append(",\n".join(values) + "\nON CONFLICT (url) DO UPDATE \nSET \n  site_id = EXCLUDED.site_id,\n  da = EXCLUDED.da,\n  pa = EXCLUDED.pa,\n  spam_score = EXCLUDED.spam_score;")

with open('insert_bookmarking_sites.sql', 'w', encoding='utf-8') as f:
    f.write("\n".join(sql_lines))

print(f"Generated {len(values)} SQL insert statements.")
