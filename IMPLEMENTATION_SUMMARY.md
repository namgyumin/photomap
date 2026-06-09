# PhotoMap PlaceDetailSheet 구현 완료

## 📋 구현 항목 요약

### 1. 드래그 애니메이션 & 높이 동적 조절
- **기능**: 회색 바 (drag handle) 잡고 위/아래로 드래그 시 부드러운 Animated 적용
- **동작**:
  - 위로 드래그: 높이 증가 (최대 92%)
  - 아래로 드래그: 높이 감소 (최소 88%)
  - 80px 이상 다운: 시트 닫기 또는 축소
  - -80px 이상 업: 시트 확장
- **파일**: `src/components/PlaceDetailSheet.tsx`
- **상태**: `sheetY` (Animated.Value), `sheetHeight` (Animated.Value), `sheetExpanded` (boolean)

### 2. 동적 사진 레이아웃
- **1장**: 전체 화면 높이 (300px)
- **2장**: 두가지 경우, 첫번째는 높이 150px 짜리가 위 아래로 두개 두번째는 높이가 250px  짜리가 좌우로 (크기가 너무 큰 경우에는 옆으로 스크롤해서 수정)
- **3장+**: 상단 1장(200px) + 하단 2장(140px) - Google Maps 스타일
- **함수**: `renderPhotoLayout()`
- **선택 상태**: Long press 시 테두리 강조 (#1C7B6C)

### 3. 사진 선택 
- **선택**: Long press로 사진선택
- press가 끝나기 전 까지 press 를 사진이 따라감
- press 위치에 놓으면 어떻게 사진들이 이동하는 지 알려줌,
- 사진들의 중심 기준 좌, 우, 상, 하를 기준으로 계산해서 그 사진 (상 하 좌 우 중) 어디쪽으로 갈 것인지(위로 예를 들어 위로 계산이 되면 기존에 있던 사진이 높이가 반토막 나거나 아니면 사진 창 자체가 커지면서 ex 300px 높이에서 위로 가면 200 px 짜리 사진 두개가 쌓임 이런 식으로 됨) 좌, 우, 상, 하 마찬가지
- press 가 끝나는 곳에서 계산된 대로 사진들이 이동됨

### 4. 중복 저장 방지
중복 저장은 places 들 각각 겹치지 않는지 이미 저장 되었는지 아닌지 확인 하는것.

### 5. 하단 수정 버튼
- **상태**: `isEditing` (boolean)
- **표시**:
  - 미편집 상태: "수정" (회색 배경 #F0F0EE)
  - 편집 중: "수정완료" (초록색 배경 #1C7B6C, 흰색 텍스트)
- **위치**: ScrollView 하단, 상단 border 1px (#E8EAED)
- 수정, 수정완료 클릭 시 아주 잠깐 한 0.1 초동안 화면이 로딩 되게

### 6. 확장/축소 모드
- **축소 (기본)**: 동적 레이아웃 표시 + 가로 스크롤 액션 버튼
- **확장**: 3열 그리드 사진 표시 + 수직 스크롤 사진
- **전환**: 드래그 또는 PanResponder 제스처

### 7. PNG 아이콘
- **생성 위치**: `assets/icons/`
- **파일 목록**:
  - `bookmark.png` / `bookmark-check.png` (저장 상태)
  - `share.png`, `close.png`
  - `direction.png`, `navigate.png`, `phone.png`
  - `clock.png`, `chevron-right.png`, `chevron-down.png`
- **사용**: 모든 버튼 및 아이콘에 적용

### 8. 인증 API (게스트 & 정규 로그인)
- **파일**: `src/services/auth.ts`
- **함수**:
  - `signOut()` - 정규 로그아웃
  - `signOutGuest()` - 게스트 로그아웃 (AsyncStorage 제거)
  - `signInAsGuest()` - 게스트 로그인
  - `getCurrentUser()` - 현재 사용자 조회
  - `getGuestUserId()` - 게스트 ID 조회
  - `getUserSession()` - 세션 조회

---

## 🎬 상세 유저 플로우 (세밀한 단계별)

### **[흐름 1] 앱 시작 → 지도 보기 → 장소 선택**

1. **앱 실행**
   - 게스트 로그인 또는 계정 로그인 선택
   - 게스트 선택 → `signInAsGuest()` 호출
   - 게스트 ID 생성 → AsyncStorage 저장
   - 지도 화면으로 진입

2. **지도 표시**
   - Google Maps 렌더링
   - 현재 위치 마커 표시
   - 검색 가능한 장소 마크

3. **장소 선택 (마커 탭)**
   - PlaceDetailSheet 모달 오픈
   - `visible={true}` → Modal 렌더링 시작
   - 회색 drag handle 표시
   - 장소 정보 로드 (fetchPlaceDetails)

---

### **[흐름 2] 장소 상세 보기 (축소 상태)**

**초기 상태 (sheetExpanded = false)**

1. **헤더 영역 표시**
   - 장소명 (21px bold)
   - 주소 (12.5px gray)
   - 별점 4.1 ⭐⭐⭐⭐⭐ (200+ 리뷰)
   - 카테고리 "일본라면 전문식당 · ¥1,000~2,000"
   - 상태 "영업 중 · 오후 11:00에 영업 종료"

2. **헤더 아이콘 버튼 (우측 수직 정렬)**
   - 🔖 북마크 (저장 안 함: border만, 저장 함: 배경 #1C7B6C)
   - ↗️ 공유 (미구현: "이 기능은 지원하지 않아요")
   - ✕ 닫기 (onClose 호출)

3. **액션 버튼 (가로 스크롤)**
   ```
   [📍 경로] [▶️ 시작] [☎️ 통화] [🔖 저장]
   ```
   - 경로: 주황색 (#1C7B6C) 배경, 흰색 텍스트
   - 나머지: 연녹색 (#D8EEE9) 배경, 짙은텍스트
   - 높이 50px, borderRadius 25px

4. **사진 영역 (동적 레이아웃)**

   **Case A: 사진 0장**
   ```
   [빈 공간] → 사용자가 "+" 또는 drag로 추가 유도
   ```

   **Case B: 사진 1장**
   ```
   ┌─────────────────────┐
   │                     │
   │      사진 1         │ (높이 300px, 전체 너비)
   │  Long press → 선택  │
   │  (테두리 강조)      │
   │                     │
   └─────────────────────┘
   
   선택 시:
   ├─ ‹ 버튼 (disabled: 첫 사진)
   └─ › 버튼 (disabled: 마지막 사진)
   ```

   **Case C: 사진 2장**
   ```
   ┌──────────────┬──────────────┐
   │              │              │
   │   사진 1     │   사진 2     │ (각 125px 높이)
   │ Long press   │ Long press   │
   │              │              │
   └──────────────┴──────────────┘
   ```

   **Case D: 사진 3장+**
   ```
   ┌──────────────────────────────┐
   │                              │
   │        사진 1 (200px)        │
   │      Long press → 선택       │
   │                              │
   ├──────────────┬───────────────┤
   │              │               │
   │  사진 2      │   사진 3      │ (각 140px)
   │ Long press   │  Long press   │
   │              │               │
   └──────────────┴───────────────┘
   ```

5. **탭 바**
   ```
   [ 개요 | 메뉴 | 리뷰 | 사진 | 업데이트 | 정보 ]
                ↑
              현재 탭 (하단 강조 2.5px)
   ```

6. **영업시간 섹션**
   ```
   🕐 영업시간                    ›
                                  (확장 가능, › 또는 ∨ 표시)
   
   [확장 시]
   월~일: 09:00 - 23:00
   ```

7. **하단 수정 버튼**
   ```
   ┌─────────────┐
   │   수정      │ (회색 배경 #F0F0EE)
   │  또는       │
   │  수정완료   │ (초록색 배경 #1C7B6C)
   └─────────────┘
   ```

---

### **[흐름 3] 사진 선택 & 네비게이션**

1. **사진 Long Press**
   ```
   사진 탭 → Long press (1초 이상)
   → selectedMediaId 상태 변경
   → 테두리 3px #1C7B6C 강조
   ```

2. **네비게이션 버튼 표시**
   ```
   선택된 사진 위에:
   
   ‹ [반투명 검정 오버레이]  ›
   (40x40px, 흰색 텍스트, borderRadius 20px)
   ```

3. **이전 사진 이동 (‹ 버튼)**
   ```
   Pressable onPress → goToPrevPhoto()
   → selectedMediaIndex - 1
   → selectedMediaId 업데이트
   → UI 자동 재렌더
   
   [첫 사진 상태]
   ‹ 버튼 disabled (opacity 0.5)
   ```

4. **다음 사진 이동 (› 버튼)**
   ```
   Pressable onPress → goToNextPhoto()
   → selectedMediaIndex + 1
   → selectedMediaId 업데이트
   
   [마지막 사진 상태]
   › 버튼 disabled (opacity 0.5)
   ```

---

### **[흐름 4] 드래그로 높이 조절**

1. **드래그 시작**
   ```
   locationY < 60px (회색 바 영역)
   → onStartShouldSetPanResponder = true
   ```

2. **드래그 중 (위로)**
   ```
   gestureState.dy < 0 (음수)
   → sheetHeight.setValue(-dy * 2)
   → maxHeight interpolate: 88% → 92%
   → 높이 부드럽게 증가
   ```

3. **드래그 중 (아래로)**
   ```
   gestureState.dy > 0 (양수)
   → sheetHeight.setValue(0)
   → 높이 감소
   ```

4. **드래그 손 뗄 때**
   ```
   [Case A] dy > 80px (80px 이상 아래로)
   → spring animation → sheetHeight = 0
   → sheetExpanded = false ? onClose() : setSheetExpanded(false)
   
   [Case B] dy < -80px (80px 이상 위로)
   → spring animation → sheetHeight = 200
   → setSheetExpanded(true)
   
   [Case C] -80 < dy < 80 (짧은 드래그)
   → spring animation → sheetHeight = 0
   → 원래 상태로 복귀
   ```

---

### **[흐름 5] 확장 모드 (sheetExpanded = true)**

1. **모드 전환**
   ```
   sheetExpanded = true 되면:
   - renderPhotoLayout() 숨김
   - photoGridContainer 표시
   ```

2. **3열 그리드 표시**
   ```
   ┌──────────┬──────────┬──────────┐
   │ 사진 1   │ 사진 2   │ 사진 3   │
   │ (31%)    │ (31%)    │ (31%)    │
   ├──────────┼──────────┼──────────┤
   │ 사진 4   │ 사진 5   │ 사진 6   │
   │ (31%)    │ (31%)    │ (31%)    │
   └──────────┴──────────┴──────────┘
   
   gap: 8px
   borderRadius: 8px
   ```

3. **사진 없을 때**
   ```
   6개의 [📷 추가] 플레이홀더 표시
   (점선 border, dashed)
   ```

4. **수직 스크롤**
   ```
   ScrollView 활성화
   → 사진 위아래로 스크롤 가능
   → 화면 80~90% 채움
   ```

---

### **[흐름 6] 사진 추가**

1. **플레이홀더 탭**
   ```
   [📷 사진 드래그 or browse files] 탭
   → handleAddMedia() 호출
   ```

2. **권한 체크**
   ```
   if (!userId) {
     Alert: "로그인 필요"
   }
   if (!currentId) {
     return (시트 닫기 가능, 이후 저장 필요)
   }
   ```

3. **파일 선택 (pickMediaMultiple)**
   ```
   사진/영상 선택 → 배열 반환
   for each picked file:
     - isDuplicate 체크
     - 중복 시 skip + alert
     - uploadMedia() → storagePath 획득
     - addMediaToVisit() → DB 저장
   ```

4. **업로드 완료**
   ```
   load(currentId) → detail 새로고침
   onChanged?.() → 부모 컴포넌트 알림
   ```

---

### **[흐름 7] 저장 (Save)**

1. **저장 버튼 탭**
   ```
   [🔖 저장] → handleSave() 호출
   ```

2. **권한 체크**
   ```
   if (!userId) {
     Alert: "로그인 필요"
     return
   }
   ```

3. **저장 로직**
   ```
   [신규 저장 (currentId == null)]
   - createOrGetPlace() → place 생성
   - createVisitMemory() → memory 생성
   - setCurrentId(memory.id)
   - onSaved?.(memory.id, searchPlace) 호출
   
   [기존 업데이트 (currentId 있음)]
   - updateVisitMemoryFields()
   - is_saved 토글
   ```

4. **저장 완료**
   ```
   Alert: "저장됨"
   load(currentId) 재로드
   onChanged?.() 호출
   setIsDirty(false)
   ```

---

### **[흐름 8] 수정 모드**

1. **수정 버튼 탭 (축소 상태)**
   ```
   [수정] 버튼 탭
   → isEditing = true
   → 버튼 텍스트: "수정완료"
   → 버튼 배경: 초록색 #1C7B6C
   ```

2. **수정 모드 활성화**
   ```
   (현재는 상태만 변경, 추가 UI는 미정)
   사용자가 필요한 수정 작업 수행
   ```

3. **수정 완료 탭**
   ```
   [수정완료] 버튼 탭
   → isEditing = false
   → 버튼 텍스트: "수정"
   → 버튼 배경: 회색 #F0F0EE
   ```

---

### **[흐름 9] 로그아웃**

**게스트 로그아웃**
```
signOutGuest()
→ AsyncStorage.removeItem('guestUserId')
→ AsyncStorage.removeItem('guestSession')
→ supabase.auth.signOut() (catch 무시)
→ 로그인 화면으로 돌아가기
```

**정규 로그아웃**
```
signOut()
→ supabase.auth.signOut()
→ session = null
→ 로그인 화면으로 돌아가기
```

---

### **[흐름 10] 모달 닫기**

1. **닫기 버튼 (✕)**
   ```
   Header 우측 버튼 탭
   → onClose() 호출
   → visible = false
   → Modal 애니메이션 닫힘
   ```

2. **배경 영역 탭**
   ```
   Pressable (flex: 1) 탭
   → onClose() 호출
   ```

3. **드래그로 닫기**
   ```
   아래로 80px 이상 드래그
   → onClose() 호출
   → spring animation 복귀
   ```

---

## 📊 상태 트리 정리

```
PlaceDetailSheet
├─ visible: boolean (부모에서 제어)
├─ currentId: string | null (메모리 ID)
├─ detail: MemoryDetail | null (로드된 데이터)
├─ loading: boolean (로딩 상태)
├─ saving: boolean (저장 진행 중)
├─ activeTab: 0-5 (탭 선택)
├─ hoursExpanded: boolean (영업시간 확장)
├─ sheetExpanded: boolean (전체 확장 모드)
├─ isEditing: boolean (수정 중)
├─ selectedMediaId: string | null (선택된 사진 ID)
├─ sheetY: Animated.Value (Y축 이동, 미사용)
├─ sheetHeight: Animated.Value (동적 높이)
└─ visitedAt, note, isSaved, visibility (사용자 입력)
```

---

## 🎨 색상 팔레트

| 항목 | 색상 | 사용처 |
|------|------|--------|
| Primary | #1C7B6C | 저장 버튼, 선택 테두리, 탭 언더라인, 수정완료 |
| Secondary | #D8EEE9 | 액션 버튼 (시작, 통화, 저장 2차) |
| Text Dark | #1a1a1a | 제목, 주요 텍스트 |
| Text Gray | #70757A | 부제목, 카테고리 |
| Border | #E8EAED | 구분선 |
| Background | #F0F0EE | 수정 버튼 (기본) |
| Disabled | rgba(0,0,0,0.3) | 오버레이 |

---

## 🔧 기술 스택

- **상태 관리**: React Hooks (useState, useCallback, useEffect, useMemo)
- **애니메이션**: React Native Animated API (spring, timing, interpolate)
- **제스처**: PanResponder
- **저장소**: AsyncStorage (게스트), Supabase Auth + DB
- **이미지**: Image (RN), PNG (assets/icons/)

---

## ✅ 테스트 체크리스트

- [ ] 드래그로 높이 자연스럽게 변경
- [ ] 1/2/3+ 사진 레이아웃 정확히 표시
- [ ] 사진 선택 시 테두리 및 화살표 표시
- [ ] 화살표로 사진 이동 가능
- [ ] 중복 사진 추가 거부
- [ ] 저장 기능 정상 동작
- [ ] 로그아웃 (게스트/정규) 완료
- [ ] 모달 닫기 (3가지 방법) 정상
