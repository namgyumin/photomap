import { supabase } from '../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
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
