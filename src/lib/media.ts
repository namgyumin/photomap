import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import type { MediaType } from '../types/database'
import { supabase } from './supabase'
import { supabaseUrl } from './config'

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

function getMimeType(uri: string, mediaType: MediaType): string {
  if (mediaType === 'video') {
    if (uri.toLowerCase().endsWith('.mov')) return 'video/quicktime'
    return 'video/mp4'
  }
  if (uri.toLowerCase().endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

// 로컬 URI → Supabase Storage 업로드. storagePath 반환 (bucket 내 경로).
export async function uploadMedia(
  userId: string,
  visitId: string,
  localUri: string,
  mediaType: MediaType
): Promise<string> {
  const ext = mediaType === 'video' ? 'mp4' : 'jpg'
  const filename = `${Date.now()}.${ext}`
  const storagePath = `${userId}/${visitId}/${filename}`

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const mimeType = getMimeType(localUri, mediaType)

  const { error } = await supabase.storage
    .from('visit-photos')
    .upload(storagePath, decode(base64), {
      contentType: mimeType,
      upsert: false,
    })

  if (error) throw error
  return storagePath
}

// storage_path → 렌더링 가능한 URI 해석.
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
  return `${supabaseUrl}/storage/v1/object/public/visit-photos/${storagePath}`
}
