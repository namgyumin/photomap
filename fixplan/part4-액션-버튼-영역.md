# Part 4 — 액션 버튼 영역 (경로/시작/통화/저장)

> 원본: `fixtheeverything.md` §액션 버튼 영역

## 목표

장소 정보 아래 Google Maps식 가로 스크롤 pill 버튼 행 구현.

## 할 일

### 1. 레이아웃

- 위치: 장소 정보 아래
- 가로 스크롤 (horizontal ScrollView)
- 버튼: `height: 52, borderRadius: 26, paddingHorizontal: 22`, gap 12

### 2. 버튼 종류

- 경로 / 시작 / 통화 / 저장(또는 저장됨)
- 디렉터리·주문 등은 실제 데이터/기능 있을 때만 추가 — 무리하게 넣지 말 것

### 3. 스타일

**경로 버튼 (primary)**
- backgroundColor `#0F7F8C` 또는 `#1C7B6C`
- text white, fontSize 16, fontWeight 700

**나머지 버튼**
- backgroundColor `#D8F3F7` 또는 `#D8EEE9`
- text `#064B56` 또는 `#1C7B6C`, fontSize 16, fontWeight 600

### 4. 동작

- **통화**: `placeDetails.internationalPhoneNumber` 있으면 `Linking.openURL('tel:...')`. 없으면 Alert `"전화번호 정보가 없습니다"`
- **공유**: 기능 없으면 Alert `"이 기능은 지원하지 않아요"`
- **저장**: 기존 `handleSave()` 흐름 유지 (Part 7 참조)

## 완료 조건

- [ ] Collapsed 상태에서도 액션 버튼까지는 보임
- [ ] 통화/공유 fallback Alert 동작
- [ ] 저장 ↔ 저장됨 상태 전환
