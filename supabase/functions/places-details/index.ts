// Supabase Edge Function: places-details
// Returns Google Places (New) details for a single place ID.
// Requires GOOGLE_MAPS_API_KEY env var set in Supabase Edge Function secrets.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
          'id,displayName,formattedAddress,location,regularOpeningHours,internationalPhoneNumber,websiteUri',
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

    const place = await res.json()
    return new Response(JSON.stringify(place), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
