import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { supabase } from '../../src/lib/supabase'

export default function ProfileScreen() {
  const { session, userId } = useAuth()
  const user = session?.user

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => {
          supabase.auth.signOut().catch((err) => {
            Alert.alert('오류', (err as Error).message)
          })
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
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
