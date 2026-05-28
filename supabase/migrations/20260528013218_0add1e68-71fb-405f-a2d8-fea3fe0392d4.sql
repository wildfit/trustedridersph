-- Remove broad SELECT policy that enabled listing all files in the public 'avatars' bucket.
-- The bucket is public, so direct file URLs continue to work via the public CDN without an RLS SELECT policy.
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;