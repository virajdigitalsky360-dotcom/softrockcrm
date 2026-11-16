-- Store Kapil's Resend FROM email in the secrets table so the send-email edge function can read it
INSERT INTO public.cron_secrets (key, value)
VALUES ('RESEND_FROM_EMAIL_KAPIL', 'SOFTROCK <onboarding@resend.dev>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
