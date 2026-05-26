
-- Revoke direct access to security-definer helpers from clients.
REVOKE ALL ON FUNCTION public.hash_security_answer(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_security_answer(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- has_role is referenced inside RLS policies and must remain executable.
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hash_security_answer(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_security_answer(TEXT, TEXT) TO service_role;
