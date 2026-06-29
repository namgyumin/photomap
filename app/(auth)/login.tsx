import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { makeRedirectUri } from 'expo-auth-session'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

const ONBOARDING_KEY = 'photomap_onboarding_done'

export default function LoginScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const SLIDES = [
    {
      title: t('onboarding.tagline'),
      subtitle: t('onboarding.desc3'),
      emoji: '🗺️',
    },
    {
      title: t('onboarding.desc1'),
      subtitle: t('onboarding.desc2'),
      emoji: '📸',
    },
  ]
  const params = useLocalSearchParams<{ next?: string }>()
  const paramsRef = useRef<string | undefined>(undefined)
  const [slide, setSlide] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)

  const applySessionFromUrl = useCallback(async (url: string | null | undefined) => {
    if (!url) return false

    const hashPart = url.includes('#')
      ? url.split('#')[1]
      : url.split('?')[1] ?? ''

    if (!hashPart) return false

    const params = new URLSearchParams(hashPart)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) return false

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (error) throw error

    const nextPath = typeof paramsRef.current === 'string' ? paramsRef.current : ''
    if (nextPath) {
      router.replace(nextPath as '/(tabs)' | '/(tabs)/memories' | `/share/${string}`)
    }

    setLoading(false)
    return true
  }, [router])

  useEffect(() => {
    paramsRef.current = typeof params.next === 'string' ? params.next : undefined
  }, [params.next])

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (!done) setShowOnboarding(true)
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => applySessionFromUrl(url))
      .catch(() => {})

    const sub = Linking.addEventListener('url', ({ url }) => {
      void applySessionFromUrl(url).catch((e: unknown) => {
        const err = e as { message?: string }
        Alert.alert(t('auth.loginFail'), err?.message ?? t('common.errorOccurred'))
        setLoading(false)
      })
    })

    return () => {
      sub.remove()
    }
  }, [applySessionFromUrl])

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {})
    setShowOnboarding(false)
  }

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true)
      const redirectTo = makeRedirectUri({ scheme: 'photomap' })
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })
      if (error || !data.url) throw error ?? new Error(t('auth.authUrlFail'))

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      if (result.type === 'success' && result.url) {
        await applySessionFromUrl(result.url)
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      Alert.alert(t('auth.loginFail'), err?.message ?? t('common.errorOccurred'))
    } finally {
      setLoading(false)
    }
  }

  const performGuestSignIn = async () => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInAnonymously()
      if (error) throw error
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; status?: number }
      const isAnonymousDisabled =
        err?.code === 'anonymous_provider_disabled' ||
        err?.status === 422 ||
        err?.message?.includes('Anonymous sign-ins are disabled')

      Alert.alert(
        t('auth.guestLoginFail'),
        isAnonymousDisabled
          ? t('auth.guestDisabled')
          : err?.message ?? t('common.errorOccurred')
      )
    } finally {
      setLoading(false)
    }
  }

  const handleGuestSignIn = () => {
    Alert.alert(
      t('auth.guestStart'),
      t('auth.guestNote'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.continue'), onPress: () => void performGuestSignIn() },
      ]
    )
  }

  if (!ready) return null

  if (showOnboarding) {
    const safeSlide = Math.min(Math.max(slide, 0), SLIDES.length - 1)
    const current = SLIDES[safeSlide] ?? SLIDES[0]
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.slide}>
          <Text style={styles.slideEmoji}>{current.emoji}</Text>
          <Text style={styles.slideTitle}>{current.title}</Text>
          <Text style={styles.slideSubtitle}>{current.subtitle}</Text>
        </View>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === slide && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.onboardingActions}>
          {slide < SLIDES.length - 1 ? (
            <Pressable style={styles.primaryBtn} onPress={() => setSlide((s) => s + 1)}>
              <Text style={styles.primaryBtnText}>{t('common.next')}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={finishOnboarding}>
              <Text style={styles.primaryBtnText}>{t('common.start')}</Text>
            </Pressable>
          )}
          <Pressable onPress={finishOnboarding}>
            <Text style={styles.skipText}>{t('common.skip')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoArea}>
        <Text style={styles.logoEmoji}>📍</Text>
        <Text style={styles.logoTitle}>photoMap</Text>
        <Text style={styles.logoSubtitle}>{t('onboarding.tagline')}</Text>
      </View>

      <View style={styles.authActions}>
        <Pressable style={[styles.googleBtn, loading && styles.disabledBtn]} onPress={handleGoogleSignIn} disabled={loading}>
          <Text style={styles.googleBtnText}>
            {loading ? t('auth.login') : t('auth.continueWithGoogle')}
          </Text>
        </Pressable>

        <Pressable style={[styles.guestBtn, loading && styles.disabledBtn]} onPress={handleGuestSignIn} disabled={loading}>
          <Text style={styles.guestBtnText}>{t('auth.guestStart')}</Text>
        </Pressable>
        <Text style={styles.guestNotice}>
          {t('auth.guestNote')}
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'space-between', padding: 24 },

  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slideEmoji: { fontSize: 80, marginBottom: 32 },
  slideTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    color: '#111',
    marginBottom: 16,
    lineHeight: 36,
  },
  slideSubtitle: { fontSize: 16, color: '#777', textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#1a73e8' },
  onboardingActions: { gap: 12 },

  logoArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 72, marginBottom: 16 },
  logoTitle: { fontSize: 36, fontWeight: '800', color: '#111', marginBottom: 8 },
  logoSubtitle: { fontSize: 16, color: '#777' },

  authActions: { gap: 12, paddingBottom: 8 },
  googleBtn: {
    width: '100%',
    height: 52,
    backgroundColor: '#f1f3f4',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  disabledBtn: { opacity: 0.6 },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: '#333' },
  guestBtn: {
    width: '100%',
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d7dce1',
  },
  guestBtnText: { fontSize: 16, fontWeight: '600', color: '#475569' },
  guestNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 6,
  },

  primaryBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipText: { textAlign: 'center', color: '#999', fontSize: 14, paddingVertical: 8 },
})
