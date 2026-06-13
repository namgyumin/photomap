# Part 9 — 아이콘 정책 + 산출 문서 + TypeScript 검증

> 원본: `fixtheeverything.md` §아이콘 처리 정책, §TypeScript 요구사항, §완료 기준

## 목표

아이콘 fallback 처리, 필요 문서 2종 작성, 최종 검증.

## 할 일

### 1. 아이콘 처리 정책

- png 없다고 깨지는 import 추가 금지
- 파일 없으면 텍스트/벡터 문자 대체:
  - 경로 `◆`/`➤`, 시작 `▲`, 통화 `☎`, 저장 `🔖`, 공유 `↗`, 닫기 `×`, 시간 `◷`

### 2. 산출 문서 ① `needed-place-detail-icons.md`

필요 아이콘 목록: 파일명 / 용도 / 권장 px / 색상 / outline·filled 여부.

최소 포함:

| 파일명 | size | color | 용도 |
|---|---|---|---|
| direction.png | 24x24 | #FFFFFF | 경로 버튼 |
| navigation.png | 24x24 | #064B56 | 시작 버튼 |
| phone.png | 24x24 | #064B56 | 통화 버튼 |
| bookmark-outline.png | 24x24 | #064B56 | 저장 전 상태 |
| bookmark-filled.png | 24x24 | #064B56 | 저장된 상태 |
| share.png | 24x24 | #1a1a1a | 공유 버튼 |
| close.png | 24x24 | #1a1a1a | 닫기 버튼 |
| clock.png | 22x22 | #1a1a1a | 영업시간 카드 |

### 3. 산출 문서 ② `place-detail-sheet-required-backend-changes.md`

현재 DB/API가 사진 레이아웃 저장 미지원일 때만 작성.

```md
# Required Backend / DB Changes

## photoLayoutType
- purpose: 사용자가 선택한 사진 레이아웃 저장
- example values: single, twoVertical, twoHorizontal,
  threeLeftHero, threeRightHero, threeTopHero, threeBottomHero

## photoSlotIndex
- purpose: 각 사진이 어느 위치에 들어가는지 저장
- type: number
- example: 0, 1, 2
```

### 4. TypeScript 요구사항

- `npx tsc --noEmit` 통과 필수
- 불필요한 `any` 금지 (third-party 타입 불가피할 때만 최소)
- state/helper 타입 명확히:

```ts
type SheetSnapState = 'collapsed' | 'medium' | 'expanded'

type PhotoLayoutType =
  | 'single' | 'twoVertical' | 'twoHorizontal'
  | 'threeLeftHero' | 'threeRightHero'
  | 'threeTopHero' | 'threeBottomHero'

type PhotoSlot = {
  slotIndex: number
  mediaId?: string
  uri?: string
}
```

### 5. 최종 완료 기준 (전체 체크리스트)

- [ ] `npx tsc --noEmit` 통과
- [ ] 장소 클릭 → Google Maps 스타일 바텀시트 오픈
- [ ] Collapsed / Medium / Expanded 3단계 동작
- [ ] 핸들바 위로 → 확장, 아래로 → 축소
- [ ] Collapsed: 장소 정보 + 경로/시작/통화/저장 버튼까지만 표시
- [ ] Medium/Expanded: 사진 영역, 탭바, 영업시간 카드 표시
- [ ] 사진 추가 시 레이아웃 먼저 선택 → 칸에 사진 삽입
- [ ] 보기 모드에서 사진 추가/삭제 UI 비노출
- [ ] 사진 탭 → 전체화면 뷰어
- [ ] Places 실데이터 표시 (rating, review count, category, opening hours, phone)
- [ ] 데이터 없으면 해당 줄 숨김 (빈 placeholder 금지)
- [ ] `needed-place-detail-icons.md` 작성
- [ ] (필요 시) `place-detail-sheet-required-backend-changes.md` 작성
- [ ] 최종 UI가 첨부 이미지 001~007과 최대한 유사
