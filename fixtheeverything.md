작은 화면에서는 장소 정보와 경로/시작/통화/저장 버튼까지만 보이고, 핸들바를 위로 올리면 첨부 이미지처럼 사진 영역과 탭바까지 보이는 Google Maps식 동적 바텀시트로 구현해라.


# PlaceDetailSheet.tsx — Google Maps Style Dynamic Bottom Sheet Rewrite Prompt

## 핵심 목표

현재 프로젝트 파일을 먼저 다시 분석한 뒤, `src/components/PlaceDetailSheet.tsx`를 Google Maps에서 가게/장소를 눌렀을 때 아래에서 올라오는 장소 상세 바텀시트처럼 완전히 재구현해줘.

가장 중요한 목표는 두 가지다.

1. **전체적인 UI/UX가 Google Maps 장소 상세 바텀시트처럼 보여야 한다.**
2. **상단 회색 핸들바를 위/아래로 드래그했을 때 화면 크기와 표시 정보가 동적으로 바뀌어야 한다.**

즉, 단순히 고정된 모달을 만드는 것이 아니라, Google Maps처럼 장소 정보가 담긴 바텀시트가 접힘/기본/확장 상태를 자연스럽게 오가야 한다.

---

## 구현 전 반드시 할 일

코드를 바로 작성하지 말고, 먼저 프로젝트 파일을 확인해라.

특히 아래 파일들을 먼저 찾아보고 현재 구조를 이해한 뒤 작업해라.

- `src/components/PlaceDetailSheet.tsx`
- memory 관련 service 파일
- google places 관련 service 파일
- media upload 관련 service 파일
- auth 관련 service 파일
- Place / Memory / Media 관련 타입 정의 파일
- 현재 PlaceDetailSheet에서 사용 중인 불필요한 state, UI, placeholder, mock data

기존 코드 중 Google Maps 스타일 구현에 필요 없는 부분은 제거해도 된다.

단, 현재 프로젝트에서 이미 연결되어 있는 실제 API/service 함수들은 가능한 유지해서 사용해라.

기존 구현과 하위 호환성을 억지로 유지하지 않아도 된다.  
필요하다면 `PlaceDetailSheet.tsx`는 완전히 새로 작성해도 된다.

---

## 유지해야 하는 Props

`PlaceDetailSheet.tsx`의 props interface는 변경하지 마라.

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

최종적으로 원하는 화면 느낌

첨부된 참고 이미지 001~007처럼 구현해라.

Google Maps의 장소 상세 바텀시트 구조를 기준으로 한다.

대략적인 구성은 다음과 같다.

┌──────────────────────────────────────┐
│ 지도 화면이 뒤에 보임                 │
│                                      │
├──────────────────────────────────────┤
│   ───── 회색 핸들바                  │
│                                      │
│ 장소 이름                 [저장][공유][닫기]
│ 부제 / 주소                           │
│ 평점 ★★★★★ 리뷰수 · 이동시간          │
│ 카테고리 · 가격대 · 기타 정보          │
│ 영업 중 / 영업 종료 · 영업시간 정보     │
│                                      │
│ [경로] [시작] [통화] [저장] ...        │
│                                      │
│ 사진 영역                             │
│                                      │
│ [개요] [메뉴] [리뷰] [사진] [업데이트] [정보]
│                                      │
│ 영업시간 / 관련 장소 / 상세 정보        │
└──────────────────────────────────────┘
바텀시트 동작 명세
1. 세 가지 상태를 구현해라

바텀시트는 최소 3가지 상태를 가져야 한다.

A. Collapsed 상태

핸들바를 아래로 내렸을 때의 작은 화면이다.

화면 높이는 전체 화면의 약 34~40% 정도로 한다.

이 상태에서는 아래 정보까지만 보여준다.

회색 핸들바
장소 이름
부제 또는 주소
평점 / 리뷰수 / 이동시간
카테고리 / 가격대
영업 상태
액션 버튼 영역
경로
시작
통화
저장

Collapsed 상태에서는 사진 영역, 탭바, 영업시간 상세 영역은 보이지 않게 한다.

즉, 사용자가 핸들바를 아래로 내리면 Google Maps처럼 “기본 장소 정보 + 액션 버튼”만 남아야 한다.

B. Medium 상태

기본으로 열리는 상태다.

화면 높이는 전체 화면의 약 70~78% 정도로 한다.

이 상태에서는 다음을 보여준다.

회색 핸들바
장소 기본 정보
액션 버튼
사진 영역
탭바
영업시간 카드 일부

사용자가 장소를 처음 눌렀을 때는 이 상태로 열리게 한다.

C. Expanded 상태

핸들바를 위로 올렸을 때의 큰 화면이다.

화면 높이는 전체 화면의 약 88~92% 정도로 한다.

첨부 이미지처럼 거의 전체 화면에 가까워야 한다.

이 상태에서는 다음을 보여준다.

회색 핸들바
장소 기본 정보
액션 버튼
사진 영역
탭바
영업시간 / 관련 장소 / 상세 정보 영역
아래쪽 수정 버튼

Expanded 상태에서도 상단은 둥근 모서리를 유지한다.

2. 드래그 동작

반드시 Animated.Value 또는 React Native Gesture 기반으로 자연스럽게 구현해라.

핵심은 다음이다.

회색 핸들바 또는 시트 상단 영역을 위로 드래그하면 Expanded 상태가 된다.
아래로 드래그하면 Collapsed 상태가 된다.
중간 정도에서 멈추면 Medium 상태로 snap 된다.
드래그 중에는 시트가 손가락을 따라 움직여야 한다.
손을 떼면 가장 가까운 상태로 자연스럽게 spring animation 된다.

권장 snap point:

const SNAP_POINTS = {
  COLLAPSED: screenHeight * 0.60,
  MEDIUM: screenHeight * 0.24,
  EXPANDED: screenHeight * 0.08,
}

또는 프로젝트 구조에 맞게 다음 방식으로 구현해도 된다.

const COLLAPSED_HEIGHT = screenHeight * 0.38
const MEDIUM_HEIGHT = screenHeight * 0.74
const EXPANDED_HEIGHT = screenHeight * 0.91

단, 최종 UX는 Google Maps처럼 보여야 한다.

3. 지도 배경

PlaceDetailSheet가 열렸을 때 뒤에는 기존 지도 화면이 보여야 한다.

바텀시트가 화면 전체를 검은 overlay로 덮어버리면 안 된다.

필요하다면 배경 overlay는 투명하거나 아주 약하게만 처리해라.

UI 상세 명세
전체 바텀시트 컨테이너
위치: 화면 하단 absolute
배경: white
상단 좌우 border radius: 28~32px
그림자:
iOS: shadowColor #000, shadowOpacity 0.12~0.18, shadowRadius 12~20
Android: elevation 12 이상
overflow: hidden 또는 필요한 곳만 hidden
safe area 고려
회색 핸들바

위치: 바텀시트 최상단 중앙

크기:

width: 54
height: 5
borderRadius: 999
backgroundColor: '#C8C8C8'
marginTop: 10
marginBottom: 12

핸들바는 반드시 드래그 가능해야 한다.

헤더 영역
장소 이름
fontSize: 28px 내외
fontWeight: 700
color: #1a1a1a
lineHeight: 34
최대 2줄
긴 이름은 자연스럽게 줄바꿈

Collapsed 상태에서는 fontSize를 22~24px 정도로 줄여도 된다.

부제 / 주소
fontSize: 17px
color: #5F6368
lineHeight: 23
최대 2줄
평점 줄

예시:

4.1 ★★★★★ (2,094) · 🚇 16시간 12분
fontSize: 16px
rating number: #5F6368
star color: #FBC02D
review count color: #5F6368
이동시간 정보가 없으면 표시하지 마라.
mock data로 이동시간을 넣지 마라.
카테고리 / 가격대

예시:

일본라면 전문식당 · ¥1,000~2,000
fontSize: 16px
color: #5F6368
값이 없으면 해당 항목은 표시하지 마라.
영업 상태

예시:

영업 중 · 오후 11:00에 영업 종료
영업 종료 · 오전 9:00에 영업 시작
24시간 영업
fontSize: 16px
open 상태: #137333
closed 상태: #C62828
곧 닫음 상태가 있으면 #B06000 계열 사용 가능
placeDetails에 정보가 없으면 아예 렌더링하지 마라.
우측 상단 아이콘 버튼

장소 이름 오른쪽 상단에 Google Maps처럼 3개의 원형 아이콘 버튼을 둔다.

버튼 크기:

width: 44
height: 44
borderRadius: 22
backgroundColor: '#F5F3F3'

간격:

gap: 12

아이콘:

저장
공유
닫기

아이콘 파일이 아직 없다면 임시로 텍스트 아이콘을 사용해라.

예:

♡ 또는 🔖
↗ 또는 ⤴
×

