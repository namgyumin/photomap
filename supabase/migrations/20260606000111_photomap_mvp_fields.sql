-- photomap MVP 데이터 레이어 보강
-- PRD v0.5 / import-merge-rule v0.5 기준
-- 매핑: memories = visits, media = visit_photos

-- shared_links.share_token 생성을 위한 random bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. visits (= memories) MVP 필드
-- ============================================================
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS amount_spent  numeric(12,2),
  ADD COLUMN IF NOT EXISTS hero_media_id uuid,
  ADD COLUMN IF NOT EXISTS is_saved      boolean NOT NULL DEFAULT true;

-- ============================================================
-- 2. visit_photos (= media) MVP 필드
-- ============================================================
ALTER TABLE public.visit_photos
  ADD COLUMN IF NOT EXISTS media_type           text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS duration_seconds     numeric(4,1),
  ADD COLUMN IF NOT EXISTS sort_order           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latitude             double precision,
  ADD COLUMN IF NOT EXISTS longitude            double precision,
  ADD COLUMN IF NOT EXISTS source_media_id      uuid REFERENCES public.visit_photos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_from_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- media_type: photo | video
ALTER TABLE public.visit_photos
  ADD CONSTRAINT visit_photos_media_type_chk
  CHECK (media_type IN ('photo', 'video'));

-- video는 최대 10초, photo는 duration 없음
ALTER TABLE public.visit_photos
  ADD CONSTRAINT visit_photos_duration_chk
  CHECK (
    (media_type = 'photo' AND duration_seconds IS NULL)
    OR
    (media_type = 'video' AND duration_seconds IS NOT NULL
      AND duration_seconds > 0 AND duration_seconds <= 10)
  );

CREATE INDEX IF NOT EXISTS visit_photos_sort_order_idx
  ON public.visit_photos(visit_id, sort_order);

-- 업로더 또는 방문 기록 소유자만 사진/영상 메타데이터 수정
-- MVP 용도: 사진/영상별 위치(latitude/longitude) long-press drag 조정, sort_order/cover 보정
DROP POLICY IF EXISTS "visit_photos_update_own" ON public.visit_photos;
CREATE POLICY "visit_photos_update_own"
  ON public.visit_photos FOR UPDATE
  USING (
    auth.uid() = uploader_id
    OR EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = uploader_id
    OR EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );

-- hero_media_id FK (media 삭제 시 대표 해제)
ALTER TABLE public.visits
  ADD CONSTRAINT visits_hero_media_fk
  FOREIGN KEY (hero_media_id) REFERENCES public.visit_photos(id) ON DELETE SET NULL;

-- places.location(geography)은 PostgREST에서 바로 lat/lng로 다루기 불편하므로
-- MVP 클라이언트 조회용 좌표 컬럼을 함께 유지한다.
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

UPDATE public.places
SET latitude = ST_Y(location::geometry),
    longitude = ST_X(location::geometry)
WHERE location IS NOT NULL
  AND (latitude IS NULL OR longitude IS NULL);

-- ============================================================
-- 3. shared_links (= 메모리 공유 / 가져오기용)
--    공동 편집 없이 토큰으로 내 기록에 import
-- ============================================================
CREATE TABLE public.shared_links (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id       uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  owner_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  share_token    text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shared_links_visit_id_idx ON public.shared_links(visit_id);
CREATE INDEX shared_links_token_idx ON public.shared_links(share_token);

ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

-- 소유자만 자기 공유 링크 목록 조회
CREATE POLICY "shared_links_select_own"
  ON public.shared_links FOR SELECT
  USING (auth.uid() = owner_user_id);

-- 소유자가 자기 visit 에 대해서만 생성
CREATE POLICY "shared_links_insert_own"
  ON public.shared_links FOR INSERT
  WITH CHECK (
    auth.uid() = owner_user_id
    AND EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id AND v.user_id = auth.uid()
    )
  );

CREATE POLICY "shared_links_delete_own"
  ON public.shared_links FOR DELETE
  USING (auth.uid() = owner_user_id);

