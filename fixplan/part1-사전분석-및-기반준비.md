# Part 1 — 사전 분석 및 기반 준비

> 원본: `fixtheeverything.md` §구현 전 반드시 할 일, §유지해야 하는 Props, §컬러 팔레트, §간격/픽셀 기준

## 목표

코드 작성 전 프로젝트 구조를 파악하고, 전체 파트에서 공유할 상수(색상/간격)를 확정한다.

## 할 일

### 1. 분석할 파일 (코드 작성 전 필독)

- `src/components/PlaceDetailSheet.tsx` (재작성 대상)
- memory 관련 service 파일
- google places 관련 service 파일
- media upload 관련 service 파일
- auth 관련 service 파일
- Place / Memory / Media 타입 정의 파일
- 현재 PlaceDetailSheet의 불필요한 state / UI / placeholder / mock data 목록화

### 2. 원칙

- Google Maps 스타일 구현에 필요 없는 기존 코드는 제거 가능
- 이미 연결된 실제 API/service 함수는 가능한 유지
- 하위 호환성 억지로 유지 안 함 — `PlaceDetailSheet.tsx` 완전 재작성 허용

### 3. Props interface — 절대 변경 금지

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

### 4. 공유 상수 정의 (모든 파트에서 사용)

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

- 작은 화면 대응: `Dimensions.get('window').width` 기준으로 사진 그리드 width 계산

## 완료 조건

- [ ] 관련 service/타입 파일 구조 파악 완료
- [ ] 제거할 기존 코드(불필요 state, placeholder, mock) 목록 확보
- [ ] 공유 상수 확정
