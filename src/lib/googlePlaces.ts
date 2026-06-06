import { edgeFunctionUrl, googleMapsApiKey, hasGoogleMapsKey, supabaseAnonKey } from './config'

export interface PlaceSearchResult {
  googlePlaceId: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  heroPhotoUrl: string | null
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
  locationBias?: { latitude: number; longitude: number }
): Promise<PlaceSearchResult[]> {
  if (!query.trim()) return []

  // Prefer Edge Function (keeps API key server-side)
  if (edgeFunctionUrl && supabaseAnonKey) {
    try {
      const res = await fetch(`${edgeFunctionUrl}/places-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ query, locationBias: locationBias ?? null }),
      })
      if (res.ok) {
        return (await res.json()) as PlaceSearchResult[]
      }
    } catch {
      // Fall through to direct call
    }
  }

  // Fallback: direct client call (dev / Edge Function not deployed)
  if (!hasGoogleMapsKey) {
    throw new Error('NO_GOOGLE_MAPS_KEY')
  }

  const body: Record<string, unknown> = { textQuery: query, languageCode: 'ko' }
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
