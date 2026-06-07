import { supabase } from '../lib/supabase'
import type {
  ImportMode,
  Media,
  MediaType,
  Memory,
  MemoryDetail,
  MemoryListItem,
  Place,
  PlaceLatLng,
  ShareLink,
  SharedMemory,
  Visibility,
} from '../types/database'

const MAX_VIDEO_SECONDS = 10

// ============================================================
// places
// ============================================================

export interface CreateOrGetPlaceInput {
  googlePlaceId: string
  displayName?: string | null
  address?: string | null
  latitude: number
  longitude: number
}

// places INSERT 는 service_role 전용 → create_or_get_place definer RPC 경유
export async function createOrGetPlace(input: CreateOrGetPlaceInput): Promise<Place> {
  const { data, error } = await supabase.rpc('create_or_get_place', {
    p_google_place_id: input.googlePlaceId,
    p_display_name: input.displayName ?? null,
    p_address: input.address ?? null,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
  })
  if (error) throw error
  return data as Place
}

// ============================================================
// memory (= visits)
// ============================================================

export interface CreateVisitMemoryInput {
  placeId: string
  visitedAt?: string // ISO, 기본 now()
  note?: string | null
  amountSpent?: number | null
  visibility?: Visibility
  isSaved?: boolean
}

export async function createVisitMemory(input: CreateVisitMemoryInput): Promise<Memory> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('not authenticated')

  const row: Record<string, unknown> = {
    user_id: userId,
    place_id: input.placeId,
    visibility: input.visibility ?? 'private',
    note: input.note ?? null,
    amount_spent: input.amountSpent ?? null,
    is_saved: input.isSaved ?? true,
  }
  if (input.visitedAt) row.visited_at = input.visitedAt

  const { data, error } = await supabase
    .from('visits')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as Memory
}

export interface UpdateVisitMemoryFields {
  visitedAt?: string
  note?: string | null
  amountSpent?: number | null
  visibility?: Visibility
  isSaved?: boolean
}

export async function updateVisitMemoryFields(
  memoryId: string,
  fields: UpdateVisitMemoryFields
): Promise<Memory> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.visitedAt !== undefined) patch.visited_at = fields.visitedAt
  if (fields.note !== undefined) patch.note = fields.note
  if (fields.amountSpent !== undefined) patch.amount_spent = fields.amountSpent
  if (fields.visibility !== undefined) patch.visibility = fields.visibility
  if (fields.isSaved !== undefined) patch.is_saved = fields.isSaved

  const { data, error } = await supabase
    .from('visits')
    .update(patch)
    .eq('id', memoryId)
    .select('*')
    .single()
  if (error) throw error
  return data as Memory
}

export async function setHeroMedia(memoryId: string, mediaId: string): Promise<Memory> {
  const { data, error } = await supabase
    .from('visits')
    .update({ hero_media_id: mediaId, updated_at: new Date().toISOString() })
    .eq('id', memoryId)
    .select('*')
    .single()
  if (error) throw error
  return data as Memory
}

// ============================================================
// media (= visit_photos)
// ============================================================

export interface AddMediaInput {
  visitId: string
  storagePath: string
  mediaType?: MediaType // 기본 photo
  durationSeconds?: number | null // video 만, 최대 10
  thumbnail128?: string | null
  thumbnail512?: string | null
  width?: number | null
  height?: number | null
  capturedAt?: string | null
  latitude?: number | null
  longitude?: number | null
  sortOrder?: number // 미지정 시 기존 미디어 뒤에 자동 append
}

export async function addMediaToVisit(input: AddMediaInput): Promise<Media> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('not authenticated')

  const mediaType: MediaType = input.mediaType ?? 'photo'

  // video 10초 검증
  if (mediaType === 'video') {
    if (input.durationSeconds == null) {
      throw new Error('video requires durationSeconds')
    }
    if (input.durationSeconds <= 0 || input.durationSeconds > MAX_VIDEO_SECONDS) {
      throw new Error(`video must be 0–${MAX_VIDEO_SECONDS}s`)
    }
  }

  // sort_order: 기존 미디어 뒤로 append
  let sortOrder = input.sortOrder
  if (sortOrder === undefined) {
    const { data: last, error: lastErr } = await supabase
      .from('visit_photos')
      .select('sort_order')
      .eq('visit_id', input.visitId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastErr) throw lastErr
    sortOrder = last ? (last as { sort_order: number }).sort_order + 1 : 0
  }

  const { data, error } = await supabase
    .from('visit_photos')
    .insert({
      visit_id: input.visitId,
      uploader_id: userId,
      storage_path: input.storagePath,
      media_type: mediaType,
      duration_seconds: mediaType === 'video' ? input.durationSeconds : null,
      thumbnail_128: input.thumbnail128 ?? null,
      thumbnail_512: input.thumbnail512 ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      captured_at: input.capturedAt ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      sort_order: sortOrder,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Media
}

// 사진/영상별 위치 드래그 조정
export async function updateMediaLocation(
  mediaId: string,
  latitude: number,
  longitude: number
): Promise<Media> {
  const { data, error } = await supabase
    .from('visit_photos')
    .update({ latitude, longitude })
    .eq('id', mediaId)
    .select('*')
    .single()
  if (error) throw error
  return data as Media
}

function isStoragePath(path: string | null): path is string {
  return Boolean(path) && !path!.startsWith('http') && !path!.startsWith('file:')
}

export async function deleteMedia(media: Media): Promise<void> {
  const paths = [media.storage_path, media.thumbnail_128, media.thumbnail_512].filter(isStoragePath)

  const { error: dbErr } = await supabase.from('visit_photos').delete().eq('id', media.id)
  if (dbErr) throw dbErr

  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('visit-photos').remove(paths)
    if (storageErr) throw storageErr
  }
}

