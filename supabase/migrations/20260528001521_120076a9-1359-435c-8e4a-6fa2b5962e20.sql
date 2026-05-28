
-- 1. Driver account controls
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'indefinite',
  ADD COLUMN IF NOT EXISTS access_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_ends_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_mode_check
  CHECK (access_mode IN ('indefinite','duration'));

-- Admins/superadmin can view & update any profile
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

DROP POLICY IF EXISTS audit_insert ON public.audit_log;
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid()
              AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin')));

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity_type, entity_id, created_at DESC);

-- 3. Fee categories admin CRUD
DROP POLICY IF EXISTS fee_cat_admin_all ON public.fee_categories;
CREATE POLICY fee_cat_admin_all ON public.fee_categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

-- 4. Admin write access to records (superadmin already covered)
DROP POLICY IF EXISTS shifts_admin_update ON public.shifts;
CREATE POLICY shifts_admin_update ON public.shifts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS shifts_admin_delete ON public.shifts;
CREATE POLICY shifts_admin_delete ON public.shifts FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS trips_admin_update ON public.trips;
CREATE POLICY trips_admin_update ON public.trips FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS trips_admin_delete ON public.trips;
CREATE POLICY trips_admin_delete ON public.trips FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS fuel_admin_update ON public.fuel_logs;
CREATE POLICY fuel_admin_update ON public.fuel_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS fuel_admin_delete ON public.fuel_logs;
CREATE POLICY fuel_admin_delete ON public.fuel_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS fee_entries_admin_update ON public.fee_entries;
CREATE POLICY fee_entries_admin_update ON public.fee_entries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS fee_entries_admin_delete ON public.fee_entries;
CREATE POLICY fee_entries_admin_delete ON public.fee_entries FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- 5. App settings: admin read/write
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_admin_select ON public.app_settings;
CREATE POLICY app_settings_admin_select ON public.app_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

-- Seed default app settings if missing
INSERT INTO public.app_settings (key, value) VALUES
  ('default_gas_rate_php_per_liter', '65'::jsonb),
  ('default_password', '"TrustedRider123!"'::jsonb)
ON CONFLICT (key) DO NOTHING;
