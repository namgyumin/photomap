import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads'

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-1579879380097498/4973662054'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SharedImportModal } from '../../src/components/SharedImportModal'
import { resolveMediaUri } from '../../src/lib/media'
import { importSharedMemory, listMyMemories, listSavedLists } from '../../src/services/memories'
import type { ImportMode, MemoryListItem, SavedList } from '../../src/types/database'
import { useAuth } from '../../src/hooks/useAuth'

export default function MemoriesScreen() {
  const { userId, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string; autoImport?: string }>()
  const autoHandledTokenRef = useRef<string | null>(null)

  const [items, setItems] = useState<MemoryListItem[]>([])
  const [savedLists, setSavedLists] = useState<SavedList[]>([])
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState('')
  const [importVisible, setImportVisible] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    if (!userId) {
      setItems([])
      setSavedLists([])
      return
    }
    setLoading(true)
    try {
      const [memories, lists] = await Promise.all([listMyMemories(), listSavedLists()])
      setItems(memories)
      setSavedLists(lists)
    } catch (e) {
      Alert.alert('불러오기 실패', String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [userId])

  // 목록 미지정 기록만 메인에 바로 노출. 목록 소속 기록은 목록 카드로 진입.
  const noListItems = items.filter((it) => it.saved_list_id == null)
  const listCounts = new Map<string, number>()
  for (const it of items) {
    if (it.saved_list_id) listCounts.set(it.saved_list_id, (listCounts.get(it.saved_list_id) ?? 0) + 1)
  }

  // 검색 중에는 목록 소속 포함 전체 기록에서 장소명/주소/메모 매칭
  const q = query.trim().toLowerCase()
  const searchMode = q.length > 0
  const visibleItems = searchMode
    ? items.filter(
        (it) =>
          (it.place?.display_name ?? '').toLowerCase().includes(q) ||
          (it.place?.address ?? '').toLowerCase().includes(q) ||
          (it.note ?? '').toLowerCase().includes(q)
      )
    : noListItems

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  useEffect(() => {
    const sharedToken = typeof params.token === 'string' ? params.token.trim() : ''
    const shouldAutoImport = params.autoImport === '1'
    if (!sharedToken) {
      autoHandledTokenRef.current = null
      return
    }

    setToken(sharedToken)

    if (!userId || !shouldAutoImport || autoHandledTokenRef.current === sharedToken) {
      return
    }

    autoHandledTokenRef.current = sharedToken
    setImportVisible(true)
  }, [params.token, params.autoImport, userId])

  const openOnMap = (id: string) => {
    const it = items.find((m) => m.id === id)
    const params: Record<string, string> = { openMemoryId: id }
    if (it?.place?.latitude != null && it?.place?.longitude != null) {
      params.placeId = it.place.google_place_id
      params.placeName = it.place.display_name ?? ''
      params.placeAddress = it.place.address ?? ''
      params.focusLat = String(it.place.latitude)
      params.focusLng = String(it.place.longitude)
    }
    router.push({ pathname: '/', params })
  }

  const runImport = async (mode: ImportMode) => {
    setImportVisible(false)
    try {
      await importSharedMemory(token.trim(), mode)
      setToken('')
      Alert.alert('가져오기 완료', '공유 기록을 내 기록으로 가져왔어요.')
      void load()
    } catch (e) {
      Alert.alert('가져오기 실패', String((e as Error).message))
    }
  }

  if (!authLoading && !userId) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.emptyTitle}>로그인이 필요해요</Text>
        <Text style={styles.emptyBody}>로그인하면 내가 갔던 곳이 여기 정리돼요.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="내가 갔던 곳 검색"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(it) => it.id}
        contentContainerStyle={items.length === 0 ? styles.listEmpty : styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          searchMode ? null : (
            <>
              {savedLists.length > 0 && (
                <View style={styles.listsSection}>
                  <Text style={styles.sectionTitle}>목록</Text>
                  {savedLists.map((list) => (
                    <Pressable
                      key={list.id}
                      style={styles.listCard}
                      onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id } })}
                    >
                      <View style={[styles.listColorDot, { backgroundColor: list.color }]} />
                      <Text style={styles.listCardName}>{list.name}</Text>
                      <Text style={styles.listCardCount}>{listCounts.get(list.id) ?? 0}곳</Text>
                      <Text style={styles.listCardChevron}>›</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {noListItems.length > 0 && <Text style={styles.sectionTitle}>기록</Text>}
            </>
          )
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : searchMode ? (
            <Text style={styles.emptyBody}>검색 결과가 없어요.</Text>
          ) : items.length === 0 ? (
            <Text style={styles.emptyBody}>아직 기록이 없어요. 지도에서 장소를 저장해보세요.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const thumb = resolveMediaUri(item.hero?.thumbnail_512 ?? item.hero?.storage_path ?? null)
          return (
            <Pressable style={styles.card} onPress={() => openOnMap(item.id)}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text style={styles.thumbEmptyText}>📍</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.place?.display_name ?? '장소'}</Text>
                <Text style={styles.cardMeta}>
                  {item.visited_at?.slice(0, 10)} · 사진 {item.media_count}
                  {item.amount_spent != null ? ` · ${item.amount_spent.toLocaleString()}원` : ''}
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

      <SharedImportModal
        visible={importVisible}
        onSelect={runImport}
        onCancel={() => setImportVisible(false)}
      />

      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  list: { padding: 16 },
  listEmpty: { flexGrow: 1, padding: 16 },
  listsSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#888', marginBottom: 8 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    marginBottom: 8,
  },
  listColorDot: { width: 16, height: 16, borderRadius: 8 },
  listCardName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#222' },
  listCardCount: { fontSize: 13, color: '#888' },
  listCardChevron: { fontSize: 20, color: '#bbb', marginTop: -2 },
  card: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmptyText: { fontSize: 24 },
  cardBody: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  cardMeta: { fontSize: 13, color: '#888', marginTop: 3 },
  cardNote: { fontSize: 14, color: '#555', marginTop: 5 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#888', textAlign: 'center' },
})
