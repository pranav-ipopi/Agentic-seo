import pandas as pd
import requests
from bs4 import BeautifulSoup

# 1. Load your Excel sheet
input_file = r"C:\Users\HP\Documents\Agentic_SEO\playwright_automation\backlink_automation\templates\template_detection\sites_list\seoworld.xlsx" # Change to your filename
df = pd.read_excel(input_file)
url_column = df.columns[0]
pligg_kliqqi_sites = []

print("Starting verification... This may take a few minutes.")

# 2. Iterate through each URL
for index, row in df.iterrows():
    url = str(row[url_column]).strip()
    if not url.startswith(('http://', 'https://')):
        url = 'http://' + url
        
    try:
        # Fetch website HTML with a timeout to prevent hanging
        response = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
        html_content = response.text.lower()
        
        # 3. Check for Pligg/Kliqqi identifiers
        is_pligg_kliqqi = False
        
        # Check generator tags
        soup = BeautifulSoup(html_content, 'html.parser')
        meta_gen = soup.find('meta', attrs={'name': 'generator'})
        if meta_gen and any(tech in meta_gen.get('content', '').lower() for tech in ['pligg', 'kliqqi']):
            is_pligg_kliqqi = True
            
        # Check common URL structures or footprint strings in source code
        elif any(footprint in html_content for footprint in ['story.php?title=', 'pligg-content', 'kliqqi-content']):
            is_pligg_kliqqi = True
            
        if is_pligg_kliqqi:
            print(f"Found: {url}")
            pligg_kliqqi_sites.append(row.to_dict())
            
    except requests.exceptions.RequestException:
        # Skip sites that are dead or timeout
        continue

# 4. Save matches to a new Excel file
if pligg_kliqqi_sites:
    output_df = pd.DataFrame(pligg_kliqqi_sites)
    output_df.to_excel("filtered_pligg_kliqqi_sites.xlsx", index=False)
    print(f"Successfully saved {len(output_df)} sites to filtered_pligg_kliqqi_sites.xlsx")
else:
    print("No matching Pligg or Kliqqi sites detected.")
