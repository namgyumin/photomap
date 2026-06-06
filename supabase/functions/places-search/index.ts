// Supabase Edge Function: places-search
// Proxies Google Places API (New) text search.
// Requires GOOGLE_MAPS_API_KEY env var set in Supabase Edge Function secrets.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
  heroPhotoUrl: null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, locationBias } = (await req.json()) as SearchRequest

    if (!query?.trim()) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not configured' }), {
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

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location',
      },
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
        heroPhotoUrl: null,
      }))

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
