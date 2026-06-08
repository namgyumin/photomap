# PhotoMap

> 오늘 간 곳에 사진을 꽂는 지도 앱

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2056-000020?logo=expo)](https://docs.expo.dev/versions/v56.0.0/)
[![React Native](https://img.shields.io/badge/React%20Native-0.85-61DAFB?logo=react)](https://reactnative.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-backend-3ECF8E?logo=supabase)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Built with Codex](https://img.shields.io/badge/Built%20with-OpenAI%20Codex-412991?logo=openai)](https://openai.com/codex)

---

## 뭐하는 앱인가

카페, 식당, 여행지를 다녀온 뒤 "그 장소 사진 어디 있지?" 하는 순간이 있다. 사진첩엔 날짜별로 쌓이고, 지도엔 아무것도 없다.

PhotoMap은 장소를 검색하고, 거기서 찍은 사진을 붙이고, 지도 위에 핀으로 남긴다. 친구와 공유하면 링크 하나로 상대방이 기억을 그대로 가져올 수 있다.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| **지도 탐색** | Google Maps 위에 내 방문 장소를 사진 마커로 표시 |
| **장소 검색** | Google Places 자동완성으로 장소 검색 + 상세 정보 (전화번호, 영업시간, 웹사이트) |
| **기억 기록** | 방문 날짜별 사진 타임라인 + 메모 저장 |
| **딥링크 공유** | `photomap://share/<token>` — 링크 하나로 친구가 같은 기억을 가져옴 |
| **게스트 모드** | 회원가입 없이 익명으로 시작, 나중에 계정 연결 가능 |
| **Apple / Google 로그인** | 이메일 없이 소셜 인증만 |

---

## 기술 스택

```
React Native (Expo SDK 56) + TypeScript
  ├── expo-router          — 파일 기반 라우팅
  ├── react-native-maps    — Google Maps iOS/Android
  ├── expo-image-picker    — PHPickerViewController 기반 사진 선택
  └── expo-apple-authentication

Supabase
  ├── Auth                 — Apple / Google / Anonymous sign-in
  ├── Storage              — 사진 업로드 + 썸네일
  ├── PostgreSQL + RLS     — 방문 기록, 미디어, 공유 토큰
  └── Edge Functions       — Google Places API 프록시 (서버사이드 키 보호)
```

---

## 로컬 실행

**필수 조건**
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator 또는 실기기 (dev build 필요)

**설치**

```bash
git clone https://github.com/namgyumin/photomap.git
cd photomap
npm install
```

**환경 변수 설정**

```bash
cp .env.example .env
```

`.env`에 아래 값을 채운다.

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

Supabase Edge Function 시크릿도 설정해야 Places API가 동작한다.

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=...
```

**실행**

```bash
npx expo run:ios    # dev build (실기기 권장)
npx expo start      # Expo Go (지도 제한됨)
```

---

## 폴더 구조

```
app/
  (auth)/          ← 로그인 화면
  (tabs)/
    index.tsx      ← 지도 메인 + 장소 검색
    memories.tsx   ← 기억 리스트 + 공유 가져오기
    profile.tsx    ← 프로필
  share/[token].tsx ← 딥링크 공유 수신 화면

src/
  components/
    PlaceDetailSheet.tsx   ← 장소 상세 + 사진 타임라인
    SharedImportModal.tsx  ← 공유 기억 가져오기
  hooks/
    useAuth.ts     ← 인증 상태 관리
  lib/
    googlePlaces.ts ← Places 검색 / 상세 API
    media.ts        ← 사진 리사이즈 + 업로드
    supabase.ts     ← 클라이언트 초기화
  services/
    memories.ts    ← 방문 기록 CRUD

supabase/
  functions/
    places-search/   ← Google Places 검색 프록시
    places-details/  ← Google Places 상세 프록시
    _shared/         ← 요청 검증 + 레이트 리미터
  migrations/        ← PostgreSQL 스키마 + RLS
```

---

## 아키텍처 메모

- **RLS 우선** — DB 레벨에서 행 단위 접근 제어. 클라이언트가 다른 유저 데이터를 직접 조회 불가
- **Places API 프록시** — Google Maps 키를 Edge Function 시크릿에만 두고 클라이언트에 노출하지 않음
- **딥링크 공유 흐름**: `Share.share()` → `photomap://share/<token>` → 수신자 앱이 토큰으로 기억 조회 → 한 번 탭으로 내 지도에 추가
- **게스트 → 계정 전환**: `signInAnonymously()` → Apple/Google 연결 시 같은 UID 유지

---

## 로드맵

- [x] Stage 0 — 개발 환경 + Supabase 스키마 + RLS
- [x] Stage 1 — 인증 (Apple / Google / Guest) + 온보딩
- [x] Stage 2 — 장소 검색 / 사진 업로드 / 지도 마커 / 딥링크 공유
- [ ] Stage 3 — 친구 팔로우 / 피드 / 전화번호 연동
- [ ] Stage 4 — 여행 회고 카드 생성 / 내보내기
- [ ] Stage 5 — App Store 출시

---

## Built with Codex

이 앱은 **OpenAI Codex**와 함께 설계하고 구현했다. 기획 단계 open question 10개 결정부터 Supabase 스키마 설계, RLS 정책, Edge Function 구현, UI 컴포넌트까지 전 과정을 Codex와 페어 프로그래밍으로 진행했다.

Obsidian 기반 AI Wiki 시스템([AI-Agent-Wiki-Template](https://github.com/namgyumin/AI-Agent-Wiki-Template))을 함께 운용해 세션 간 맥락을 이어갔다.

---

## 라이선스

MIT
