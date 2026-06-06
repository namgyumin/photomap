CREATE TYPE visibility_level AS ENUM (
  'private', -- 나만
  'link'     -- 공유 링크로 가져오기 허용
);

CREATE TABLE public.visits (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place_id     uuid NOT NULL REFERENCES public.places(id),
  visited_at   timestamptz NOT NULL DEFAULT now(),
  visibility   visibility_level NOT NULL DEFAULT 'private',
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visits_user_id_idx ON public.visits(user_id);
CREATE INDEX visits_place_id_idx ON public.visits(place_id);
CREATE INDEX visits_visited_at_idx ON public.visits(visited_at DESC);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- 본인 방문 기록 조회
CREATE POLICY "visits_select_own"
  ON public.visits FOR SELECT
  USING (auth.uid() = user_id);

-- 본인만 생성
CREATE POLICY "visits_insert_own"
  ON public.visits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인만 수정
CREATE POLICY "visits_update_own"
  ON public.visits FOR UPDATE
  USING (auth.uid() = user_id);

-- 본인만 삭제
CREATE POLICY "visits_delete_own"
  ON public.visits FOR DELETE
  USING (auth.uid() = user_id);
