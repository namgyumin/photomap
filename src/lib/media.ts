import { decode } from 'base64-arraybuffer'
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library'
import * as VideoThumbnails from 'expo-video-thumbnails'
import type { MediaType } from '../types/database'
import { supabase } from './supabase'
import { supabaseUrl } from './config'

export const MAX_VIDEO_SECONDS = 10

// 하이브리드 미디어 정책:
// - 원본(사진/영상)은 유저 기기 사진 라이브러리에 그대로 (local_asset_id 참조)
// - 서버엔 디스플레이용 썸네일(1280, thumbnail_512 컬럼) + 마커용(128)만 업로드
// - 공유 시점에만 uploadOriginal 로 원본 업로드 → storage_path 채움
export const DISPLAY_THUMB_WIDTH = 1280

export interface PickedMedia {
  uri: string
  assetId: string | null
  mediaType: MediaType
  durationSeconds: number | null
  width: number | null
  height: number | null
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
}

export interface UploadedMediaPaths {
  storagePath: string | null
  thumbnail128: string | null
  thumbnail512: string | null
}

export class VideoTooLongError extends Error {
  constructor(public seconds: number) {
    super(`video must be <= ${MAX_VIDEO_SECONDS}s (got ${seconds}s)`)
    this.name = 'VideoTooLongError'
  }
}

function parseExifDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function numberFromExif(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function extractExif(asset: ImagePicker.ImagePickerAsset): {
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
} {
  const exif = (asset as { exif?: Record<string, unknown> | null }).exif ?? null
  if (!exif) return { capturedAt: null, latitude: null, longitude: null }

  const capturedAt =
    parseExifDate(exif.DateTimeOriginal) ??
    parseExifDate(exif.DateTimeDigitized) ??
    parseExifDate(exif.DateTime) ??
    null

  const rawLat = numberFromExif(exif.GPSLatitude)
  const rawLng = numberFromExif(exif.GPSLongitude)
  const latRef = typeof exif.GPSLatitudeRef === 'string' ? exif.GPSLatitudeRef : ''
  const lngRef = typeof exif.GPSLongitudeRef === 'string' ? exif.GPSLongitudeRef : ''

  const latitude = rawLat == null ? null : latRef.toUpperCase() === 'S' ? -Math.abs(rawLat) : rawLat
  const longitude = rawLng == null ? null : lngRef.toUpperCase() === 'W' ? -Math.abs(rawLng) : rawLng

  return { capturedAt, latitude, longitude }
}

// 사진/영상 1개 선택. 영상은 클라이언트에서 10초 검증.
function assetToPickedMedia(asset: ImagePicker.ImagePickerAsset): PickedMedia {
  const isVideo = asset.type === 'video'
  const durationSeconds =
    asset.duration != null ? Math.round((asset.duration / 1000) * 10) / 10 : null
  const exif = extractExif(asset)
  return {
    uri: asset.uri,
    assetId: asset.assetId ?? null,
    mediaType: isVideo ? 'video' : 'photo',
    durationSeconds: isVideo ? durationSeconds : null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    capturedAt: exif.capturedAt,
    latitude: exif.latitude,
    longitude: exif.longitude,
  }
}

export async function pickMediaMultiple(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error('PERMISSION_DENIED')

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 0.8,
    exif: true,
  })

  if (result.canceled || !result.assets?.length) return []

  const picked: PickedMedia[] = []
  for (const asset of result.assets) {
    const isVideo = asset.type === 'video'
    if (isVideo) {
      const secs = asset.duration != null ? Math.round((asset.duration / 1000) * 10) / 10 : null
      if (secs == null || secs <= 0) throw new Error('video duration unknown')
    }
    picked.push(assetToPickedMedia(asset))
  }
  return picked
}

export async function pickMedia(): Promise<PickedMedia | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    throw new Error('PERMISSION_DENIED')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: false,
    quality: 0.8,
    exif: true,
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
  }

  return assetToPickedMedia(asset)
}

function getMimeType(uri: string, mediaType: MediaType): string {
  if (mediaType === 'video') {
    if (uri.toLowerCase().endsWith('.mov')) return 'video/quicktime'
    return 'video/mp4'
  }
  if (uri.toLowerCase().endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

async function uploadLocalFile(
  bucket: 'visit-photos' | 'avatars',
  path: string,
  uri: string,
  contentType: string
): Promise<void> {
  const base64 = await readAsStringAsync(uri, {
    encoding: 'base64',
  })

  const { error } = await supabase.storage.from(bucket).upload(path, decode(base64), {
    contentType,
    upsert: false,
  })

  if (error) throw error
}

async function createPhotoThumbnail(localUri: string, width: number): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
  )
  return result.uri
}

