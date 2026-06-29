import { useTranslation } from 'react-i18next'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import {
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
const MIN_DURATION = 0.499 // 표시상 0.5초
const MAX_DURATION = 10.01

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
  const { t } = useTranslation()
  const clampedTotal = Math.min(videoDuration, 600)

  const initEnd = Math.min(clampedTotal, MAX_DURATION)
  const [startRatio, setStartRatio] = useState(0)
  const [endRatio, setEndRatio] = useState(initEnd / clampedTotal)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [playPos, setPlayPos] = useState(0) // 0~1 ratio within full video

  const startTime = startRatio * clampedTotal
  const endTime = endRatio * clampedTotal
  const trimDuration = endTime - startTime

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.play()
  })

  // loop within trim range + update playhead
  useEffect(() => {
    const interval = setInterval(() => {
      const t = player.currentTime
      if (t < startTime || t >= endTime - 0.1) {
        player.currentTime = startTime
        setPlayPos(startRatio)
      } else {
        setPlayPos(t / clampedTotal)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [player, startTime, endTime, startRatio, clampedTotal])

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

  const startRef = useRef(startRatio)
  const endRef = useRef(endRatio)
  startRef.current = startRatio
  endRef.current = endRatio

  // grant 시점의 값을 저장해서 delta 계산
  const startGrantRef = useRef(0)
  const endGrantRef = useRef(0)
  const midGrantStart = useRef(0)
  const midGrantEnd = useRef(0)

  const startPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startGrantRef.current = startRef.current
      },
      onPanResponderMove: (_, g) => {
        const delta = g.dx / TIMELINE_W
        let next = startGrantRef.current + delta
        next = Math.max(0, next)
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
      onPanResponderGrant: () => {
        endGrantRef.current = endRef.current
      },
      onPanResponderMove: (_, g) => {
        const delta = g.dx / TIMELINE_W
        let next = endGrantRef.current + delta
        next = Math.min(1, next)
        const dur = (next - startRef.current) * clampedTotal
        if (dur < MIN_DURATION) next = startRef.current + MIN_DURATION / clampedTotal
        if (dur > MAX_DURATION) next = startRef.current + MAX_DURATION / clampedTotal
        setEndRatio(Math.min(1, next))
      },
    })
  ).current

  // 선택 구간 전체 이동
  const midPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        midGrantStart.current = startRef.current
        midGrantEnd.current = endRef.current
      },
      onPanResponderMove: (_, g) => {
        const delta = g.dx / TIMELINE_W
        const dur = midGrantEnd.current - midGrantStart.current
        let newStart = midGrantStart.current + delta
        let newEnd = midGrantEnd.current + delta
        if (newStart < 0) { newStart = 0; newEnd = dur }
        if (newEnd > 1) { newEnd = 1; newStart = 1 - dur }
        setStartRatio(newStart)
        setEndRatio(newEnd)
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
            <Text style={styles.headerBtnText}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('video.trimTitle')}</Text>
          <Pressable onPress={handleConfirm} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, styles.confirmText]}>{t('video.confirmBtn')}</Text>
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
        <Text style={styles.durationText}>{trimDuration.toFixed(1)}{t('video.seconds')}</Text>

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

            {/* 재생 위치 표시선 */}
            <View
              pointerEvents="none"
              style={[styles.playhead, { left: playPos * TIMELINE_W - 1 }]}
            />

            {/* 중간 드래그 영역 — 구간 전체 이동 */}
            <View
              style={[styles.midZone, { left: startPx + 14, width: Math.max(0, endPx - startPx - 28) }]}
              {...midPan.panHandlers}
            />

            {/* 시작 핸들 */}
            <View
              style={[styles.handle, { left: startPx - 14 }]}
              {...startPan.panHandlers}
            >
              <View style={styles.handleBar} />
            </View>

            {/* 끝 핸들 */}
            <View
              style={[styles.handle, { left: endPx - 14 }]}
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
  playhead: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
    zIndex: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 4,
  },
  midZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 5,
  },
  handleBar: {
    width: 4,
    height: 36,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  timeLabel: { fontSize: 11, color: '#555' },
})
