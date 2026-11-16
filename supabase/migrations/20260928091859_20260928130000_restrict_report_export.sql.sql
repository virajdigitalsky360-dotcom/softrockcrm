/*
# Restrict Report Export to Primary Master (Viraj)

## Purpose
Only Viraj (Primary Master) can export/download work reports.
Kapil and Rostan can view reports but cannot export.
This is enforced at the database level via a SECURITY DEFINER function.

## New Functions

### can_export_reports()
Returns true only if the caller is Viraj (viraj.digitalsky360@gmail.com).
Used as a backend gate before any export operation.

## Security
- The function checks the caller's email against the Primary Master email.
- Even if the frontend is manipulated to show export buttons, the export
  functions call this RPC first — if it returns false, the export is blocked.
- No existing data or policies are modified.
*/

CREATE OR REPLACE FUNCTION public.can_export_reports()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    ''
  ) = 'viraj.digitalsky360@gmail.com';
$$;

GRANT EXECUTE ON FUNCTION public.can_export_reports() TO authenticated;
