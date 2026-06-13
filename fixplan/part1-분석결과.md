# Part 1 결과 — 사전 분석 및 기반 준비

> 작성: 2026-06-10 / 대상: `src/components/PlaceDetailSheet.tsx` (1265줄) 재작성 준비
> Part 2~9 에서 이 문서를 기준으로 작업한다.

---

## 1. 프로젝트 구조 분석

### 파일 맵

| 역할 | 파일 | 비고 |
|---|---|---|
| 재작성 대상 | `src/components/PlaceDetailSheet.tsx` | 1265줄, 단일 호출처: `app/(tabs)/index.tsx:365` |
| memory service | `src/services/memories.ts` | visits/visit_photos CRUD + 공유 |
| google places | `src/lib/googlePlaces.ts` | `searchPlaces`, `fetchPlaceDetails` (Edge Function 우선) |
| media upload | `src/lib/media.ts` | pick + upload + thumbnail + `resolveMediaUri` |
| auth | `src/services/auth.ts`, `src/hooks/useAuth.ts` | supabase auth + guest |
| 타입 | `src/types/database.ts` | Place / Memory / Media / MemoryDetail 등 |
| config | `src/lib/config.ts` | supabaseUrl, edgeFunctionUrl, googleMapsApiKey |

### 호출처 (Props 계약 검증)

`app/(tabs)/index.tsx:365` 단일 사용. 전달 props: `visible`, `onClose`, `userId`, `searchPlace`, `memoryId`, `onSaved`. (`onChanged`는 현재 미전달 — optional이므로 유지.)

### 데이터 타입 핵심

- `MemoryDetail = { memory: Memory, place: PlaceLatLng | null, media: Media[] }` — `getMemoryDetail(id)` 반환
- `Media`: `storage_path`, `thumbnail_128/512`, `width/height`, `media_type('photo'|'video')`, `duration_seconds`, `sort_order`, `is_cover`
- `PlaceSearchResult`: `googlePlaceId`, `name`, `address`, `latitude/longitude`, `heroPhotoUrl`
- `PlaceDetailsResult`: `displayName`, `formattedAddress`, `regularOpeningHours{openNow, weekdayDescriptions[]}`, `internationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`, `primaryTypeDisplayName`, `googleHeroPhotoUrl`
- `Visibility = 'private' | 'link'`

### 유지해야 하는 service/API 연결 (현재 사용 중)

| 함수 | 출처 | 사용처 (현재) |
|---|---|---|
| `getMemoryDetail` | memories.ts | load() |
| `createOrGetPlace` + `createVisitMemory` | memories.ts | 신규 저장 흐름 |
| `updateVisitMemoryFields` | memories.ts | 저장 토글 / 수정완료 |
| `addMediaToVisit` | memories.ts | 사진 추가 |
| `deleteMedia` | memories.ts | 사진 삭제 |
| `fetchPlaceDetails` | googlePlaces.ts | 헤더/영업시간/통화 데이터 |
| `pickMediaMultiple`, `uploadMedia`, `resolveMediaUri` | media.ts | 사진 pick/업로드/URI |
| `VideoTooLongError`, `MAX_VIDEO_SECONDS` | media.ts | 에러 처리 |

미사용이지만 존재하는 함수 (재작성 시 필요하면 사용 가능): `setHeroMedia`, `updateMediaLocation`, `deleteVisitMemory`.

### 사용 가능한 아이콘 (assets/icons/)

`bookmark.png`, `bookmark-check.png`, `chevron-down.png`, `chevron-right.png`, `clock.png`, `close.png`, `direction.png`, `navigate.png`, `phone.png`, `share.png`

→ 이 10개 외 아이콘 import 금지. 새로 필요한 아이콘은 텍스트 fallback + `needed-place-detail-icons.md`에 기록 (Part 9).

---

## 2. 제거/교체 대상 목록 (현재 PlaceDetailSheet.tsx)

### 제거할 state / 로직

