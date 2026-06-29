import { edgeFunctionUrl, googleMapsApiKey, hasGoogleMapsKey, supabaseAnonKey } from './config'
import { supabase } from './supabase'

export interface PlaceSearchResult {
  googlePlaceId: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  heroPhotoUrl: string | null
}

export interface PlaceDetailsResult {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  primaryTypeDisplayName?: { text?: string }
  googleHeroPhotoUrl?: string | null
}

interface RawPlace {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  photos?: Array<{ name: string }>
}

// photo resource name → media URL (only used in direct-call fallback)
export function buildPhotoUrl(photoName: string, maxWidthPx = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${googleMapsApiKey}`
}

export async function searchPlaces(
  query: string,
  locationBias?: { latitude: number; longitude: number },
  sessionToken?: string,
  languageCode?: string
): Promise<PlaceSearchResult[]> {
  if (!query.trim()) return []

  // Prefer Edge Function (keeps API key server-side)
  if (edgeFunctionUrl && supabaseAnonKey) {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      const res = await fetch(`${edgeFunctionUrl}/places-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
        },
        body: JSON.stringify({
          query,
          locationBias: locationBias ?? null,
          sessionToken: sessionToken ?? null,
          languageCode: languageCode ?? 'ko',
        }),
      })
      if (res.ok) {
        const items = (await res.json()) as Array<
          PlaceSearchResult & { googlePhotoName?: string | null }
        >
        // Edge Function이 photo URL을 해석하지 못한 항목은 클라이언트 키로 보완
        return items.map((item) => ({
          ...item,
          heroPhotoUrl:
            item.heroPhotoUrl ??
            (item.googlePhotoName && hasGoogleMapsKey
              ? buildPhotoUrl(item.googlePhotoName, 512)
              : null),
        }))
      }

      const bodyText = await res.text().catch(() => '')
      throw new Error(`EDGE_PLACES_SEARCH_FAILED: ${res.status} ${bodyText}`)
    } catch (error) {
      // In production we should not fall back to direct client Google API calls,
      // because mobile key restrictions can produce misleading Android-blocked errors.
      if (hasGoogleMapsKey) {
        throw error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  // Fallback: direct client call (dev / Edge Function not deployed)
  if (!hasGoogleMapsKey) {
    throw new Error('NO_GOOGLE_MAPS_KEY')
  }

  // NOTE: places:searchText 는 sessionToken 필드를 지원하지 않음 (Autocomplete 전용).
  // body에 넣으면 400 INVALID_ARGUMENT 발생.
  const body: Record<string, unknown> = { textQuery: query, languageCode: languageCode ?? 'ko' }
  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.latitude, longitude: locationBias.longitude },
        radius: 10000,
      },
    }
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsApiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.photos',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(`Places search failed: ${res.status} ${bodyText}`)
  }

  const json = (await res.json()) as { places?: RawPlace[] }
  const places = json.places ?? []

  return places
    .filter((p) => p.location)
    .map((p) => ({
      googlePlaceId: p.id,
      name: p.displayName?.text ?? '(이름 없음)',
      address: p.formattedAddress ?? null,
      latitude: p.location!.latitude,
      longitude: p.location!.longitude,
      heroPhotoUrl: p.photos?.[0]?.name ? buildPhotoUrl(p.photos[0].name) : null,
    }))
}

export async function fetchPlaceDetails(placeId: string, languageCode?: string): Promise<PlaceDetailsResult | null> {
  if (!placeId.trim() || !edgeFunctionUrl || !supabaseAnonKey) return null

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  const res = await fetch(`${edgeFunctionUrl}/places-details`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
    },
    body: JSON.stringify({ placeId, languageCode: languageCode ?? 'ko' }),
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(`EDGE_PLACES_DETAILS_FAILED: ${res.status} ${bodyText}`)
  }

  return (await res.json()) as PlaceDetailsResult
}
