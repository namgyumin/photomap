// Supabase Edge Function: places-details
// Returns Google Places (New) details for a single place ID.
// Requires GOOGLE_MAPS_API_KEY env var set in Supabase Edge Function secrets.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { checkRateLimit, getClientIp } from '../_shared/rateLimiter.ts'

const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { placeId } = (await req.json()) as { placeId: string }

    if (!placeId?.trim()) {
      return new Response(JSON.stringify({ error: 'placeId required' }), {
        status: 400,
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

    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'id,displayName,formattedAddress,location,regularOpeningHours,internationalPhoneNumber,websiteUri,photos,rating,userRatingCount,primaryTypeDisplayName',
        'Accept-Language': 'ko',
      },
    })

    if (!res.ok) {
      const txt = await res.text()
      return new Response(JSON.stringify({ error: `Places API: ${res.status} ${txt}` }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const place = await res.json() as {
      photos?: Array<{ name: string }>
      [key: string]: unknown
    }

    // 첫 번째 photo media URL fetch (서버에서 처리해 API key 노출 방지)
    let googleHeroPhotoUrl: string | null = null
    const photoName = place.photos?.[0]?.name
    if (photoName) {
      try {
        const mediaRes = await fetch(
          `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
          { headers: { 'X-Goog-Api-Key': apiKey } }
        )
        if (mediaRes.ok) {
          const mediaJson = await mediaRes.json() as { photoUri?: string }
          googleHeroPhotoUrl = mediaJson.photoUri ?? null
        }
      } catch {
        // photo fetch 실패해도 기본 정보는 반환
      }
    }

    return new Response(JSON.stringify({ ...place, googleHeroPhotoUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
