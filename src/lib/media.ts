import * as ImagePicker from 'expo-image-picker'
import { supabaseUrl } from './config'
import type { MediaType } from '../types/database'

export const MAX_VIDEO_SECONDS = 10

export interface PickedMedia {
  uri: string
  mediaType: MediaType
  durationSeconds: number | null
  width: number | null
  height: number | null
}

export class VideoTooLongError extends Error {
  constructor(public seconds: number) {
    super(`video must be <= ${MAX_VIDEO_SECONDS}s (got ${seconds}s)`)
    this.name = 'VideoTooLongError'
  }
}

// 사진/영상 1개 선택. 영상은 클라이언트에서 10초 검증.
export async function pickMedia(): Promise<PickedMedia | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    throw new Error('PERMISSION_DENIED')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: false,
    quality: 0.8,
  })

  if (result.canceled || !result.assets?.length) return null

  const asset = result.assets[0]
  const isVideo = asset.type === 'video'
  // expo-image-picker duration 은 밀리초
  const durationSeconds =
    asset.duration != null ? Math.round((asset.duration / 1000) * 10) / 10 : null

  if (isVideo) {
    if (durationSeconds == null || durationSeconds <= 0) {
      throw new Error('video duration unknown')
    }
    if (durationSeconds > MAX_VIDEO_SECONDS) {
      throw new VideoTooLongError(durationSeconds)
    }
  }

  return {
    uri: asset.uri,
    mediaType: isVideo ? 'video' : 'photo',
    durationSeconds: isVideo ? durationSeconds : null,
    width: asset.width ?? null,
    height: asset.height ?? null,
  }
}

// storage_path → 렌더링 가능한 URI 해석.
// 로컬 uri(file:/content:/http) 면 그대로, 아니면 supabase storage public URL 로 가정.
export function resolveMediaUri(storagePath: string | null): string | null {
  if (!storagePath) return null
  if (
    storagePath.startsWith('http') ||
    storagePath.startsWith('file:') ||
    storagePath.startsWith('content:') ||
    storagePath.startsWith('data:')
  ) {
    return storagePath
  }
  if (!supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/media/${storagePath}`
}
