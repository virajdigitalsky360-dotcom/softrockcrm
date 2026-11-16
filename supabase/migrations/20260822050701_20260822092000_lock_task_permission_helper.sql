/*
# Lock Task Permission Helper

1. Overview
   Restricts direct execution of the task-permission helper to signed-in users.
   The function remains callable by task RLS policies while anonymous callers
   cannot invoke it as a public database API.

2. Modified Objects
   - `public.can_manage_tasks()`: EXECUTE is revoked from `anon` and granted
     only to `authenticated`.

3. Security
   - The helper continues to derive the caller from `auth.uid()` and checks the
     existing role and permission catalogue.
   - No tables, task rows, or task policies are changed.
*/

REVOKE EXECUTE ON FUNCTION public.can_manage_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_tasks() TO authenticated;
