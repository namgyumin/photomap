CREATE TABLE public.visit_photos (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id         uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  uploader_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path     text NOT NULL,       -- Supabase Storage object path 또는 MVP 로컬 URI
  thumbnail_128    text,
  thumbnail_512    text,
  width            integer,
  height           integer,
  captured_at      timestamptz,
  is_cover         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visit_photos_visit_id_idx ON public.visit_photos(visit_id);

ALTER TABLE public.visit_photos ENABLE ROW LEVEL SECURITY;

-- 방문 기록 소유자만 연결된 사진/영상 조회
CREATE POLICY "visit_photos_select_own"
  ON public.visit_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );

-- 본인 방문에 본인만 업로드
CREATE POLICY "visit_photos_insert_own"
  ON public.visit_photos FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id
    AND EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );

-- 업로더 또는 방문 기록 소유자만 삭제
CREATE POLICY "visit_photos_delete_own"
  ON public.visit_photos FOR DELETE
  USING (
    auth.uid() = uploader_id
    OR EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );
