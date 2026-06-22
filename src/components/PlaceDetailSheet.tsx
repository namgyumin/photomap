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
  cacheVideoLocally,
  localVideoUri,
  MAX_VIDEO_SECONDS,
  pickMedia,
  resolveLocalAssetUri,
  resolveMediaUri,
  uploadMedia,
  VideoTooLongError,
} from '../lib/media'
import {
  addMediaToVisit,
  createOrGetPlace,
  createSavedList,
  createVisitMemory,
  deleteListIfEmpty,
  deleteMedia,
  deleteVisitMemory,
  getMemoryDetail,
  listSavedLists,
  updateVisitMemoryFields,
} from '../services/memories'
import type { Media, MemoryDetail, SavedList, Visibility } from '../types/database'
import { PhotoCropEditor } from './PhotoCropEditor'
import { VideoTrimEditor } from './VideoTrimEditor'
import { VideoPositionEditor } from './VideoPositionEditor'

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

const UNSUPPORTED_MSG = '이 기능은 지원하지 않아요'

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

// 그리드 slot 인라인 영상 — 렌더 즉시 muted 자동재생 + loop
function SlotVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })
  return (
    <VideoView player={player} style={styles.videoFill} nativeControls={false} contentFit="cover" />
  )
}

// 전체화면 뷰어 영상 — 현재 페이지일 때만 재생 (스와이프 시 이웃 영상 소리 겹침 방지)
function ViewerVideo({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
  })
  useEffect(() => {
    if (active) {
      player.play()
    } else {
      player.pause()
    }
  }, [active, player])
  return <VideoView player={player} style={styles.viewerVideo} contentFit="contain" />
}

const TABS = ['개요', '메뉴', '리뷰', '사진', '업데이트', '정보'] as const

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

const LAYOUT_OPTIONS: Array<{ type: PhotoLayoutType; label: string }> = [
  { type: 'single', label: '1장 전체' },
  { type: 'twoVertical', label: '2장 좌우' },
  { type: 'twoHorizontal', label: '2장 위아래' },
  { type: 'threeLeftHero', label: '왼쪽 대표' },
  { type: 'threeRightHero', label: '오른쪽 대표' },
  { type: 'threeTopHero', label: '상단 대표' },
  { type: 'threeBottomHero', label: '하단 대표' },
]

