/*
# Add master-readable SELECT policy on profiles

## Problem
Masters need to see all user profiles in the Control Panel (User Role Control
and User CRM Access sections). The existing `pf_select` policy restricts SELECT
to own row only (`auth.uid() = id`), so masters only see their own profile.

## Fix
Add a second SELECT policy `pf_select_master` that allows users whose effective
role is 'master' (via `is_master()`) to read all profile rows.

No other changes — insert/update/delete policies are unchanged.
*/

DROP POLICY IF EXISTS "pf_select_master" ON public.profiles;
CREATE POLICY "pf_select_master" ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_master());
