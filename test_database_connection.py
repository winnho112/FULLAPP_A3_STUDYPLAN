"""
test_database_connection.py
Run:  python test_database_connection.py
Expected: "Database connection successful"
"""

import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

print(f"Connecting to database...")
try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT 1")
    result = cur.fetchone()
    cur.close()
    conn.close()
    print("Database connection successful")
except Exception as e:
    print(f"Database connection FAILED: {e}")