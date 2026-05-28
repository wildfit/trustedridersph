
-- Profile photo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Per-shift gas rate
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS gas_rate_php_per_liter numeric;

-- Fee category income/expense flag
ALTER TABLE public.fee_categories
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'income'
  CHECK (entry_type IN ('income','expense'));

-- Seed defaults (idempotent on name)
INSERT INTO public.fee_categories (name, entry_type, is_active)
VALUES ('Tip','income',true), ('Tariff','income',true), ('Toll','income',true), ('Other','income',true)
ON CONFLICT DO NOTHING;

-- Only one active shift per driver
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_active_per_driver
  ON public.shifts(driver_id) WHERE ended_at IS NULL;

-- Avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
