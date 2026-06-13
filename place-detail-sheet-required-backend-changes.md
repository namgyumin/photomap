# Required Backend / DB Changes

> fixplan part9 산출물. PlaceDetailSheet 재구현(2026-06-10) 중 발견된 백엔드 미지원 항목.
> 적용된 것 / 필요한 것 구분.

## 이미 적용됨 (2026-06-10)

### visit_photos 하이브리드 미디어 (migration: `hybrid_media_local_asset`)

```sql
alter table public.visit_photos add column if not exists local_asset_id text;
alter table public.visit_photos alter column storage_path drop not null;
```

- 원본은 유저 기기 사진 라이브러리(local_asset_id), 서버엔 썸네일만
- `storage_path`는 공유 시점(`ensureOriginalsUploaded`)에만 채워짐
- 디스플레이 썸네일 1280px는 **`thumbnail_512` 컬럼에 저장됨 (컬럼명 legacy)** — 혼동 주의

### photoSlotIndex

- 별도 컬럼 불필요 — 기존 `visit_photos.sort_order`를 slot index로 사용 중 (0/1/2)

### 저장 목록 (migration: `saved_lists`)

- `saved_lists` 테이블 (name, color) + RLS own-only 4종
- `visits.saved_list_id` FK (목록 삭제 시 set null)
- 지도 마커가 목록 색상 표시 (사진 마커는 테두리, 무사진은 색 점)

### 게스트 로그아웃 수정 (migrations: `fix_purge_guest_storage_api`, `add_visit_photos_storage_delete_policy`)

- `purge_guest_account`의 `DELETE FROM storage.objects` 제거 — Supabase가 storage 테이블 직접 DELETE 차단
- storage 파일 삭제는 클라이언트 `deleteGuestAccountAndSignOut()`이 Storage API로 수행
- `storage.objects`에 DELETE 정책이 아예 없었음 → `visit_photos_delete_own` 추가 (사진 삭제 기능도 이전엔 storage 파일을 못 지우고 있었음)

## 필요 — 미적용

### 1. visits.photo_layout (photoLayoutType)

- purpose: 사용자가 선택한 사진 레이아웃 저장
- type: `text` (또는 enum)
- example values: `single`, `twoVertical`, `twoHorizontal`, `threeLeftHero`, `threeRightHero`, `threeTopHero`, `threeBottomHero`
- 현재 상태: **AsyncStorage(기기 내)로만 유지** — 기기 변경/재설치 시 레이아웃 선택값 소실 (사진 자체는 유지, 기본 레이아웃으로 표시)
- 적용 시 클라이언트 변경: `PlaceDetailSheet.tsx`의 `LAYOUT_STORAGE_PREFIX` AsyncStorage 로직을 visits 컬럼 read/write로 교체

```sql
alter table public.visits add column photo_layout text
  check (photo_layout in ('single','twoVertical','twoHorizontal',
    'threeLeftHero','threeRightHero','threeTopHero','threeBottomHero'));
```

### 2. places-details Edge Function — field mask 확장

현재 `PlaceDetailsResult`에 없어서 UI에서 표시 생략 중인 항목 (part3 명세 대비):

| 필드 | UI 용도 |
|---|---|
| `priceLevel` / `priceRange` | 헤더 카테고리 줄 `· ¥1,000~2,000` |
| `currentOpeningHours.nextCloseTime` 등 | `영업 중 · 오후 11:00에 영업 종료` (현재는 영업 중/종료만) |
| routes API 이동시간 | 평점 줄 `· 🚇 16분` (별도 API — 우선순위 낮음) |

Edge Function `places-details`의 `X-Goog-FieldMask`에 필드 추가 + `PlaceDetailsResult` 타입 확장 필요.

### 3. import_shared_memory RPC — local_asset_id 처리 ✅ 확인 완료 (2026-06-10)

- 함수 정의 조회 결과: 컬럼 명시 insert 방식 — `local_asset_id` 미포함 → 가져온 행은 자동 null
- 추가 작업 불필요. 단, 향후 RPC 수정 시 `local_asset_id` insert 목록에 넣지 말 것 (남의 기기 참조)

### 4. (선택) 영상 재생 — 공유받은 영상

- 공유 시 원본 영상이 업로드되므로 상대방은 서버 mp4 스트리밍으로 재생 가능 — 추가 작업 없음
- 단 Storage 버킷이 public이므로 영상 트래픽 비용 모니터링 권장
