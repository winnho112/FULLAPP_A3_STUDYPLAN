"""
check_tables.py
Run:  python check_tables.py
Expected: prints all 5 table names
"""

import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

TABLES = ["profiles", "study_plans", "availability", "preferences", "study_sessions"]

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema = 'public' AND table_name = ANY(%s) "
    "ORDER BY table_name",
    (TABLES,),
)
found = [row[0] for row in cur.fetchall()]

cur.close()
conn.close()

for t in TABLES:
    if t in found:
        print(t)
    else:
        print(f"{t} — NOT FOUND")