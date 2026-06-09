-- guest account lifecycle
-- 1) guest logout/self-destruct deletes guest-owned data immediately
-- 2) anonymous accounts inactive for 30+ days can be purged by scheduled cleanup

CREATE OR REPLACE FUNCTION public.purge_guest_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_is_anonymous boolean;
BEGIN
  SELECT is_anonymous
  INTO v_is_anonymous
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF COALESCE(v_is_anonymous, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'user is not anonymous';
  END IF;

  -- remove non-cascading references first
  DELETE FROM public.friendships
  WHERE requester_id = p_user_id OR addressee_id = p_user_id;

  DELETE FROM public.invite_links
  WHERE created_by = p_user_id;

  DELETE FROM public.visit_companions
  WHERE user_id = p_user_id;

  -- remove storage objects under <user_id>/...
  DELETE FROM storage.objects
  WHERE bucket_id = 'visit-photos'
    AND name LIKE p_user_id::text || '/%';

  -- deleting auth.users cascades to public.users, visits, visit_photos, shared_links, etc.
  DELETE FROM auth.users
  WHERE id = p_user_id
    AND is_anonymous IS TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_current_guest_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_uid uuid;
  v_is_anonymous boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT is_anonymous
  INTO v_is_anonymous
  FROM auth.users
  WHERE id = v_uid;

  IF COALESCE(v_is_anonymous, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'current user is not anonymous';
  END IF;

  PERFORM public.purge_guest_account(v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_anonymous_users(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM auth.users
    WHERE is_anonymous IS TRUE
      AND COALESCE(last_sign_in_at, created_at) < now() - interval '30 days'
    ORDER BY COALESCE(last_sign_in_at, created_at) ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  LOOP
    PERFORM public.purge_guest_account(r.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_guest_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_anonymous_users(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_current_guest_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_current_guest_account() TO authenticated;
