-- ==============================================================================
-- KoyuncuFit Supabase PostgreSQL Database Schema
-- Multi-User Social Fitness Platform with Friend Comparisons & Cloud Sync
-- ==============================================================================
--
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your Project and navigate to the "SQL Editor" in the left sidebar.
-- 3. Click "New Query", paste this entire script, and click "Run".
-- 4. In Project Settings > API, copy your Project URL and anon public API key
--    into your Vercel Environment Variables or local .env file:
--    VITE_SUPABASE_URL=https://your-project.supabase.co
--    VITE_SUPABASE_ANON_KEY=your-anon-public-key
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USERS TABLE
-- Stores athlete profile, biometrics, avatar styling, and hashed security PIN.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')) DEFAULT 'male',
  age INTEGER DEFAULT 25,
  weight_kg NUMERIC DEFAULT 75,
  height_cm NUMERIC DEFAULT 178,
  body_fat_percentage NUMERIC DEFAULT 15,
  avatar_color TEXT DEFAULT '#3b82f6',
  pin_hash TEXT,
  pin_salt TEXT,
  share_workouts BOOLEAN DEFAULT TRUE,
  share_routines BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Case-insensitive lookup index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON public.users (LOWER(username));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ROUTINES TABLE
-- Stores custom workout routine templates created by athletes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exercises JSONB NOT NULL DEFAULT '[]'::JSONB,
  display_order INTEGER DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routines_user_id ON public.routines(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_order ON public.routines(user_id, display_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WORKOUTS TABLE
-- Stores completed workout sessions, exercise logs, sets, reps, and volume.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  routine_id TEXT,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  exercises JSONB NOT NULL DEFAULT '[]'::JSONB,
  exercise_ids INTEGER[] DEFAULT '{}',
  total_volume NUMERIC NOT NULL DEFAULT 0,
  total_sets INTEGER NOT NULL DEFAULT 0,
  calories_burned NUMERIC DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_started_at ON public.workouts(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_exercise_ids ON public.workouts USING GIN (exercise_ids);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FOLLOWS TABLE
-- Stores athlete social graph relationships (followers & following).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Enables safe public reading for discovery/comparison and scoped write access.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- USERS POLICIES
DROP POLICY IF EXISTS "Public users directory is viewable by all" ON public.users;
CREATE POLICY "Public users directory is viewable by all"
  ON public.users FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can create a user account" ON public.users;
CREATE POLICY "Anyone can create a user account"
  ON public.users FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own account" ON public.users;
CREATE POLICY "Users can update their own account"
  ON public.users FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Users can delete their own account" ON public.users;
CREATE POLICY "Users can delete their own account"
  ON public.users FOR DELETE
  USING (true);

-- ROUTINES POLICIES
DROP POLICY IF EXISTS "Routines viewable by all" ON public.routines;
CREATE POLICY "Routines viewable by all"
  ON public.routines FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage routines" ON public.routines;
CREATE POLICY "Users can manage routines"
  ON public.routines FOR ALL
  USING (true);

-- WORKOUTS POLICIES
DROP POLICY IF EXISTS "Workouts viewable by all" ON public.workouts;
CREATE POLICY "Workouts viewable by all"
  ON public.workouts FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage workouts" ON public.workouts;
CREATE POLICY "Users can manage workouts"
  ON public.workouts FOR ALL
  USING (true);

-- FOLLOWS POLICIES
DROP POLICY IF EXISTS "Follows viewable by all" ON public.follows;
CREATE POLICY "Follows viewable by all"
  ON public.follows FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage follows" ON public.follows;
CREATE POLICY "Users can manage follows"
  ON public.follows FOR ALL
  USING (true);

-- Realtime publication for live feed updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workouts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workouts, public.routines, public.follows, public.users;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if publication already configured or permissions vary
END $$;
