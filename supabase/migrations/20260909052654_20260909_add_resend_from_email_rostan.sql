-- Store Rostan's Resend FROM email in the secrets table
INSERT INTO public.cron_secrets (key, value)
VALUES ('RESEND_FROM_EMAIL_ROSTAN', 'SOFTROCK <onboarding@resend.dev>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