단, 아이콘 파일이 필요하다면 실제 png 파일을 임의로 만들지 말고, 필요한 아이콘 목록을 별도 문서로 만들어라.

파일명 예시:

needed-icons.md

그 안에 필요한 아이콘 이름, 용도, 권장 사이즈, 색상을 적어라.

예:

# Needed Icons

## bookmark-outline.png
- size: 24x24
- color: #1C7B6C
- usage: 저장 안 된 상태

## bookmark-filled.png
- size: 24x24
- color: #1C7B6C
- usage: 저장된 상태

## share.png
- size: 24x24
- color: #1a1a1a
- usage: 공유 버튼

## close.png
- size: 24x24
- color: #1a1a1a
- usage: 닫기 버튼
액션 버튼 영역

Google Maps처럼 가로 스크롤 버튼으로 구현해라.

위치: 장소 정보 아래

버튼 높이:

height: 52
borderRadius: 26
paddingHorizontal: 22

버튼 간격:

gap: 12

버튼 종류:

경로
시작
통화
저장 또는 저장됨
필요하면 디렉터리 / 주문 등 추가 가능
단, 실제 데이터나 기능이 없으면 무리하게 추가하지 마라.
경로 버튼
backgroundColor: #0F7F8C 또는 #1C7B6C
text color: white
fontSize: 16
fontWeight: 700
나머지 버튼
backgroundColor: #D8F3F7 또는 #D8EEE9
text color: #064B56 또는 #1C7B6C
fontSize: 16
fontWeight: 600

통화 버튼은 placeDetails.internationalPhoneNumber가 있으면 Linking.openURL('tel:...')을 사용한다.
전화번호가 없으면 Alert로 "전화번호 정보가 없습니다"를 보여준다.

공유 버튼은 아직 기능이 없으면 Alert로 "이 기능은 지원하지 않아요"를 보여준다.

사진 영역 핵심 변경 사항

기존처럼 사진 개수에 따라 자동으로 레이아웃이 고정되는 방식만 사용하지 마라.

사용자가 사진을 추가할 때 다음 흐름을 구현해라.

사진 추가 흐름
사용자가 수정 모드로 들어간다.
사진 영역에서 "레이아웃 선택" 버튼을 누른다.
레이아웃 선택 모달이 열린다.
사용자는 원하는 사진 레이아웃을 고른다.
선택한 레이아웃의 빈 칸들이 표시된다.
사용자가 원하는 칸을 눌러 사진을 추가한다.
각 칸에 사진이 들어가면 Google Maps 스타일 그리드로 보인다.
지원해야 하는 기본 사진 레이아웃

첨부 이미지 001~007을 참고해서 다음 레이아웃을 기본 제공해라.

Layout A — 1장 전체형
┌──────────────────────────────┐
│                              │
│            Photo 1           │
│                              │
└──────────────────────────────┘

사용 조건:

사진 1장
대표 사진 하나만 크게 보여줄 때

권장 크기:

height: 300
width: '100%'
Layout B — 2장 세로 분할형
┌──────────────┬──────────────┐
│              │              │
│   Photo 1    │   Photo 2    │
│              │              │
└──────────────┴──────────────┘

사용 조건:

사진 2장
두 사진을 동일 비중으로 보여줄 때

권장 크기:

height: 260
leftWidth: '50%'
rightWidth: '50%'
gap: 3
Layout C — 2장 위아래형

첨부 이미지 004, 007과 비슷한 형태다.

┌──────────────────────────────┐
│           Photo 1            │
├──────────────────────────────┤
│           Photo 2            │
└──────────────────────────────┘

사용 조건:

사진 2장
두 사진 모두 가로형이거나, 음식 사진처럼 넓게 보여주는 게 자연스러울 때

권장 크기:

photo1Height: 190
photo2Height: 190
gap: 3
Layout D — 3장 왼쪽 큰 사진 + 오른쪽 2장

첨부 이미지 001과 비슷한 형태다.

┌──────────────┬──────────────┐
│              │   Photo 2    │
│   Photo 1    ├──────────────┤
│              │   Photo 3    │
└──────────────┴──────────────┘

사용 조건:

대표 사진 1장을 크게 보여주고, 나머지 2장을 오른쪽에 쌓을 때

권장 크기:

height: 360
leftWidth: '38%'
rightWidth: '62%'
rightPhotoHeight: 178
gap: 3

또는 화면 비율에 맞게 left/right를 40/60으로 조정해도 된다.

Layout E — 3장 오른쪽 큰 사진 + 왼쪽 2장

