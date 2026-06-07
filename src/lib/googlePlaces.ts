import { googleMapsApiKey, hasGoogleMapsKey } from './config'

// Places API (New) - Text Search
// https://places.googleapis.com/v1/places:searchText
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

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

// photo resource name → media URL
export function buildPhotoUrl(photoName: string, maxWidthPx = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${googleMapsApiKey}`
}

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  if (!hasGoogleMapsKey) {
    throw new Error('NO_GOOGLE_MAPS_KEY')
  }
  if (!query.trim()) return []

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleMapsApiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.photos',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'ko' }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Places search failed: ${res.status} ${body}`)
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