const LAYOUT_STORAGE_PREFIX = 'photomap:placeSheetLayout:'

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
      const d = await getMemoryDetail(id)
      setDetail(d)
      setVisitedAt(d.memory.visited_at?.slice(0, 10) || todayIso())
      setIsSaved(d.memory.is_saved)
      const storedLayout = await AsyncStorage.getItem(LAYOUT_STORAGE_PREFIX + id).catch(() => null)
      setLayoutType(isPhotoLayoutType(storedLayout) ? storedLayout : defaultLayoutFor(d.media.length))
    } catch (e) {
      Alert.alert('불러오기 실패', String((e as Error).message))
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

  useEffect(() => {
    if (!visible || !googlePlaceId) {
      setPlaceDetails(null)
      return
    }
    let cancelled = false
    fetchPlaceDetails(googlePlaceId)
      .then((d) => {
        if (!cancelled) setPlaceDetails(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visible, googlePlaceId])

  const placeName = detail?.place?.display_name ?? searchPlace?.name ?? '장소'
  const placeAddress = detail?.place?.address ?? searchPlace?.address ?? null
  const media = detail?.media ?? []

  // 하이브리드 렌더 우선순위: 기기 원본(local) → 서버 썸네일/원본
  // 영상은 앱 문서 폴더 캐시(file://, 재생 보장) 우선 — ph:// 는 expo-video 재생 불가
  const [localUris, setLocalUris] = useState<Record<string, string>>({})
  useEffect(() => {
    const mediaList = detail?.media ?? []
    if (!mediaList.length) {
      setLocalUris({})
      return
    }
    let cancelled = false
    ;(async () => {
      const entries: Array<[string, string]> = []
      for (const m of mediaList) {
        let uri: string | null = null
        if (m.media_type === 'video') {
          uri = await localVideoUri(m.id)
        } else if (m.local_asset_id) {
          uri = await resolveLocalAssetUri(m.local_asset_id)
        }
        if (uri) entries.push([m.id, uri])
      }
      if (!cancelled) setLocalUris(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [detail])

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
      Alert.alert('로그인 필요', '저장하려면\n먼저 로그인해야 해요.')
      return
    }
    if (saving) return
    if (currentId && isSaved) {
      Alert.alert('저장 해제', '저장 목록에서 제거할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '제거',
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            const listId = detail?.memory.saved_list_id ?? null
            try {
              await deleteVisitMemory(currentId)
              if (listId) await deleteListIfEmpty(listId)
              onDeleted?.(currentId)
              onChanged?.()
              onClose()
            } catch (e) {
              Alert.alert('삭제 실패', String((e as Error).message))
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
      Alert.alert('저장 실패', String((e as Error).message))
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
      Alert.alert('목록 생성 실패', String((e as Error).message))
    }
  }

  const slotLayoutsRef = useRef<Record<number, { width: number; height: number }>>({})

  const uploadPickedPhoto = async (
    uri: string,
    picked: Awaited<ReturnType<typeof pickMedia>>,
    slotIndex: number
  ): Promise<boolean> => {
    if (!picked || !userId || !currentId) return false
    const uploaded = await uploadMedia(userId, currentId, uri, picked.mediaType)
    const created = await addMediaToVisit({
      visitId: currentId,
      storagePath: uploaded.storagePath,
      localAssetId: picked.assetId,
      mediaType: picked.mediaType,
      durationSeconds: picked.durationSeconds,
      thumbnail128: uploaded.thumbnail128,
      thumbnail512: uploaded.thumbnail512,
      width: picked.width,
      height: picked.height,
      capturedAt: picked.capturedAt,
      latitude: picked.latitude,
      longitude: picked.longitude,
      sortOrder: slotIndex,
    })
    if (picked.mediaType === 'video') {
      await cacheVideoLocally(created.id, picked.uri).catch(() => {})
    }
    return true
  }

  // slot 단위 사진 선택→편집→업로드→DB insert. sort_order = slotIndex 로 위치 영속.
  const pickAndUploadToSlot = async (slotIndex: number): Promise<boolean> => {
    if (!userId) {
      Alert.alert('로그인 필요', '사진/영상을 추가하려면\n먼저 로그인해주세요.')
      return false
    }
    if (!currentId) {
      Alert.alert('저장 필요', '사진을 추가하려면\n먼저 장소를 저장해주세요.')
      return false
    }
    const picked = await pickMedia()
    if (!picked) return false

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
      Alert.alert('영상이 너무 길어요', `${MAX_VIDEO_SECONDS}초 이하 영상만 추가할 수 있어요.`)
    } else if ((e as Error).message === 'PERMISSION_DENIED') {
      Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요해요.')
    } else {
      Alert.alert('사진 처리 실패', String((e as Error).message))
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
      await deleteMedia(m)
      if (currentId) await load(currentId)
      onChanged?.()
    } catch (e) {
      Alert.alert('삭제 실패', String((e as Error).message))
    }
  }

  const handleReplaceSlot = async (old: Media, slotIndex: number) => {
    if (mediaBusy) return
    setMediaBusy(true)
    try {
      // 새 사진 업로드 성공 후에만 기존 사진 삭제 (실패 시 기존 유지)
      const added = await pickAndUploadToSlot(slotIndex)
      if (added) {
        await deleteMedia(old)
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
    Alert.alert('사진', '이 사진을 어떻게 할까요?', [
      { text: '교체', onPress: () => void handleReplaceSlot(m, slotIndex) },
      { text: '삭제', style: 'destructive', onPress: () => void doDeleteMedia(m) },
      { text: '취소', style: 'cancel' },
    ])
  }

  const handleDeleteMedia = (m: Media) => {
    Alert.alert('사진 삭제', '이 사진을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void doDeleteMedia(m) },
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
        Alert.alert('저장 필요', '사진을 추가하려면\n먼저 장소를 저장해주세요.')
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
      Alert.alert('통화', '전화번호 정보가 없습니다')
    }
  }

  const handleUnsupported = (featureName: string) => {
    Alert.alert(featureName, UNSUPPORTED_MSG)
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
      const v = videoUri(m)
      if (v) {
        // pointerEvents none — 탭은 바깥 Pressable이 받음
        return (
          <View style={styles.videoFill} pointerEvents="none">
            <SlotVideo uri={v} />
          </View>
        )
      }
    }
    const uri = photoUri(m)
    return uri ? <Image source={{ uri }} style={styles.photoImage} /> : null
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
              <Text style={styles.editAddLabel}>사진 추가</Text>
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
          <Text style={styles.photoEmptyTitle}>아직 사진이 없습니다</Text>
          <Text style={styles.photoEmptySub}>수정 버튼을 눌러 사진을 추가하세요</Text>
        </View>
      )
    }
    return <View style={styles.photoSection}>{renderLayoutGrid(false)}</View>
  }

  const renderEditPhotos = () => (
    <View style={styles.photoSection}>
      <Pressable style={styles.layoutSelectBtn} onPress={() => setLayoutPickerVisible(true)}>
        <Text style={styles.layoutSelectText}>레이아웃 선택</Text>
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

  const handleVideoPositionConfirm = async (_ox: number, _oy: number, _scale: number) => {
    const pending = pendingPickRef.current
    const editor = videoPositionEditor
    setVideoPositionEditor(null)
    pendingPickRef.current = null
    if (!pending || !editor) return
    try {
      setMediaBusy(true)
      const ok = await uploadPickedPhoto(editor.uri, pending.picked, editor.slotIndex)
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
      const ok = await uploadPickedPhoto(croppedUri, pending.picked, cropEditor?.slotIndex ?? 0)
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
        onConfirm={(ox, oy, s) => void handleVideoPositionConfirm(ox, oy, s)}
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

                  {placeDetails?.rating != null && (
                    <View style={styles.ratingRow}>
                      <Text style={styles.ratingNumber}>{placeDetails.rating.toFixed(1)}</Text>
                      {renderStars(placeDetails.rating)}
                      {placeDetails.userRatingCount != null && (
                        <Text style={styles.reviewCount}>
                          ({placeDetails.userRatingCount.toLocaleString()})
                        </Text>
                      )}
                    </View>
                  )}

                  {placeDetails?.primaryTypeDisplayName?.text ? (
                    <Text style={styles.category}>{placeDetails.primaryTypeDisplayName.text}</Text>
                  ) : null}

                  {openNow != null && (
                    <Text style={[styles.statusText, openNow ? styles.statusOpen : styles.statusClosed]}>
                      {openNow ? '영업 중' : '영업 종료'}
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
                  <Pressable style={styles.headerIconBtn} onPress={() => handleUnsupported('공유')}>
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
                  onPress={() => handleUnsupported('경로')}
                >
                  <Image source={require('../../assets/icons/direction.png')} style={styles.actionIcon} />
                  <Text style={styles.actionBtnTextPrimary}>경로</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={() => handleUnsupported('시작')}
                >
                  <Image source={require('../../assets/icons/navigate.png')} style={styles.actionIcon} />
                  <Text style={styles.actionBtnText}>시작</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleCall}>
                  <Image source={require('../../assets/icons/phone.png')} style={styles.actionIcon} />
                  <Text style={styles.actionBtnText}>통화</Text>
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
                    {isSaved && currentId != null ? '저장됨' : '저장'}
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
                        <Text style={styles.infoLabel}>영업시간</Text>
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
                      {isEditing ? '수정완료' : '수정'}
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
            <Text style={styles.pickerTitle}>레이아웃 선택</Text>
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
            <Text style={styles.pickerTitle}>저장할 목록</Text>

            <Pressable style={styles.listRow} onPress={() => void saveToList(null)}>
              <View style={[styles.listDot, styles.listDotNone]} />
              <Text style={styles.listRowText}>목록 없이 저장</Text>
            </Pressable>

            {saveLists.map((list) => (
              <Pressable key={list.id} style={styles.listRow} onPress={() => void saveToList(list.id)}>
                <View style={[styles.listDot, { backgroundColor: list.color }]} />
                <Text style={styles.listRowText}>{list.name}</Text>
              </Pressable>
            ))}

            <View style={styles.listCreateDivider} />
            <Text style={styles.listCreateLabel}>새 목록 만들기</Text>
            <TextInput
              style={styles.listNameInput}
              placeholder="목록 이름"
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
              <Text style={styles.listCreateBtnText}>만들고 저장</Text>
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
                      <ViewerVideo uri={v} active={index === viewerIndex} />
                    ) : poster ? (
                      <Image source={{ uri: poster }} style={styles.viewerImage} resizeMode="contain" />
                    ) : null}
                  </View>
                )
              }
              const uri = localUris[item.id] ?? fullUri(item)
              return (
                <View style={styles.viewerPage}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
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
