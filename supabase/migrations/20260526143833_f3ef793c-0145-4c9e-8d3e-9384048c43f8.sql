
-- =============================================================================
-- Trusted Riders — Phase 1 schema
-- =============================================================================
-- All money in PHP (₱), distance in km, fuel in liters.
-- Roles live in user_roles (NEVER on profiles) to avoid privilege escalation.
-- Security answers stored hashed via pgcrypto bcrypt, verified server-side.
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enum: app_role
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('driver', 'admin', 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- profiles
-- ===========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,                          -- matches auth.users.id (no FK per policy)
  full_name TEXT,
  phone TEXT,
  motorcycle_brand TEXT,
  motorcycle_model TEXT,
  fuel_tank_liters NUMERIC(5,2),
  first_sign_in_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- user_roles  (kept separate from profiles)
-- ===========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ===========================================================================
-- security_questions (catalog)
-- ===========================================================================
CREATE TABLE public.security_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.security_questions TO authenticated;
GRANT ALL ON public.security_questions TO service_role;
ALTER TABLE public.security_questions ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- user_security_answers (hashed answers)
-- ===========================================================================
CREATE TABLE public.user_security_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.security_questions(id) ON DELETE RESTRICT,
  answer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_security_answers TO authenticated;
GRANT ALL ON public.user_security_answers TO service_role;
ALTER TABLE public.user_security_answers ENABLE ROW LEVEL SECURITY;

-- Hash + verify helpers (SECURITY DEFINER so RLS-free).
-- Normalise (lower + trim) so casing/whitespace don't lock a driver out.
CREATE OR REPLACE FUNCTION public.hash_security_answer(_answer TEXT)
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT crypt(lower(trim(_answer)), gen_salt('bf', 10));
$$;

CREATE OR REPLACE FUNCTION public.verify_security_answer(_answer TEXT, _hash TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT _hash = crypt(lower(trim(_answer)), _hash);
$$;

-- ===========================================================================
-- shifts
-- ===========================================================================
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  starting_odometer_km NUMERIC(10,2),
  ending_odometer_km NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_driver_started ON public.shifts(driver_id, started_at DESC);
CREATE TRIGGER trg_shifts_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- trips
-- ===========================================================================
DO $$ BEGIN
  CREATE TYPE public.service_type AS ENUM ('angkas', 'pabakal', 'padala');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL,
  service_type public.service_type NOT NULL,
  gross_fare_php NUMERIC(10,2) NOT NULL DEFAULT 0,
  distance_km NUMERIC(10,2),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trips_driver ON public.trips(driver_id, started_at DESC);
CREATE INDEX idx_trips_shift ON public.trips(shift_id);
CREATE TRIGGER trg_trips_updated_at BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- fuel_logs
-- ===========================================================================
CREATE TABLE public.fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  liters NUMERIC(6,2) NOT NULL,
  price_per_liter_php NUMERIC(8,2) NOT NULL,
  total_cost_php NUMERIC(10,2) NOT NULL,
  odometer_km NUMERIC(10,2),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fuel_driver ON public.fuel_logs(driver_id, logged_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_logs TO authenticated;
GRANT ALL ON public.fuel_logs TO service_role;
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- fee_categories  (seeded)
-- ===========================================================================
CREATE TABLE public.fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_categories TO authenticated;
GRANT ALL ON public.fee_categories TO service_role;
ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- fee_entries
-- ===========================================================================
CREATE TABLE public.fee_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.fee_categories(id),
  amount_php NUMERIC(10,2) NOT NULL,
  note TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fees_driver ON public.fee_entries(driver_id, logged_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_entries TO authenticated;
GRANT ALL ON public.fee_entries TO service_role;
ALTER TABLE public.fee_entries ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- app_settings  (server-only)
-- ===========================================================================
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- RLS POLICIES
-- ===========================================================================

-- profiles: own row; admins/superadmins can read all; superadmin can write all
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));

-- user_roles: read own; only superadmin writes
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'));

-- security_questions: any authed user reads active questions
CREATE POLICY security_questions_select ON public.security_questions FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'superadmin'));

-- user_security_answers: own only (no SELECT on hash recommended, but allowed for own row)
CREATE POLICY usa_select_own ON public.user_security_answers FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY usa_insert_own ON public.user_security_answers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY usa_update_own ON public.user_security_answers FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY usa_delete_own ON public.user_security_answers FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- shifts
CREATE POLICY shifts_select ON public.shifts FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY shifts_insert ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());
CREATE POLICY shifts_update ON public.shifts FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY shifts_delete ON public.shifts FOR DELETE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));

-- trips
CREATE POLICY trips_select ON public.trips FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY trips_insert ON public.trips FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());
CREATE POLICY trips_update ON public.trips FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY trips_delete ON public.trips FOR DELETE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));

-- fuel_logs
CREATE POLICY fuel_select ON public.fuel_logs FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY fuel_insert ON public.fuel_logs FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());
CREATE POLICY fuel_update ON public.fuel_logs FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY fuel_delete ON public.fuel_logs FOR DELETE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));

-- fee_categories: any authed user reads
CREATE POLICY fee_cat_select ON public.fee_categories FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'superadmin'));

-- fee_entries
CREATE POLICY fee_entries_select ON public.fee_entries FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY fee_entries_insert ON public.fee_entries FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());
CREATE POLICY fee_entries_update ON public.fee_entries FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY fee_entries_delete ON public.fee_entries FOR DELETE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));

-- app_settings: no anon, no authenticated reads (server-side admin client only)
-- Intentionally NO policies for authenticated → access denied by default.

-- ===========================================================================
-- Auto-create profile + driver role on new auth user
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Default new accounts to driver. Superadmin seeding upgrades the role afterward.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===========================================================================
-- SEED DATA
-- ===========================================================================
INSERT INTO public.security_questions (question_text) VALUES
  ('What is your mother''s first name?'),
  ('What is the name of the street you grew up on?'),
  ('What is the name of your first pet?'),
  ('What city were you born in?'),
  ('What is your favorite food?'),
  ('What was the name of your elementary school?'),
  ('What is your father''s middle name?'),
  ('What is your favorite basketball team?');

INSERT INTO public.fee_categories (name) VALUES
  ('Toll'),
  ('Parking'),
  ('Commission'),
  ('Food'),
  ('Phone load'),
  ('Other');

INSERT INTO public.app_settings (key, value) VALUES
  ('default_driver_password', '"Welcome312"'::jsonb),
  ('superadmin_email',        '"admin@trustedriders.ph"'::jsonb),
  ('superadmin_username',     '"Admin"'::jsonb);
