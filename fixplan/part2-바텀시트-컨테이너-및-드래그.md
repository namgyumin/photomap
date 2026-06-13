# Part 2 — 바텀시트 컨테이너 + 3단계 드래그 동작

> 원본: `fixtheeverything.md` §바텀시트 동작 명세, §전체 바텀시트 컨테이너, §회색 핸들바, §지도 배경

## 목표

Google Maps처럼 Collapsed / Medium / Expanded 3단계로 snap되는 동적 바텀시트 골격을 만든다. 전체 재구현의 핵심 파트.

## 할 일

### 1. 세 가지 상태

| 상태 | 높이 (화면 대비) | 표시 내용 |
|---|---|---|
| **Collapsed** | 약 34~40% | 핸들바, 장소 이름, 부제/주소, 평점/리뷰수/이동시간, 카테고리/가격대, 영업 상태, 액션 버튼(경로/시작/통화/저장). **사진 영역·탭바·영업시간 상세 숨김** |
| **Medium** (기본 오픈 상태) | 약 70~78% | Collapsed 내용 + 사진 영역 + 탭바 + 영업시간 카드 일부 |
| **Expanded** | 약 88~92% | Medium 내용 + 영업시간/관련 장소/상세 정보 영역 + 하단 수정 버튼. 상단 둥근 모서리 유지 |

- 장소를 처음 누르면 **Medium**으로 열림

```ts
type SheetSnapState = 'collapsed' | 'medium' | 'expanded'

// 권장 snap point (top offset 기준)
const SNAP_POINTS = {
  COLLAPSED: screenHeight * 0.60,
  MEDIUM: screenHeight * 0.24,
  EXPANDED: screenHeight * 0.08,
}
// 또는 height 기준
const COLLAPSED_HEIGHT = screenHeight * 0.38
const MEDIUM_HEIGHT = screenHeight * 0.74
const EXPANDED_HEIGHT = screenHeight * 0.91
```

### 2. 드래그 동작 (Animated.Value 또는 RN Gesture 기반 필수)

- 핸들바 또는 시트 상단 영역 위로 드래그 → Expanded
- 아래로 드래그 → Collapsed
- 중간에서 멈추면 → Medium으로 snap
- 드래그 중 시트가 손가락을 따라 움직임
- 손 떼면 가장 가까운 상태로 spring animation

### 3. 컨테이너 스타일

- 위치: 화면 하단 absolute
- 배경: white
- 상단 좌우 border radius: 28~32px
- 그림자: iOS `shadowColor #000, shadowOpacity 0.12~0.18, shadowRadius 12~20` / Android `elevation 12+`
- overflow: hidden (필요한 곳만)
- safe area 고려

### 4. 회색 핸들바

```ts
width: 54
height: 5
borderRadius: 999
backgroundColor: '#C8C8C8'
marginTop: 10
marginBottom: 12
```

- 바텀시트 최상단 중앙. **반드시 드래그 가능**

### 5. 지도 배경

- 시트가 열려도 뒤에 기존 지도 화면이 보여야 함
- 화면 전체 검은 overlay 금지 — 투명 또는 아주 약한 overlay만

## 완료 조건

- [ ] 3단계 snap 동작 + spring animation
- [ ] 드래그 중 손가락 추종
- [ ] 지도 배경 노출 유지
- [ ] Collapsed에서 사진/탭바/영업시간 상세 숨김
