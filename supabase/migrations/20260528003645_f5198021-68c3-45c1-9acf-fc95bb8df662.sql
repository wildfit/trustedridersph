
-- 1. Lock down user_security_answers: all access goes through SECURITY DEFINER server fns via service_role.
DROP POLICY IF EXISTS usa_select_own ON public.user_security_answers;
DROP POLICY IF EXISTS usa_insert_own ON public.user_security_answers;
DROP POLICY IF EXISTS usa_update_own ON public.user_security_answers;
DROP POLICY IF EXISTS usa_delete_own ON public.user_security_answers;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_security_answers FROM authenticated, anon;

-- 2. user_roles: explicit deny for INSERT/UPDATE/DELETE by client roles (service_role bypasses RLS).
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

CREATE POLICY user_roles_no_insert ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY user_roles_no_update ON public.user_roles
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY user_roles_no_delete ON public.user_roles
  FOR DELETE TO authenticated USING (false);

-- 3. SECURITY DEFINER helpers must not be callable by signed-in users — only service_role.
REVOKE EXECUTE ON FUNCTION public.verify_security_answer(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_security_answer(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_security_answer(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hash_security_answer(text) TO service_role;

-- 4. Avatars bucket: stop allowing clients to list all objects. Files remain reachable by public URL
--    because the bucket is public; we just block bucket-wide enumeration via storage.objects SELECT.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
