import * as VideoThumbnails from 'expo-video-thumbnails'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Image } from 'react-native'

const SCREEN = Dimensions.get('window')
const TIMELINE_W = SCREEN.width - 48
const THUMB_COUNT = 8
const MIN_DURATION = 0.98
const MAX_DURATION = 10

interface TrimResult {
  startTime: number
  endTime: number
  duration: number
}

interface Props {
  uri: string
  videoDuration: number
  onConfirm: (result: TrimResult) => void
  onCancel: () => void
}

export function VideoTrimEditor({ uri, videoDuration, onConfirm, onCancel }: Props) {
  const clampedTotal = Math.min(videoDuration, 600)

  const initEnd = Math.min(clampedTotal, MAX_DURATION)
  const [startRatio, setStartRatio] = useState(0)
  const [endRatio, setEndRatio] = useState(initEnd / clampedTotal)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [toastVisible, setToastVisible] = useState(false)
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startTime = startRatio * clampedTotal
  const endTime = endRatio * clampedTotal
  const trimDuration = endTime - startTime

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.play()
  })

  // loop within trim range
  useEffect(() => {
    const interval = setInterval(() => {
      if (player.currentTime < startTime || player.currentTime >= endTime - 0.1) {
        player.currentTime = startTime
      }
    }, 100)
    return () => clearInterval(interval)
  }, [player, startTime, endTime])

  // generate thumbnails
  useEffect(() => {
    let cancelled = false
    const generate = async () => {
      const thumbs: string[] = []
      for (let i = 0; i < THUMB_COUNT; i++) {
        const t = (i / (THUMB_COUNT - 1)) * clampedTotal
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: t * 1000 })
          if (!cancelled) thumbs.push(thumbUri)
        } catch {
          if (!cancelled) thumbs.push('')
        }
      }
      if (!cancelled) setThumbnails(thumbs)
    }
    void generate()
    return () => { cancelled = true }
  }, [uri, clampedTotal])

  const showToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400)
    setToastVisible(true)
  }

  const startRef = useRef(startRatio)
  const endRef = useRef(endRatio)
  startRef.current = startRatio
  endRef.current = endRatio

  const startPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const delta = g.dx / TIMELINE_W
        let next = Math.max(0, startRef.current + delta)
        const dur = (endRef.current - next) * clampedTotal
        if (dur < MIN_DURATION) next = endRef.current - MIN_DURATION / clampedTotal
        if (dur > MAX_DURATION) next = endRef.current - MAX_DURATION / clampedTotal
        setStartRatio(Math.max(0, next))
      },
    })
  ).current

  const endPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const delta = g.dx / TIMELINE_W
        let next = Math.min(1, endRef.current + delta)
        const dur = (next - startRef.current) * clampedTotal
        if (dur < MIN_DURATION) next = startRef.current + MIN_DURATION / clampedTotal
        if (dur > MAX_DURATION) {
          next = startRef.current + MAX_DURATION / clampedTotal
          showToast()
        }
        setEndRatio(Math.min(1, next))
      },
    })
  ).current

  const handleConfirm = () => {
    onConfirm({ startTime, endTime, duration: trimDuration })
  }

  const startPx = startRatio * TIMELINE_W
  const endPx = endRatio * TIMELINE_W
  const thumbW = TIMELINE_W / THUMB_COUNT

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>취소</Text>
          </Pressable>
          <Text style={styles.headerTitle}>동영상 편집</Text>
          <Pressable onPress={handleConfirm} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, styles.confirmText]}>설정완료</Text>
          </Pressable>
        </View>

        {/* 영상 미리보기 */}
        <View style={styles.videoArea}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls={false}
          />
        </View>

        {/* 구간 정보 */}
        <Text style={styles.durationText}>{trimDuration.toFixed(1)}초</Text>

        {/* 타임라인 */}
        <View style={styles.timelineWrapper}>
          <View style={[styles.timeline, { width: TIMELINE_W }]}>
            {/* 썸네일 스트립 */}
            <View style={styles.thumbStrip}>
              {Array.from({ length: THUMB_COUNT }).map((_, i) => (
                <View key={i} style={[styles.thumbCell, { width: thumbW }]}>
                  {thumbnails[i] ? (
                    <Image source={{ uri: thumbnails[i] }} style={{ width: thumbW, height: 52 }} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumbPlaceholder, { width: thumbW }]} />
                  )}
                </View>
              ))}
            </View>

            {/* 선택 구간 오버레이 */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {/* 왼쪽 어둠 */}
              <View style={[styles.dimZone, { left: 0, width: startPx }]} />
              {/* 오른쪽 어둠 */}
              <View style={[styles.dimZone, { right: 0, width: TIMELINE_W - endPx }]} />
              {/* 선택 테두리 */}
              <View style={[styles.selectionBorder, { left: startPx, width: endPx - startPx }]} />
            </View>

            {/* 시작 핸들 */}
            <View
              style={[styles.handle, styles.handleLeft, { left: startPx - 14 }]}
              {...startPan.panHandlers}
            >
              <View style={styles.handleBar} />
            </View>

            {/* 끝 핸들 */}
            <View
              style={[styles.handle, styles.handleRight, { left: endPx - 14 }]}
              {...endPan.panHandlers}
            >
              <View style={styles.handleBar} />
            </View>
          </View>

          {/* 시간 라벨 */}
          <View style={[styles.timeLabels, { width: TIMELINE_W }]}>
            <Text style={styles.timeLabel}>0s</Text>
            <Text style={styles.timeLabel}>{(clampedTotal / 2).toFixed(0)}s</Text>
            <Text style={styles.timeLabel}>{clampedTotal.toFixed(0)}s</Text>
          </View>
        </View>

        {/* 토스트 */}
        {toastVisible && (
          <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
            <Text style={styles.toastText}>10초 이상은 불가능합니다</Text>
          </Animated.View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  headerBtn: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 60 },
  headerBtnText: { fontSize: 16, color: '#888' },
  confirmText: { color: '#4ade80', fontWeight: '600', textAlign: 'right' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  videoArea: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: { width: '100%', height: '100%' },
  durationText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
    fontVariant: ['tabular-nums'],
  },
  timelineWrapper: { paddingHorizontal: 24, paddingBottom: 48, gap: 6 },
  timeline: { height: 52, position: 'relative' },
  thumbStrip: { flexDirection: 'row', height: 52, overflow: 'hidden', borderRadius: 6 },
  thumbCell: { height: 52, overflow: 'hidden' },
  thumbPlaceholder: { height: 52, backgroundColor: '#222' },
  dimZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  selectionBorder: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 4,
  },
  handle: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleLeft: {},
  handleRight: {},
  handleBar: {
    width: 4,
    height: 36,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  timeLabel: { fontSize: 11, color: '#555' },
  toast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(30,30,30,0.92)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 13 },
})
