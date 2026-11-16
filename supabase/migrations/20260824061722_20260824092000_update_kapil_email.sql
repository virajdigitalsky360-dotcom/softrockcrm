/*
# Update Kapil's profile email to match new auth email

Kapil's auth.users email was changed from kprajapati9054@gmail.com to
kapilrajprajapati9054@gmail.com via the admin API. This migration updates
the public.profiles row to match. No other data is touched — Kapil's
master role, permissions, and history are unchanged. No team member record
exists for Kapil (he's a master account), so there's nothing to update there.
*/
UPDATE public.profiles
SET email = 'kapilrajprajapati9054@gmail.com'
WHERE id = '6c82a101-2a45-47f0-a875-02e75de8e41f';
