# photomap — 필요한 아이콘 전체 목록

마지막 업데이트: 2026-06-10

---

## 1. 앱 아이콘 (App Icon)

앱스토어 / 홈 화면에 표시되는 아이콘.

| 파일 | 현재 상태 | 요구 크기 | 메모 |
|---|---|---|---|
| `assets/branding/app-icon.png` | ✅ 있음 (기본 디자인) | 1024×1024px | 개선 필요 — 더 강한 브랜드 아이덴티티 |
| `assets/branding/adaptive-icon-foreground.png` | ✅ 있음 | 1024×1024px | Android foreground layer |
| `assets/branding/adaptive-icon-background.png` | ✅ 있음 | 1024×1024px | Android background layer |
| `assets/branding/adaptive-icon-monochrome.png` | ✅ 있음 | 1024×1024px | Android monochrome (알림용) |

**앱 아이콘 컨셉 제안:**
- 지도 핀 위에 카메라 렌즈 또는 사진 프레임
- 색상: 브랜드 초록 (`#4CAF50` 계열) + 흰색
- 둥근 모서리 (iOS 자동 마스킹되므로 풀 블리드 OK)
- 심플한 flat 스타일 (과도한 그라데이션 자제)

---

## 2. 탭 바 아이콘 (Bottom Tab Bar)

현재 `app/(tabs)/_layout.tsx`에 `tabBarIcon` 미설정 → **기본 Expo 텍스트 탭만 표시됨**.
아래 3개 탭 모두 아이콘 추가 필요.

| 탭 | 파일명 (제안) | 활성 파일명 (제안) | 크기 | 설명 |
|---|---|---|---|---|
| 지도 (index) | `tab-map.png` | `tab-map-active.png` | 28×28px | 지도/핀 아이콘 |
| 기록 (memories) | `tab-memories.png` | `tab-memories-active.png` | 28×28px | 사진 더미 / 폴라로이드 |
| 프로필 (profile) | `tab-profile.png` | `tab-profile-active.png` | 28×28px | 사람 실루엣 |

**스펙:**
- 크기: 28×28px (탭바 렌더 사이즈) → 소스는 56×56px 이상 권장
- 형식: PNG, 투명 배경
- 색상: inactive = `#8E8E93` (iOS 기본 gray), active = `#4CAF50` (브랜드 초록)
- 선 굵기: 1.5~2px stroke 또는 solid fill — 통일 필요

**코드 연결 위치:** `app/(tabs)/_layout.tsx`
```tsx
<Tabs.Screen name="index" options={{
  title: '지도',
  tabBarIcon: ({ color, size }) => (
    <Image source={require('../../assets/icons/tab-map.png')}
      style={{ width: size, height: size, tintColor: color }} />
  )
}} />
```

---

## 3. PlaceDetailSheet 인앱 아이콘 (현재 적용됨)

`assets/icons/` 에 PNG로 적용 완료. 전부 흰색 단색, 투명 배경.

| 파일 | 용도 | 크기 | 상태 |
|---|---|---|---|
| `bookmark.png` | 저장 안 된 상태 | 36px | ✅ 적용 |
| `bookmark-check.png` | 저장된 상태 | 36px | ✅ 적용 |
| `share.png` | 공유 버튼 | 36px | ✅ 적용 |
| `close.png` | 시트 닫기 | 36px | ✅ 적용 |
| `direction.png` | 길찾기 액션 버튼 | 24px | ✅ 적용 |
| `navigate.png` | 내비게이션 액션 버튼 | 24px | ✅ 적용 |
| `phone.png` | 전화 액션 버튼 | 24px | ✅ 적용 |
| `clock.png` | 영업시간 앞 아이콘 | 16px | ✅ 적용 |
| `chevron-up.png` | 영업시간 접기 | 16px | ✅ 적용 |
| `chevron-down.png` | 영업시간 펼치기 | 16px | ✅ 적용 |
| `chevron-right.png` | 목록 항목 우측 화살표 | 16px | ✅ 적용 |
| `star-filled.png` | 평점 별 (채움) | 14px | ✅ 적용 |
| `star-empty.png` | 평점 별 (빈) | 14px | ✅ 적용 |
| `camera.png` | 사진 추가 / 빈 슬롯 | 24px | ✅ 적용 |

