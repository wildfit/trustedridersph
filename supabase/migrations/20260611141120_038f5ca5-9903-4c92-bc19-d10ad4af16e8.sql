
-- driver_messages table
CREATE TABLE public.driver_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  sender_id uuid,
  subject text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX driver_messages_driver_created_idx
  ON public.driver_messages (driver_id, created_at DESC);

GRANT SELECT ON public.driver_messages TO authenticated;
GRANT ALL ON public.driver_messages TO service_role;

ALTER TABLE public.driver_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY dm_select_own_or_admin ON public.driver_messages
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

-- Auto-end stale shifts ( > 36h )
CREATE OR REPLACE FUNCTION public.auto_end_stale_shifts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT id, driver_id, notes
    FROM public.shifts
    WHERE ended_at IS NULL
      AND started_at < now() - interval '36 hours'
  LOOP
    UPDATE public.shifts
    SET ended_at = now(),
        notes = COALESCE(notes, '') || ' | Auto-ended after 36h'
    WHERE id = s.id;

    INSERT INTO public.driver_messages (driver_id, sender_id, subject, body)
    VALUES (
      s.driver_id,
      NULL,
      'Shift auto-ended',
      'Your shift was automatically ended because it had been active for more than 36 hours.'
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_end_stale_shifts() FROM PUBLIC, anon, authenticated;

-- pg_cron schedule
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-end-stale-shifts') THEN
    PERFORM cron.unschedule('auto-end-stale-shifts');
  END IF;
  PERFORM cron.schedule(
    'auto-end-stale-shifts',
    '*/30 * * * *',
    $cron$ SELECT public.auto_end_stale_shifts(); $cron$
  );
END $$;
