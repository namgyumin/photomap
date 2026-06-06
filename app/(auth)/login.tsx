import AsyncStorage from '@react-native-async-storage/async-storage'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

const ONBOARDING_KEY = 'photomap_onboarding_done'

const SLIDES = [
  {
    title: '오늘 간 곳을\n지도에 남겨요',
    subtitle: '검색으로 장소를 찾고 내 기록으로 저장해요',
    emoji: '🗺️',
  },
  {
    title: '사진과 함께\n내 기록을 만들어요',
    subtitle: '찍은 사진을 장소마다 모아두어요',
    emoji: '📸',
  },
  {
    title: '친구와\n기록을 공유해요',
    subtitle: '내가 다녀온 곳을 링크로 쉽게 공유해요',
    emoji: '🔗',
  },
]

export default function LoginScreen() {
  const [slide, setSlide] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (!done) setShowOnboarding(true)
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {})
    setShowOnboarding(false)
  }

  const handleAppleSignIn = async () => {
    try {
      setLoading(true)
      const rawNonce = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      )
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      })
      if (!credential.identityToken) throw new Error('Apple 인증 토큰을 받지 못했어요.')
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      })
      if (error) throw error
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('로그인 실패', err?.message ?? '오류가 발생했어요.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'photomap://',
          skipBrowserRedirect: true,
        },
      })
      if (error || !data.url) throw error ?? new Error('인증 URL을 가져오지 못했어요.')

      const result = await WebBrowser.openAuthSessionAsync(data.url, 'photomap://')

      if (result.type === 'success' && result.url) {
        const hashPart = result.url.includes('#')
          ? result.url.split('#')[1]
          : result.url.split('?')[1] ?? ''
        const params = new URLSearchParams(hashPart)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessErr) throw sessErr
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      Alert.alert('로그인 실패', err?.message ?? '오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return null

  if (showOnboarding) {
    const current = SLIDES[slide]
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
              <Text style={styles.primaryBtnText}>다음</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={finishOnboarding}>
              <Text style={styles.primaryBtnText}>시작하기</Text>
            </Pressable>
          )}
          <Pressable onPress={finishOnboarding}>
            <Text style={styles.skipText}>건너뛰기</Text>
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
        <Text style={styles.logoSubtitle}>오늘 간 곳을 지도에 남기세요</Text>
      </View>

      <View style={styles.authActions}>
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
        )}

        <Pressable style={[styles.googleBtn, loading && styles.disabledBtn]} onPress={handleGoogleSignIn} disabled={loading}>
          <Text style={styles.googleBtnText}>
            {loading ? '로그인 중…' : 'Google로 계속하기'}
          </Text>
        </Pressable>
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
  appleBtn: { width: '100%', height: 52 },
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

  primaryBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipText: { textAlign: 'center', color: '#999', fontSize: 14, paddingVertical: 8 },
})