-- ============================================================
-- 4. create_or_get_place RPC
--    places INSERT 는 service_role 전용 → 클라이언트는 definer RPC 경유
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_or_get_place(
  p_google_place_id text,
  p_display_name    text,
  p_address         text,
  p_latitude        double precision,
  p_longitude       double precision
)
RETURNS public.places
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.places;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.places (google_place_id, display_name, address, location, latitude, longitude)
  VALUES (
    p_google_place_id,
    p_display_name,
    p_address,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    p_latitude,
    p_longitude
  )
  ON CONFLICT (google_place_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.places.display_name),
        address      = COALESCE(EXCLUDED.address, public.places.address),
        location     = EXCLUDED.location,
        latitude     = EXCLUDED.latitude,
        longitude    = EXCLUDED.longitude
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. get_shared_memory RPC
--    공유 기록 미리보기. 토큰만 알면 RLS 우회하여 visit + photos 반환
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_shared_memory(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link   public.shared_links;
  v_visit  public.visits;
  v_place  public.places;
  v_result jsonb;
BEGIN
  SELECT * INTO v_link FROM public.shared_links
  WHERE share_token = p_token
    AND (expires_at IS NULL OR expires_at > now());

  IF v_link.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_visit FROM public.visits WHERE id = v_link.visit_id;
  IF v_visit.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_place FROM public.places WHERE id = v_visit.place_id;

  SELECT jsonb_build_object(
    'token', v_link.share_token,
    'owner_user_id', v_visit.user_id,
    'visit', jsonb_build_object(
      'id', v_visit.id,
      'visited_at', v_visit.visited_at,
      'note', v_visit.note,
      'amount_spent', v_visit.amount_spent,
      'hero_media_id', v_visit.hero_media_id,
      'place_id', v_visit.place_id
    ),
    'place', CASE WHEN v_place.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_place.id,
      'google_place_id', v_place.google_place_id,
      'display_name', v_place.display_name,
      'address', v_place.address,
      'latitude', v_place.latitude,
      'longitude', v_place.longitude
    ) END,
    'media', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'media_type', p.media_type,
        'storage_path', p.storage_path,
        'thumbnail_128', p.thumbnail_128,
        'thumbnail_512', p.thumbnail_512,
        'width', p.width,
        'height', p.height,
        'duration_seconds', p.duration_seconds,
        'captured_at', p.captured_at,
        'sort_order', p.sort_order,
        'latitude', p.latitude,
        'longitude', p.longitude
      ) ORDER BY p.sort_order)
      FROM public.visit_photos p WHERE p.visit_id = v_visit.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 6. import_shared_memory RPC
