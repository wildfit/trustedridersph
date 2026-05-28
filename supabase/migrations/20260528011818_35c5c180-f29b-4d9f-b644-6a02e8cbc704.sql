
CREATE TYPE public.request_type AS ENUM ('profile_change', 'resubscribe');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.user_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  type public.request_type NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  message text,
  proposed jsonb,
  admin_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_requests TO authenticated;
GRANT ALL ON public.user_requests TO service_role;

ALTER TABLE public.user_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "req_select_own_or_admin" ON public.user_requests FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

CREATE POLICY "req_insert_own" ON public.user_requests FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE TRIGGER set_user_requests_updated_at
  BEFORE UPDATE ON public.user_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
