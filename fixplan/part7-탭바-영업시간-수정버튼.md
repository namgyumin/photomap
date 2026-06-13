# Part 7 — 탭바 + 영업시간 카드 + 하단 수정 버튼

> 원본: `fixtheeverything.md` §탭바, §영업시간 카드, §하단 수정 버튼

## 목표

사진 영역 아래 Google Maps식 탭바, 접이식 영업시간 카드, 하단 수정/수정완료 버튼 구현.

## 할 일

### 1. 탭바

```ts
const TABS = ['개요', '메뉴', '리뷰', '사진', '업데이트', '정보']
```

- height 58, 가로 스크롤 가능
- active text `#1C7B6C`, inactive text `#3C4043`
- active underline: `height 4, width 36, borderRadius 999, color #1C7B6C`
- **Collapsed 상태에서 숨김. Medium/Expanded에서만 표시**

### 2. 영업시간 카드 (탭바 아래)

접힘:
```
🕐 영업시간                          ˅
```
펼침:
```
🕐 영업시간                          ˄
월요일 09:00–23:00
화요일 09:00–23:00
...
```

- 스타일: `backgroundColor '#F1F3F4', borderRadius 22, paddingHorizontal 18, paddingVertical 16`
- `placeDetails.regularOpeningHours.weekdayDescriptions` 있으면 실제 데이터 표시
- **없으면 카드 자체 숨김**

### 3. 하단 수정 버튼

- 바텀시트 하단 상시 표시 (Collapsed에서 공간 부족 시 숨김 허용)
- 보기 모드: `[수정]` — `backgroundColor '#F0F0EE', textColor '#666'`
- 수정 모드: `[수정완료]` — `backgroundColor '#1C7B6C', textColor '#FFFFFF'`
- 공통: `height 48, borderRadius 24, marginHorizontal 16`

**수정완료 클릭 시:**
1. 최소 100ms ActivityIndicator 표시
2. 변경 정보 있으면 update API 호출
3. 사진 변경 있으면 최신 데이터 재로드
4. 수정 모드 종료

## 완료 조건

- [ ] 탭바 Collapsed 숨김 / Medium·Expanded 표시
- [ ] 영업시간 카드 접기/펼치기 + 데이터 없을 때 숨김
- [ ] 수정 ↔ 수정완료 전환 + 저장 시퀀스 동작
