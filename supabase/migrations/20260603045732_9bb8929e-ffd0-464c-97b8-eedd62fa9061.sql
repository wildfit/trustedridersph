ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS starting_tank_full boolean NOT NULL DEFAULT false;