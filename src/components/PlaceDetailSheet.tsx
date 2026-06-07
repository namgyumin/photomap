import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { PlaceSearchResult } from '../lib/googlePlaces'
import { MAX_VIDEO_SECONDS, pickMedia, resolveMediaUri, uploadMedia, VideoTooLongError } from '../lib/media'
import {
  addMediaToVisit,
  createOrGetPlace,
  createShareLink,
  createVisitMemory,
  getMemoryDetail,
  setHeroMedia,
  updateMediaLocation,
  updateVisitMemoryFields,
} from '../services/memories'
import type { Media, MemoryDetail } from '../types/database'

interface Props {
  visible: boolean
  onClose: () => void
  userId: string | null
  // 검색에서 선택한 (아직 저장 안 했을 수 있는) 장소
  searchPlace?: PlaceSearchResult | null
  // 기존 메모리 열기
  memoryId?: string | null
  // 신규 저장 완료 시 (지도 마커 추가용)
  onSaved?: (memoryId: string, place: PlaceSearchResult) => void
  onChanged?: () => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PlaceDetailSheet({
  visible,
  onClose,
  userId,
  searchPlace,
  memoryId,
  onSaved,
  onChanged,
}: Props) {
  const [currentId, setCurrentId] = useState<string | null>(memoryId ?? null)
  const [detail, setDetail] = useState<MemoryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // form
  const [visitedAt, setVisitedAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [isSaved, setIsSaved] = useState(true)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const d = await getMemoryDetail(id)
      setDetail(d)
      setVisitedAt(d.memory.visited_at?.slice(0, 10) || todayIso())
      setNote(d.memory.note ?? '')
      setAmount(d.memory.amount_spent != null ? String(d.memory.amount_spent) : '')
      setIsSaved(d.memory.is_saved)
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
      // 신규 (검색 장소)
      setCurrentId(null)
      setDetail(null)
      setVisitedAt(todayIso())
      setNote('')
      setAmount('')
      setIsSaved(true)
    }
  }, [visible, memoryId, load])

  const placeName = detail?.place?.display_name ?? searchPlace?.name ?? '장소'
  const placeAddress = detail?.place?.address ?? searchPlace?.address ?? null

  // hero: 저장된 대표 미디어 > 검색 장소 사진
  const heroMedia =
    detail?.media.find((m) => m.id === detail.memory.hero_media_id) ??
    detail?.media[0] ??
    null
  const heroUri = heroMedia
    ? resolveMediaUri(heroMedia.thumbnail_512 ?? heroMedia.storage_path)
    : searchPlace?.heroPhotoUrl ?? null

  const requireAuth = (): boolean => {
    if (!userId) {
      Alert.alert('로그인 필요', '저장하려면 먼저 로그인해야 해요.')
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!requireAuth()) return
    setSaving(true)
    try {
      const amountNum = amount.trim() ? Number(amount) : null
      if (currentId) {
        await updateVisitMemoryFields(currentId, {
          visitedAt,
          note: note || null,
          amountSpent: Number.isNaN(amountNum as number) ? null : amountNum,
          isSaved,
        })
        await load(currentId)
        onChanged?.()
        Alert.alert('저장됨', '기록을 업데이트했어요.')
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
          note: note || null,
          amountSpent: Number.isNaN(amountNum as number) ? null : amountNum,
          isSaved,
        })
        setCurrentId(memory.id)
        await load(memory.id)
        onSaved?.(memory.id, searchPlace)
        onChanged?.()
        Alert.alert('저장됨', '내가 갔던 곳에 추가했어요. 이제 사진을 추가할 수 있어요.')
      }
    } catch (e) {
      Alert.alert('저장 실패', String((e as Error).message))
    } finally {
      setSaving(false)
    }
  }

  const handleAddMedia = async () => {
    if (!requireAuth()) return
    if (!currentId) {
      Alert.alert('먼저 저장하기', '사진/영상을 추가하기 전에 장소를 먼저 저장해주세요.')
      return
    }
    try {
      const picked = await pickMedia()
      if (!picked) return

      // Upload to Supabase Storage
      const storagePath = await uploadMedia(userId!, currentId, picked.uri, picked.mediaType)

      await addMediaToVisit({
        visitId: currentId,
        storagePath,
        mediaType: picked.mediaType,
        durationSeconds: picked.durationSeconds,
        width: picked.width,
        height: picked.height,
      })
      await load(currentId)
      onChanged?.()
    } catch (e) {
      if (e instanceof VideoTooLongError) {
        Alert.alert('영상이 너무 길어요', `${MAX_VIDEO_SECONDS}초 이하 영상만 추가할 수 있어요.`)
      } else if ((e as Error).message === 'PERMISSION_DENIED') {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요해요.')
      } else {
        Alert.alert('추가 실패', String((e as Error).message))
      }
    }
  }

  const handleSetHero = async (media: Media) => {
    if (!currentId) return
    try {
      await setHeroMedia(currentId, media.id)
      await load(currentId)
      onChanged?.()
    } catch (e) {
      Alert.alert('대표 사진 변경 실패', String((e as Error).message))
    }
  }

  const handleUsePlaceLocation = async (media: Media) => {
    const lat = detail?.place?.latitude
    const lng = detail?.place?.longitude
    if (lat == null || lng == null) {
      Alert.alert('위치 없음', '장소 좌표가 없어요.')
      return
    }
    try {
      await updateMediaLocation(media.id, lat, lng)
      await load(currentId!)
      onChanged?.()
    } catch (e) {
      Alert.alert('위치 저장 실패', String((e as Error).message))
    }
  }

  const handleShare = async () => {
    if (!currentId) {
      Alert.alert('먼저 저장하기', '공유하려면 먼저 저장해주세요.')
      return
    }
    try {
      const link = await createShareLink({ visitId: currentId })
      await Share.share({
        message: `photomap 기록 공유: ${placeName}\n토큰: ${link.share_token}`,
      })
    } catch (e) {
      Alert.alert('공유 실패', String((e as Error).message))
    }
  }

  const media = detail?.media ?? []

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator>
              {/* hero */}
              {heroUri ? (
                <Image source={{ uri: heroUri }} style={styles.hero} />
              ) : (
                <View style={[styles.hero, styles.heroEmpty]}>
                  <Text style={styles.heroEmptyText}>대표 사진 없음</Text>
                </View>
              )}

              {/* name */}
              <Text style={styles.name}>{placeName}</Text>

              {/* 필수 필드 */}
              <View style={styles.field}>
                <Text style={styles.label}>위치</Text>
                <Text style={styles.value}>{placeAddress ?? '주소 정보 없음'}</Text>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.label}>저장</Text>
                <Switch value={isSaved} onValueChange={setIsSaved} />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>방문일</Text>
                <TextInput
                  style={styles.input}
                  value={visitedAt}
                  onChangeText={setVisitedAt}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>메모</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="메모를 남겨보세요"
                  multiline
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>쓴 금액</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.actionsRow}>
                <Pressable style={[styles.actionBtn, styles.primary]} onPress={handleSave}>
                  <Text style={styles.primaryText}>{saving ? '저장 중…' : '저장'}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.ghost]} onPress={handleShare}>
                  <Text style={styles.ghostText}>공유</Text>
                </Pressable>
              </View>

              {/* 사진/영상 리스트 */}
              <View style={styles.mediaHeader}>
                <Text style={styles.sectionTitle}>사진 / 영상 ({media.length})</Text>
                <Pressable onPress={handleAddMedia}>
                  <Text style={styles.addLink}>+ 추가</Text>
                </Pressable>
              </View>

              {media.length === 0 ? (
                <Text style={styles.empty}>
                  {currentId
                    ? '아직 사진/영상이 없어요. + 추가로 넣어보세요.'
                    : '저장하면 사진/영상을 추가할 수 있어요.'}
                </Text>
              ) : (
                media.map((m) => {
                  const uri = resolveMediaUri(m.thumbnail_512 ?? m.storage_path)
                  const isHero = m.id === detail?.memory.hero_media_id
                  return (
                    <View key={m.id} style={styles.mediaItem}>
                      {uri ? (
                        <Image source={{ uri }} style={styles.mediaThumb} />
                      ) : (
                        <View style={[styles.mediaThumb, styles.heroEmpty]} />
                      )}
                      <View style={styles.mediaMeta}>
                        <Text style={styles.mediaType}>
                          {m.media_type === 'video'
                            ? `영상 ${m.duration_seconds ?? '?'}s`
                            : '사진'}
                          {m.imported_from_user_id ? ' · 가져옴' : ''}
                        </Text>
                        {m.latitude != null && m.longitude != null ? (
                          <Text style={styles.mediaCoords}>
                            {`위치: ${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`}
                          </Text>
                        ) : (
                          <Text style={styles.mediaCoords}>위치 없음</Text>
                        )}
                        <Pressable
                          onPress={() => handleSetHero(m)}
                          disabled={isHero}
                        >
                          <Text style={[styles.heroBtn, isHero && styles.heroBtnActive]}>
                            {isHero ? '★ 대표 사진' : '대표로 설정'}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => handleUsePlaceLocation(m)}>
                          <Text style={styles.locationBtn}>장소 위치 사용</Text>
                        </Pressable>
                      </View>
                    </View>
                  )
                })
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  backdropTop: { height: 60 },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    marginBottom: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#eee' },
  heroEmpty: { alignItems: 'center', justifyContent: 'center' },
  heroEmptyText: { color: '#999' },
  name: { fontSize: 22, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  field: { marginBottom: 12 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: { fontSize: 13, color: '#888', marginBottom: 4 },
  value: { fontSize: 15, color: '#222' },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 20 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primary: { backgroundColor: '#1a73e8' },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  ghost: { backgroundColor: '#f1f3f4' },
  ghostText: { color: '#444', fontWeight: '600', fontSize: 15 },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addLink: { color: '#1a73e8', fontWeight: '600', fontSize: 15 },
  empty: { color: '#999', paddingVertical: 16 },
  mediaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  mediaThumb: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#eee' },
  mediaMeta: { flex: 1 },
  mediaType: { fontSize: 14, color: '#333', marginBottom: 6 },
  heroBtn: { color: '#1a73e8', fontSize: 13, fontWeight: '600' },
  heroBtnActive: { color: '#f5a623' },
  mediaCoords: { fontSize: 11, color: '#999', marginBottom: 4 },
  locationBtn: { color: '#34a853', fontSize: 13, fontWeight: '600', marginTop: 4 },
})
