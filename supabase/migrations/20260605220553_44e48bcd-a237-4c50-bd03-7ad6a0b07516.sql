
-- 1. Reset attempts log (server-only).
CREATE TABLE public.password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid,
  succeeded boolean not null default false,
  ip text,
  created_at timestamptz not null default now()
);
CREATE INDEX password_reset_attempts_email_created_idx
  ON public.password_reset_attempts (lower(email), created_at desc);
GRANT ALL ON public.password_reset_attempts TO service_role;
ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;
-- No policies = no client access. Service role bypasses RLS.

-- 2. Short-lived reset tokens.
CREATE TABLE public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX password_reset_tokens_user_idx ON public.password_reset_tokens(user_id);
GRANT ALL ON public.password_reset_tokens TO service_role;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- No policies = no client access.

-- 3. Profile column guard: non-admins cannot touch privileged columns.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- Service role / no JWT (server-side) bypasses; auth.uid() is null there.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged :=
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Force protected columns back to OLD values for non-admins.
  NEW.is_enabled := OLD.is_enabled;
  NEW.access_mode := OLD.access_mode;
  NEW.access_starts_at := OLD.access_starts_at;
  NEW.access_ends_at := OLD.access_ends_at;
  NEW.first_sign_in_completed := OLD.first_sign_in_completed;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_protected ON public.profiles;
CREATE TRIGGER profiles_guard_protected
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_columns();

-- 4. Remove unused plaintext default password.
DELETE FROM public.app_settings WHERE key = 'default_password';