--    import-merge-rule v0.5 구현
--    p_mode: 'keep'(내 기록 유지) | 'overwrite'(모든 데이터 덮어쓰기)
--    p_target_visit_id: 같은 장소 기존 내 기록. NULL 이면 새 visit 생성
-- ============================================================
CREATE OR REPLACE FUNCTION public.import_shared_memory(
  p_token           text,
  p_mode            text DEFAULT 'keep',
  p_target_visit_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_link         public.shared_links;
  v_src_visit    public.visits;
  v_target_id    uuid;
  v_max_order    integer;
  v_src_owner    uuid;
  v_src_hero     uuid;
  v_new_hero     uuid;
  r_media        record;
  v_inserted_id  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_mode NOT IN ('keep', 'overwrite') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;

  SELECT * INTO v_link FROM public.shared_links
  WHERE share_token = p_token
    AND (expires_at IS NULL OR expires_at > now());
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'share link not found or expired';
  END IF;

  SELECT * INTO v_src_visit FROM public.visits WHERE id = v_link.visit_id;
  IF v_src_visit.id IS NULL THEN
    RAISE EXCEPTION 'source memory not found';
  END IF;
  v_src_owner := v_src_visit.user_id;
  v_src_hero  := v_src_visit.hero_media_id;

  IF v_src_owner = v_caller THEN
    RAISE EXCEPTION 'cannot import your own memory';
  END IF;

  -- ----- target visit 결정 -----
  IF p_target_visit_id IS NULL THEN
    -- 새 기록 생성: 모든 필드 공유 값에서 가져옴 (내 값이 비어있는 상태)
    INSERT INTO public.visits (
      user_id, place_id, visited_at, visibility, note,
      amount_spent, is_saved
    )
    VALUES (
      v_caller, v_src_visit.place_id, v_src_visit.visited_at,
      'private', v_src_visit.note,
      v_src_visit.amount_spent, true
    )
    RETURNING id INTO v_target_id;
  ELSE
    -- 기존 내 기록: 소유 검증
    PERFORM 1 FROM public.visits
    WHERE id = p_target_visit_id AND user_id = v_caller;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'target memory not owned by caller';
    END IF;
    v_target_id := p_target_visit_id;

    IF p_mode = 'keep' THEN
      -- 내 값 우선: 비어 있는 필드만 공유 값으로 채움 (방문일/장소는 항상 보존)
      UPDATE public.visits SET
        note         = COALESCE(note, v_src_visit.note),
        amount_spent = COALESCE(amount_spent, v_src_visit.amount_spent),
        updated_at   = now()
      WHERE id = v_target_id;
    ELSE
      -- overwrite: 위치(place)/방문일/메모/쓴 금액 공유 값으로 교체
      UPDATE public.visits SET
        place_id     = v_src_visit.place_id,
        visited_at   = v_src_visit.visited_at,
        note         = v_src_visit.note,
        amount_spent = v_src_visit.amount_spent,
        updated_at   = now()
      WHERE id = v_target_id;
    END IF;
  END IF;

  -- ----- 미디어 append (항상 기존 내 미디어 뒤 순서) -----
  SELECT COALESCE(MAX(sort_order), -1) INTO v_max_order
  FROM public.visit_photos WHERE visit_id = v_target_id;

  FOR r_media IN
    SELECT * FROM public.visit_photos
    WHERE visit_id = v_src_visit.id
    ORDER BY sort_order
  LOOP
    v_max_order := v_max_order + 1;
    INSERT INTO public.visit_photos (
      visit_id, uploader_id, storage_path, thumbnail_128, thumbnail_512,
      width, height, captured_at, is_cover, media_type, duration_seconds,
      sort_order, latitude, longitude, source_media_id, imported_from_user_id
    )
    VALUES (
      v_target_id, v_caller, r_media.storage_path, r_media.thumbnail_128,
      r_media.thumbnail_512, r_media.width, r_media.height, r_media.captured_at,
      false, r_media.media_type, r_media.duration_seconds, v_max_order,
      r_media.latitude, r_media.longitude, r_media.id, v_src_owner
    )
    RETURNING id INTO v_inserted_id;

    -- 공유 대표 사진에 대응하는 복사본 추적
    IF v_src_hero IS NOT NULL AND r_media.id = v_src_hero THEN
      v_new_hero := v_inserted_id;
    END IF;
  END LOOP;

  -- ----- 대표 사진 처리 -----
  IF p_target_visit_id IS NULL THEN
    -- 새 기록: 공유 대표 사진의 복사본을 대표로
    IF v_new_hero IS NOT NULL THEN
      UPDATE public.visits SET hero_media_id = v_new_hero WHERE id = v_target_id;
    END IF;
  ELSIF p_mode = 'overwrite' THEN
    -- 덮어쓰기: 공유 대표 사진의 복사본으로 교체
    IF v_new_hero IS NOT NULL THEN
      UPDATE public.visits SET hero_media_id = v_new_hero WHERE id = v_target_id;
    END IF;
  ELSE
    -- keep: 내 대표 사진 유지. 단 내 대표가 비어 있으면 공유 값으로 채움
    UPDATE public.visits SET hero_media_id = v_new_hero
    WHERE id = v_target_id AND hero_media_id IS NULL AND v_new_hero IS NOT NULL;
  END IF;

  RETURN v_target_id;
END;
$$;
