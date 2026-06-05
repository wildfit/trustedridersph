
-- Tighten shifts insert: only enabled drivers within their access window can create shifts
DROP POLICY IF EXISTS shifts_insert ON public.shifts;
CREATE POLICY shifts_insert ON public.shifts
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_enabled = true
        AND (p.access_mode = 'indefinite'
             OR (
               (p.access_starts_at IS NULL OR p.access_starts_at <= now())
               AND (p.access_ends_at IS NULL OR p.access_ends_at >= now())
             ))
    )
  );

-- Lock down SECURITY DEFINER functions: revoke public/anon execute on all of them.
-- has_role must remain executable by authenticated (used by RLS policies).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hash_security_answer(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_security_answer(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_security_answer(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_security_answer(text, text) TO service_role;

-- Trigger-only functions: not meant to be called directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_protected_columns() FROM PUBLIC, anon, authenticated;
