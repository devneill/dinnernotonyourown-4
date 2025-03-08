import { useState, useEffect } from 'react'
import { 
  redirect, 
  Form, 
  useLoaderData,
  useFetcher,
  useNavigation, 
  type LoaderFunctionArgs, 
  type ActionFunctionArgs 
} from 'react-router'
import { CountdownTimer } from '#app/components/countdown-timer'
import { RestaurantList } from '#app/components/restaurant-list'
import { RestaurantMap } from '#app/components/restaurant-map'
import { Button } from '#app/components/ui/button'
import { PageHeader } from '#app/components/ui/page-header'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { 
  useGeolocation, 
  DEFAULT_LOCATION,
  calculateDistance
} from '#app/utils/geolocation'
import { type loader as restaurantsLoader } from '#app/routes/resources+/restaurants'

// Dinner time - 7:00 PM today
const getDinnerTime = () => {
  const today = new Date()
  today.setHours(19, 0, 0, 0) // 7:00 PM
  return today
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request)
  const user = await prisma.user.findUnique({
    select: { id: true, name: true, username: true },
    where: { username: params.username },
  })

  if (!user) {
    throw new Response('Not Found', { status: 404 })
  }

  // Ensure the user can only access their own dashboard
  if (user.id !== userId) {
    throw redirect(`/users/${params.username}`)
  }

  // Get URL params for filtering
  const url = new URL(request.url)
  const viewMode = url.searchParams.get('viewMode') || 'list'
  const distanceFilter = Number(url.searchParams.get('distance') || 10)
  const ratingFilter = Number(url.searchParams.get('rating') || 0)
  const priceRangeFilter = Number(url.searchParams.get('priceRange') || 0)
  const cuisineTypeFilter = url.searchParams.get('cuisineType') || ''

  // Fetch user's current dinner group directly from database
  const attendee = await prisma.attendee.findFirst({
    where: { userId },
    include: {
      dinnerGroup: true
    }
  })

  const currentDinnerGroup = attendee?.dinnerGroup || null

  return {
    user,
    currentDinnerGroup,
    filters: {
      viewMode,
      distance: distanceFilter,
      rating: ratingFilter,
      priceRange: priceRangeFilter,
      cuisineType: cuisineTypeFilter
    },
    venueLocation: DEFAULT_LOCATION // The venue's static location as a fallback
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request)
  const formData = await request.formData()
  const intent = formData.get('intent')
  
  if (intent === 'join-dinner') {
    const restaurantId = formData.get('restaurantId')
    if (!restaurantId || typeof restaurantId !== 'string') {
      return { error: 'Restaurant ID is required' }
    }
    
    // Check if a dinner group already exists for this restaurant
    let dinnerGroupId: string
    
    const existingGroup = await prisma.dinnerGroup.findFirst({
      where: { restaurantId }
    })
    
    if (existingGroup) {
      dinnerGroupId = existingGroup.id
    } else {
      // Create a new dinner group if none exists
      const newGroup = await prisma.dinnerGroup.create({
        data: {
          restaurantId,
          notes: ''
        }
      })
      dinnerGroupId = newGroup.id
    }
    
    // Check if user is already in another dinner group
    const existingAttendee = await prisma.attendee.findFirst({
      where: { userId }
    })
    
    if (existingAttendee) {
      // If user is already in a dinner group, update it
      await prisma.attendee.update({
        where: { id: existingAttendee.id },
        data: { dinnerGroupId }
      })
    } else {
      // Otherwise create a new attendee record
      await prisma.attendee.create({
        data: {
          userId,
          dinnerGroupId
        }
      })
    }
    
    return { success: true }
  }
  
  if (intent === 'leave-dinner') {
    // Find and delete the user's attendee record
    await prisma.attendee.deleteMany({
      where: { userId }
    })
    
    return { success: true }
  }
  
  return { error: 'Unknown intent' }
}

