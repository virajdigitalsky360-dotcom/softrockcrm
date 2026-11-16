/*
# CRM Assistant — Dedup RPC

When a duplicate system_alerts dedup_key is inserted (Postgres raises a
unique violation), the frontend calls this RPC to increment the
occurrence_count and update last_seen_at on the existing row instead of
creating a duplicate alert.
*/

CREATE OR REPLACE FUNCTION public.increment_system_alert(p_dedup_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.system_alerts
  SET occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      updated_at = now()
  WHERE dedup_key = p_dedup_key;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_system_alert(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_system_alert(text) TO authenticated;
