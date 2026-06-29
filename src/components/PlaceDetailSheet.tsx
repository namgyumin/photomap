import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useInterstitialAd } from '../hooks/useInterstitialAd'
import { useVideoPlayer, VideoView } from 'expo-video'
import type { PlaceDetailsResult, PlaceSearchResult } from '../lib/googlePlaces'
import { fetchPlaceDetails } from '../lib/googlePlaces'
import {
  MAX_VIDEO_SECONDS,
  pickMedia,
  resolveMediaUri,
  VideoTooLongError,
} from '../lib/media'
import {
  addLocalMedia,
  deleteLocalMedia,
  listLocalMedia,
  persistLocalFile,
  type LocalMedia,
} from '../lib/localMedia'
import {
  createOrGetPlace,
  createSavedList,
  createVisitMemory,
  deleteListIfEmpty,
  deleteVisitMemory,
  getMemoryDetail,
  listSavedLists,
  updateVisitMemoryFields,
} from '../services/memories'
import type { Media, MemoryDetail, SavedList, Visibility } from '../types/database'
import { useTranslation } from 'react-i18next'
import { PhotoCropEditor } from './PhotoCropEditor'
import { VideoTrimEditor } from './VideoTrimEditor'
import { VideoPositionEditor, type PositionResult } from './VideoPositionEditor'

// 로컬 미디어 → 렌더링용 Media 형태로 매핑 (storage_path = file:// 로컬 경로)
function localToMedia(lm: LocalMedia): Media {
  return {
    id: lm.id,
    visit_id: lm.visitId,
    uploader_id: '',
    storage_path: lm.uri,
    local_asset_id: null,
    thumbnail_128: null,
    thumbnail_512: lm.uri,
    width: lm.width,
    height: lm.height,
    captured_at: null,
    is_cover: false,
    media_type: lm.mediaType,
    duration_seconds: null,
    video_start_time: lm.videoStartTime ?? null,
    video_end_time: lm.videoEndTime ?? null,
    video_offset_x: null,
    video_offset_y: null,
    video_scale: null,
    video_box_w_frac: lm.boxWFrac ?? null,
    video_box_h_frac: lm.boxHFrac ?? null,
    video_offset_x_frac: lm.offsetXFrac ?? null,
    video_offset_y_frac: lm.offsetYFrac ?? null,
    sort_order: lm.sortOrder,
    latitude: null,
    longitude: null,
    source_media_id: null,
    imported_from_user_id: null,
    created_at: lm.createdAt,
  }
}

interface Props {
  visible: boolean
  onClose: () => void
  userId: string | null
  searchPlace?: PlaceSearchResult | null
  memoryId?: string | null
  onSaved?: (memoryId: string, place: PlaceSearchResult) => void
  onDeleted?: (memoryId: string) => void
  onChanged?: () => void
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5, delayMs = 800): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

function RetryImage({ uri, style }: { uri: string; style: object }) {
  const [loading, setLoading] = useState(true)
  const [retries, setRetries] = useState(0)
  const [key, setKey] = useState(0)
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <Image
        key={key}
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity: loading ? 0 : 1 }]}
        onLoad={() => setLoading(false)}
        onError={() => {
          if (retries < 4) {
            setTimeout(() => { setRetries(r => r + 1); setKey(k => k + 1) }, 800 * (retries + 1))
          } else {
            setLoading(false)
          }
        }}
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0EE' }]}>
          <ActivityIndicator size="small" color="#1C7B6C" />
        </View>
      )}
    </View>
  )
}

// ============================================================
// 공유 상수 (fixplan part1)
// ============================================================

const COLORS = {
  primary: '#1C7B6C',
  primaryDark: '#064B56',
  primaryLight: '#D8EEE9',
  actionBlueLight: '#D8F3F7',
  textDark: '#1A1A1A',
  textGray: '#5F6368',
  textLightGray: '#70757A',
  border: '#E8EAED',
  bgMuted: '#F0F0EE',
  cardBg: '#F1F3F4',
  white: '#FFFFFF',
  open: '#137333',
  closed: '#C62828',
  closingSoon: '#B06000',
  star: '#FBC02D',
}

const SHEET_RADIUS = 30

const SPACING = {
  horizontal: 24,
  section: 20,
  small: 8,
  medium: 12,
  large: 18,
}

const HEADER = {
  titleSizeExpanded: 28,
  titleSizeCollapsed: 23,
  subtitleSize: 17,
  metaSize: 16,
  lineHeightTitle: 34,
  lineHeightSubtitle: 23,
}

const ACTION_BUTTON = {
  height: 52,
  borderRadius: 26,
  paddingHorizontal: 22,
  gap: 12,
}

const ICON_BUTTON = {
  size: 36,
  borderRadius: 18,
}

// ============================================================
// 바텀시트 3단계 snap (fixplan part2)
// ============================================================

type SheetSnapState = 'collapsed' | 'medium' | 'expanded'

const SCREEN_WIDTH = Dimensions.get('window').width
const SCREEN_HEIGHT = Dimensions.get('window').height

const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.91
const MEDIUM_HEIGHT = SCREEN_HEIGHT * 0.74
const COLLAPSED_HEIGHT = SCREEN_HEIGHT * 0.38

// dragY = expanded 상단 기준 top offset. 0 = expanded, CLOSED_OFFSET = 완전히 숨김
const SNAP_OFFSET: Record<SheetSnapState, number> = {
  expanded: 0,
  medium: EXPANDED_HEIGHT - MEDIUM_HEIGHT,
  collapsed: EXPANDED_HEIGHT - COLLAPSED_HEIGHT,
}
const CLOSED_OFFSET = EXPANDED_HEIGHT

// 핸들바 영역은 탭부터 드래그, 그 아래 헤더 영역은 움직임이 생겼을 때만 드래그
const HANDLE_DRAG_REGION = 40
const SHEET_DRAG_REGION = 96
const VELOCITY_PROJECTION_MS = 250

const SPRING_CONFIG = { tension: 60, friction: 11, useNativeDriver: false as const }

function clampOffset(offset: number): number {
  return Math.max(0, Math.min(CLOSED_OFFSET, offset))
}

// 손 떼는 순간의 위치 + 속도로 가장 가까운 snap 상태 결정
function resolveSnapTarget(
  offset: number,
  vy: number,
  snapOffsets: Record<SheetSnapState, number>
): SheetSnapState | 'closed' {
  const projected = offset + vy * VELOCITY_PROJECTION_MS
  const candidates: Array<[SheetSnapState | 'closed', number]> = [
    ['expanded', snapOffsets.expanded],
    ['medium', snapOffsets.medium],
    ['collapsed', snapOffsets.collapsed],
    ['closed', CLOSED_OFFSET],
  ]
  let best = candidates[0]
  for (const candidate of candidates) {
    if (Math.abs(candidate[1] - projected) < Math.abs(best[1] - projected)) best = candidate
  }
  return best[0]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}


if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'))
}

function thumbUri(m: Media): string | null {
  return resolveMediaUri(m.thumbnail_512 ?? m.storage_path)
}

function fullUri(m: Media): string | null {
  return resolveMediaUri(m.storage_path ?? m.thumbnail_512)
}

interface VideoMeta {
  startTime?: number | null
  endTime?: number | null
  boxWFrac?: number | null // 영상 박스 너비 / 컨테이너 너비
  boxHFrac?: number | null // 영상 박스 높이 / 컨테이너 높이
  offsetXFrac?: number | null
  offsetYFrac?: number | null
}

