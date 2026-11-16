/*
# User Access Control System — Kapil Master Toggle + Individual CRM Down

## Purpose
Adds two Master-only access controls:
1. **Kapil Master Access** — a global setting (`kapil_master_access`) that, when OFF, makes Kapil's `current_role()` return `'normal'` instead of `'master'`. All RLS policies that check `is_master()` automatically enforce this.
2. **Individual User CRM Down** — a new `user_access_settings` table keyed by `user_id` with a `crm_down` boolean.

## Changes
1. Inserts `kapil_master_access` setting (default 'true').
2. Updates `current_role()` to return 'normal' for Kapil when setting is 'false'.
3. Creates `user_access_settings` table with RLS (users read own row, masters write).
*/

INSERT INTO settings (key, value) VALUES ('kapil_master_access', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public."current_role"()
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
SELECT
  CASE
    WHEN COALESCE((SELECT value FROM public.settings WHERE key = 'kapil_master_access'), 'true') = 'false'
      AND (
        SELECT email FROM public.profiles WHERE id = auth.uid()
      ) = 'kapilprajapati9054@gmail.com'
    THEN 'normal'
    ELSE COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'normal')
  END;
$function$;

CREATE TABLE IF NOT EXISTS public.user_access_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_down boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_access_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_access" ON public.user_access_settings;
CREATE POLICY "select_own_access"
  ON public.user_access_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_master_access" ON public.user_access_settings;
CREATE POLICY "insert_master_access"
  ON public.user_access_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_master());

DROP POLICY IF EXISTS "update_master_access" ON public.user_access_settings;
CREATE POLICY "update_master_access"
  ON public.user_access_settings FOR UPDATE
  TO authenticated
  USING (public.is_master())
  WITH CHECK (public.is_master());

DROP POLICY IF EXISTS "delete_master_access" ON public.user_access_settings;
CREATE POLICY "delete_master_access"
  ON public.user_access_settings FOR DELETE
  TO authenticated
  USING (public.is_master());