async function sanitizePhotoForUpload(localUri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(localUri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  return result.uri
}

// 하이브리드 업로드: 원본은 올리지 않고 썸네일만 서버에 저장.
// thumbnail_512 컬럼에 1280px 디스플레이 썸네일을 넣음 (컬럼명은 legacy).
export async function uploadMedia(
  userId: string,
  visitId: string,
  localUri: string,
  mediaType: MediaType
): Promise<UploadedMediaPaths> {
  const now = Date.now()

  // 썸네일 소스: 사진은 원본, 영상은 첫 프레임 포스터
  let thumbSourceUri: string
  if (mediaType === 'video') {
    const { uri } = await VideoThumbnails.getThumbnailAsync(localUri, { time: 0 })
    thumbSourceUri = uri
  } else {
    thumbSourceUri = await sanitizePhotoForUpload(localUri)
  }

  const thumb128Path = `${userId}/${visitId}/thumbs/${now}_128.jpg`
  const displayThumbPath = `${userId}/${visitId}/thumbs/${now}_${DISPLAY_THUMB_WIDTH}.jpg`
  const [thumb128Uri, displayThumbUri] = await Promise.all([
    createPhotoThumbnail(thumbSourceUri, 128),
    createPhotoThumbnail(thumbSourceUri, DISPLAY_THUMB_WIDTH),
  ])

  await Promise.all([
    uploadLocalFile('visit-photos', thumb128Path, thumb128Uri, 'image/jpeg'),
    uploadLocalFile('visit-photos', displayThumbPath, displayThumbUri, 'image/jpeg'),
  ])

  return { storagePath: null, thumbnail128: thumb128Path, thumbnail512: displayThumbPath }
}

// 공유 시점 원본 업로드. storage_path 로 쓸 경로 반환.
export async function uploadOriginal(
  userId: string,
  visitId: string,
  localUri: string,
  mediaType: MediaType
): Promise<string> {
  const now = Date.now()
  const ext = mediaType === 'video' ? 'mp4' : 'jpg'
  const storagePath = `${userId}/${visitId}/original/${now}.${ext}`
  const sourceUri = mediaType === 'photo' ? await sanitizePhotoForUpload(localUri) : localUri
  await uploadLocalFile('visit-photos', storagePath, sourceUri, getMimeType(sourceUri, mediaType))
  return storagePath
}

// ============================================================
// 영상 로컬 캐시
// iOS 사진 라이브러리 asset URI(ph://)는 expo-video 가 재생 못 함
// → 영상 추가 시점에 앱 문서 폴더로 복사해 file:// 로 재생 (10초 제한이라 용량 작음)
// ============================================================

const LOCAL_VIDEO_DIR = `${documentDirectory ?? ''}photomap-videos/`

function localVideoPath(mediaId: string): string {
  return `${LOCAL_VIDEO_DIR}${mediaId}.mp4`
}

export async function cacheVideoLocally(mediaId: string, sourceUri: string): Promise<void> {
  await makeDirectoryAsync(LOCAL_VIDEO_DIR, { intermediates: true }).catch(() => {})
  await copyAsync({ from: sourceUri, to: localVideoPath(mediaId) })
}

export async function localVideoUri(mediaId: string): Promise<string | null> {
  try {
    const info = await getInfoAsync(localVideoPath(mediaId))
    return info.exists ? localVideoPath(mediaId) : null
  } catch {
    return null
  }
}

export async function deleteLocalVideo(mediaId: string): Promise<void> {
  await deleteAsync(localVideoPath(mediaId), { idempotent: true }).catch(() => {})
}

// local_asset_id → 렌더링/업로드 가능한 로컬 URI.
// 갤러리에서 삭제됐거나 권한 없으면 null (호출부는 서버 썸네일 fallback).
export async function resolveLocalAssetUri(assetId: string | null): Promise<string | null> {
  if (!assetId) return null
  try {
    let perm = await MediaLibrary.getPermissionsAsync()
    if (!perm.granted && perm.canAskAgain) {
      perm = await MediaLibrary.requestPermissionsAsync()
    }
    if (!perm.granted) return null
    const info = await MediaLibrary.getAssetInfoAsync(assetId)
    return info?.localUri ?? info?.uri ?? null
  } catch {
    return null
  }
}

// 프로필 사진: 정사각 크롭 선택 → 512px JPEG → avatars 버킷 업로드 → public URL 반환.
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error('PERMISSION_DENIED')

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  })
  if (result.canceled || !result.assets?.length) return null

  const resized = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 512 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  )

  const path = `${userId}/avatar_${Date.now()}.jpg`
  await uploadLocalFile('avatars', path, resized.uri, 'image/jpeg')

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
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