// 그리드 slot 인라인 영상 — 컨테이너 크기 측정 후 정규화 비율로 위치/크기 재현
function SlotVideo({ uri, meta }: { uri: string; meta?: VideoMeta }) {
  const startTime = meta?.startTime ?? 0
  const endTime = meta?.endTime ?? null
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.muted = true
    p.currentTime = startTime
    p.play()
  })
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 100)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (endTime == null) return
    const interval = setInterval(() => {
      try {
        if (player.currentTime >= endTime - 0.08) player.currentTime = startTime
      } catch {}
    }, 80)
    return () => clearInterval(interval)
  }, [player, startTime, endTime])

  const bwf = meta?.boxWFrac ?? null
  const bhf = meta?.boxHFrac ?? null
  const hasBox = bwf != null && bhf != null && size.w > 0 && size.h > 0

  return (
    <View
      style={[styles.videoFill, { overflow: 'hidden' }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {ready &&
        (hasBox ? (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View
              style={{
                width: bwf * size.w,
                height: bhf * size.h,
                transform: [
                  { translateX: (meta?.offsetXFrac ?? 0) * size.w },
                  { translateY: (meta?.offsetYFrac ?? 0) * size.h },
                ],
              }}
            >
              <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="fill" surfaceType="textureView" />
            </View>
          </View>
        ) : (
          <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" surfaceType="textureView" />
        ))}
    </View>
  )
}

// 전체화면 뷰어 영상 — trim 구간만 루프, 전체 영상 contain
function ViewerVideo({ uri, active, meta }: { uri: string; active: boolean; meta?: VideoMeta }) {
  const startTime = meta?.startTime ?? 0
  const endTime = meta?.endTime ?? null
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.currentTime = startTime
  })
  useEffect(() => {
    if (active) player.play()
    else player.pause()
  }, [active, player])
  useEffect(() => {
    const interval = setInterval(() => {
      if (endTime != null && player.currentTime >= endTime - 0.08) player.currentTime = startTime
    }, 80)
    return () => clearInterval(interval)
  }, [player, startTime, endTime])

  return <VideoView player={player} style={styles.viewerVideo} contentFit="contain" />
}

// ============================================================
// 별점 (0.5 단위 표시 + 편집)
// ============================================================
const STAR_FILLED = require('../../assets/icons/star-filled.png')
const STAR_EMPTY = require('../../assets/icons/star-empty.png')

function HalfStar({
  filled,
  size,
  side,
  onPress,
}: {
  filled: boolean
  size: number
  side: 'left' | 'right'
  onPress?: () => void
}) {
  const img = (
    <View style={{ width: size / 2, height: size, overflow: 'hidden' }}>
      <Image
        source={filled ? STAR_FILLED : STAR_EMPTY}
        style={{ width: size, height: size, marginLeft: side === 'right' ? -size / 2 : 0, resizeMode: 'contain' }}
      />
    </View>
  )
  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={3}>
        {img}
      </Pressable>
    )
  }
  return img
}

function Stars({ value, size, onPick }: { value: number; size: number; onPick?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: onPick ? 4 : 1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          <HalfStar filled={value >= i + 0.5} size={size} side="left" onPress={onPick ? () => onPick(i + 0.5) : undefined} />
          <HalfStar filled={value >= i + 1} size={size} side="right" onPress={onPick ? () => onPick(i + 1) : undefined} />
        </View>
      ))}
    </View>
  )
}

