/*
# CRM Assistant — System Alerts Table

1. New Table: `system_alerts`
   - Stores CRM/system problems detected by the CRM Assistant chatbot
   - Only Viraj (Primary Master) can read alerts
   - Any authenticated user can insert alerts (so the frontend can report errors),
     but only Viraj can see them
   - Deduplication via a unique `dedup_key` — inserting a duplicate key
     updates `last_seen_at` and increments `occurrence_count` instead of
     creating a new row

2. Columns:
   - id (uuid, PK)
   - severity (text: 'error' | 'warning' | 'info')
   - module (text: which CRM area — Task Management, Email, Auth, etc.)
   - title (text: short summary)
   - message (text: plain-language description)
   - dedup_key (text: unique key to prevent duplicates)
   - occurrence_count (int, default 1)
   - is_read (boolean, default false — Viraj's read state)
   - last_seen_at (timestamptz)
   - created_at (timestamptz)
   - updated_at (timestamptz)

3. Security:
   - RLS enabled
   - SELECT: only Viraj (email = viraj.digitalsky360@gmail.com)
   - INSERT: any authenticated user (so frontend can report errors)
   - UPDATE: only Viraj (to mark as read)
   - DELETE: only Viraj (to clear history)
*/

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error', 'warning', 'info')),
  module text NOT NULL DEFAULT 'System',
  title text NOT NULL,
  message text NOT NULL,
  dedup_key text NOT NULL,
  occurrence_count int NOT NULL DEFAULT 1,
  is_read boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for deduplication
ALTER TABLE public.system_alerts
  DROP CONSTRAINT IF EXISTS system_alerts_dedup_key_key;
ALTER TABLE public.system_alerts
  ADD CONSTRAINT system_alerts_dedup_key_key UNIQUE (dedup_key);

-- Enable RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is Viraj (Primary Master)
CREATE OR REPLACE FUNCTION public.is_primary_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'master'
      AND lower(email) = 'viraj.digitalsky360@gmail.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_primary_master() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_primary_master() TO authenticated;

-- SELECT: only Viraj
DROP POLICY IF EXISTS "system_alerts_select_viraj" ON public.system_alerts;
CREATE POLICY "system_alerts_select_viraj" ON public.system_alerts
  FOR SELECT TO authenticated
  USING (public.is_primary_master());

-- INSERT: any authenticated user (to report errors)
DROP POLICY IF EXISTS "system_alerts_insert_authenticated" ON public.system_alerts;
CREATE POLICY "system_alerts_insert_authenticated" ON public.system_alerts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: only Viraj (mark as read, dedup updates)
DROP POLICY IF EXISTS "system_alerts_update_viraj" ON public.system_alerts;
CREATE POLICY "system_alerts_update_viraj" ON public.system_alerts
  FOR UPDATE TO authenticated
  USING (public.is_primary_master())
  WITH CHECK (public.is_primary_master());

-- DELETE: only Viraj
DROP POLICY IF EXISTS "system_alerts_delete_viraj" ON public.system_alerts;
CREATE POLICY "system_alerts_delete_viraj" ON public.system_alerts
  FOR DELETE TO authenticated
  USING (public.is_primary_master());

-- Grant table access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_alerts TO authenticated;

-- Index for Viraj's queries
CREATE INDEX IF NOT EXISTS system_alerts_unread_idx
  ON public.system_alerts (is_read, created_at DESC)
  WHERE is_read = false;
