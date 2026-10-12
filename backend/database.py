"""
database.py — PostgreSQL connection and table initialisation
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_connection():
    """Return a new psycopg2 connection to the Supabase PostgreSQL database."""
    return psycopg2.connect(DATABASE_URL)


def init_db():
    """
    Create all five tables if they don't already exist.
    Called automatically on server startup via the FastAPI lifespan.
    """
    conn = get_connection()
    cur = conn.cursor()

    # -----------------------------------------------------------
    # Table 1: profiles
    # -----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id          UUID PRIMARY KEY,
            full_name   TEXT,
            email       TEXT,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
    """)

    # -----------------------------------------------------------
    # Table 2: study_plans
    # -----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS study_plans (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         UUID NOT NULL,
            assignment_name TEXT NOT NULL,
            subject         TEXT NOT NULL,
            due_date        DATE NOT NULL,
            assignment_type TEXT NOT NULL
                CHECK (assignment_type IN ('essay','report','presentation','exam','project')),
            workload        TEXT NOT NULL
                CHECK (workload IN ('light','moderate','heavy')),
            status          TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed')),
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        );
    """)

    # -----------------------------------------------------------
    # Table 3: availability
    # -----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS availability (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plan_id     UUID NOT NULL,
            monday      DECIMAL(4,2) DEFAULT 0,
            tuesday     DECIMAL(4,2) DEFAULT 0,
            wednesday   DECIMAL(4,2) DEFAULT 0,
            thursday    DECIMAL(4,2) DEFAULT 0,
            friday      DECIMAL(4,2) DEFAULT 0,
            saturday    DECIMAL(4,2) DEFAULT 0,
            sunday      DECIMAL(4,2) DEFAULT 0
        );
    """)

    # -----------------------------------------------------------
    # Table 4: preferences
    # -----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS preferences (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plan_id             UUID NOT NULL,
            session_length      INTEGER NOT NULL
                CHECK (session_length IN (25, 50, 90)),
            preferred_study_time TEXT NOT NULL
                CHECK (preferred_study_time IN ('morning','afternoon','evening')),
            break_frequency     TEXT NOT NULL
                CHECK (break_frequency IN ('every_25min','every_50min','when_needed')),
            priority            TEXT NOT NULL
                CHECK (priority IN ('finish_early','balanced','difficult_first'))
        );
    """)

    # -----------------------------------------------------------
    # Table 5: study_sessions
    # -----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS study_sessions (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plan_id       UUID NOT NULL,
            session_date  DATE NOT NULL,
            start_time    TIME NOT NULL,
            end_time      TIME NOT NULL,
            task_name     TEXT NOT NULL,
            is_completed  BOOLEAN DEFAULT FALSE,
            note          VARCHAR(50)
        );
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Database initialization completed successfully")


if __name__ == "__main__":
    init_db()