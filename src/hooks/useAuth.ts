import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { signOutGuest, signOut } from '../services/auth'

export interface AuthState {
  session: Session | null
  userId: string | null
  isGuest: boolean
  loading: boolean
  signOut: () => Promise<void>
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [guestId, setGuestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const handleSignOut = useCallback(async () => {
    if (guestId) {
      await signOutGuest()
      setGuestId(null)
      setSession(null)
    } else {
      await signOut()
      setSession(null)
    }
  }, [guestId])

  useEffect(() => {
    let mounted = true
    const fallback = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 5000)

    Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem('guestUserId'),
    ])
      .then(([{ data }, guest]) => {
        if (!mounted) return
        setSession(data.session)
        setGuestId(guest)
        setLoading(false)
        clearTimeout(fallback)
      })
      .catch(() => {
        if (!mounted) return
        setLoading(false)
        clearTimeout(fallback)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => {
      mounted = false
      clearTimeout(fallback)
      sub.subscription.unsubscribe()
    }
  }, [])

  return {
    session,
    userId: session?.user?.id ?? guestId,
    isGuest: !!guestId && !session?.user,
    loading,
    signOut: handleSignOut,
  }
}
