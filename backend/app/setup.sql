-- ============================================================
-- StudyPlan Backend — Complete Database Setup
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Table 1: profiles (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY,
    full_name   TEXT,
    email       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: study_plans
CREATE TABLE IF NOT EXISTS study_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    assignment_name TEXT NOT NULL,
    subject         TEXT NOT NULL,
    due_date        DATE NOT NULL,
    assignment_type TEXT NOT NULL CHECK (assignment_type IN ('essay','report','presentation','exam','project')),
    workload        TEXT NOT NULL CHECK (workload IN ('light','moderate','heavy')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Table 3: availability (one row per plan)
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

-- Table 4: preferences (one row per plan)
CREATE TABLE IF NOT EXISTS preferences (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL,
    session_length      INTEGER NOT NULL CHECK (session_length IN (25, 50, 90)),
    preferred_study_time TEXT NOT NULL CHECK (preferred_study_time IN ('morning','afternoon','evening')),
    break_frequency     TEXT NOT NULL CHECK (break_frequency IN ('every_25min','every_50min','when_needed')),
    priority            TEXT NOT NULL CHECK (priority IN ('finish_early','balanced','difficult_first'))
);

-- Table 5: study_sessions
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

-- ============================================================
-- 2. FOREIGN KEYS
-- ============================================================

-- profiles → auth.users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
        ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END$$;

-- study_plans → profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_plans_user_id_fkey') THEN
        ALTER TABLE study_plans ADD CONSTRAINT study_plans_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    END IF;
END$$;

-- availability → study_plans
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_plan_id_fkey') THEN
        ALTER TABLE availability ADD CONSTRAINT availability_plan_id_fkey
            FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE;
    END IF;
END$$;

-- preferences → study_plans
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preferences_plan_id_fkey') THEN
        ALTER TABLE preferences ADD CONSTRAINT preferences_plan_id_fkey
            FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE;
    END IF;
END$$;

-- study_sessions → study_plans
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_sessions_plan_id_fkey') THEN
        ALTER TABLE study_sessions ADD CONSTRAINT study_sessions_plan_id_fkey
            FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE;
    END IF;
END$$;

-- ============================================================
-- 3. TRIGGER — auto-create profile on Supabase Auth signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        NEW.email
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions  ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- study_plans
CREATE POLICY "plans_select_own" ON study_plans
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "plans_insert_own" ON study_plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plans_update_own" ON study_plans
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "plans_delete_own" ON study_plans
    FOR DELETE USING (auth.uid() = user_id);

-- availability
CREATE POLICY "availability_select_own" ON availability FOR SELECT USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = availability.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "availability_insert_own" ON availability FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = availability.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "availability_update_own" ON availability FOR UPDATE USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = availability.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "availability_delete_own" ON availability FOR DELETE USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = availability.plan_id AND study_plans.user_id = auth.uid()));

-- preferences
CREATE POLICY "preferences_select_own" ON preferences FOR SELECT USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = preferences.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "preferences_insert_own" ON preferences FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = preferences.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "preferences_update_own" ON preferences FOR UPDATE USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = preferences.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "preferences_delete_own" ON preferences FOR DELETE USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = preferences.plan_id AND study_plans.user_id = auth.uid()));

-- study_sessions
CREATE POLICY "sessions_select_own" ON study_sessions FOR SELECT USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = study_sessions.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "sessions_insert_own" ON study_sessions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = study_sessions.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "sessions_update_own" ON study_sessions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = study_sessions.plan_id AND study_plans.user_id = auth.uid()));
CREATE POLICY "sessions_delete_own" ON study_sessions FOR DELETE USING (
    EXISTS (SELECT 1 FROM study_plans WHERE study_plans.id = study_sessions.plan_id AND study_plans.user_id = auth.uid()));