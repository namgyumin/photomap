# Part 5 — 사진 레이아웃 시스템 (7종 레이아웃 + slot)

> 원본: `fixtheeverything.md` §사진 영역 핵심 변경 사항, §레이아웃 선택 UI, §사진 슬롯 동작, §보기 모드 사진 영역

## 목표

사진 개수에 따른 자동 고정 레이아웃 대신, 사용자가 레이아웃을 직접 고르고 칸(slot)에 사진을 채우는 시스템 구현. 가장 큰 신규 기능 파트.

## 할 일

### 1. 사진 추가 흐름

1. 수정 모드 진입
2. 사진 영역에서 "레이아웃 선택" 버튼 클릭
3. 레이아웃 선택 모달 오픈
4. 원하는 레이아웃 선택
5. 빈 칸(slot)들 표시
6. 칸 클릭 → 사진 선택/업로드
7. 채워지면 Google Maps 스타일 그리드로 표시

### 2. 7종 기본 레이아웃 (첨부 이미지 001~007 기준)

```ts
type PhotoLayoutType =
  | 'single'          // A: 1장 전체형 — height 300, width '100%'
  | 'twoVertical'     // B: 2장 좌우 분할 — height 260, 50/50, gap 3
  | 'twoHorizontal'   // C: 2장 위아래 — 각 height 190, gap 3
  | 'threeLeftHero'   // D: 왼쪽 큰 사진 + 오른쪽 2장 — height 360, left 38% / right 62%, rightPhotoHeight 178, gap 3 (40/60 조정 가능)
  | 'threeRightHero'  // E: 오른쪽 큰 사진 + 왼쪽 2장 — height 360, left 62% / right 38%, leftPhotoHeight 178, gap 3
  | 'threeTopHero'    // F: 상단 큰 사진 + 하단 2장 — photo1Height 210, bottomHeight 150, gap 3
  | 'threeBottomHero' // G: 상단 2장 + 하단 큰 사진 — topHeight 160, bottomHeight 210, gap 3
```

레이아웃 형태:

```
A: [    1    ]   B: [1|2]   C: [1 / 2 위아래]
D: [1 | 2/3]    E: [1/2 | 3]
F: [1 / 2|3]    G: [1|2 / 3]
```

### 3. 레이아웃 선택 UI

- 수정 모드에서 사진 영역 위/안쪽에 "레이아웃 선택" 버튼
  - `height: 42, borderRadius: 21, backgroundColor: '#F0F0EE', paddingHorizontal: 16`
- 모달: bottom sheet 또는 centered modal
- 모달 안에 각 레이아웃 미니 프리뷰 표시 (1장 전체형 / 2장 좌우형 / 2장 위아래형 / 3장 왼쪽대표형 / 3장 오른쪽대표형 / 3장 상단대표형 / 3장 하단대표형)
- 선택 레이아웃은 state로 관리

### 4. 사진 슬롯 동작

```ts
type PhotoSlot = {
  slotIndex: number
  mediaId?: string
  uri?: string
}
```

- 빈 slot 클릭 → 사진 선택/업로드
- 사진 있는 slot 클릭 → 교체 또는 삭제 옵션
- 삭제 버튼: 사진 우상단 표시. 삭제 후 해당 slot만 비움
- **저장 후 재로드 시 레이아웃 + slot 위치 유지 필수**
- DB가 layoutType/slot 저장 미지원이면: 현재 가능한 범위로 구현 + `place-detail-sheet-required-backend-changes.md` 작성 (Part 8 참조)

### 5. 보기 모드

- **추가/삭제 버튼 절대 노출 금지**
- 사진 없으면 placeholder만:
  ```
  📷
  아직 사진이 없습니다
  수정 버튼을 눌러 사진을 추가하세요
  ```
  스타일: `height: 220, backgroundColor: '#F0F0EE', 중앙 정렬, borderRadius: 0`
- 사진 있으면 선택된 레이아웃대로 표시
- 사진 클릭 → 전체화면 뷰어 (Part 6)
- 사진 그리드 width는 `Dimensions.get('window').width` 기준 계산

## 완료 조건

- [ ] 7종 레이아웃 모두 렌더링
- [ ] 레이아웃 선택 모달 + 미니 프리뷰
- [ ] slot 추가/교체/삭제 동작
- [ ] 저장 후 재로드 시 레이아웃/slot 유지
- [ ] 보기 모드에서 편집 UI 완전 숨김
