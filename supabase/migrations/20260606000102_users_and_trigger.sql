CREATE TABLE public.users (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle       text UNIQUE NOT NULL,
  name         text NOT NULL,
  avatar_url   text,
  bio          text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 누구나 프로필 조회 가능 (나중에 private 계정 지원 시 변경)
CREATE POLICY "users_select_all"
  ON public.users FOR SELECT
  USING (true);

-- 본인만 자신의 프로필 수정
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- 회원가입 시 자동 생성 (trigger에서 INSERT)
CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, handle, name, avatar_url)
  VALUES (
    new.id,
    -- handle: email 앞부분 또는 랜덤 suffix
    COALESCE(
      split_part(new.email, '@', 1),
      'user_' || substr(new.id::text, 1, 8)
    ),
    COALESCE(new.raw_user_meta_data->>'full_name', '이름 없음'),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