첨부 이미지 002, 005와 비슷한 형태다.

┌──────────────┬──────────────┐
│   Photo 1    │              │
├──────────────┤   Photo 3    │
│   Photo 2    │              │
└──────────────┴──────────────┘

사용 조건:

세로 사진 또는 대표 사진을 오른쪽에 크게 보여주고 싶을 때

권장 크기:

height: 360
leftWidth: '62%'
rightWidth: '38%'
leftPhotoHeight: 178
gap: 3
Layout F — 3장 상단 큰 사진 + 하단 2장

첨부 이미지 006과 비슷한 형태다.

┌──────────────────────────────┐
│           Photo 1            │
├──────────────┬──────────────┤
│   Photo 2    │   Photo 3    │
└──────────────┴──────────────┘

사용 조건:

대표 사진을 위에 크게 두고, 아래에 보조 사진 2장을 둘 때

권장 크기:

photo1Height: 210
bottomHeight: 150
gap: 3
Layout G — 3장 상단 2장 + 하단 큰 사진

첨부 이미지 003과 비슷한 형태다.

┌──────────────┬──────────────┐
│   Photo 1    │   Photo 2    │
├──────────────┴──────────────┤
│           Photo 3            │
└──────────────────────────────┘

사용 조건:

아래쪽 사진을 풍경이나 큰 장소 사진으로 보여주고 싶을 때

권장 크기:

topHeight: 160
bottomHeight: 210
gap: 3
레이아웃 선택 UI

수정 모드에서 사진 영역 위나 안쪽에 "레이아웃 선택" 버튼을 둔다.

버튼 스타일:

height: 42
borderRadius: 21
backgroundColor: '#F0F0EE'
paddingHorizontal: 16

레이아웃 선택 모달은 bottom sheet 또는 centered modal로 구현해도 된다.

모달 안에는 각 레이아웃의 미니 프리뷰를 보여준다.

예:

[1장 전체형]
[2장 좌우형]
[2장 위아래형]
[3장 왼쪽대표형]
[3장 오른쪽대표형]
[3장 상단대표형]
[3장 하단대표형]

선택한 레이아웃은 state로 관리한다.

예:

type PhotoLayoutType =
  | 'single'
  | 'twoVertical'
  | 'twoHorizontal'
  | 'threeLeftHero'
  | 'threeRightHero'
  | 'threeTopHero'
  | 'threeBottomHero'
사진 슬롯 동작

수정 모드에서는 선택한 레이아웃의 각 사진 칸이 slot처럼 동작해야 한다.

각 slot 상태 예시:

type PhotoSlot = {
  slotId: string
  mediaId?: string
  uri?: string
}

동작:

빈 slot을 누르면 사진 선택/업로드
이미 사진이 있는 slot을 누르면 교체 또는 삭제 옵션 표시
삭제 버튼은 사진 오른쪽 상단에 표시
삭제 후에는 해당 slot만 비워짐
저장 후 다시 불러왔을 때도 선택한 레이아웃과 slot 위치가 유지되어야 함

만약 현재 DB 구조가 slot 위치나 layoutType 저장을 지원하지 않는다면, 우선 현재 가능한 범위에서 구현하고, 필요한 DB/API 변경 사항을 별도 문서로 작성해라.

파일명:

place-detail-sheet-required-backend-changes.md

문서에 다음 내용을 적어라.

# Required Backend / DB Changes

## photoLayoutType
- purpose: 사용자가 선택한 사진 레이아웃 저장
- example values:
  - single
  - twoVertical
  - twoHorizontal
  - threeLeftHero
  - threeRightHero
  - threeTopHero
  - threeBottomHero

## photoSlotIndex
- purpose: 각 사진이 어느 위치에 들어가는지 저장
- type: number
- example:
  - 0
  - 1
  - 2
보기 모드 사진 영역

보기 모드에서는 추가/삭제 버튼을 절대 보여주지 마라.

사진이 없으면 다음 placeholder만 보여준다.

📷
아직 사진이 없습니다
수정 버튼을 눌러 사진을 추가하세요

스타일:

height: 220
backgroundColor: '#F0F0EE'
alignItems: 'center'
justifyContent: 'center'
borderRadius: 0

사진이 있으면 사용자가 선택한 레이아웃대로 보여준다.

사진을 누르면 전체화면 사진 뷰어가 열린다.

전체화면 사진 뷰어

사진을 탭하면 Google Maps처럼 검은 배경 전체화면 뷰어를 열어라.

