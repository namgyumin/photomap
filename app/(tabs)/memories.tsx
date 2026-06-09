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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SharedImportModal } from '../../src/components/SharedImportModal'
import { resolveMediaUri } from '../../src/lib/media'
import { importSharedMemory, listMyMemories } from '../../src/services/memories'
import type { ImportMode, MemoryListItem } from '../../src/types/database'
import { useAuth } from '../../src/hooks/useAuth'

export default function MemoriesScreen() {
  const { userId, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string; autoImport?: string }>()
  const autoHandledTokenRef = useRef<string | null>(null)

  const [items, setItems] = useState<MemoryListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState('')
  const [importVisible, setImportVisible] = useState(false)

  const load = useCallback(async () => {
    if (!userId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      setItems(await listMyMemories())
    } catch (e) {
      Alert.alert('불러오기 실패', String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [userId])

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
    router.push({ pathname: '/', params: { openMemoryId: id } })
  }

  const startImport = () => {
    if (!token.trim()) {
      Alert.alert('토큰 필요', '공유 토큰을 입력해주세요.')
      return
    }
    // 충돌 가능성 → 항상 모달 확인 (PRD: 내 기록 유지 / 덮어쓰기 / 취소)
    setImportVisible(true)
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.importBar}>
        <TextInput
          style={styles.tokenInput}
          placeholder="공유 토큰 입력"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
        />
        <Pressable style={styles.importBtn} onPress={startImport}>
          <Text style={styles.importBtnText}>가져오기</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={items.length === 0 ? styles.listEmpty : styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={<Text style={styles.header}># 내가 갔던 곳</Text>}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.emptyBody}>아직 기록이 없어요. 지도에서 장소를 저장해보세요.</Text>
          )
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  importBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tokenInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  importBtn: { backgroundColor: '#1a73e8', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  importBtnText: { color: '#fff', fontWeight: '600' },
  list: { padding: 16 },
  listEmpty: { flexGrow: 1, padding: 16 },
  header: { fontSize: 24, fontWeight: '800', marginBottom: 16 },
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
