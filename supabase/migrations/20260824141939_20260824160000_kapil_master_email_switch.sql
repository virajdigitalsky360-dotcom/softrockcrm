-- 1. Promote kapilprajapati9054@gmail.com to master and clean up display name
UPDATE public.profiles
SET role = 'master', display_name = 'Kapil'
WHERE email = 'kapilprajapati9054@gmail.com';

-- 2. Delete the duplicate kapilrajprajapati9054@gmail.com profile
--    (only has 1 auto-saved sticky note, no task data)
DELETE FROM public.sticky_notes WHERE user_id = '6c82a101-2a45-47f0-a875-02e75de8e41f';
DELETE FROM public.profiles WHERE id = '6c82a101-2a45-47f0-a875-02e75de8e41f';

-- 3. Update the auth trigger to use kapilprajapati9054@gmail.com as master
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_tm uuid;
BEGIN
  v_role := CASE
    WHEN new.email IN ('viraj.digitalsky360@gmail.com','kapilprajapati9054@gmail.com') THEN 'master'
    WHEN new.email = 'softrockwork@gmail.com' THEN 'view_all'
    ELSE 'normal'
  END;
  SELECT id INTO v_tm FROM public.team_members WHERE email = new.email;
  INSERT INTO public.profiles (id, email, role, team_member_id)
  VALUES (new.id, new.email, v_role, v_tm)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
