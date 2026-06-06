// photomap 데이터 레이어 타입
// 매핑: memory = visits 행, media = visit_photos 행

export type Visibility = 'private' | 'link'
export type MediaType = 'photo' | 'video'
export type ImportMode = 'keep' | 'overwrite'

export interface Place {
  id: string
  google_place_id: string
  display_name: string | null
  address: string | null
  // location 은 geography → 클라이언트는 lat/lng 만 다룸
  cached_at: string
}

export interface PlaceLatLng {
  id: string
  google_place_id: string
  display_name: string | null
  address: string | null
  latitude: number
  longitude: number
}

// visits = memory
export interface Memory {
  id: string
  user_id: string
  place_id: string
  visited_at: string
  visibility: Visibility
  note: string | null
  amount_spent: number | null
  hero_media_id: string | null
  is_saved: boolean
  created_at: string
  updated_at: string
}

// visit_photos = media
export interface Media {
  id: string
  visit_id: string
  uploader_id: string
  storage_path: string
  thumbnail_128: string | null
  thumbnail_512: string | null
  width: number | null
  height: number | null
  captured_at: string | null
  is_cover: boolean
  media_type: MediaType
  duration_seconds: number | null
  sort_order: number
  latitude: number | null
  longitude: number | null
  source_media_id: string | null
  imported_from_user_id: string | null
  created_at: string
}

export interface ShareLink {
  id: string
  visit_id: string
  owner_user_id: string
  share_token: string
  expires_at: string | null
  created_at: string
}

// get_shared_memory RPC 반환 형태
export interface SharedMemory {
  token: string
  owner_user_id: string
  visit: {
    id: string
    visited_at: string
    note: string | null
    amount_spent: number | null
    hero_media_id: string | null
    place_id: string
  }
  place: PlaceLatLng | null
  media: Array<{
    id: string
    media_type: MediaType
    storage_path: string
    thumbnail_128: string | null
    thumbnail_512: string | null
    width: number | null
    height: number | null
    duration_seconds: number | null
    captured_at: string | null
    sort_order: number
    latitude: number | null
    longitude: number | null
  }>
}

export interface MemoryDetail {
  memory: Memory
  place: PlaceLatLng | null
  media: Media[]
}

export interface MemoryListItem {
  id: string
  visited_at: string
  note: string | null
  amount_spent: number | null
  hero_media_id: string | null
  place: Pick<Place, 'id' | 'display_name' | 'address'> | null
  hero: Pick<Media, 'id' | 'thumbnail_512' | 'storage_path'> | null
  media_count: number
}
