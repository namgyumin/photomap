import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy'

// ============================================================
// 로컬 미디어 스토어 (DB 미사용)
// - 사진: 크롭된 JPEG 파일을 기기 문서 폴더에 저장
// - 영상: 원본 mp4 복사 + 위치/트림 메타데이터(정규화 비율)
// - 메타데이터는 AsyncStorage 에 visitId 별 JSON 배열로 보관
// ============================================================

const MEDIA_DIR = `${documentDirectory ?? ''}photomap-media/`
const KEY = (visitId: string) => `localMedia:${visitId}`

export interface LocalMedia {
  id: string
  visitId: string
  mediaType: 'photo' | 'video'
  uri: string // file:// 로컬 경로
  width: number | null
  height: number | null
  sortOrder: number
  // video 전용 — 트림 구간 + 위치(뷰포트 대비 비율)
  videoStartTime?: number | null
  videoEndTime?: number | null
  boxWFrac?: number | null // 영상 박스 너비 / 뷰포트 너비
  boxHFrac?: number | null // 영상 박스 높이 / 뷰포트 높이
  offsetXFrac?: number | null // 가로 오프셋 / 뷰포트 너비
  offsetYFrac?: number | null // 세로 오프셋 / 뷰포트 높이
  createdAt: string
}

async function ensureDir(): Promise<void> {
  await makeDirectoryAsync(MEDIA_DIR, { intermediates: true }).catch(() => {})
}

export async function listLocalMedia(visitId: string): Promise<LocalMedia[]> {
  const raw = await AsyncStorage.getItem(KEY(visitId)).catch(() => null)
  if (!raw) return []
  try {
    return (JSON.parse(raw) as LocalMedia[]).sort((a, b) => a.sortOrder - b.sortOrder)
  } catch {
    return []
  }
}

async function saveAll(visitId: string, list: LocalMedia[]): Promise<void> {
  await AsyncStorage.setItem(KEY(visitId), JSON.stringify(list))
}

// 편집 완료된 파일(크롭 JPEG / 원본 mp4)을 영구 폴더로 복사 → file:// 반환
export async function persistLocalFile(id: string, ext: string, sourceUri: string): Promise<string> {
  await ensureDir()
  const dest = `${MEDIA_DIR}${id}.${ext}`
  await deleteAsync(dest, { idempotent: true }).catch(() => {})
  await copyAsync({ from: sourceUri, to: dest })
  return dest
}

export async function addLocalMedia(rec: Omit<LocalMedia, 'createdAt'>): Promise<LocalMedia> {
  const list = await listLocalMedia(rec.visitId)
  const full: LocalMedia = { ...rec, createdAt: new Date().toISOString() }
  // 같은 슬롯(sortOrder) 이미 있으면 교체
  const filtered = list.filter((m) => m.sortOrder !== rec.sortOrder)
  filtered.push(full)
  await saveAll(rec.visitId, filtered)
  return full
}

export async function deleteLocalMedia(visitId: string, id: string): Promise<void> {
  const list = await listLocalMedia(visitId)
  const target = list.find((m) => m.id === id)
  if (target) await deleteAsync(target.uri, { idempotent: true }).catch(() => {})
  await saveAll(
    visitId,
    list.filter((m) => m.id !== id)
  )
}

// 첫 미디어 = hero. 지도 마커 썸네일용으로 첫 사진/영상 uri 반환.
export async function localHeroUri(visitId: string): Promise<string | null> {
  const list = await listLocalMedia(visitId)
  if (!list.length) return null
  const first = list[0]
  const info = await getInfoAsync(first.uri).catch(() => null)
  return info?.exists ? first.uri : null
}
