import { decode } from 'base64-arraybuffer'
import { readAsStringAsync } from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
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
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
}

export interface UploadedMediaPaths {
  storagePath: string
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
      if (secs > MAX_VIDEO_SECONDS) throw new VideoTooLongError(secs)
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
    if (durationSeconds > MAX_VIDEO_SECONDS) {
      throw new VideoTooLongError(durationSeconds)
    }
  }

  const exif = extractExif(asset)

  return {
    uri: asset.uri,
    mediaType: isVideo ? 'video' : 'photo',
    durationSeconds: isVideo ? durationSeconds : null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    capturedAt: exif.capturedAt,
    latitude: exif.latitude,
    longitude: exif.longitude,
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

async function uploadLocalFile(
  bucket: 'visit-photos',
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

// 로컬 URI → Supabase Storage 업로드. 원본 + 사진 썸네일 경로 반환.
export async function uploadMedia(
  userId: string,
  visitId: string,
  localUri: string,
  mediaType: MediaType
): Promise<UploadedMediaPaths> {
  const now = Date.now()
  const ext = mediaType === 'video' ? 'mp4' : 'jpg'
  const storagePath = `${userId}/${visitId}/original/${now}.${ext}`
  const sanitizedPhotoUri = mediaType === 'photo' ? await sanitizePhotoForUpload(localUri) : localUri
  const mimeType = getMimeType(sanitizedPhotoUri, mediaType)

  await uploadLocalFile('visit-photos', storagePath, sanitizedPhotoUri, mimeType)

  if (mediaType === 'video') {
    return { storagePath, thumbnail128: null, thumbnail512: null }
  }

  const thumb128Path = `${userId}/${visitId}/thumbs/${now}_128.jpg`
  const thumb512Path = `${userId}/${visitId}/thumbs/${now}_512.jpg`
  const [thumb128Uri, thumb512Uri] = await Promise.all([
    createPhotoThumbnail(sanitizedPhotoUri, 128),
    createPhotoThumbnail(sanitizedPhotoUri, 512),
  ])

  await Promise.all([
    uploadLocalFile('visit-photos', thumb128Path, thumb128Uri, 'image/jpeg'),
    uploadLocalFile('visit-photos', thumb512Path, thumb512Uri, 'image/jpeg'),
  ])

  return { storagePath, thumbnail128: thumb128Path, thumbnail512: thumb512Path }
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
