import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../src/hooks/useAuth'
import '../src/i18n'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    const isPublicShareRoute = segments[0] === 'share'
    if (!session && !inAuth && !isPublicShareRoute) {
      router.replace('/(auth)/login')
    } else if (session && inAuth) {
      router.replace('/(tabs)')
    }
  }, [session, loading, segments, router])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>{t('app.loading')}</Text>
      </View>
    )
  }

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <AuthGuard>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="list/[id]" options={{ headerShown: false }} />
      </Stack>
    </AuthGuard>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  loadingText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
})
