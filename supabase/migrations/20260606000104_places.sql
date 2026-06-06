CREATE TABLE public.places (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_place_id  text UNIQUE NOT NULL,
  display_name     text,          -- 캐시 (약관상 장기 저장 주의)
  address          text,          -- 캐시 (약관상 장기 저장 주의)
  location         geography(POINT, 4326) NOT NULL,
  cached_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자가 장소 조회 가능
CREATE POLICY "places_select_authenticated"
  ON public.places FOR SELECT
  USING (auth.role() = 'authenticated');

-- 백엔드(service role)만 캐시 저장
-- 클라이언트는 Edge Function 경유로만 접근
CREATE POLICY "places_insert_service"
  ON public.places FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
