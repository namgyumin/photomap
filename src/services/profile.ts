import { supabase } from '../lib/supabase'

export interface UserProfile {
  id: string
  handle: string
  name: string
  avatar_url: string | null
}

export async function getMyProfile(): Promise<UserProfile | null> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return null
  const { data, error } = await supabase
    .from('users')
    .select('id, handle, name, avatar_url')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as UserProfile | null) ?? null
}

export async function updateMyProfile(fields: {
  name?: string
  avatarUrl?: string | null
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('not authenticated')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.name !== undefined) patch.name = fields.name
  if (fields.avatarUrl !== undefined) patch.avatar_url = fields.avatarUrl

  const { error } = await supabase.from('users').update(patch).eq('id', userId)
  if (error) throw error
}
