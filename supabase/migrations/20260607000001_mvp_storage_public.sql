-- Make visit-photos public for MVP display.
-- Switch to private + signed URLs (via Edge Function) once thumbnail pipeline is ready (Stage 3+).
UPDATE storage.buckets SET public = true WHERE id = 'visit-photos';

-- Allow authenticated users to read their own files
CREATE POLICY "visit_photos_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'visit-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
