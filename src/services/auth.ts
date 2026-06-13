import { supabase } from '../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// 게스트 계정 삭제 + 로그아웃.
// storage 파일은 SQL 로 못 지움 (Supabase 가 storage 테이블 직접 DELETE 차단)
// → Storage API 로 먼저 삭제 후 delete_current_guest_account RPC 호출.
export async function deleteGuestAccountAndSignOut(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('not authenticated')

  const { data: rows, error } = await supabase
    .from('visit_photos')
    .select('storage_path, thumbnail_128, thumbnail_512')
    .eq('uploader_id', userId)
  if (error) throw error

  const paths = (rows ?? [])
    .flatMap((r) => [r.storage_path, r.thumbnail_128, r.thumbnail_512])
    .filter((p): p is string => Boolean(p) && !p!.startsWith('http') && !p!.startsWith('file:'))

  // Storage remove 는 한 번에 너무 많으면 실패할 수 있어 100개씩 분할
  for (let i = 0; i < paths.length; i += 100) {
    const { error: storageErr } = await supabase.storage
      .from('visit-photos')
      .remove(paths.slice(i, i + 100))
    if (storageErr) throw storageErr
  }

  const { error: rpcErr } = await supabase.rpc('delete_current_guest_account')
  if (rpcErr) throw rpcErr

  await supabase.auth.signOut({ scope: 'local' })
}

export async function signOutGuest(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem('guestSession'),
      AsyncStorage.removeItem('guestUserId'),
    ])
  } catch (e) {
    console.error('Guest logout error:', e)
    throw e
  }
}

export async function signInAsGuest(): Promise<string> {
  const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  await AsyncStorage.setItem('guestUserId', guestId)
  await AsyncStorage.setItem('guestSession', JSON.stringify({ userId: guestId, createdAt: new Date().toISOString() }))
  return guestId
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function getGuestUserId(): Promise<string | null> {
  return await AsyncStorage.getItem('guestUserId')
}

export async function getUserSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}
