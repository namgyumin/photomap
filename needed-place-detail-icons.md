# PlaceDetailSheet 필요 아이콘 목록

> fixplan part9 산출물. 현재 `assets/icons/`에 있는 파일과 추가로 필요한 파일 구분.

## 현재 보유 (그대로 사용 중)

| 파일명 | 사용처 | 비고 |
|---|---|---|
| direction.png | 경로 버튼 | |
| navigate.png | 시작 버튼 | 명세상 navigation.png — 파일명만 다름, 동일 용도 |
| phone.png | 통화 버튼 | |
| bookmark.png | 저장 전 상태 (헤더 + 액션 버튼) | |
| bookmark-check.png | 저장된 상태 | |
| share.png | 공유 버튼 (헤더) | |
| close.png | 닫기 버튼 (헤더) | |
| clock.png | 영업시간 카드 | |
| chevron-down.png | 영업시간 펼침 (접힘 상태) | 펼친 상태는 180° transform 회전으로 처리 |
| chevron-right.png | (현재 미사용) | part7에서 chevron-down 회전 방식으로 대체됨 |

## 적용 완료 (2026-06-10)

`icons/`의 ChatGPT 생성 PNG 14종을 `scripts/process-icons.js`로 처리해 교체/추가함
(체커보드 배경 제거 → 투명화 → 단색화 → trim → 96px). 기존 10종 전부 새 디자인으로 교체 +
chevron-up / star-filled / star-empty / camera 신규 적용 (텍스트 fallback 제거).

| 파일명 | 적용처 |
|---|---|
| chevron-up.png | 영업시간 펼침 상태 (회전 방식 제거) |
| star-filled.png / star-empty.png | 평점 별 (텍스트 ★ 제거) |
| camera.png | 빈 slot + 사진 placeholder (📷 제거) |

**미적용**: play-badge.png — 원본이 흰 아이콘 + 흰 체커 배경이라 추출 불가. 영상은 인라인 자동재생이라 필수 아님. 필요해지면 어두운 배경으로 재생성 요청.

## 정책

- 없는 png import 금지 — 빌드 깨짐 방지
- 새 아이콘 추가 전까지 위 fallback 유지 (텍스트/회전)
- 권장 포맷: 3x 해상도 PNG 또는 SVG(react-native-svg 설치돼 있음)
- 색상 변경이 필요한 아이콘(저장됨 상태 white 등)은 `tintColor` 스타일로 처리 가능하도록 단색 아이콘 권장
