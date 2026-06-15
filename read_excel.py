import pandas as pd
import sys

try:
    df = pd.read_excel('pligg_site_template.xlsx')
    print("Columns:", df.columns.tolist())
    print(df.head())
except Exception as e:
    print("Error:", e)
    sys.exit(1)