export default function Dashboard() {
  const { 
    filters: initialFilters, 
    currentDinnerGroup,
    venueLocation
  } = useLoaderData<typeof loader>()
  
  const [viewMode, setViewMode] = useState(initialFilters.viewMode)
  const [filters, setFilters] = useState(initialFilters)
  const navigation = useNavigation()
  const dinnerFetcher = useFetcher()
  const restaurantsFetcher = useFetcher<typeof restaurantsLoader>()
  
  // State for location handling
  const [userLocation, setUserLocation] = useState(venueLocation)
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [isUsingDefaultLocation, setIsUsingDefaultLocation] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Get user location on component mount
  useEffect(() => {
    const getUserLocation = () => {
      if (!navigator.geolocation) {
        setLocationError('Geolocation is not supported by your browser')
        return
      }
      
      setIsLoadingLocation(true)
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          console.log('Got user location:', latitude, longitude)
          setUserLocation({ lat: latitude, lng: longitude })
          setIsUsingDefaultLocation(false)
          setIsLoadingLocation(false)
          
          // Fetch restaurants with user location
          const searchParams = new URLSearchParams()
          searchParams.set('lat', String(latitude))
          searchParams.set('lng', String(longitude))
          
          // Use 10 miles as default if distance is 0 or not specified
          const radiusInMeters = filters.distance > 0 
            ? filters.distance * 1609.34  // convert miles to meters
            : 16093.4  // 10 miles in meters
          searchParams.set('radius', radiusInMeters.toString())
          
          // Only add price filter if it's non-zero
          if (filters.priceRange > 0) {
            searchParams.set('maxPrice', String(filters.priceRange))
          }
          
          // Only add rating filter if it's non-zero
          if (filters.rating > 0) {
            searchParams.set('minRating', String(filters.rating))
          }
          
          if (filters.cuisineType) {
            searchParams.set('keyword', filters.cuisineType)
          }
          
          void restaurantsFetcher.load(`/resources/restaurants?${searchParams.toString()}`)
        },
        (error) => {
          console.error('Geolocation error:', error)
          setIsUsingDefaultLocation(true)
          
          let errorMessage = 'Error getting location'
          
          // Provide more specific error messages
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied. Please enable location services.'
              break
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.'
              break
            case error.TIMEOUT:
              errorMessage = 'Location request timed out.'
              break
            default:
              errorMessage = `Error getting location: ${error.message}`
          }
          
          setLocationError(errorMessage)
          setIsLoadingLocation(false)
          
          // Load restaurants with default location
          void fetchRestaurantsWithCurrentFilters(venueLocation)
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000,
          maximumAge: 0 
        }
      )
    }
    
    // Only attempt to get location on initial load
    if (isInitialLoad) {
      setIsInitialLoad(false)
      getUserLocation()
    }
  }, [isInitialLoad, filters, venueLocation])
  
  // Function to refresh location
  const handleRefreshLocation = () => {
    setIsLoadingLocation(true)
    setLocationError(null)
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      setIsLoadingLocation(false)
      return
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        console.log('Updated user location:', latitude, longitude)
        setUserLocation({ lat: latitude, lng: longitude })
        setIsUsingDefaultLocation(false)
        setIsLoadingLocation(false)
        
        // Refresh restaurants with new location
        void fetchRestaurantsWithCurrentFilters({ lat: latitude, lng: longitude })
      },
      (error) => {
        console.error('Geolocation error on refresh:', error)
        setLocationError(`Error getting location: ${error.message}`)
        setIsLoadingLocation(false)
      },
      { 
        enableHighAccuracy: true, 
        timeout: 10000,
        maximumAge: 0 
      }
    )
  }
  
  // Fetch restaurants with current filters
  const fetchRestaurantsWithCurrentFilters = (location: { lat: number; lng: number }) => {
    // Create a search params object with all our filters
    const searchParams = new URLSearchParams({
      lat: location.lat.toString(),
      lng: location.lng.toString(),
    })
    
    // Add any non-empty filters
    // Use 10 miles as default if distance is 0 or not specified
    const radiusInMeters = filters.distance > 0 
      ? filters.distance * 1609.34  // convert miles to meters
      : 16093.4  // 10 miles in meters
    searchParams.append('radius', radiusInMeters.toString())
    
    // Only add price filter if it's non-zero
    if (filters.priceRange > 0) {
      searchParams.append('maxPrice', filters.priceRange.toString())
    }
    
    // Only add rating filter if it's non-zero
    if (filters.rating > 0) {
      searchParams.append('minRating', filters.rating.toString())
    }
    
    if (filters.cuisineType) {
      searchParams.append('keyword', filters.cuisineType)
    }
    
    if (filters.forceRefresh) {
      searchParams.append('forceRefresh', 'true')
    }

    // Log what we're fetching
    console.log('Fetching restaurants with filters:', Object.fromEntries(searchParams.entries()))
    
    // Trigger the fetcher to load the data
    void restaurantsFetcher.load(`/resources/restaurants?${searchParams.toString()}`)
  }
  
  // Update URL when filters change (without full page reload)
  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters)
    
    // Update URL
    const formData = new FormData()
    Object.entries(newFilters).forEach(([key, value]) => {
      formData.append(key, String(value))
    })
    const searchParams = new URLSearchParams(formData as any)
    void window.history.pushState(null, '', `?${searchParams.toString()}`)
    
    // Fetch restaurants with new filters
    void fetchRestaurantsWithCurrentFilters(userLocation)
  }
  
  // Function to handle refreshing restaurants
  const handleRefreshRestaurants = () => {
    setIsRefreshing(true)
    
    // Force refresh by setting the flag and fetching with current filters
    const updatedFilters = {...filters, forceRefresh: true}
    setFilters(updatedFilters)
    void fetchRestaurantsWithCurrentFilters(userLocation)
    
    // Reset forceRefresh flag after fetching
    setTimeout(() => {
      setFilters(prev => ({...prev, forceRefresh: false}))
    }, 500)
  }
  
  // Process restaurants from the fetcher
  const getRestaurants = () => {
    // Get restaurants from the fetcher
    const fetcherData = restaurantsFetcher.data?.restaurants || []
    
    console.log('Restaurant data from fetcher:', {
      state: restaurantsFetcher.state,
      hasData: !!restaurantsFetcher.data,
      restaurantCount: fetcherData.length
    })
    
    if (fetcherData.length === 0) {
      console.log('No restaurants in fetcher data')
      return []
    }
    
    return fetcherData
  }
  
  // Get optimistically updated restaurants based on ongoing fetcher action
  const getOptimisticRestaurants = () => {
    const restaurants = getRestaurants()
    
    console.log('In getOptimisticRestaurants, base restaurants:', restaurants.length)
    
    if (restaurants.length === 0) {
      return []
    }
    
    if (dinnerFetcher.formData) {
      const intent = dinnerFetcher.formData.get('intent')
      
      if (intent === 'join-dinner') {
        const restaurantId = dinnerFetcher.formData.get('restaurantId')
        
        // Optimistically update restaurants for the join action
        return restaurants.map(restaurant => ({
          ...restaurant,
          userIsAttending: restaurant.id === restaurantId,
          // Optimistically increment attendee count for the joined restaurant
          attendeeCount: restaurant.id === restaurantId 
            ? (restaurant.attendeeCount || 0) + 1 
            : restaurant.attendeeCount
        }))
      }
      
      if (intent === 'leave-dinner') {
        // Find restaurant user was attending
        const attendingRestaurantId = restaurants.find(r => r.userIsAttending)?.id
        
        // Optimistically update restaurants for the leave action
        return restaurants.map(restaurant => ({
          ...restaurant,
          userIsAttending: false,
          // Optimistically decrement attendee count for the left restaurant
          attendeeCount: restaurant.id === attendingRestaurantId && restaurant.attendeeCount
            ? restaurant.attendeeCount - 1 
            : restaurant.attendeeCount
        }))
      }
    }
    
    return restaurants
  }
  
  // Get the optimistic restaurants
  const optimisticRestaurants = getOptimisticRestaurants()
  
  // Debug information
  useEffect(() => {
    console.log('Current restaurantsFetcher state:', restaurantsFetcher.state)
    console.log('Has restaurants data:', !!restaurantsFetcher.data?.restaurants)
    console.log('Restaurant count:', optimisticRestaurants.length)
    
    if (optimisticRestaurants.length > 0) {
      console.log('First restaurant:', optimisticRestaurants[0])
    }
  }, [restaurantsFetcher.state, restaurantsFetcher.data, optimisticRestaurants.length])
  
  // Handle joining a dinner group
  const handleJoinDinner = (restaurantId: string) => {
    const formData = new FormData()
    formData.append('intent', 'join-dinner')
    formData.append('restaurantId', restaurantId)
    void dinnerFetcher.submit(formData, { method: 'post' })
  }
  
  // Handle leaving a dinner group
  const handleLeaveDinner = () => {
    const formData = new FormData()
    formData.append('intent', 'leave-dinner')
    void dinnerFetcher.submit(formData, { method: 'post' })
  }

  // Check for loading states
  const isPageLoading = navigation.state === 'loading'
  const isRestaurantsLoading = restaurantsFetcher.state === 'loading'
  const isDinnerActionLoading = dinnerFetcher.state !== 'idle'
  const isSomethingLoading = isPageLoading || isRestaurantsLoading || isDinnerActionLoading || isRefreshing
  
  // Flag to track if the application has a Google API key configured
  const isMissingApiKey = restaurantsFetcher.data?.error === 'Failed to fetch restaurants' ||
    restaurantsFetcher.data?.fallback === true

  // Load restaurants on initial load if we don't have location
  useEffect(() => {
    if (!isInitialLoad && restaurantsFetcher.state === 'idle' && !restaurantsFetcher.data) {
      void fetchRestaurantsWithCurrentFilters(userLocation)
    }
    
    // Reset refreshing state when fetch completes
    if (restaurantsFetcher.state === 'idle' && isRefreshing) {
      setIsRefreshing(false)
    }
  }, [isInitialLoad, restaurantsFetcher.state, restaurantsFetcher.data, isRefreshing])

  return (
    <div className="px-2 md:px-6 py-6">
      <PageHeader
        title="Restaurant Discovery"
        subtitle="Find dinner companions in Salt Lake City"
      />
      
      <div className="flex flex-col gap-6">
        {/* Header with countdown timer and filter toggles */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-muted p-4 rounded-lg">
          <div className="text-xl font-semibold">
            <CountdownTimer targetTime={getDinnerTime()} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setViewMode('list')
                setFilters(prev => ({...prev, viewMode: 'list'}))
              }}
              disabled={isSomethingLoading}
            >
              List View
            </Button>
            <Button
              variant={viewMode === 'map' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setViewMode('map')
                setFilters(prev => ({...prev, viewMode: 'map'}))
              }}
              disabled={isSomethingLoading}
            >
              Map View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshRestaurants}
              disabled={isSomethingLoading}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
        
        {/* Location Status Banner */}
        <div className="p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLoadingLocation ? (
              <>
                <span className="text-lg animate-spin">⏳</span>
                <div className="text-sm">Getting your location...</div>
              </>
            ) : locationError ? (
              <>
                <span className="text-lg">⚠️</span>
                <div className="text-sm text-yellow-800">{locationError}</div>
              </>
            ) : isUsingDefaultLocation ? (
              <>
                <span className="text-lg">⚠️</span>
                <div className="text-sm text-yellow-800">
                  Using venue location. Enable location services for personalized walking distances.
                </div>
              </>
            ) : (
              <>
                <span className="text-lg">📍</span>
                <div className="text-sm text-green-800">
                  Using your live location for accurate walking distances.
                </div>
              </>
            )}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshLocation}
            disabled={isLoadingLocation}
          >
            {isUsingDefaultLocation ? 'Use My Location' : 'Update Location'}
          </Button>
        </div>

        {/* API Key Warning Banner (if needed) */}
        {isMissingApiKey && (
          <div className="p-3 rounded-lg flex items-center gap-2 bg-red-50 text-red-800">
            <span className="text-lg">⚠️</span>
            <div className="text-sm">
              Google Places API key is not configured or not working properly. Some data may be unavailable or using fallback values.
            </div>
          </div>
        )}
        
        {/* Filters Form */}
        <Form method="get" className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Hidden inputs for current filters */}
          <input type="hidden" name="viewMode" value={viewMode} />
          
          {/* Distance Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Distance</label>
            <div className="flex flex-wrap gap-2">
              {[0.5, 1, 2, 5, 10].map(distance => (
                <Button
                  key={distance}
                  variant={filters.distance === distance ? 'default' : 'outline'}
                  size="sm"
                  type="submit"
                  name="distance"
                  value={distance}
                  onClick={() => handleFilterChange({ ...filters, distance })}
                  disabled={isSomethingLoading}
                >
                  {distance} mi
                </Button>
              ))}
            </div>
          </div>
          
          {/* Rating Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Rating</label>
            <div className="flex flex-wrap gap-2">
              <Button
                key={0}
                variant={filters.rating === 0 ? 'default' : 'outline'}
                size="sm"
                type="submit"
                name="rating"
                value={0}
                onClick={() => handleFilterChange({ ...filters, rating: 0 })}
                disabled={isSomethingLoading}
              >
                All
              </Button>
              {[1, 2, 3, 4, 5].map(rating => (
                <Button
                  key={rating}
                  variant={filters.rating === rating ? 'default' : 'outline'}
                  size="sm"
                  type="submit"
                  name="rating"
                  value={rating}
                  onClick={() => handleFilterChange({ ...filters, rating })}
                  disabled={isSomethingLoading}
                >
                  {rating}+
                </Button>
              ))}
            </div>
          </div>
          
          {/* Price Range Filter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Price</label>
            <div className="flex flex-wrap gap-2">
              <Button
                key={0}
                variant={filters.priceRange === 0 ? 'default' : 'outline'}
                size="sm"
                type="submit"
                name="priceRange"
                value={0}
                onClick={() => handleFilterChange({ ...filters, priceRange: 0 })}
                disabled={isSomethingLoading}
              >
                All
              </Button>
              {[1, 2, 3, 4].map(price => (
                <Button
                  key={price}
                  variant={filters.priceRange === price ? 'default' : 'outline'}
                  size="sm"
                  type="submit"
                  name="priceRange"
                  value={price}
                  onClick={() => handleFilterChange({ ...filters, priceRange: price })}
                  disabled={isSomethingLoading}
                >
                  {'$'.repeat(price)}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Cuisine Type Filter - placeholder */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Cuisine</label>
            <div className="flex gap-2">
              <Button
                variant={filters.cuisineType === '' ? 'default' : 'outline'}
                size="sm"
                type="submit"
                name="cuisineType"
                value=""
                onClick={() => handleFilterChange({ ...filters, cuisineType: '' })}
                disabled={isSomethingLoading}
              >
                All
              </Button>
              {/* We'll add more cuisine types later */}
            </div>
          </div>
        </Form>
        
        {/* Content area */}
        <div className="min-h-[500px] border rounded-lg p-4">
          {/* Loading indicator */}
          {isSomethingLoading && (
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm">Loading restaurants...</span>
              </div>
            </div>
          )}
          
          {/* Empty state */}
          {!isSomethingLoading && optimisticRestaurants.length === 0 && (
            <div className="flex items-center justify-center h-[400px]">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">No restaurants found matching your criteria.</p>
                <Button onClick={handleRefreshRestaurants}>
                  Refresh Restaurants
                </Button>
              </div>
            </div>
          )}
          
          {/* Restaurant display - either list or map */}
          {optimisticRestaurants.length > 0 && (
            <>
              {viewMode === 'list' ? (
                <RestaurantList 
                  restaurants={optimisticRestaurants}
                  onJoinDinner={handleJoinDinner}
                  onLeaveDinner={handleLeaveDinner}
                  isActionInProgress={isDinnerActionLoading}
                />
              ) : (
                <RestaurantMap
                  restaurants={optimisticRestaurants}
                  userLocation={userLocation}
                  onRestaurantClick={handleJoinDinner}
                  isUsingDefaultLocation={isUsingDefaultLocation}
                />
              )}
            </>
          )}
        </div>
        
        <div className="text-center text-sm text-muted-foreground mt-6">
          <p>Created with Epic Stack, React Router, and Google Places API</p>
        </div>
      </div>
    </div>
  )
} 