function RatingEditor({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: number
  onConfirm: (r: number) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [r, setR] = useState(initial || 0)
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={ratingStyles.backdrop} onPress={() => onConfirm(r)}>
        <Pressable style={ratingStyles.card} onPress={() => {}}>
          <Text style={ratingStyles.title}>{t('rating.title')}</Text>
          <Stars value={r} size={44} onPick={setR} />
          <Text style={ratingStyles.value}>{r > 0 ? r.toFixed(1) : '-'}</Text>
          <Pressable style={ratingStyles.confirm} onPress={() => onConfirm(r)}>
            <Text style={ratingStyles.confirmText}>{t('common.ok')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const ratingStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  value: { fontSize: 22, fontWeight: '800', color: '#1C7B6C' },
  confirm: {
    backgroundColor: '#1C7B6C',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})


// ============================================================
// 사진 레이아웃 시스템 (fixplan part5)
// slot 위치는 visit_photos.sort_order 로 영속.
// layoutType 은 DB 컬럼이 없어 AsyncStorage 로 기기 내 유지
// (백엔드 컬럼 추가 필요 — part9 문서 참조)
// ============================================================

type PhotoLayoutType =
  | 'single' //          A: 1장 전체형
  | 'twoVertical' //     B: 2장 좌우 분할
  | 'twoHorizontal' //   C: 2장 위아래
  | 'threeLeftHero' //   D: 왼쪽 큰 사진 + 오른쪽 2장
  | 'threeRightHero' //  E: 오른쪽 큰 사진 + 왼쪽 2장
  | 'threeTopHero' //    F: 상단 큰 사진 + 하단 2장
  | 'threeBottomHero' // G: 상단 2장 + 하단 큰 사진

const LAYOUT_SLOT_COUNT: Record<PhotoLayoutType, number> = {
  single: 1,
  twoVertical: 2,
  twoHorizontal: 2,
  threeLeftHero: 3,
  threeRightHero: 3,
  threeTopHero: 3,
  threeBottomHero: 3,
}

const LAYOUT_OPTIONS_BASE: Array<{ type: PhotoLayoutType; labelKey: string }> = [
  { type: 'single', labelKey: 'place.layoutSingle' },
  { type: 'twoVertical', labelKey: 'place.layoutTwoV' },
  { type: 'twoHorizontal', labelKey: 'place.layoutTwoH' },
  { type: 'threeLeftHero', labelKey: 'place.layoutLeft' },
  { type: 'threeRightHero', labelKey: 'place.layoutRight' },
  { type: 'threeTopHero', labelKey: 'place.layoutTop' },
  { type: 'threeBottomHero', labelKey: 'place.layoutBottom' },
]

const LAYOUT_STORAGE_PREFIX = 'photomap:placeSheetLayout:'
const RATING_STORAGE_PREFIX = 'photomap:userRating:'

// 저장 목록 색상 팔레트
const LIST_COLORS = [
  '#1C7B6C',
  '#D93025',
  '#F9AB00',
  '#1A73E8',
  '#9334E6',
  '#E8710A',
  '#0B8043',
  '#F06292',
]

function isPhotoLayoutType(v: string | null): v is PhotoLayoutType {
  return v != null && v in LAYOUT_SLOT_COUNT
}

function defaultLayoutFor(count: number): PhotoLayoutType {
  if (count <= 1) return 'single'
  if (count === 2) return 'twoVertical'
  return 'threeLeftHero'
}

// 레이아웃 선택 모달용 미니 프리뷰
function LayoutPreviewThumb({ type }: { type: PhotoLayoutType }) {
  switch (type) {
    case 'single':
      return (
        <View style={styles.pvFrame}>
          <View style={styles.pvBlock} />
        </View>
      )
    case 'twoVertical':
      return (
        <View style={[styles.pvFrame, styles.pvRow]}>
          <View style={styles.pvBlock} />
          <View style={styles.pvBlock} />
        </View>
      )
    case 'twoHorizontal':
      return (
        <View style={styles.pvFrame}>
          <View style={styles.pvBlock} />
          <View style={styles.pvBlock} />
        </View>
      )
    case 'threeLeftHero':
      return (
        <View style={[styles.pvFrame, styles.pvRow]}>
          <View style={[styles.pvBlock, styles.pvHero]} />
          <View style={styles.pvCol}>
            <View style={styles.pvBlock} />
            <View style={styles.pvBlock} />
          </View>
        </View>
      )
    case 'threeRightHero':
      return (
        <View style={[styles.pvFrame, styles.pvRow]}>
          <View style={styles.pvCol}>
            <View style={styles.pvBlock} />
            <View style={styles.pvBlock} />
          </View>
          <View style={[styles.pvBlock, styles.pvHero]} />
        </View>
      )
    case 'threeTopHero':
      return (
        <View style={styles.pvFrame}>
          <View style={[styles.pvBlock, styles.pvHero]} />
          <View style={styles.pvRowInner}>
            <View style={styles.pvBlock} />
            <View style={styles.pvBlock} />
          </View>
        </View>
      )
    case 'threeBottomHero':
      return (
        <View style={styles.pvFrame}>
          <View style={styles.pvRowInner}>
            <View style={styles.pvBlock} />
            <View style={styles.pvBlock} />
          </View>
          <View style={[styles.pvBlock, styles.pvHero]} />
        </View>
      )
  }
}

export function PlaceDetailSheet({
  visible,
  onClose,
  userId,
  searchPlace,
  memoryId,
  onSaved,
  onDeleted,
  onChanged,
}: Props) {
  const { t } = useTranslation()
  const TABS = [t('place.overview'), t('place.menu'), t('place.reviews'), t('place.photos'), t('place.updates'), t('place.info')]
  const LAYOUT_OPTIONS = LAYOUT_OPTIONS_BASE.map((o) => ({
    type: o.type,
    label: o.labelKey.startsWith('place.') ? t(o.labelKey) : o.labelKey,
  }))
  const { show: showInterstitial } = useInterstitialAd()

  // Sheet
  const [isEditing, setIsEditing] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [snapState, setSnapState] = useState<SheetSnapState>('medium')
  const snapStateRef = useRef<SheetSnapState>('medium')
  const dragY = useRef(new Animated.Value(CLOSED_OFFSET)).current
  const dragBase = useRef(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Collapsed 높이는 헤더+액션버튼 실측 높이에 맞춰 동적 조정 (38%는 fallback)
  const snapOffsetsRef = useRef<Record<SheetSnapState, number>>({ ...SNAP_OFFSET })
  const actionScrollRef = useRef<ScrollView>(null)
  const handleCollapsedContentLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    const HANDLE_AREA = 27 // marginTop 10 + bar 5 + marginBottom 12
    const measured = e.nativeEvent.layout.height + HANDLE_AREA + 16
    const clamped = Math.min(Math.max(measured, SCREEN_HEIGHT * 0.16), SCREEN_HEIGHT * 0.6)
    const next = EXPANDED_HEIGHT - clamped
    if (Math.abs(snapOffsetsRef.current.collapsed - next) < 1) return
    snapOffsetsRef.current = { ...snapOffsetsRef.current, collapsed: next }
    if (snapStateRef.current === 'collapsed') {
      Animated.spring(dragY, { toValue: next, ...SPRING_CONFIG }).start()
    }
  }

  // Data
  const [currentId, setCurrentId] = useState<string | null>(memoryId ?? null)
  const [detail, setDetail] = useState<MemoryDetail | null>(null)
  const [localMediaList, setLocalMediaList] = useState<LocalMedia[]>([])
  const [userRating, setUserRating] = useState<number | null>(null)
  const [ratingEditorVisible, setRatingEditorVisible] = useState(false)
  const [placeDetails, setPlaceDetails] = useState<PlaceDetailsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Photo layout
  const [layoutType, setLayoutType] = useState<PhotoLayoutType>('single')
  const [layoutPickerVisible, setLayoutPickerVisible] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [cropEditor, setCropEditor] = useState<{
    uri: string; width: number; height: number; slotAspect: number; slotIndex: number
  } | null>(null)
  const [videoTrimEditor, setVideoTrimEditor] = useState<{
    uri: string; duration: number; width: number; height: number; slotAspect: number; slotIndex: number
  } | null>(null)
  const [videoPositionEditor, setVideoPositionEditor] = useState<{
    uri: string; trim: { startTime: number; endTime: number; duration: number }
    width: number; height: number; slotAspect: number; slotIndex: number
  } | null>(null)

  // Photo viewer
  const [viewerVisible, setViewerVisible] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const viewerListRef = useRef<FlatList<Media>>(null)

  // UI
  const [activeTab, setActiveTab] = useState(0)
  const [hoursExpanded, setHoursExpanded] = useState(false)
  const [isSaved, setIsSaved] = useState(true)
  const [visitedAt, setVisitedAt] = useState(todayIso())
  const [visibility] = useState<Visibility>('private')

  const settleTo = useCallback(
    (target: SheetSnapState, vy: number) => {
      animateLayout()
      snapStateRef.current = target
      setSnapState(target)
      Animated.spring(dragY, {
        toValue: snapOffsetsRef.current[target],
        velocity: vy,
        ...SPRING_CONFIG,
      }).start()
    },
    [dragY]
  )

  const closeSheet = useCallback(() => {
    Animated.timing(dragY, {
      toValue: CLOSED_OFFSET,
      duration: 220,
      useNativeDriver: false,
    }).start(() => {
      onCloseRef.current()
    })
  }, [dragY])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.locationY < HANDLE_DRAG_REGION,
        onMoveShouldSetPanResponder: (evt, gestureState) =>
          evt.nativeEvent.locationY < SHEET_DRAG_REGION && Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          dragBase.current = snapOffsetsRef.current[snapStateRef.current]
        },
        onPanResponderMove: (_, gestureState) => {
          dragY.setValue(clampOffset(dragBase.current + gestureState.dy))
        },
        onPanResponderRelease: (_, gestureState) => {
          const offset = clampOffset(dragBase.current + gestureState.dy)
          const target = resolveSnapTarget(offset, gestureState.vy, snapOffsetsRef.current)
          if (target === 'closed') {
            closeSheet()
          } else {
            settleTo(target, gestureState.vy)
          }
        },
      }),
    [dragY, settleTo, closeSheet]
  )

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const d = await withRetry(() => getMemoryDetail(id))
      setDetail(d)
      setVisitedAt(d.memory.visited_at?.slice(0, 10) || todayIso())
      setIsSaved(d.memory.is_saved)
      // 미디어는 로컬 스토어에서 로드 (DB 미사용)
      const lm = await listLocalMedia(id)
      setLocalMediaList(lm)
      const storedLayout = await AsyncStorage.getItem(LAYOUT_STORAGE_PREFIX + id).catch(() => null)
      setLayoutType(isPhotoLayoutType(storedLayout) ? storedLayout : defaultLayoutFor(lm.length))
    } catch (e) {
      Alert.alert(t('place.loadFail'), String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    if (memoryId) {
      setCurrentId(memoryId)
      void load(memoryId)
    } else {
      setCurrentId(null)
      setDetail(null)
      setLocalMediaList([])
      setVisitedAt(todayIso())
      setIsSaved(true)
    }
    setActiveTab(0)
    setHoursExpanded(false)
    setIsEditing(false)
    setViewerVisible(false)
    // 처음 열릴 때는 Medium으로 snap
    snapStateRef.current = 'medium'
    setSnapState('medium')
    dragY.setValue(CLOSED_OFFSET)
    Animated.spring(dragY, { toValue: snapOffsetsRef.current.medium, ...SPRING_CONFIG }).start()
  }, [visible, memoryId, load, dragY])

  const googlePlaceId = searchPlace?.googlePlaceId ?? detail?.place?.google_place_id ?? null

  // 장소 바뀌면 액션 버튼 스크롤을 처음(왼쪽)으로
  useEffect(() => {
    actionScrollRef.current?.scrollTo({ x: 0, animated: false })
  }, [googlePlaceId, visible])

  // 사용자 별점 로드 (로컬, googlePlaceId 기준)
  useEffect(() => {
    if (!googlePlaceId) {
      setUserRating(null)
      return
    }
    let cancelled = false
    AsyncStorage.getItem(RATING_STORAGE_PREFIX + googlePlaceId)
      .then((v) => {
        if (!cancelled) setUserRating(v != null ? Number(v) : null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [googlePlaceId])

  const commitRating = (r: number) => {
    setRatingEditorVisible(false)
    const val = r > 0 ? r : null
    setUserRating(val)
    if (googlePlaceId) {
      if (val != null) void AsyncStorage.setItem(RATING_STORAGE_PREFIX + googlePlaceId, String(val)).catch(() => {})
      else void AsyncStorage.removeItem(RATING_STORAGE_PREFIX + googlePlaceId).catch(() => {})
    }
  }

  useEffect(() => {
    if (!visible || !googlePlaceId) {
      setPlaceDetails(null)
      return
    }
    let cancelled = false
    withRetry(() => fetchPlaceDetails(googlePlaceId))
      .then((d) => {
        if (!cancelled) setPlaceDetails(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visible, googlePlaceId])

  const placeName = detail?.place?.display_name ?? searchPlace?.name ?? t('place.place')
  const placeAddress = detail?.place?.address ?? searchPlace?.address ?? null
  const media = useMemo(() => localMediaList.map(localToMedia), [localMediaList])

  // 모든 미디어가 로컬 file:// — id → uri 매핑
  const [localUris, setLocalUris] = useState<Record<string, string>>({})
  useEffect(() => {
    setLocalUris(Object.fromEntries(localMediaList.map((m) => [m.id, m.uri])))
  }, [localMediaList])

  // 사진 표시용: 로컬 원본 → 서버 썸네일
  const photoUri = (m: Media): string | null => localUris[m.id] ?? thumbUri(m)
  // 영상 재생용: 로컬 원본 → 서버 원본(공유된 것). 없으면 null → 포스터 fallback
  const videoUri = (m: Media): string | null =>
    localUris[m.id] ?? (m.storage_path ? resolveMediaUri(m.storage_path) : null)

  // 저장 목록 (색상 지정 가능)
  const [saveLists, setSaveLists] = useState<SavedList[]>([])
  const [savePickerVisible, setSavePickerVisible] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0])

  // 저장 버튼: 미저장 → 목록 선택 모달, 저장됨 → 해제 confirm
  const handleSave = async () => {
    if (!userId) {
      Alert.alert(t('auth.loginNeeded'), t('place.saveNeedLogin'))
      return
    }
    if (saving) return
    if (currentId && isSaved) {
      Alert.alert(t('place.unsave'), t('place.removeSaved'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            const listId = detail?.memory.saved_list_id ?? null
            try {
              // 로컬 미디어 먼저 정리
              for (const lm of localMediaList) await deleteLocalMedia(currentId, lm.id)
              await deleteVisitMemory(currentId)
              if (listId) await deleteListIfEmpty(listId)
              onDeleted?.(currentId)
              onChanged?.()
              onClose()
            } catch (e) {
              Alert.alert(t('media.deleteFail'), String((e as Error).message))
            } finally {
              setSaving(false)
            }
          },
        },
      ])
      return
    }
    try {
      setSaveLists(await listSavedLists())
    } catch {
      setSaveLists([])
    }
    setSavePickerVisible(true)
  }

  // 목록 선택(또는 목록 없이) → 저장 실행
  const saveToList = async (listId: string | null) => {
    setSavePickerVisible(false)
    setSaving(true)
    try {
      if (currentId) {
        await updateVisitMemoryFields(currentId, { isSaved: true, savedListId: listId })
        await load(currentId)
        onChanged?.()
      } else if (searchPlace) {
        const place = await createOrGetPlace({
          googlePlaceId: searchPlace.googlePlaceId,
          displayName: searchPlace.name,
          address: searchPlace.address,
          latitude: searchPlace.latitude,
          longitude: searchPlace.longitude,
        })
        const memory = await createVisitMemory({
          placeId: place.id,
          visitedAt,
          visibility,
          isSaved: true,
          savedListId: listId,
        })
        setCurrentId(memory.id)
        await load(memory.id)
        onSaved?.(memory.id, searchPlace)
        onChanged?.()
        showInterstitial()
      }
    } catch (e) {
      Alert.alert(t('place.saveFail'), String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  const handleCreateList = async () => {
    const name = newListName.trim()
    if (!name) return
    try {
      const list = await createSavedList(name, newListColor)
      setNewListName('')
      await saveToList(list.id)
    } catch (e) {
      Alert.alert(t('media.listCreateFail'), String((e as Error).message))
    }
  }

  const slotLayoutsRef = useRef<Record<number, { width: number; height: number }>>({})

  // 편집 완료된 미디어를 기기 로컬에 저장 (DB/서버 미사용)
  const savePickedMediaLocal = async (
    uri: string,
    picked: Awaited<ReturnType<typeof pickMedia>>,
    slotIndex: number,
    videoMeta?: {
      startTime: number
      endTime: number
      boxWFrac: number
      boxHFrac: number
      offsetXFrac: number
      offsetYFrac: number
    }
  ): Promise<boolean> => {
    if (!picked || !currentId) return false
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = picked.mediaType === 'video' ? 'mp4' : 'jpg'
    const localUri = await persistLocalFile(id, ext, uri)
    await addLocalMedia({
      id,
      visitId: currentId,
      mediaType: picked.mediaType,
      uri: localUri,
      width: picked.width,
      height: picked.height,
      sortOrder: slotIndex,
      videoStartTime: videoMeta?.startTime ?? null,
      videoEndTime: videoMeta?.endTime ?? null,
      boxWFrac: videoMeta?.boxWFrac ?? null,
      boxHFrac: videoMeta?.boxHFrac ?? null,
      offsetXFrac: videoMeta?.offsetXFrac ?? null,
      offsetYFrac: videoMeta?.offsetYFrac ?? null,
    })
    return true
  }

  // slot 단위 사진 선택→편집→업로드→DB insert. sort_order = slotIndex 로 위치 영속.
  const pickAndUploadToSlot = async (slotIndex: number): Promise<boolean> => {
    if (!userId) {
      Alert.alert(t('auth.loginNeeded'), t('media.addPhotoNeedLogin'))
      return false
    }
    if (!currentId) {
      Alert.alert(t('place.saveNeedSave'), t('media.addPhotoNeedSave'))
      return false
    }
    const picked = await pickMedia()
    if (!picked) return false

    // 0.5초 이하 영상은 너무 짧아 트림 불가
    if (picked.mediaType === 'video' && (picked.durationSeconds ?? 0) <= 0.5) {
      Alert.alert(t('media.videoTooShort'), t('media.videoTooShortMsg'))
      return false
    }

    // 영상: 트림 편집 → 위치 편집 → 업로드
    if (picked.mediaType === 'video') {
      const slotSize = slotLayoutsRef.current[slotIndex]
      const aspect = slotSize && slotSize.height > 0 ? slotSize.width / slotSize.height : 1
      return new Promise<boolean>((resolve) => {
        setVideoTrimEditor({
          uri: picked.uri,
          duration: picked.durationSeconds ?? 10,
          width: picked.width ?? 1080,
          height: picked.height ?? 1920,
          slotAspect: aspect,
          slotIndex,
        })
        pendingPickRef.current = { picked, resolve }
      })
    }

    // 사진: 슬롯 비율 계산 후 편집 모달
    const slotSize = slotLayoutsRef.current[slotIndex]
    const aspect = slotSize && slotSize.height > 0 ? slotSize.width / slotSize.height : 1
    return new Promise<boolean>((resolve) => {
      setCropEditor({
        uri: picked.uri,
        width: picked.width ?? 1000,
        height: picked.height ?? 1000,
        slotAspect: aspect,
        slotIndex,
      })
      pendingPickRef.current = { picked, resolve }
    })
  }

  const pendingPickRef = useRef<{
    picked: Awaited<ReturnType<typeof pickMedia>>
    resolve: (v: boolean) => void
  } | null>(null)

  const showMediaError = (e: unknown) => {
    if (e instanceof VideoTooLongError) {
      Alert.alert(t('media.videoTooLong'), t('media.videoTooLongMsg', { seconds: MAX_VIDEO_SECONDS }))
    } else if ((e as Error).message === 'PERMISSION_DENIED') {
      Alert.alert(t('media.permissionNeeded'), t('media.libraryPermission'))
    } else {
      Alert.alert(t('media.processFail'), String((e as Error).message))
    }
  }

  const handleAddToSlot = async (slotIndex: number) => {
    if (mediaBusy) return
    setMediaBusy(true)
    try {
      const added = await pickAndUploadToSlot(slotIndex)
      if (added && currentId) {
        await load(currentId)
        onChanged?.()
      }
    } catch (e) {
      showMediaError(e)
    } finally {
      setMediaBusy(false)
    }
  }

  const doDeleteMedia = async (m: Media) => {
    try {
      if (currentId) {
        await deleteLocalMedia(currentId, m.id)
        await load(currentId)
      }
      onChanged?.()
    } catch (e) {
      Alert.alert(t('media.deleteFail'), String((e as Error).message))
    }
  }

  const handleReplaceSlot = async (old: Media, slotIndex: number) => {
    if (mediaBusy) return
    setMediaBusy(true)
    try {
      // 새 사진 추가 성공 후에만 기존 사진 삭제 (실패 시 기존 유지).
      // addLocalMedia 가 같은 slotIndex 를 교체하므로 old 가 곧 새 항목이면 삭제 생략
      const added = await pickAndUploadToSlot(slotIndex)
      if (added) {
        if (currentId && old.sort_order !== slotIndex) await deleteLocalMedia(currentId, old.id)
        if (currentId) await load(currentId)
        onChanged?.()
      }
    } catch (e) {
      showMediaError(e)
    } finally {
      setMediaBusy(false)
    }
  }

  const handleFilledSlotPress = (m: Media, slotIndex: number) => {
    Alert.alert(t('media.photos'), t('media.photoOptions'), [
      { text: t('common.replace'), onPress: () => void handleReplaceSlot(m, slotIndex) },
      { text: t('common.delete'), style: 'destructive', onPress: () => void doDeleteMedia(m) },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  const handleDeleteMedia = (m: Media) => {
    Alert.alert(t('media.deletePhoto'), t('media.deletePhotoConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void doDeleteMedia(m) },
    ])
  }

  const selectLayout = (t: PhotoLayoutType) => {
    animateLayout()
    setLayoutType(t)
    setLayoutPickerVisible(false)
    if (currentId) {
      void AsyncStorage.setItem(LAYOUT_STORAGE_PREFIX + currentId, t).catch(() => {})
    }
  }

  // 수정완료: 최소 100ms 스피너 + 최신 데이터 재로드 후 수정 모드 종료 (part7 명세)
  const handleEditToggle = async () => {
    if (!isEditing) {
      if (!currentId) {
        Alert.alert(t('place.saveNeedSave'), t('media.addPhotoNeedSave'))
        return
      }
      animateLayout()
      setIsEditing(true)
      return
    }
    setEditLoading(true)
    const started = Date.now()
    try {
      if (currentId) await load(currentId)
    } finally {
      const remain = 100 - (Date.now() - started)
      if (remain > 0) await new Promise((r) => setTimeout(r, remain))
      animateLayout()
      setIsEditing(false)
      setEditLoading(false)
      showInterstitial()
    }
  }

  const handleCall = () => {
    const phone = placeDetails?.internationalPhoneNumber
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => {})
    } else {
      Alert.alert(t('place.call'), t('place.noPhone'))
    }
  }

  const handleUnsupported = (featureName: string) => {
    Alert.alert(featureName, t('common.unsupported'))
  }

  const openViewer = (index: number) => {
    setViewerIndex(index)
    setViewerVisible(true)
  }

  const viewerGoTo = (index: number) => {
    if (index < 0 || index >= media.length) return
    viewerListRef.current?.scrollToIndex({ index, animated: true })
    setViewerIndex(index)
  }

  const renderStars = (rating: number) => {
    const filled = Math.round(rating)
    return (
      <View style={styles.starsRow}>
        {[...Array(5)].map((_, i) => (
          <Image
            key={i}
            source={
              i < filled
                ? require('../../assets/icons/star-filled.png')
                : require('../../assets/icons/star-empty.png')
            }
            style={styles.starIcon}
          />
        ))}
      </View>
    )
  }

  // slot index → 해당 sort_order 의 media
  const slotMedia = (slotIndex: number): Media | null =>
    media.find((m) => m.sort_order === slotIndex) ?? null

  // slot 내용물: 영상이면 인라인 자동재생, 사진이면 이미지.
  // 영상 재생 소스 없으면 (로컬 소실 + 미공유) 포스터 썸네일로 fallback
  const renderSlotContent = (m: Media) => {
    if (m.media_type === 'video') {
      const v = localUris[m.id] ?? null  // localUris 완전 로드 후에만 사용
      if (v) {
        return (
          <View style={styles.videoFill} pointerEvents="none">
            <SlotVideo key={v} uri={v} meta={{ startTime: m.video_start_time, endTime: m.video_end_time, boxWFrac: m.video_box_w_frac, boxHFrac: m.video_box_h_frac, offsetXFrac: m.video_offset_x_frac, offsetYFrac: m.video_offset_y_frac }} />
          </View>
        )
      }
      // 로컬 없으면 썸네일 poster
      const poster = thumbUri(m)
      return poster ? <RetryImage uri={poster} style={styles.photoImage} /> : null
    }
    const uri = photoUri(m)
    return uri ? <RetryImage uri={uri} style={styles.photoImage} /> : null
  }

  const renderSlot = (slotIndex: number, style: object, editing: boolean) => {
    const m = slotMedia(slotIndex)

    if (!editing) {
      if (!m) {
        // 보기 모드 빈 slot: 레이아웃 형태 유지용 muted box (버튼 아님)
        return <View key={slotIndex} style={[style, styles.slotEmptyView]} />
      }
      const mediaIndex = media.findIndex((x) => x.id === m.id)
      return (
        <Pressable key={slotIndex} style={style} onPress={() => openViewer(Math.max(0, mediaIndex))}>
          {renderSlotContent(m)}
        </Pressable>
      )
    }

    if (!m) {
      return (
        <Pressable
          key={slotIndex}
          style={[style, styles.slotEmptyEdit]}
          onPress={() => handleAddToSlot(slotIndex)}
          onLayout={(e) => { slotLayoutsRef.current[slotIndex] = e.nativeEvent.layout }}
          disabled={mediaBusy}
        >
          {mediaBusy ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <Image source={require('../../assets/icons/camera.png')} style={styles.editAddIconImg} />
              <Text style={styles.editAddLabel}>{t('media.addPhoto')}</Text>
            </>
          )}
        </Pressable>
      )
    }

    return (
      <Pressable
        key={slotIndex}
        style={style}
        onPress={() => handleFilledSlotPress(m, slotIndex)}
        disabled={mediaBusy}
      >
        {renderSlotContent(m)}
        <Pressable style={styles.editDeleteBtn} onPress={() => handleDeleteMedia(m)} disabled={mediaBusy}>
          <Text style={styles.editDeleteText}>✕</Text>
        </Pressable>
      </Pressable>
    )
  }

  const renderLayoutGrid = (editing: boolean) => {
    const cell = (i: number, style: object) => renderSlot(i, style, editing)
    switch (layoutType) {
      case 'single':
        return <View style={styles.gridSingle}>{cell(0, styles.gridFill)}</View>
      case 'twoVertical':
        return (
          <View style={styles.gridTwoVertical}>
            {cell(0, styles.gridFill)}
            {cell(1, styles.gridFill)}
          </View>
        )
      case 'twoHorizontal':
        return (
          <View style={styles.gridStack}>
            {cell(0, styles.gridRowH190)}
            {cell(1, styles.gridRowH190)}
          </View>
        )
      case 'threeLeftHero':
        return (
          <View style={styles.gridThreeSide}>
            {cell(0, styles.gridHeroCol)}
            <View style={styles.gridSideCol}>
              {cell(1, styles.gridFill)}
              {cell(2, styles.gridFill)}
            </View>
          </View>
        )
      case 'threeRightHero':
        return (
          <View style={styles.gridThreeSide}>
            <View style={styles.gridSideCol}>
              {cell(1, styles.gridFill)}
              {cell(2, styles.gridFill)}
            </View>
            {cell(0, styles.gridHeroCol)}
          </View>
        )
      case 'threeTopHero':
        return (
          <View style={styles.gridStack}>
            {cell(0, styles.gridRowH210)}
            <View style={styles.gridRowPair150}>
              {cell(1, styles.gridFill)}
              {cell(2, styles.gridFill)}
            </View>
          </View>
        )
      case 'threeBottomHero':
        return (
          <View style={styles.gridStack}>
            <View style={styles.gridRowPair160}>
              {cell(1, styles.gridFill)}
              {cell(2, styles.gridFill)}
            </View>
            {cell(0, styles.gridRowH210)}
          </View>
        )
    }
  }

  const renderViewPhotos = () => {
    if (media.length === 0) {
      // 보기 모드 placeholder (part5 명세 — 편집 버튼 아님, 안내만)
      return (
        <View style={styles.photoEmpty}>
          <Image source={require('../../assets/icons/camera.png')} style={styles.photoEmptyIconImg} />
          <Text style={styles.photoEmptyTitle}>{t('media.noPhotosTitle')}</Text>
          <Text style={styles.photoEmptySub}>{t('media.noPhotosSub')}</Text>
        </View>
      )
    }
    return <View style={styles.photoSection}>{renderLayoutGrid(false)}</View>
  }

  const renderEditPhotos = () => (
    <View style={styles.photoSection}>
      <Pressable style={styles.layoutSelectBtn} onPress={() => setLayoutPickerVisible(true)}>
        <Text style={styles.layoutSelectText}>{t('place.layoutSelect')}</Text>
      </Pressable>
      {renderLayoutGrid(true)}
    </View>
  )

  const openNow = placeDetails?.regularOpeningHours?.openNow

  // Collapsed: 헤더 + 액션 버튼만. 사진/탭바/영업시간/수정 버튼 숨김 (part2/7 명세)
  const showBody = snapState !== 'collapsed'

  const handleVideoTrimConfirm = (trim: { startTime: number; endTime: number; duration: number }) => {
    if (!videoTrimEditor) return
    const { uri, width, height, slotAspect, slotIndex } = videoTrimEditor
    setVideoTrimEditor(null)
    setVideoPositionEditor({ uri, trim, width, height, slotAspect, slotIndex })
  }

  const handleVideoTrimCancel = () => {
    const pending = pendingPickRef.current
    setVideoTrimEditor(null)
    pendingPickRef.current = null
    pending?.resolve(false)
  }

  const handleVideoPositionConfirm = async (pos: PositionResult) => {
    const pending = pendingPickRef.current
    const editor = videoPositionEditor
    setVideoPositionEditor(null)
    pendingPickRef.current = null
    if (!pending || !editor) return
    try {
      setMediaBusy(true)
      const trimmedPicked = pending.picked
        ? { ...pending.picked, durationSeconds: editor.trim.duration }
        : pending.picked
      const ok = await savePickedMediaLocal(editor.uri, trimmedPicked, editor.slotIndex, {
        startTime: editor.trim.startTime,
        endTime: editor.trim.endTime,
        boxWFrac: pos.boxWFrac,
        boxHFrac: pos.boxHFrac,
        offsetXFrac: pos.offsetXFrac,
        offsetYFrac: pos.offsetYFrac,
      })
      if (ok && currentId) {
        await load(currentId)
        onChanged?.()
      }
      pending.resolve(ok)
    } catch (e) {
      showMediaError(e)
      pending.resolve(false)
    } finally {
      setMediaBusy(false)
    }
  }

  const handleVideoPositionCancel = () => {
    const pending = pendingPickRef.current
    setVideoPositionEditor(null)
    pendingPickRef.current = null
    pending?.resolve(false)
  }

  const handleCropConfirm = async (croppedUri: string) => {
    const pending = pendingPickRef.current
    setCropEditor(null)
    pendingPickRef.current = null
    if (!pending) return
    try {
      setMediaBusy(true)
      const ok = await savePickedMediaLocal(croppedUri, pending.picked, cropEditor?.slotIndex ?? 0)
      if (ok && currentId) {
        await load(currentId)
        onChanged?.()
      }
      pending.resolve(ok)
    } catch (e) {
      showMediaError(e)
      pending.resolve(false)
    } finally {
      setMediaBusy(false)
    }
  }

  const handleCropCancel = () => {
    const pending = pendingPickRef.current
    setCropEditor(null)
    pendingPickRef.current = null
    pending?.resolve(false)
  }

  return (
    <>
    {videoTrimEditor && (
      <VideoTrimEditor
        uri={videoTrimEditor.uri}
        videoDuration={videoTrimEditor.duration}
        onConfirm={handleVideoTrimConfirm}
        onCancel={handleVideoTrimCancel}
      />
    )}
    {videoPositionEditor && (
      <VideoPositionEditor
        uri={videoPositionEditor.uri}
        trim={videoPositionEditor.trim}
        videoWidth={videoPositionEditor.width}
        videoHeight={videoPositionEditor.height}
        slotAspect={videoPositionEditor.slotAspect}
        onConfirm={(r) => void handleVideoPositionConfirm(r)}
        onCancel={handleVideoPositionCancel}
      />
    )}
    {cropEditor && (
      <PhotoCropEditor
        uri={cropEditor.uri}
        imageWidth={cropEditor.width}
        imageHeight={cropEditor.height}
        slotAspect={cropEditor.slotAspect}
        onConfirm={(uri) => void handleCropConfirm(uri)}
        onCancel={handleCropCancel}
      />
    )}
    {ratingEditorVisible && (
      <RatingEditor
        initial={userRating ?? 0}
        onConfirm={commitRating}
        onCancel={() => setRatingEditorVisible(false)}
      />
    )}
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* 지도가 계속 보여야 하므로 어두운 overlay 없이 투명 영역만 둠 */}
      <Pressable style={styles.backdrop} onPress={() => closeSheet()} />
      <Animated.View
        style={[
          styles.sheet,
          {
            height: dragY.interpolate({
              inputRange: [0, CLOSED_OFFSET],
              outputRange: [EXPANDED_HEIGHT, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.dragHandleContainer}>
          <View style={styles.dragHandle} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {/* Collapsed 높이 측정 대상: 헤더 + 액션 버튼 */}
              <View onLayout={handleCollapsedContentLayout}>
              {/* Header */}
              <View style={styles.headerContainer}>
                <View style={styles.headerLeft}>
                  <Text
                    style={[styles.placeName, snapState === 'collapsed' && styles.placeNameCollapsed]}
                    numberOfLines={2}
                  >
                    {placeName}
                  </Text>
                  {placeAddress ? (
                    <Text style={styles.subtitle} numberOfLines={2}>
                      {placeAddress}
                    </Text>
                  ) : null}

                  <Pressable style={styles.ratingRow} onPress={() => setRatingEditorVisible(true)}>
                    {userRating != null ? (
                      <>
                        <Text style={styles.ratingNumber}>{userRating.toFixed(1)}</Text>
                        <Stars value={userRating} size={15} />
                        <Text style={styles.reviewCount}>{t('rating.myRating')}</Text>
                      </>
                    ) : placeDetails?.rating != null ? (
                      <>
                        <Text style={styles.ratingNumber}>{placeDetails.rating.toFixed(1)}</Text>
                        <Stars value={placeDetails.rating} size={15} />
                        {placeDetails.userRatingCount != null && (
                          <Text style={styles.reviewCount}>
                            ({placeDetails.userRatingCount.toLocaleString()})
                          </Text>
                        )}
                      </>
                    ) : (
                      <>
                        <Stars value={0} size={15} />
                        <Text style={styles.reviewCount}>{t('rating.rateThis')}</Text>
                      </>
                    )}
                  </Pressable>

                  {placeDetails?.primaryTypeDisplayName?.text ? (
                    <Text style={styles.category}>{placeDetails.primaryTypeDisplayName.text}</Text>
                  ) : null}

                  {openNow != null && (
                    <Text style={[styles.statusText, openNow ? styles.statusOpen : styles.statusClosed]}>
                      {openNow ? t('place.openNow') : t('place.closedNow')}
                    </Text>
                  )}
                </View>

                <View style={styles.headerIconsContainer}>
                  <Pressable
                    style={[styles.headerIconBtn, isSaved && currentId != null && styles.headerIconBtnActive]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    <Image
                      source={
                        isSaved && currentId != null
                          ? require('../../assets/icons/bookmark-check.png')
                          : require('../../assets/icons/bookmark.png')
                      }
                      style={[styles.headerIcon, isSaved && currentId != null && styles.headerIconActive]}
                    />
                  </Pressable>
                  <Pressable style={styles.headerIconBtn} onPress={() => handleUnsupported(t('place.share'))}>
                    <Image source={require('../../assets/icons/share.png')} style={styles.headerIcon} />
                  </Pressable>
                  <Pressable style={styles.headerIconBtn} onPress={() => closeSheet()}>
                    <Image source={require('../../assets/icons/close.png')} style={styles.headerIcon} />
                  </Pressable>
                </View>
              </View>

              {/* Action buttons */}
              <ScrollView
                ref={actionScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.actionButtonsScroll}
                contentContainerStyle={styles.actionButtonsContainer}
              >
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                  onPress={() => handleUnsupported(t('place.route'))}
                >
                  <Image source={require('../../assets/icons/direction.png')} style={styles.actionIcon} />
                  <Text style={styles.actionBtnTextPrimary}>{t('place.route')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={() => handleUnsupported(t('common.start'))}
                >
                  <Image source={require('../../assets/icons/navigate.png')} style={styles.actionIcon} />
                  <Text style={styles.actionBtnText}>{t('common.start')}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleCall}>
                  <Image source={require('../../assets/icons/phone.png')} style={styles.actionIcon} />
                  <Text style={styles.actionBtnText}>{t('place.call')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Image
                    source={
                      isSaved && currentId != null
                        ? require('../../assets/icons/bookmark-check.png')
                        : require('../../assets/icons/bookmark.png')
                    }
                    style={styles.actionIcon}
                  />
                  <Text style={styles.actionBtnText}>
                    {isSaved && currentId != null ? t('place.saved') : t('place.save')}
                  </Text>
                </Pressable>
              </ScrollView>
              </View>

              {/* Collapsed에서는 여기 아래 전부 숨김 */}
              {showBody && (
                <>
                  {/* Photo section: saved memory만 사진 표시 */}
                  {currentId != null &&
                    detail != null &&
                    (isEditing ? renderEditPhotos() : renderViewPhotos())}

                  {/* Tab bar */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabBarScroll}
                    contentContainerStyle={styles.tabBarContainer}
                  >
                    {TABS.map((tab, idx) => (
                      <Pressable key={tab} style={styles.tabItem} onPress={() => setActiveTab(idx)}>
                        <Text style={[styles.tabText, activeTab === idx && styles.tabTextActive]}>
                          {tab}
                        </Text>
                        {activeTab === idx && (
                          <View style={styles.tabUnderline} pointerEvents="none" />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>

                  {/* Hours card — 데이터 없으면 카드 자체 숨김 (part7 명세) */}
                  {(placeDetails?.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0 && (
                    <View style={styles.hoursCard}>
                      <Pressable
                        style={styles.hoursHeader}
                        onPress={() => {
                          animateLayout()
                          setHoursExpanded(!hoursExpanded)
                        }}
                      >
                        <Image source={require('../../assets/icons/clock.png')} style={styles.infoIcon} />
                        <Text style={styles.infoLabel}>{t('place.hours')}</Text>
                        <Image
                          source={
                            hoursExpanded
                              ? require('../../assets/icons/chevron-up.png')
                              : require('../../assets/icons/chevron-down.png')
                          }
                          style={styles.infoChevronIcon}
                        />
                      </Pressable>
                      {hoursExpanded && (
                        <View style={styles.hoursBody}>
                          {placeDetails!.regularOpeningHours!.weekdayDescriptions!.map((line) => (
                            <Text key={line} style={styles.hoursText}>
                              {line}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              <View style={styles.scrollBottomSpace} />
            </ScrollView>

            {/* Edit / 수정완료 — Medium/Expanded 하단 상시, Collapsed에서만 숨김 */}
            {showBody && (
              <View style={styles.editButtonContainer}>
                <Pressable
                  style={[styles.editButton, isEditing && styles.editButtonActive]}
                  onPress={() => void handleEditToggle()}
                  disabled={editLoading}
                >
                  {editLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={[styles.editButtonText, isEditing && styles.editButtonTextActive]}>
                      {isEditing ? t('common.done') : t('common.edit')}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </>
        )}
      </Animated.View>

      {/* Layout picker */}
      <Modal
        visible={layoutPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLayoutPickerVisible(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setLayoutPickerVisible(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{t('place.layoutSelect')}</Text>
            <View style={styles.pickerGrid}>
              {LAYOUT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.type}
                  style={[styles.pickerOption, layoutType === opt.type && styles.pickerOptionActive]}
                  onPress={() => selectLayout(opt.type)}
                >
                  <LayoutPreviewThumb type={opt.type} />
                  <Text
                    style={[
                      styles.pickerOptionLabel,
                      layoutType === opt.type && styles.pickerOptionLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 저장 목록 선택 */}
      <Modal
        visible={savePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSavePickerVisible(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setSavePickerVisible(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{t('place.selectList')}</Text>

            <Pressable style={styles.listRow} onPress={() => void saveToList(null)}>
              <View style={[styles.listDot, styles.listDotNone]} />
              <Text style={styles.listRowText}>{t('place.saveNoList')}</Text>
            </Pressable>

            {saveLists.map((list) => (
              <Pressable key={list.id} style={styles.listRow} onPress={() => void saveToList(list.id)}>
                <View style={[styles.listDot, { backgroundColor: list.color }]} />
                <Text style={styles.listRowText}>{list.name}</Text>
              </Pressable>
            ))}

            <View style={styles.listCreateDivider} />
            <Text style={styles.listCreateLabel}>{t('place.createNewList')}</Text>
            <TextInput
              style={styles.listNameInput}
              placeholder={t('media.listNamePlaceholder')}
              placeholderTextColor="#9AA0A6"
              value={newListName}
              onChangeText={setNewListName}
              maxLength={30}
            />
            <View style={styles.colorRow}>
              {LIST_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    newListColor === c && styles.colorSwatchActive,
                  ]}
                  onPress={() => setNewListColor(c)}
                />
              ))}
            </View>
            <Pressable
              style={[styles.listCreateBtn, !newListName.trim() && styles.listCreateBtnDisabled]}
              onPress={() => void handleCreateList()}
              disabled={!newListName.trim()}
            >
              <Text style={styles.listCreateBtnText}>{t('place.createAndSave')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen photo viewer */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerContainer}>
          <View style={styles.viewerTopBar}>
            <Pressable style={styles.viewerCloseBtn} onPress={() => setViewerVisible(false)}>
              <Text style={styles.viewerCloseText}>✕</Text>
            </Pressable>
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1} / {media.length}
            </Text>
          </View>

          <FlatList
            ref={viewerListRef}
            data={media}
            extraData={viewerIndex}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(m) => m.id}
            initialScrollIndex={viewerIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                viewerListRef.current?.scrollToIndex({ index, animated: false })
              }, 100)
            }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
              setViewerIndex(Math.max(0, Math.min(media.length - 1, idx)))
            }}
            renderItem={({ item, index }) => {
              if (item.media_type === 'video') {
                const v = videoUri(item)
                const poster = photoUri(item)
                return (
                  <View style={styles.viewerPage}>
                    {v ? (
                      <ViewerVideo uri={v} active={index === viewerIndex} meta={{ startTime: item.video_start_time, endTime: item.video_end_time }} />
                    ) : poster ? (
                      <RetryImage uri={poster} style={styles.viewerImage} />
                    ) : null}
                  </View>
                )
              }
              const uri = localUris[item.id] ?? fullUri(item)
              return (
                <View style={styles.viewerPage}>
                  {uri ? (
                    <RetryImage uri={uri} style={styles.viewerImage} />
                  ) : null}
                </View>
              )
            }}
          />

          {/* 좌우 화살표 — 사진 영역 좌우 가장자리 중앙 overlay */}
          <Pressable
            style={[
              styles.viewerArrowBtn,
              styles.viewerArrowLeft,
              viewerIndex <= 0 && styles.viewerArrowDisabled,
            ]}
            onPress={() => viewerGoTo(viewerIndex - 1)}
            disabled={viewerIndex <= 0}
          >
            <Text style={styles.viewerArrowText}>‹</Text>
          </Pressable>
          <Pressable
            style={[
              styles.viewerArrowBtn,
              styles.viewerArrowRight,
              viewerIndex >= media.length - 1 && styles.viewerArrowDisabled,
            ]}
            onPress={() => viewerGoTo(viewerIndex + 1)}
            disabled={viewerIndex >= media.length - 1}
          >
            <Text style={styles.viewerArrowText}>›</Text>
          </Pressable>
        </View>
      </Modal>
    </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 14,
    overflow: 'hidden',
  },
  dragHandleContainer: {
    alignItems: 'center',
  },
  dragHandle: {
    width: 54,
    height: 5,
    backgroundColor: '#C8C8C8',
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollBottomSpace: {
    height: 20,
  },

  // HEADER
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.medium,
    paddingHorizontal: SPACING.horizontal,
    paddingTop: 2,
    paddingBottom: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  placeName: {
    fontSize: HEADER.titleSizeExpanded,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: -0.4,
    lineHeight: HEADER.lineHeightTitle,
  },
  placeNameCollapsed: {
    fontSize: HEADER.titleSizeCollapsed,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: HEADER.subtitleSize,
    color: COLORS.textGray,
    lineHeight: HEADER.lineHeightSubtitle,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  ratingNumber: {
    fontSize: HEADER.metaSize,
    color: COLORS.textGray,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 1,
  },
  starIcon: {
    width: 15,
    height: 15,
    resizeMode: 'contain',
  },
  reviewCount: {
    fontSize: HEADER.metaSize,
    color: COLORS.textGray,
  },
  category: {
    fontSize: HEADER.metaSize,
    color: COLORS.textGray,
    marginTop: 4,
  },
  statusText: {
    fontSize: HEADER.metaSize,
    fontWeight: '500',
    marginTop: 4,
  },
  statusOpen: {
    color: COLORS.open,
  },
  statusClosed: {
    color: COLORS.closed,
  },

  // HEADER ICON BUTTONS — 가로 배치 (저장이 앞)
  headerIconsContainer: {
    flexDirection: 'row',
    gap: SPACING.small,
  },
  headerIconBtn: {
    width: ICON_BUTTON.size,
    height: ICON_BUTTON.size,
    borderRadius: ICON_BUTTON.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3F3',
  },
  headerIconBtnActive: {
    backgroundColor: COLORS.primary,
  },
  headerIcon: {
    width: 17,
    height: 17,
    resizeMode: 'contain',
  },
  headerIconActive: {
    tintColor: COLORS.white,
  },

  // ACTION BUTTONS
  actionButtonsScroll: {
    flexGrow: 0,
  },
  actionButtonsContainer: {
    paddingLeft: SPACING.medium,
    paddingRight: SPACING.horizontal,
    paddingVertical: SPACING.medium,
    gap: ACTION_BUTTON.gap,
    alignItems: 'center',
  },
  actionBtn: {
    height: ACTION_BUTTON.height,
    borderRadius: ACTION_BUTTON.borderRadius,
    paddingHorizontal: ACTION_BUTTON.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  actionBtnSecondary: {
    backgroundColor: COLORS.primaryLight,
  },
  actionBtnTextPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryDark,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  actionIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },

  // PHOTO SECTION — 그리드는 화면 전체 너비 (Google Maps 스타일 edge-to-edge)
  photoSection: {
    marginBottom: SPACING.medium,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  videoFill: {
    width: '100%',
    height: '100%',
  },
  viewerVideo: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  photoEmpty: {
    height: 220,
    backgroundColor: COLORS.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: SPACING.medium,
  },
  photoEmptyIconImg: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
    marginBottom: 2,
  },
  photoEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textLightGray,
  },
  photoEmptySub: {
    fontSize: 13,
    color: '#9AA0A6',
  },

  // 7종 레이아웃 그리드
  gridFill: {
    flex: 1,
  },
  gridSingle: {
    height: 300,
  },
  gridTwoVertical: {
    height: 260,
    flexDirection: 'row',
    gap: 3,
  },
  gridStack: {
    gap: 3,
  },
  gridRowH190: {
    height: 190,
  },
  gridRowH210: {
    height: 210,
  },
  gridRowPair150: {
    height: 150,
    flexDirection: 'row',
    gap: 3,
  },
  gridRowPair160: {
    height: 160,
    flexDirection: 'row',
    gap: 3,
  },
  gridThreeSide: {
    height: 360,
    flexDirection: 'row',
    gap: 3,
  },
  gridHeroCol: {
    flex: 62,
  },
  gridSideCol: {
    flex: 38,
    gap: 3,
  },

  // slot 상태
  slotEmptyView: {
    backgroundColor: COLORS.bgMuted,
  },
  slotEmptyEdit: {
    borderWidth: 1.5,
    borderColor: '#C7C7CC',
    borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  editDeleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.closed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDeleteText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  editAddIconImg: {
    width: 26,
    height: 26,
    resizeMode: 'contain',
  },
  editAddLabel: {
    fontSize: 12,
    color: '#9AA0A6',
    fontWeight: '500',
  },

  // 레이아웃 선택 버튼 + 모달
  layoutSelectBtn: {
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.bgMuted,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.horizontal,
    marginBottom: SPACING.small,
  },
  layoutSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textGray,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: {
    width: '86%',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 16,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pickerOption: {
    width: '30%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickerOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  pickerOptionLabel: {
    fontSize: 12,
    color: COLORS.textGray,
    fontWeight: '500',
  },
  pickerOptionLabelActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  pvFrame: {
    width: 64,
    height: 48,
    gap: 2,
  },
  pvRow: {
    flexDirection: 'row',
  },
  pvRowInner: {
    flex: 1,
    flexDirection: 'row',
    gap: 2,
  },
  pvCol: {
    flex: 1,
    gap: 2,
  },
  pvBlock: {
    flex: 1,
    backgroundColor: '#C9CDD2',
    borderRadius: 2,
  },
  pvHero: {
    flex: 1.6,
  },

  // 저장 목록 선택 모달
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  listDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  listDotNone: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: '#C7C7CC',
  },
  listRowText: {
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  listCreateDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  listCreateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textGray,
    marginBottom: 8,
  },
  listNameInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.textDark,
    marginBottom: 12,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: COLORS.textDark,
  },
  listCreateBtn: {
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCreateBtnDisabled: {
    opacity: 0.4,
  },
  listCreateBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },

  // TAB BAR
  tabBarScroll: {
    marginTop: 4,
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBarContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.small,
  },
  tabItem: {
    height: 58,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3C4043',
    letterSpacing: -0.2,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  // tabItem(column)의 alignItems:center 가 absolute 자식의 가로 위치를 중앙으로 잡아줌
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    width: 36,
    height: 4,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: COLORS.primary,
  },

  // HOURS CARD
  hoursCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginHorizontal: SPACING.horizontal,
    marginTop: SPACING.section,
  },
  hoursHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  infoLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  infoIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  infoChevronIcon: {
    width: 17,
    height: 17,
    resizeMode: 'contain',
  },
  hoursBody: {
    marginTop: 12,
    gap: 4,
  },
  hoursText: {
    fontSize: 14,
    color: COLORS.textGray,
    lineHeight: 21,
  },

  // EDIT BUTTON
  editButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  editButton: {
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonActive: {
    backgroundColor: COLORS.primary,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  editButtonTextActive: {
    color: COLORS.white,
  },

  // FULLSCREEN VIEWER
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  viewerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  viewerCloseText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '600',
  },
  viewerCounter: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  viewerPage: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  viewerArrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerArrowLeft: {
    left: 16,
  },
  viewerArrowRight: {
    right: 16,
  },
  viewerArrowDisabled: {
    opacity: 0.3,
  },
  viewerArrowText: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 30,
  },
})
