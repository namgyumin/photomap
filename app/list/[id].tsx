import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import Svg, { Circle, Path } from 'react-native-svg'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { listLocalMedia } from '../../src/lib/localMedia'
import { listMyMemories, listSavedLists } from '../../src/services/memories'
import type { MemoryListItem, SavedList } from '../../src/types/database'

function MapPin({ color = '#111111', size = 36 }: { color?: string; size?: number }) {
  const w = size * 0.72
  return (
    <Svg width={w} height={size} viewBox="0 0 36 50">
      <Path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 32 18 32S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill={color} />
      <Circle cx="18" cy="18" r="8" fill="white" opacity={0.9} />
    </Svg>
  )
}

export default function SavedListScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const mapRef = useRef<MapView>(null)

  const [list, setList] = useState<SavedList | null>(null)
  const [items, setItems] = useState<MemoryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [localInfo, setLocalInfo] = useState<Record<string, { uri: string | null; count: number }>>({})

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [lists, memories] = await Promise.all([listSavedLists(), listMyMemories()])
      const found = lists.find((l) => l.id === id) ?? null
      setList(found)
      const mine = memories.filter((m) => m.saved_list_id === id)
      setItems(mine)
      const info: Record<string, { uri: string | null; count: number }> = {}
      for (const m of mine) {
        const lm = await listLocalMedia(m.id)
        info[m.id] = { uri: lm[0]?.uri ?? null, count: lm.length }
      }
      setLocalInfo(info)
    } catch (e) {
      Alert.alert(t('place.loadFail'), String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const places = items.filter((it) => it.place?.latitude != null && it.place?.longitude != null)

  // 목록의 장소 전체가 지도 한 화면에 들어오도록 fit
  const fitAll = () => {
    if (!places.length) return
    mapRef.current?.fitToCoordinates(
      places.map((it) => ({ latitude: it.place!.latitude!, longitude: it.place!.longitude! })),
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false }
    )
  }

  const openOnMap = (memoryId: string) => {
    const it = items.find((m) => m.id === memoryId)
    const params: Record<string, string> = { openMemoryId: memoryId }
    if (it?.place?.latitude != null && it?.place?.longitude != null) {
      params.placeId = it.place.google_place_id
      params.placeName = it.place.display_name ?? ''
      params.placeAddress = it.place.address ?? ''
      params.focusLat = String(it.place.latitude)
      params.focusLng = String(it.place.longitude)
    }
    router.push({ pathname: '/', params })
  }

  const color = list?.color ?? '#1C7B6C'

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={[styles.titleDot, { backgroundColor: color }]} />
        <Text style={styles.title} numberOfLines={1}>
          {list?.name ?? t('list.list')}
        </Text>
        <Text style={styles.count}>{items.length} {t('map.places')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={items.length === 0 ? styles.listEmpty : undefined}
          ListHeaderComponent={
            places.length > 0 ? (
              <MapView ref={mapRef} style={styles.map} onMapReady={fitAll}>
                {places.map((it) => (
                  <Marker
                    key={it.id}
                    coordinate={{ latitude: it.place!.latitude!, longitude: it.place!.longitude! }}
                    title={it.place!.display_name ?? t('map.place')}
                    tracksViewChanges={false}
                    onPress={() => openOnMap(it.id)}
                  >
                    <MapPin color={color ?? '#111111'} size={32} />
                  </Marker>
                ))}
              </MapView>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.emptyBody}>{t('list.empty')}</Text>
          }
          renderItem={({ item }) => {
            const thumb = localInfo[item.id]?.uri ?? null
            return (
              <Pressable style={styles.card} onPress={() => openOnMap(item.id)}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <View style={[styles.thumbDot, { backgroundColor: color }]} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.place?.display_name ?? t('map.place')}</Text>
                  <Text style={styles.cardMeta}>
                    {item.visited_at?.slice(0, 10)} · {t('media.photos')} {localInfo[item.id]?.count ?? 0}
                  </Text>
                  {item.note ? (
                    <Text style={styles.cardNote} numberOfLines={2}>
                      {item.note}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 28, color: '#222', marginTop: -4 },
  titleDot: { width: 14, height: 14, borderRadius: 7 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#222' },
  count: { fontSize: 14, color: '#888' },
  map: { height: 260 },
  markerDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  markerInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  listEmpty: { flexGrow: 1 },
  emptyBody: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 48 },
  card: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbDot: { width: 18, height: 18, borderRadius: 9 },
  cardBody: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  cardMeta: { fontSize: 13, color: '#888', marginTop: 3 },
  cardNote: { fontSize: 14, color: '#555', marginTop: 5 },
})
