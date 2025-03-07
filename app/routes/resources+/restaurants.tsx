import { z } from 'zod'
import { requireUserId } from '#app/utils/auth.server.ts'
import { searchRestaurants, getPlaceDetails, getWalkingDistance } from '#app/utils/providers/google-places.server.ts'
import { getRestaurants, createRestaurant } from '#app/utils/restaurants.server.ts'

// Schema for search parameters
const searchParamsSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().optional(),
  type: z.string().optional(),
  keyword: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  openNow: z.coerce.boolean().optional(),
})

// Schema for walking distance parameters
const walkingDistanceParamsSchema = z.object({
  originLat: z.coerce.number(),
  originLng: z.coerce.number(),
  destLat: z.coerce.number(),
  destLng: z.coerce.number(),
})

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  switch (action) {
    case 'search': {
      try {
        const searchParams = Object.fromEntries(url.searchParams.entries())
        const { lat, lng, radius, type, keyword, minPrice, maxPrice, openNow } = searchParamsSchema.parse(searchParams)
        
        const restaurants = await searchRestaurants({
          lat,
          lng,
          radius,
          type,
          keyword,
          minPrice,
          maxPrice,
          openNow,
        })
        
        return { restaurants }
      } catch (error) {
        console.error('Error searching restaurants:', error)
        throw new Response(JSON.stringify({ error: 'Failed to search restaurants' }), {
          status: 400
        })
      }
    }
    
    case 'details': {
      try {
        const placeId = url.searchParams.get('placeId')
        if (!placeId) {
          throw new Response(JSON.stringify({ error: 'Place ID is required' }), {
            status: 400
          })
        }
        
        const details = await getPlaceDetails(placeId)
        return { details }
      } catch (error) {
        console.error('Error fetching restaurant details:', error)
        throw new Response(JSON.stringify({ error: 'Failed to fetch restaurant details' }), {
          status: 400
        })
      }
    }
    
    case 'walking-distance': {
      try {
        const distanceParams = Object.fromEntries(url.searchParams.entries())
        const { originLat, originLng, destLat, destLng } = walkingDistanceParamsSchema.parse(distanceParams)
        
        const distance = await getWalkingDistance(originLat, originLng, destLat, destLng)
        return { distance }
      } catch (error) {
        console.error('Error calculating walking distance:', error)
        throw new Response(JSON.stringify({ error: 'Failed to calculate walking distance' }), {
          status: 400
        })
      }
    }
    
    case 'list': {
      try {
        const restaurants = await getRestaurants()
        return { restaurants }
      } catch (error) {
        console.error('Error listing restaurants:', error)
        throw new Response(JSON.stringify({ error: 'Failed to list restaurants' }), {
          status: 500
        })
      }
    }
    
    default:
      throw new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400
      })
  }
}

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    throw new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405
    })
  }
  
  try {
    const formData = await request.formData()
    const action = formData.get('action')
    
    switch (action) {
      case 'create': {
        const placeId = formData.get('placeId')
        if (!placeId || typeof placeId !== 'string') {
          throw new Response(JSON.stringify({ error: 'Place ID is required' }), {
            status: 400
          })
        }
        
        // Get place details from Google Places API
        const placeDetails = await getPlaceDetails(placeId)
        
        // Create restaurant in our database
        const restaurant = await createRestaurant({
          name: placeDetails.name,
          address: placeDetails.vicinity,
          cuisineType: placeDetails.types?.[0] || 'restaurant',
          priceLevel: placeDetails.price_level || 1,
          rating: placeDetails.rating || 0,
          lat: placeDetails.geometry.location.lat,
          lng: placeDetails.geometry.location.lng,
          photoUrl: placeDetails.photos?.[0]?.photo_reference 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${placeDetails.photos[0].photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
            : null,
          mapsUrl: placeDetails.url || null,
          websiteUrl: placeDetails.website || null,
        })
        
        return { restaurant }
      }
      
      default:
        throw new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400
        })
    }
  } catch (error) {
    console.error('Error processing restaurant action:', error)
    throw new Response(JSON.stringify({ error: 'Failed to process restaurant action' }), {
      status: 500
    })
  }
} 