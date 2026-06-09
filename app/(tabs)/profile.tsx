import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { supabase } from '../../src/lib/supabase'

export default function ProfileScreen() {
  const { session, userId } = useAuth()
  const user = session?.user
  const isGuest = Boolean(user?.is_anonymous)

  const handleLogout = () => {
    const message = isGuest
      ? '게스트 계정은 로그아웃하는 순간 데이터가 바로 삭제돼요. 로그인하지 않은 상태로 30일이 지나도 자동 삭제될 수 있어요. 정말 로그아웃할까요?'
      : '로그아웃하시겠어요?'

    Alert.alert('로그아웃', message, [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            if (isGuest) {
              const { error } = await supabase.rpc('delete_current_guest_account')
              if (error) throw error
              await supabase.auth.signOut({ scope: 'local' })
            } else {
              await supabase.auth.signOut()
            }
          } catch (err) {
            Alert.alert('오류', (err as Error).message)
          }
        },
      },
    ])
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.emptyText}>로그인이 필요해요</Text>
      </SafeAreaView>
    )
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? userId ?? '사용자'
  const email = user.email ?? ''
  const initial = displayName.charAt(0).toUpperCase()
  const accountLabel = isGuest ? '게스트 계정 · 로그아웃 시 데이터 즉시 삭제' : '일반 계정'

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.accountLabel}>{accountLabel}</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  emptyText: { fontSize: 16, color: '#888' },
  profile: { alignItems: 'center', paddingVertical: 48 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 6 },
  accountLabel: { fontSize: 13, color: '#1a73e8', marginBottom: 6, fontWeight: '600' },
  email: { fontSize: 14, color: '#888' },
  logoutBtn: {
    marginTop: 'auto',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#d93025' },
})
