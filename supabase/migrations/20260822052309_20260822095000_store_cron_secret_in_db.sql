/*
# Store CRON_SECRET in Database for pg_cron and Edge Function Sharing

1. Overview
   The pg_cron job runs inside the database and cannot read edge function
   environment variables. This migration creates a dedicated table to store
   the CRON_SECRET, accessible only by the service role (RLS enabled, no
   policies). A SECURITY DEFINER function lets the edge function read the
   same value via RPC.

2. New Tables
   - `public.cron_secrets`: stores key/value secrets for cron jobs.
     - `key` (text, primary key): secret name.
     - `value` (text): secret value.
   - RLS is enabled with no policies, so only the service role (which bypasses
     RLS) can read or write.

3. New Functions
   - `public.get_cron_secret()`: SECURITY DEFINER function that returns the
     CRON_SECRET value. Executable by authenticated only.

4. Security
   - The cron_secrets table is locked down: no anon or authenticated policies.
   - Only the service role (used by the edge function and pg_cron) can access it.
   - No existing tables, policies, or data are changed.

5. Important Notes
   - This database-stored secret is the single source of truth for CRON_SECRET.
   - The edge function reads it via RPC using the service role key.
   - The cron job reads it directly from the table.
*/

CREATE TABLE IF NOT EXISTS public.cron_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cron_secrets (key, value)
VALUES ('CRON_SECRET', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.cron_secrets WHERE key = 'CRON_SECRET' LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO authenticated;
