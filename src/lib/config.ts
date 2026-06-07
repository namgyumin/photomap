import Constants from 'expo-constants'

// app.config.js extra.googleMapsApiKey 에서 읽음. 없으면 빈 문자열.
export const googleMapsApiKey: string =
  (Constants.expoConfig?.extra?.googleMapsApiKey as string | undefined) ??
  (process.env.GOOGLE_MAPS_API_KEY ?? '')

export const hasGoogleMapsKey = googleMapsApiKey.length > 0

export const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
