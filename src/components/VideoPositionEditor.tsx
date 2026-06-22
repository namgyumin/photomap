import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated'

const SCREEN = Dimensions.get('window')

interface TrimResult {
  startTime: number
  endTime: number
  duration: number
}

interface Props {
  uri: string
  trim: TrimResult
  videoWidth: number
  videoHeight: number
  slotAspect: number
  onConfirm: (offsetX: number, offsetY: number, scale: number) => void
  onCancel: () => void
}

export function VideoPositionEditor({
  uri, trim, videoWidth, videoHeight, slotAspect, onConfirm, onCancel,
}: Props) {
  const VIEWPORT_W = SCREEN.width - 48
  const VIEWPORT_H = VIEWPORT_W / slotAspect
  const scaleToFit = Math.max(VIEWPORT_W / videoWidth, VIEWPORT_H / videoHeight)

  const scale = useSharedValue(scaleToFit)
  const offsetX = useSharedValue(0)
  const offsetY = useSharedValue(0)

  const [snapScale, setSnapScale] = useState(scaleToFit)
  const [snapOffset, setSnapOffset] = useState({ x: 0, y: 0 })

  const clampOffset = (s: number, ox: number, oy: number) => {
    'worklet'
    const imgW = videoWidth * s
    const imgH = videoHeight * s
    const maxX = Math.max(0, (imgW - VIEWPORT_W) / 2)
    const maxY = Math.max(0, (imgH - VIEWPORT_H) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    }
  }

  const panStartX = useSharedValue(0)
  const panStartY = useSharedValue(0)
  const panGesture = Gesture.Pan()
    .onStart(() => {
      panStartX.value = offsetX.value
      panStartY.value = offsetY.value
    })
    .onUpdate((e) => {
      const clamped = clampOffset(scale.value, panStartX.value + e.translationX, panStartY.value + e.translationY)
      offsetX.value = clamped.x
      offsetY.value = clamped.y
    })
    .onEnd(() => {
      runOnJS(setSnapOffset)({ x: offsetX.value, y: offsetY.value })
    })

  const pinchStartScale = useSharedValue(scaleToFit)
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartScale.value = scale.value
    })
    .onUpdate((e) => {
      const newScale = Math.max(scaleToFit, Math.min(scaleToFit * 5, pinchStartScale.value * e.scale))
      scale.value = newScale
      const clamped = clampOffset(newScale, offsetX.value, offsetY.value)
      offsetX.value = clamped.x
      offsetY.value = clamped.y
    })
    .onEnd(() => {
      runOnJS(setSnapScale)(scale.value)
      runOnJS(setSnapOffset)({ x: offsetX.value, y: offsetY.value })
    })

  const composed = Gesture.Simultaneous(panGesture, pinchGesture)

  const animStyle = useAnimatedStyle(() => ({
    width: videoWidth * scale.value,
    height: videoHeight * scale.value,
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }],
  }))

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true
    p.currentTime = trim.startTime
    p.play()
  })

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.currentTime >= trim.endTime - 0.08) {
        player.currentTime = trim.startTime
      }
    }, 80)
    return () => clearInterval(interval)
  }, [player, trim.startTime, trim.endTime])

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>취소</Text>
          </Pressable>
          <Text style={styles.headerTitle}>위치 조정</Text>
          <Pressable
            onPress={() => onConfirm(snapOffset.x, snapOffset.y, snapScale)}
            style={[styles.headerBtn, styles.confirmBtn]}
          >
            <Text style={[styles.headerBtnText, styles.confirmText]}>완료</Text>
          </Pressable>
        </View>

        <GestureDetector gesture={composed}>
          <View style={styles.body}>
            <Text style={styles.hint}>드래그·핀치로 위치/크기 조정</Text>

            <View style={styles.dimFrame}>
              <Animated.View style={[animStyle, { opacity: 0.3 }]}>
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="fill" nativeControls={false} />
              </Animated.View>
            </View>

            <View style={[styles.viewport, { width: VIEWPORT_W, height: VIEWPORT_H }]} pointerEvents="none">
              <Animated.View style={animStyle}>
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="fill" nativeControls={false} />
              </Animated.View>
              <View style={StyleSheet.absoluteFill}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const CORNER = 20
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
  headerBtn: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 52 },
  confirmBtn: { alignItems: 'flex-end' },
  headerBtnText: { fontSize: 16, color: '#888' },
  confirmText: { color: '#4ade80', fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hint: { position: 'absolute', top: 16, fontSize: 13, color: '#666', zIndex: 10 },
  dimFrame: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  viewport: {
    overflow: 'hidden',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderWidth: 2.5 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 3 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 3 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 3 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 3 },
})
