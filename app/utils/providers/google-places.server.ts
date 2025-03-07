import { z } from 'zod'
import { cache } from '../cache.server.ts'

// Define the response schema for Google Places API
const googlePlacesRestaurantSchema = z.object({
  place_id: z.string(),
  name: z.string(),
  vicinity: z.string(), // address
  types: z.array(z.string()),
  price_level: z.number().optional(),
  rating: z.number().optional(),
  geometry: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
  photos: z
    .array(
      z.object({
        photo_reference: z.string(),
        height: z.number(),
        width: z.number(),
      }),
    )
    .optional(),
  website: z.string().optional(),
  url: z.string().optional(), // Google Maps URL
})

const googlePlacesResponseSchema = z.object({
  results: z.array(googlePlacesRestaurantSchema),
  status: z.string(),
  next_page_token: z.string().optional(),
})

type GooglePlacesRestaurant = z.infer<typeof googlePlacesRestaurantSchema>

// Function to get photo URL from photo reference
export function getPhotoUrl(photoReference: string, maxWidth = 400) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
}

// Function to search for restaurants near a location
export async function searchRestaurants({
  lat,
  lng,
  radius = 1500, // Default 1.5km radius
  type = 'restaurant',
  keyword = '',
  minPrice,
  maxPrice,
  openNow = true,
}: {
  lat: number
  lng: number
  radius?: number
  type?: string
  keyword?: string
  minPrice?: number
  maxPrice?: number
  openNow?: boolean
}) {
  // Create a cache key based on the search parameters
  const cacheKey = `places-search:${lat}-${lng}-${radius}-${type}-${keyword}-${minPrice}-${maxPrice}-${openNow}`

  // Try to get from cache first
  const cachedResults = await cache.get(cacheKey)
  if (cachedResults) {
    return cachedResults.value as GooglePlacesRestaurant[]
  }

  // Build the URL with query parameters
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  url.searchParams.append('location', `${lat},${lng}`)
  url.searchParams.append('radius', radius.toString())
  url.searchParams.append('type', type)
  if (keyword) url.searchParams.append('keyword', keyword)
  if (minPrice !== undefined) url.searchParams.append('minprice', minPrice.toString())
  if (maxPrice !== undefined) url.searchParams.append('maxprice', maxPrice.toString())
  if (openNow) url.searchParams.append('opennow', 'true')
  url.searchParams.append('key', process.env.GOOGLE_PLACES_API_KEY)

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`)
    }

    const data = await response.json()
    const parsedData = googlePlacesResponseSchema.parse(data)

    // Cache the results for 1 hour
    await cache.set(cacheKey, {
      metadata: { createdTime: Date.now() },
      value: parsedData.results,
    })

    return parsedData.results
  } catch (error) {
    console.error('Error fetching restaurants from Google Places API:', error)
    throw error
  }
}

// Function to get details for a specific place
export async function getPlaceDetails(placeId: string) {
  // Create a cache key based on the place ID
  const cacheKey = `place-details:${placeId}`

  // Try to get from cache first
  const cachedDetails = await cache.get(cacheKey)
  if (cachedDetails) {
    return cachedDetails.value
  }

  // Build the URL with query parameters
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.append('place_id', placeId)
  url.searchParams.append('fields', 'name,vicinity,type,price_level,rating,geometry,photos,website,url')
  url.searchParams.append('key', process.env.GOOGLE_PLACES_API_KEY)

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`)
    }

    const data = await response.json() as { result: unknown }
    
    // Cache the results for 1 day
    await cache.set(cacheKey, {
      metadata: { createdTime: Date.now() },
      value: data.result,
    })

    return data.result
  } catch (error) {
    console.error('Error fetching place details from Google Places API:', error)
    throw error
  }
}

// Function to calculate walking distance and time between two points
export async function getWalkingDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
) {
  // Create a cache key based on the coordinates
  const cacheKey = `walking-distance:${originLat}-${originLng}-${destLat}-${destLng}`

  // Try to get from cache first
  const cachedDistance = await cache.get(cacheKey)
  if (cachedDistance) {
    return cachedDistance.value
  }

  // Build the URL with query parameters
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.append('origins', `${originLat},${originLng}`)
  url.searchParams.append('destinations', `${destLat},${destLng}`)
  url.searchParams.append('mode', 'walking')
  url.searchParams.append('key', process.env.GOOGLE_PLACES_API_KEY)

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`Google Distance Matrix API error: ${response.statusText}`)
    }

    const data = await response.json() as { rows: Array<{ elements: Array<{ distance: unknown; duration: unknown }> }> }
    
    if (!data.rows?.[0]?.elements?.[0]) {
      throw new Error('Invalid response from Google Distance Matrix API')
    }
    
    const result = {
      distance: data.rows[0].elements[0].distance,
      duration: data.rows[0].elements[0].duration,
    }

    // Cache the results for 1 day
    await cache.set(cacheKey, {
      metadata: { createdTime: Date.now() },
      value: result,
    })

    return result
  } catch (error) {
    console.error('Error fetching walking distance from Google Distance Matrix API:', error)
    throw error
  }
} 