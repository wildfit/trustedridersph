
-- Explicit write restrictions on driver_messages (defense in depth; server uses service role).
CREATE POLICY dm_insert_admin ON public.driver_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

CREATE POLICY dm_update_admin ON public.driver_messages
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

CREATE POLICY dm_delete_admin ON public.driver_messages
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

-- Allow authenticated users to read avatar objects so createSignedUrl works
-- once the avatars bucket is made private.
CREATE POLICY "Authenticated can read avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');