| 항목 | 위치(현재) | 이유 |
|---|---|---|
| `sheetExpanded` (boolean 2단계) | L91 | Part 2에서 3단계 snap(Collapsed/Half/Expanded)으로 교체 |
| `EXPANDED_DRAG = -200` 고정 오프셋 | L62 | 3단계 snap 좌표 체계로 교체 |
| `note`, `setNote` | L113 | 입력 UI 없음 — state만 존재하는 dead state. 데이터 흐름 Part 8에서 재설계 |
| `visitedAt` UI 없는 입력 | L112 | 위와 동일 — 편집 UI 미노출 상태로 state만 존재 |
| `visibility` state | L114 | 변경 UI 없음, 항상 'private' 고정 동작 |
| `isDirty` | L101 | note/visitedAt 편집 UI 없어 실질적으로 항상 false |
| `handleSave`의 `isSaved: !isSaved` 토글 방식 | L234, L252 | 북마크 토글과 저장 생성이 한 함수에 엉킴 — Part 4/8에서 분리 |
| `setTimeout(..., 100)` in `handleEditToggle` | L349 | 인위적 지연 — 제거 |
| `TABS` 중 미구현 탭 placeholder 동작 | L77, L645 | 탭 누르면 underline만 이동, 내용 없음 — Part 7에서 재정의 |
| `photoEmpty` (사진 없을 때 "아직 사진이 없습니다" 카드) | L411-418 | mock/placeholder 금지 원칙 — 데이터 없으면 UI 숨김 |
| `renderStars` 텍스트 ★ 방식 | L396-407 | Part 3 스펙에 따라 재구현 |
| `maxHeight '92%'/'88%'` interpolate 방식 | L503-507 | 3단계 snap translateY 방식으로 교체 |

### mock / 하드코딩 없음 확인

- 현재 코드에 mock data는 없음 (모두 실제 service 연결). 문제는 **dead state**(note/visitedAt/visibility)와 **placeholder UI**(빈 사진 카드, 미구현 탭).
- `UNSUPPORTED_MSG = '이 기능은 지원하지 않아요'` Alert 패턴 — 경로/시작/공유에서 사용 중. 유지 여부는 Part 4 스펙 따름.

### 유지할 검증된 로직 (재작성 시 이식)

- `load()` → `getMemoryDetail` 흐름 (L163-177)
- `fetchPlaceDetails` cancelled-flag effect (L202-216)
- `handleAddMedia`의 권한/중복/개수/영상길이 검증 (L268-317)
- `handleDeleteMedia` confirm Alert (L319-336)
- `handleCall` 전화번호 정규화 `tel:` Linking (L372-379)
- `thumbUri`/`fullUri` helper (썸네일 우선, 원본 fallback)
- viewer `getItemLayout` + `onMomentumScrollEnd` 인덱스 동기화 (Part 6에서 재사용)

---

## 3. 공유 상수 (확정 — Part 2~7 전체 사용)

```ts
const COLORS = {
  primary: '#1C7B6C',
  primaryDark: '#064B56',
  primaryLight: '#D8EEE9',
  actionBlueLight: '#D8F3F7',
  textDark: '#1A1A1A',
  textGray: '#5F6368',
  textLightGray: '#70757A',
  border: '#E8EAED',
  bgMuted: '#F0F0EE',
  cardBg: '#F1F3F4',
  white: '#FFFFFF',
  open: '#137333',
  closed: '#C62828',
  closingSoon: '#B06000',
  star: '#FBC02D',
}

const SHEET_RADIUS = 30

const SPACING = {
  horizontal: 24,
  section: 20,
  small: 8,
  medium: 12,
  large: 18,
}

const HEADER = {
  titleSizeExpanded: 28,
  titleSizeCollapsed: 23,
  subtitleSize: 17,
  metaSize: 16,
  lineHeightTitle: 34,
  lineHeightSubtitle: 23,
}

const ACTION_BUTTON = {
  height: 52,
  borderRadius: 26,
  paddingHorizontal: 22,
  gap: 12,
}

const ICON_BUTTON = {
  size: 44,
  borderRadius: 22,
}
```

- 작은 화면 대응: 사진 그리드 width는 `Dimensions.get('window').width` 기준 계산 (고정 px 금지)
- 기존 코드와 상수 차이 주의: 헤더 타이틀 21→28/23, 액션버튼 높이 50→52, 수평 패딩 16→24, 시트 radius 16→30, 별색 `#FBBC04`→`#FBC02D`

---

## 4. Props interface (변경 금지 — 검증 완료)

```ts
interface Props {
  visible: boolean
  onClose: () => void
  userId: string | null
  searchPlace?: PlaceSearchResult | null
  memoryId?: string | null
  onSaved?: (memoryId: string, place: PlaceSearchResult) => void
  onChanged?: () => void
}
```

현재 코드 interface와 동일. 호출처(`app/(tabs)/index.tsx`)와도 일치.

---

## 완료 조건 체크

- [x] 관련 service/타입 파일 구조 파악 완료 (§1)
- [x] 제거할 기존 코드 목록 확보 (§2)
- [x] 공유 상수 확정 (§3)

→ Part 2 (바텀시트 컨테이너 + 3단계 드래그) 진행 가능.
