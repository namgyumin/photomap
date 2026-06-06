-- 업로더만 업로드 가능
CREATE POLICY "visit_photos_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'visit-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 접근 권한은 visit_photos 테이블 RLS로 제어
-- signed URL 방식 사용 (Edge Function에서 발급)