---

## 4. 미적용 / 누락 인앱 아이콘

| 아이콘 | 용도 | 파일명 (제안) | 크기 | 현재 |
|---|---|---|---|---|
| 재생 뱃지 | 영상 슬롯 위 오버레이 | `play-badge.png` | 24×24px | ❌ 미적용 (흰 아이콘+흰 배경으로 추출 불가) |
| 지도 탭 핀 | 탭바 지도 아이콘 | `tab-map.png` | 56×56px | ❌ 없음 |
| 기록 탭 | 탭바 기록 아이콘 | `tab-memories.png` | 56×56px | ❌ 없음 |
| 프로필 탭 | 탭바 프로필 아이콘 | `tab-profile.png` | 56×56px | ❌ 없음 |
| 저장 목록 색상 아이콘 | 기록 탭 목록 앞 색상 점 | 코드에서 View로 구현 | - | ✅ 코드 처리 (아이콘 불필요) |
| 지도 마커 (사진 있음) | 커스텀 마커 테두리 | 코드에서 Image+border | - | ✅ 코드 처리 |
| 지도 마커 (사진 없음) | 색상 점 마커 | 코드에서 View | - | ✅ 코드 처리 |
| 위치 핀 📍 | memories.tsx 썸네일 없을 때 | `map-pin.png` | 24×24px | ⚠️ 이모지 사용 중 → PNG로 교체 권장 |
| 수정 연필 | 수정 버튼 안 아이콘 | `edit-pencil.png` | 20×20px | ⚠️ 텍스트만 ("수정") → 아이콘 추가 고려 |

---

## 5. 스플래시 스크린 아이콘

| 파일 | 크기 | 상태 |
|---|---|---|
| `assets/icon.png` | 1024×1024px | ✅ 있음 (구버전, app.json은 branding/ 참조) |
| `assets/splash-icon.png` | 200×200px | ✅ 있음 |
| `assets/branding/logo-mark.png` | - | ✅ 있음 |

---

## 6. 우선순위 요약

| 우선순위 | 항목 | 이유 |
|---|---|---|
| 🔴 P0 | 탭 바 아이콘 3종 | 현재 탭에 아이콘 없음, 앱 완성도 직결 |
| 🔴 P0 | 앱 아이콘 리디자인 | 앱스토어 제출 전 필수 |
| 🟡 P1 | play-badge.png | 영상 슬롯에서 영상임을 시각적으로 표시 |
| 🟡 P1 | map-pin.png | 이모지 → PNG 교체 (일관성) |
| 🟢 P2 | edit-pencil.png | 수정 버튼 아이콘 (현재 텍스트로도 OK) |

---

## 7. 아이콘 제작 가이드라인

- **스타일**: SF Symbols 스타일 (iOS 네이티브 느낌) 또는 Material Symbols Rounded
- **선 굵기**: 1.5px (small), 2px (medium), 2.5px (large)
- **배경**: 투명 (알파 채널 필수)
- **색상**: 흰색 단색으로 납품 → 코드에서 `tintColor`로 색상 적용
- **소스 크기**: 최소 2× (렌더 크기의 2배), 권장 3×
- **포맷**: PNG-24 (알파 포함)
- **ChatGPT 생성 시 주의**: 체커보드 배경 없이 투명 배경으로 요청. 흰 아이콘이면 진한 배경으로 미리보기 확인 후 납품.

---

## 관련 파일

- `photomap/scripts/process-icons.js` — ChatGPT PNG 처리 스크립트 (체커보드 제거, 단색화, trim)
- `photomap/needed-place-detail-icons.md` — PlaceDetailSheet 전용 아이콘 요구사항 (이전 버전)
- `assets/icons/` — 현재 적용된 인앱 아이콘 14종
- `assets/branding/` — 앱 아이콘 및 스플래시 에셋
