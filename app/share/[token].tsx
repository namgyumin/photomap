import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { getSharedMemoryByToken } from '../../src/services/memories'
import type { SharedMemory } from '../../src/types/database'

export default function ShareTokenScreen() {
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token?: string }>()
  const { userId, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(false)
  const [shared, setShared] = useState<SharedMemory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const value = typeof token === 'string' ? token.trim() : ''
    if (!value) {
      setShared(null)
      setLoadError('공유 토큰이 없어요.')
      return
    }

    setLoading(true)
    setLoadError(null)
    getSharedMemoryByToken(value)
      .then((result) => {
        if (!result) {
          setShared(null)
          setLoadError('공유 기록을 찾을 수 없어요.')
          return
        }
        setShared(result)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setLoadError(message)
      })
      .finally(() => setLoading(false))
  }, [token])

  const goToImport = () => {
    const value = typeof token === 'string' ? token.trim() : ''
    if (!value) {
      Alert.alert('토큰 오류', '유효한 공유 토큰이 없어요.')
      return
    }
    if (!userId) {
      router.push({ pathname: '/(auth)/login', params: { next: `/share/${value}` } })
      return
    }
    router.replace({ pathname: '/(tabs)/memories', params: { token: value, autoImport: '1' } })
  }

  const placeName = shared?.place?.display_name ?? '공유 기록'
  const visitedAt = shared?.visit.visited_at?.slice(0, 10)
  const mediaCount = shared?.media.length ?? 0

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PhotoMap 공유</Text>
        <Text style={styles.title}>{placeName}</Text>
        {visitedAt ? <Text style={styles.meta}>{visitedAt}</Text> : null}

        {loading || authLoading ? <ActivityIndicator style={styles.loader} /> : null}

        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {shared ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLine}>사진/영상 {mediaCount}개</Text>
            {shared.visit.note ? (
              <Text style={styles.note} numberOfLines={4}>
                {shared.visit.note}
              </Text>
            ) : (
              <Text style={styles.noteMuted}>작성된 메모는 없어요.</Text>
            )}
          </View>
        ) : null}

        <Pressable style={styles.primaryBtn} onPress={goToImport}>
          <Text style={styles.primaryBtnText}>
            {userId ? '내 기록으로 가져오기' : '로그인 후 가져오기'}
          </Text>
        </Pressable>

        {!userId ? (
          <Text style={styles.helper}>
            아직 로그인 전이면 이 화면에서 내용을 먼저 확인하고, 로그인 후 다시 링크를 열면 돼요.
          </Text>
        ) : (
          <Text style={styles.helper}>
            버튼을 누르면 기록 탭으로 이동해 가져오기 방식을 선택할 수 있어요.
          </Text>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a73e8',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  meta: {
    fontSize: 14,
    color: '#64748b',
  },
  loader: {
    marginVertical: 6,
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryLine: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  note: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  noteMuted: {
    fontSize: 14,
    color: '#94a3b8',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
  },
})