export async function deleteVisitMemory(memoryId: string): Promise<void> {
  const detail = await getMemoryDetail(memoryId)
  const paths = detail.media
    .flatMap((m) => [m.storage_path, m.thumbnail_128, m.thumbnail_512])
    .filter(isStoragePath)

  const { error } = await supabase.from('visits').delete().eq('id', memoryId)
  if (error) throw error

  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('visit-photos').remove(paths)
    if (storageErr) throw storageErr
  }
}

// ============================================================
// 조회
// ============================================================

export async function listMyMemories(): Promise<MemoryListItem[]> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('not authenticated')

  const { data, error } = await supabase
    .from('visits')
    .select(
      `id, visited_at, note, amount_spent, hero_media_id,
       place:places(id, display_name, address, latitude, longitude),
       media:visit_photos(id, thumbnail_512, storage_path, sort_order)`
    )
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    visited_at: string
    note: string | null
    amount_spent: number | null
    hero_media_id: string | null
    place: { id: string; display_name: string | null; address: string | null; latitude: number | null; longitude: number | null } | null
    media: Array<{ id: string; thumbnail_512: string | null; storage_path: string; sort_order: number }>
  }>

  return rows.map((r) => {
    const media = r.media ?? []
    const hero =
      (r.hero_media_id && media.find((m) => m.id === r.hero_media_id)) ||
      [...media].sort((a, b) => a.sort_order - b.sort_order)[0] ||
      null
    return {
      id: r.id,
      visited_at: r.visited_at,
      note: r.note,
      amount_spent: r.amount_spent,
      hero_media_id: r.hero_media_id,
      place: r.place
        ? {
            id: r.place.id,
            display_name: r.place.display_name,
            address: r.place.address,
            latitude: r.place.latitude,
            longitude: r.place.longitude,
          }
        : null,
      hero: hero
        ? { id: hero.id, thumbnail_512: hero.thumbnail_512, storage_path: hero.storage_path }
        : null,
      media_count: media.length,
    }
  })
}

export interface MapMarker {
  memoryId: string
  placeId: string
  displayName: string
  latitude: number
  longitude: number
  heroThumbnail: string | null
}

export async function loadMapMarkers(): Promise<MapMarker[]> {
  const memories = await listMyMemories()
  return memories
    .filter((m) => m.place?.latitude != null && m.place?.longitude != null)
    .map((m) => ({
      memoryId: m.id,
      placeId: m.place!.id,
      displayName: m.place!.display_name ?? '장소',
      latitude: m.place!.latitude!,
      longitude: m.place!.longitude!,
      heroThumbnail: m.hero?.thumbnail_512 ?? m.hero?.storage_path ?? null,
    }))
}

export async function getMemoryDetail(memoryId: string): Promise<MemoryDetail> {
  const { data: memory, error: mErr } = await supabase
    .from('visits')
    .select('*')
    .eq('id', memoryId)
    .single()
  if (mErr) throw mErr

  const { data: place, error: pErr } = await supabase
    .from('places')
    .select('id, google_place_id, display_name, address, latitude, longitude')
    .eq('id', (memory as Memory).place_id)
    .maybeSingle()
  if (pErr) throw pErr

  const { data: media, error: mediaErr } = await supabase
    .from('visit_photos')
    .select('*')
    .eq('visit_id', memoryId)
    .order('sort_order', { ascending: true })
  if (mediaErr) throw mediaErr

  return {
    memory: memory as Memory,
    place: (place as PlaceLatLng) ?? null,
    media: (media ?? []) as Media[],
  }
}

// ============================================================
// 공유 / 가져오기
// ============================================================

export interface CreateShareLinkInput {
  visitId: string
  expiresAt?: string | null
}

export async function createShareLink(input: CreateShareLinkInput): Promise<ShareLink> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('not authenticated')

  const { data, error } = await supabase
    .from('shared_links')
    .insert({
      visit_id: input.visitId,
      owner_user_id: userId,
      expires_at: input.expiresAt ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ShareLink
}

export async function getSharedMemoryByToken(token: string): Promise<SharedMemory | null> {
  const { data, error } = await supabase.rpc('get_shared_memory', { p_token: token })
  if (error) throw error
  return (data as SharedMemory | null) ?? null
}

// import-merge-rule v0.5
// mode 'keep'   : 내 값 유지, 빈 필드만 채움, 공유 미디어 뒤에 append, 대표 사진 유지
// mode 'overwrite': 위치/방문일/메모/쓴 금액/대표 사진 공유 값으로 교체, 미디어는 그대로 append (삭제 없음)
// 취소는 호출자 측 no-op (이 함수 미호출)
export async function importSharedMemory(
  token: string,
  mode: ImportMode = 'keep',
  targetVisitId?: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('import_shared_memory', {
    p_token: token,
    p_mode: mode,
    p_target_visit_id: targetVisitId ?? null,
  })
  if (error) throw error
  return data as string
}
