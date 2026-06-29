import { useTranslation } from 'react-i18next'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { makeRedirectUri } from 'expo-auth-session'
import { useFocusEffect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/hooks/useAuth'
import { pickAndUploadAvatar } from '../../src/lib/media'
import { supabase } from '../../src/lib/supabase'
import { setLanguage } from '../../src/i18n'
import { deleteGuestAccountAndSignOut } from '../../src/services/auth'
import { getMyProfile, updateMyProfile, type UserProfile } from '../../src/services/profile'

WebBrowser.maybeCompleteAuthSession()

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language === 'ko' ? 'ko' : 'en'
  const { session, userId } = useAuth()
  const user = session?.user
  const isGuest = Boolean(user?.is_anonymous)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [editVisible, setEditVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [linking, setLinking] = useState(false)

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    try {
      setProfile(await getMyProfile())
    } catch {
      // 프로필 로드 실패는 치명적이지 않음 — auth metadata fallback 사용
    }
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      void loadProfile()
    }, [loadProfile])
  )

  const openEdit = () => {
    setEditName(profile?.name ?? displayName)
    setEditAvatarUrl(profile?.avatar_url ?? null)
    setEditVisible(true)
  }

  const handlePickAvatar = async () => {
    if (!userId) return
    setUploadingAvatar(true)
    try {
      const url = await pickAndUploadAvatar(userId)
      if (url) setEditAvatarUrl(url)
    } catch (e) {
      const msg = (e as Error).message
      Alert.alert(
        t('media.uploadFail'),
        msg === 'PERMISSION_DENIED' ? t('media.photoPermission') : msg
      )
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    const name = editName.trim()
    if (!name) {
      Alert.alert(t('auth.nicknameRequired'), t('auth.nicknamePlaceholder'))
      return
    }
    setSavingProfile(true)
    try {
      await updateMyProfile({ name, avatarUrl: editAvatarUrl })
      await loadProfile()
      setEditVisible(false)
    } catch (e) {
      Alert.alert(t('place.saveFail'), String((e as Error).message))
    } finally {
      setSavingProfile(false)
    }
  }

  // 게스트 → Google 계정 연결 (데이터 유지한 채 영구 계정 전환)
  const handleLinkGoogle = async () => {
    setLinking(true)
    try {
      const redirectTo = makeRedirectUri({ scheme: 'photomap' })
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error || !data?.url) throw error ?? new Error(t('auth.authUrlFail'))

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      if (result.type === 'success' && result.url) {
        const hashPart = result.url.includes('#')
          ? result.url.split('#')[1]
          : result.url.split('?')[1] ?? ''
        const tokens = new URLSearchParams(hashPart)
        const errDesc = tokens.get('error_description') ?? tokens.get('error')
        if (errDesc) throw new Error(decodeURIComponent(errDesc.replace(/\+/g, ' ')))
        const accessToken = tokens.get('access_token')
        const refreshToken = tokens.get('refresh_token')
        if (accessToken && refreshToken) {
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionErr) throw sessionErr
        }
        await supabase.auth.refreshSession()
        Alert.alert(t('auth.linkDone'), t('profile.googleLinked'))
      }
    } catch (e) {
      Alert.alert(t('auth.linkFail'), String((e as Error).message))
    } finally {
      setLinking(false)
    }
  }

  const handleLogout = () => {
    const message = isGuest
      ? t('profile.guestLogoutWarn')
      : t('auth.logoutConfirm')

    Alert.alert(t('auth.logout'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.logout'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (isGuest) {
              await deleteGuestAccountAndSignOut()
            } else {
              await supabase.auth.signOut()
            }
          } catch (err) {
            Alert.alert(t('common.error'), (err as Error).message)
          }
        },
      },
    ])
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.emptyText}>{t('profile.loginRequired')}</Text>
      </SafeAreaView>
    )
  }

  const displayName =
    profile?.name ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    userId ??
    t('place.user')
  const avatarUrl = profile?.avatar_url ?? null
  const email = user.email ?? ''
  const initial = displayName.charAt(0).toUpperCase()
  const accountLabel = isGuest ? t('auth.guestNote') : t('auth.normalAccount')

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.profile}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.accountLabel}>{accountLabel}</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={openEdit}>
          <Text style={styles.actionText}>{t('profile.editProfile')}</Text>
        </Pressable>
        {isGuest && (
          <Pressable style={styles.actionBtn} onPress={handleLinkGoogle} disabled={linking}>
            {linking ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={styles.actionText}>{t('profile.linkGoogle')}</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.languageRow}>
        <Text style={styles.languageLabel}>{t('profile.language')}</Text>
        <View style={styles.languageBtns}>
          <Pressable
            style={[styles.langBtn, currentLang === 'ko' && styles.langBtnActive]}
            onPress={() => setLanguage('ko')}
          >
            <Text style={[styles.langBtnText, currentLang === 'ko' && styles.langBtnTextActive]}>
              {t('profile.languageKo')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.langBtn, currentLang === 'en' && styles.langBtnActive]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langBtnText, currentLang === 'en' && styles.langBtnTextActive]}>
              {t('profile.languageEn')}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t('auth.logout')}</Text>
      </Pressable>

      {/* 프로필 수정 모달 */}
      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('profile.editProfile')}</Text>

            <Pressable style={styles.modalAvatarWrap} onPress={handlePickAvatar} disabled={uploadingAvatar}>
              {editAvatarUrl ? (
                <Image source={{ uri: editAvatarUrl }} style={styles.modalAvatar} />
              ) : (
                <View style={[styles.modalAvatar, styles.modalAvatarEmpty]}>
                  <Text style={styles.modalAvatarInitial}>{initial}</Text>
                </View>
              )}
              {uploadingAvatar ? (
                <ActivityIndicator style={styles.modalAvatarBadge} size="small" />
              ) : (
                <View style={styles.modalAvatarBadge}>
                  <Text style={styles.modalAvatarBadgeText}>{t('profile.changePhoto')}</Text>
                </View>
              )}
            </Pressable>

            <TextInput
              style={styles.modalInput}
              placeholder={t('auth.nickname')}
              value={editName}
              onChangeText={setEditName}
              maxLength={30}
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditVisible(false)}>
                <Text style={styles.modalBtnCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSaveProfile}
                disabled={savingProfile || uploadingAvatar}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>{t('common.save')}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  avatarImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 16, backgroundColor: '#eee' },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 6 },
  accountLabel: { fontSize: 13, color: '#1a73e8', marginBottom: 6, fontWeight: '600' },
  email: { fontSize: 14, color: '#888' },
  actions: { gap: 10 },
  actionBtn: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionText: { fontSize: 15, fontWeight: '600', color: '#222' },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  languageLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  languageBtns: { flexDirection: 'row', gap: 8 },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
  },
  langBtnActive: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  langBtnText: { fontSize: 14, fontWeight: '600', color: '#555' },
  langBtnTextActive: { color: '#fff' },
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 20 },
  modalAvatarWrap: { alignItems: 'center', marginBottom: 20 },
  modalAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#eee' },
  modalAvatarEmpty: {
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarInitial: { fontSize: 36, fontWeight: '700', color: '#fff' },
  modalAvatarBadge: { marginTop: 8 },
  modalAvatarBadgeText: { fontSize: 13, fontWeight: '600', color: '#1a73e8' },
  modalInput: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 20,
  },
  modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: { backgroundColor: '#f0f0f0' },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600', color: '#555' },
  modalBtnSave: { backgroundColor: '#1a73e8' },
  modalBtnSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
