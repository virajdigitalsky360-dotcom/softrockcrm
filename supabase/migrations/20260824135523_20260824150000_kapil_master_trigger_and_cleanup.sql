-- Update the auth trigger to recognize Kapil's new email as master
-- and remove the old email from the master auto-assign list.
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
    WHEN new.email IN ('viraj.digitalsky360@gmail.com','kapilrajprajapati9054@gmail.com') THEN 'master'
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

-- Clean up display name (trailing space)
UPDATE public.profiles
SET display_name = 'Kapil'
WHERE id = '6c82a101-2a45-47f0-a875-02e75de8e41f' AND display_name = 'kapil ';