구성:

┌──────────────────────────────────────┐
│  ×                              1 / 3 │
│                                      │
│                                      │
│              Photo                   │
│                                      │
│                                      │
│ ‹                                ›   │
└──────────────────────────────────────┘

요구사항:

Modal 사용
animationType="fade"
backgroundColor: black
사진은 화면 안에서 contain 또는 cover 중 자연스러운 방식 사용
좌상단 닫기 버튼
우상단 현재 index / 전체 개수 표시
좌우 화살표
첫 사진에서 왼쪽 화살표 opacity 0.3
마지막 사진에서 오른쪽 화살표 opacity 0.3
swipe 가능하면 구현
어렵다면 좌우 버튼이라도 반드시 구현
탭바

사진 영역 아래에 Google Maps 스타일 탭바를 둔다.

탭 목록:

const TABS = ['개요', '메뉴', '리뷰', '사진', '업데이트', '정보']

스타일:

height: 58
가로 스크롤 가능
active text color: #1C7B6C
inactive text color: #3C4043
active underline:
height: 4
width: 36
borderRadius: 999
color: #1C7B6C

Collapsed 상태에서는 탭바를 숨긴다.

Medium / Expanded 상태에서만 보인다.

영업시간 카드

탭바 아래에는 Google Maps처럼 둥근 카드 형태로 영업시간 정보를 보여준다.

기본 접힘 상태:

🕐 영업시간                          ˅

펼침 상태:

🕐 영업시간                          ˄
월요일 09:00–23:00
화요일 09:00–23:00
수요일 09:00–23:00
...

스타일:

backgroundColor: '#F1F3F4'
borderRadius: 22
paddingHorizontal: 18
paddingVertical: 16

placeDetails.regularOpeningHours.weekdayDescriptions가 있으면 실제 데이터를 보여준다.

없으면 영업시간 카드 자체를 숨긴다.

하단 수정 버튼

바텀시트 하단에 항상 수정 버튼을 둔다.

단, Collapsed 상태에서는 공간이 부족하면 숨겨도 된다.

보기 모드:

[수정]

수정 모드:

[수정완료]

스타일:

height: 48
borderRadius: 24
marginHorizontal: 16

보기 모드 버튼:

backgroundColor: '#F0F0EE'
textColor: '#666'

수정완료 버튼:

backgroundColor: '#1C7B6C'
textColor: '#FFFFFF'

수정완료를 누르면:

최소 100ms 동안 ActivityIndicator를 보여준다.
변경된 정보가 있으면 update API를 호출한다.
사진 변경이 있으면 최신 데이터를 다시 load한다.
수정 모드를 종료한다.
실제 데이터 연결

mock data를 넣지 마라.

아래 값들은 실제 데이터가 있을 때만 표시한다.

장소 기본 정보

우선순위:

const placeName =
  searchPlace?.name ??
  detail?.place?.name ??
  ''

const subtitle =
  searchPlace?.address ??
  detail?.place?.address ??
  ''
Google Place Details

googlePlaceId는 다음 순서로 찾는다.

const googlePlaceId =
  searchPlace?.googlePlaceId ??
  detail?.place?.google_place_id

시트가 열렸고 googlePlaceId가 있으면 fetchPlaceDetails(googlePlaceId)를 호출한다.

사용할 수 있는 데이터:

rating
userRatingCount
primaryTypeDisplayName.text
regularOpeningHours.openNow
regularOpeningHours.weekdayDescriptions
internationalPhoneNumber
priceLevel 또는 priceRange가 있다면 가격대

데이터가 없으면 빈 텍스트를 하드코딩하지 말고 해당 UI를 렌더링하지 마라.

저장 흐름

searchPlace로 들어온 새 장소는 아직 저장되지 않은 상태일 수 있다.

이 경우:

장소 정보는 보여준다.
사진 영역은 비어 있어야 한다.
사용자가 저장 버튼을 누르면 기존 handleSave() 흐름을 유지한다.
저장 성공 후 currentId를 설정한다.
load(currentId)를 호출해서 저장된 memory detail을 다시 불러온다.
이후 사진 추가가 가능해야 한다.

memoryId가 있는 경우:

열릴 때 load(memoryId)를 호출한다.
저장된 사진, 메모리 정보, 장소 정보를 불러온다.
아이콘 처리 정책

아이콘 png 파일이 없다고 해서 임의로 깨지는 import를 추가하지 마라.

아이콘 파일이 없으면 일단 텍스트 또는 기본 벡터 문자로 대체한다.

