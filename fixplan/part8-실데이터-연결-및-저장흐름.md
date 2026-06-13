# Part 8 — 실제 데이터 연결 + 저장 흐름

> 원본: `fixtheeverything.md` §실제 데이터 연결, §Google Place Details, §저장 흐름, §하지 말 것

## 목표

mock data 전면 금지. Google Places 실데이터 + 기존 memory service 연결.

## 할 일

### 1. 장소 기본 정보 우선순위

```ts
const placeName =
  searchPlace?.name ??
  detail?.place?.name ??
  ''

const subtitle =
  searchPlace?.address ??
  detail?.place?.address ??
  ''
```

### 2. Google Place Details

```ts
const googlePlaceId =
  searchPlace?.googlePlaceId ??
  detail?.place?.google_place_id
```

- 시트 열림 + googlePlaceId 존재 → `fetchPlaceDetails(googlePlaceId)` 호출
- 사용 가능 필드:
  - `rating`, `userRatingCount`
  - `primaryTypeDisplayName.text`
  - `regularOpeningHours.openNow`, `regularOpeningHours.weekdayDescriptions`
  - `internationalPhoneNumber`
  - `priceLevel` 또는 `priceRange`
- **데이터 없으면 빈 텍스트 하드코딩 금지 — 해당 UI 렌더링 자체 생략**

### 3. 저장 흐름

**searchPlace로 들어온 미저장 장소:**
1. 장소 정보는 표시, 사진 영역은 비움
2. 저장 버튼 → 기존 `handleSave()` 흐름 유지
3. 저장 성공 → `currentId` 설정
4. `load(currentId)` 호출 → 저장된 memory detail 재로드
5. 이후 사진 추가 가능

**memoryId 있는 경우:**
- 열릴 때 `load(memoryId)` 호출 → 저장된 사진/메모리/장소 정보 로드

### 4. 금지 사항 (하지 말 것)

- Google Maps처럼 안 보이는 독자 디자인 금지
- mock rating / mock review count / mock opening hours 금지
- `"4.1"`, `"(2,094)"`, `"16시간 12분"` 하드코딩 금지
- 없는 아이콘 파일 import로 빌드 깨뜨리기 금지
- 보기 모드에서 사진 추가 버튼 노출 금지
- Collapsed에서 사진 영역 노출 금지
- 기존 service/API 무시하고 가짜 데이터로 만들기 금지
- 불필요한 placeholder 컴포넌트 / 미사용 state·function·style 잔존 금지

## 완료 조건

- [ ] fetchPlaceDetails 실데이터 연동 (rating, review count, category, opening hours, phone)
- [ ] 신규 장소 저장 → currentId → load 재조회 흐름
- [ ] memoryId 진입 시 load 동작
- [ ] mock/하드코딩 값 0건
