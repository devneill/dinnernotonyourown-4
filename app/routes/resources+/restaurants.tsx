import { z } from 'zod'
import { type LoaderFunctionArgs } from 'react-router'
import { 
  searchRestaurants,
  getPhotoUrl, 
  DEFAULT_VENUE_LOCATION,
  calculateDistance 
} from '#app/utils/providers/google-places.server.ts'
import { getRestaurantById } from '#app/utils/restaurants.server.ts'
import { prisma } from '#app/utils/db.server.ts'

// Schema for search parameters
const searchParamsSchema = z.object({
  radius: z.coerce.number().optional(),
  type: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  keyword: z.string().optional(),
  forceRefresh: z.coerce.boolean().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  
  try {
    // Parse search parameters
    const searchParams = Object.fromEntries(url.searchParams.entries())
    const params = searchParamsSchema.parse(searchParams)
    
    // Use either user provided location or default venue location
    const userLocation = params.lat && params.lng 
      ? { lat: params.lat, lng: params.lng }
      : DEFAULT_VENUE_LOCATION

    console.log('Restaurant search params:', {
      ...params,
      userLocation
    })

    // Search for restaurants with the provided filters
    const restaurantResults = await searchRestaurants({
      lat: userLocation.lat,
      lng: userLocation.lng,
      radius: params.radius || 16093.4, // Default to 10 miles
      type: params.type,
      keyword: params.keyword,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      minRating: params.minRating
    })

    console.log(`Found ${restaurantResults.length} restaurants from Places API`)
    
    // Print the first result for debugging if available
    if (restaurantResults.length > 0) {
      console.log('First result:', JSON.stringify(restaurantResults[0], null, 2))
    }

    // Process the results and transform to the expected restaurant format
    const restaurants = await Promise.all(restaurantResults.map(async (place, index) => {
      try {
        console.log(`Processing restaurant ${index + 1}/${restaurantResults.length}: ${place.name}`)
        
        // Make sure we have a valid photo URL
        const photoUrl = place.photos && place.photos.length > 0
          ? getPhotoUrl(place.photos[0].photo_reference) 
          : 'https://placehold.co/400x300?text=Restaurant'

        // Handle potentially missing geometry data
        if (!place.geometry || !place.geometry.location) {
          console.warn(`Restaurant ${place.name} is missing geometry data`)
          return null
        }

        // Calculate walking distance if user location is provided
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          place.geometry.location.lat,
          place.geometry.location.lng
        )

        // Calculate walking time (assuming 3mph walking speed)
        const walkingTimeMinutes = Math.round(distance / 3 * 60)

        // Format the restaurant object with fallbacks for all fields
        const restaurant = {
          id: place.place_id || `temp-id-${index}`,
          name: place.name || 'Unknown Restaurant',
          address: place.vicinity || 'Address unavailable',
          cuisineType: place.types && place.types.length > 0 ? place.types[0] : 'Restaurant', 
          priceLevel: typeof place.price_level === 'number' ? place.price_level : 2,
          rating: typeof place.rating === 'number' ? place.rating : 3.0,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          photoUrl,
          mapsUrl: place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : null,
          websiteUrl: place.website || null,
          distance,
          walkingTimeMinutes
        }

        // Store in database only if we have a valid place_id
        if (place.place_id) {
          try {
            void prisma.restaurant.upsert({
              where: { id: place.place_id },
              update: {
                name: place.name || 'Unknown Restaurant',
                address: place.vicinity || 'Address unavailable',
                cuisineType: place.types && place.types.length > 0 ? place.types[0] : 'Restaurant',
                priceLevel: typeof place.price_level === 'number' ? place.price_level : 2,
                rating: typeof place.rating === 'number' ? place.rating : 3.0,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng,
                photoUrl,
                mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
                websiteUrl: place.website || null,
              },
              create: {
                id: place.place_id,
                name: place.name || 'Unknown Restaurant',
                address: place.vicinity || 'Address unavailable',
                cuisineType: place.types && place.types.length > 0 ? place.types[0] : 'Restaurant',
                priceLevel: typeof place.price_level === 'number' ? place.price_level : 2,
                rating: typeof place.rating === 'number' ? place.rating : 3.0,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng,
                photoUrl,
                mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
                websiteUrl: place.website || null,
              },
            })
          } catch (error) {
            console.error(`Error saving restaurant ${place.name} to database:`, error)
          }
        }

        return restaurant
      } catch (error) {
        console.error(`Error processing restaurant at index ${index}:`, error)
        return null
      }
    }))

    // Filter out any null values from failed processing
    const validRestaurants = restaurants.filter(Boolean)
    console.log(`Successfully processed ${validRestaurants.length} restaurants`)

    // Add attendee count information to the restaurants
    const restaurantsWithAttendees = await getRestaurantsWithAttendeeCount()
    const enhancedRestaurants = validRestaurants.map(restaurant => {
      const attendeeInfo = restaurantsWithAttendees.find(r => r.id === restaurant.id)
      return {
        ...restaurant,
        attendeeCount: attendeeInfo?.attendeeCount || 0,
        userIsAttending: Boolean(attendeeInfo?.userIsAttending),
        dinnerGroupId: attendeeInfo?.dinnerGroupId
      }
    })

    console.log(`Returning ${enhancedRestaurants.length} restaurants to client`)
    return { restaurants: enhancedRestaurants }
  } catch (error) {
    console.error('Error fetching restaurants:', error)
    return { 
      restaurants: [],
      error: 'Failed to fetch restaurants. Please try again.'
    }
  }
}

// Get count of attendees for each restaurant dinner group
async function getRestaurantsWithAttendeeCount() {
  // Note: This is a basic implementation that needs to be updated
  // with actual user session handling
  try {
    const dinnerGroups = await prisma.dinnerGroup.findMany({
      include: {
        attendees: true,
      },
    })

    return dinnerGroups.map(group => ({
      id: group.restaurantId,
      attendeeCount: group.attendees.length,
      userIsAttending: false, // To be replaced with actual user check
      dinnerGroupId: group.id
    }))
  } catch (error) {
    console.error('Error getting attendee counts:', error)
    return []
  }
}

// API to join or leave dinners
export async function action({ request }: { request: Request }) {
  const formData = await request.formData()
  const action = formData.get('action')
  const restaurantId = formData.get('restaurantId')

  if (!restaurantId || typeof restaurantId !== 'string') {
    return { success: false, error: 'Restaurant ID is required' }
  }

  // Simulated implementation - would need actual user session handling
  if (action === 'join') {
    // Get or create dinner group
    try {
      const dinnerGroup = await prisma.dinnerGroup.upsert({
        where: { restaurantId },
        update: {},
        create: { restaurantId },
      })

      // Simulated adding current user
      console.log(`User would join dinner at restaurant ${restaurantId}`)
      
      return { success: true, dinnerGroupId: dinnerGroup.id }
    } catch (error) {
      console.error('Error joining dinner:', error)
      return { success: false, error: 'Failed to join dinner' }
    }
  } else if (action === 'leave') {
    // Simulated implementation for leaving
    console.log(`User would leave dinner at restaurant ${restaurantId}`)
    return { success: true }
  }

  return { success: false, error: 'Invalid action' }
} 