예:

경로: ◆ 또는 ➤
시작: ▲
통화: ☎
저장: 🔖
공유: ↗
닫기: ×
시간: ◷

하지만 실제 앱 완성도를 위해 필요한 아이콘 목록은 별도 파일로 만들어라.

파일명:

needed-place-detail-icons.md

내용에는 다음을 포함해라.

아이콘 파일명
용도
권장 px 사이즈
색상
outline / filled 여부

예:

# Needed Place Detail Icons

## direction.png
- size: 24x24
- color: #FFFFFF
- usage: 경로 버튼

## navigation.png
- size: 24x24
- color: #064B56
- usage: 시작 버튼

## phone.png
- size: 24x24
- color: #064B56
- usage: 통화 버튼

## bookmark-outline.png
- size: 24x24
- color: #064B56
- usage: 저장 전 상태

## bookmark-filled.png
- size: 24x24
- color: #064B56
- usage: 저장된 상태

## share.png
- size: 24x24
- color: #1a1a1a
- usage: 공유 버튼

## close.png
- size: 24x24
- color: #1a1a1a
- usage: 닫기 버튼

## clock.png
- size: 22x22
- color: #1a1a1a
- usage: 영업시간 카드
컬러 팔레트

아래 색상을 기준으로 통일해라.

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
간격 / 픽셀 기준

전체적으로 iOS 기준 Google Maps와 비슷한 밀도로 맞춰라.

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

화면 폭이 작은 기기에서도 깨지지 않도록 Dimensions.get('window').width를 기준으로 사진 그리드 width를 계산해라.

TypeScript 요구사항
npx tsc --noEmit가 통과해야 한다.
불필요한 any를 쓰지 마라.
third-party 타입 때문에 불가피한 경우에만 최소한으로 사용해라.
state와 helper function 타입을 명확히 작성해라.

권장 타입 예시:

type SheetSnapState = 'collapsed' | 'medium' | 'expanded'

type PhotoLayoutType =
  | 'single'
  | 'twoVertical'
  | 'twoHorizontal'
  | 'threeLeftHero'
  | 'threeRightHero'
  | 'threeTopHero'
  | 'threeBottomHero'

type PhotoSlot = {
  slotIndex: number
  mediaId?: string
  uri?: string
}
하지 말 것
Google Maps처럼 보이지 않는 독자적인 디자인으로 바꾸지 마라.
mock rating, mock review count, mock opening hours를 넣지 마라.
"4.1", "(2,094)", "16시간 12분" 같은 값을 하드코딩하지 마라.
없는 아이콘 파일을 import해서 빌드가 깨지게 하지 마라.
사진 추가 버튼을 보기 모드에서 보여주지 마라.
Collapsed 상태에서 사진 영역이 보이게 하지 마라.
현재 프로젝트 service/API 연결을 무시하고 완전히 가짜 데이터로 만들지 마라.
기존 코드에 불필요한 placeholder 컴포넌트가 있으면 제거해라.
사용하지 않는 state, function, style은 남기지 마라.
완료 기준

아래 기준을 모두 만족해야 한다.

npx tsc --noEmit 통과
장소를 누르면 Google Maps 스타일 바텀시트가 열린다.
바텀시트는 Collapsed / Medium / Expanded 상태를 가진다.
핸들바를 위로 올리면 큰 화면으로 확장된다.
핸들바를 아래로 내리면 작은 화면으로 접힌다.
작은 화면에서는 장소 정보와 경로/시작/통화/저장 버튼까지만 보인다.
큰 화면에서는 사진 영역, 탭바, 영업시간 카드까지 보인다.
사진 추가 시 먼저 레이아웃을 선택할 수 있다.
레이아웃 선택 후 원하는 칸에 사진을 넣을 수 있다.
보기 모드에서는 사진 추가/삭제 UI가 보이지 않는다.
사진을 누르면 전체화면 사진 뷰어가 열린다.
Google Places 실제 데이터가 있으면 rating, review count, category, opening hours, phone을 표시한다.
데이터가 없으면 빈 placeholder를 만들지 않고 해당 줄을 숨긴다.
필요한 아이콘 파일 목록을 needed-place-detail-icons.md로 작성한다.
현재 DB/API 구조상 사진 레이아웃 저장이 불가능하면 place-detail-sheet-required-backend-changes.md를 작성한다.
최종 UI가 첨부 이미지 001~007의 Google Maps 장소 상세 화면과 최대한 유사해야 한다.