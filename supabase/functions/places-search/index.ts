// Supabase Edge Function: places-search
// Proxies Google Places API (New) text search.
// Requires GOOGLE_MAPS_API_KEY env var set in Supabase Edge Function secrets.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { checkRateLimit, getClientIp } from '../_shared/rateLimiter.ts'

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchRequest {
  query: string
  locationBias?: { latitude: number; longitude: number } | null
}

interface PlaceResult {
  googlePlaceId: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  heroPhotoUrl: string | null
  googlePhotoName: string | null
}

// 사진 media URL 해석 (skipHttpRedirect → photoUri는 key 없이 접근 가능한 googleusercontent URL)
const MAX_PHOTO_RESOLVE = 8

async function resolvePhotoUri(photoName: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=512&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': apiKey } }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { photoUri?: string }
    return json.photoUri ?? null
  } catch {
    return null
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const ip = getClientIp(req)
  const { allowed, retryAfter } = checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    })
  }

  try {
    const { query, locationBias } = (await req.json()) as SearchRequest

    if (!query?.trim()) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    console.log('[places-search] apiKey exists:', !!apiKey, 'length:', apiKey?.length)
    if (!apiKey || !apiKey.trim()) {
      return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not configured or empty' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: 'ko',
    }

    if (locationBias) {
      body.locationBias = {
        circle: {
          center: { latitude: locationBias.latitude, longitude: locationBias.longitude },
          radius: 10000,
        },
      }
    }

    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.set('X-Goog-Api-Key', apiKey)
    headers.set('X-Goog-FieldMask', 'places.id,places.displayName,places.formattedAddress,places.location,places.photos')

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const txt = await res.text()
      return new Response(JSON.stringify({ error: `Places API: ${res.status} ${txt}` }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = (await res.json()) as {
      places?: Array<{
        id: string
        displayName?: { text?: string }
        formattedAddress?: string
        location?: { latitude: number; longitude: number }
        photos?: Array<{ name: string }>
      }>
    }

    const places: PlaceResult[] = (json.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        googlePlaceId: p.id,
        name: p.displayName?.text ?? '(이름 없음)',
        address: p.formattedAddress ?? null,
        latitude: p.location!.latitude,
        longitude: p.location!.longitude,
        heroPhotoUrl: null as string | null,
        googlePhotoName: p.photos?.[0]?.name ?? null,
      }))

    // 상위 결과의 hero photo URL을 서버에서 해석 (API key 클라이언트 노출 방지)
    await Promise.all(
      places.slice(0, MAX_PHOTO_RESOLVE).map(async (place) => {
        if (place.googlePhotoName) {
          place.heroPhotoUrl = await resolvePhotoUri(place.googlePhotoName, apiKey)
        }
      })
    )

    return new Response(JSON.stringify(places), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
