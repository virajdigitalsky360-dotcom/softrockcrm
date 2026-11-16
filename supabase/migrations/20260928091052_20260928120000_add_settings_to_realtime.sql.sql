/*
# Add settings table to Supabase Realtime publication

## Purpose
The `settings` table (which stores `maintenance_mode` and `kapil_master_access`)
was NOT in the `supabase_realtime` publication. This means Supabase Realtime
`postgres_changes` subscriptions on the `settings` table never fired — clients
never received maintenance mode toggle events until they manually refreshed.

## Fix
Add `public.settings` to the `supabase_realtime` publication so that any UPDATE
to the settings table (e.g. Viraj toggling maintenance mode) immediately pushes
a realtime event to all subscribed clients.

## Security
- The settings table only contains boolean flags (maintenance_mode, kapil_master_access).
- SELECT is already open to authenticated users via RLS.
- Realtime only sends events for rows the user can SELECT (RLS applies to realtime too).
- No data is modified or deleted.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
