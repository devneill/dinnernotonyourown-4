import { useState, useEffect } from 'react'

// Default location for Salt Lake City venue
export const DEFAULT_LOCATION = {
  lat: 40.7608,
  lng: -111.8910
}

// Types
export interface Location {
  lat: number
  lng: number
}

export interface GeolocationState {
  location: Location
  isLoading: boolean
  error: GeolocationPositionError | null
  isUsingDefault: boolean
}

/**
 * Hook that provides access to the user's current location
 * Falls back to DEFAULT_LOCATION if geolocation is not available or permission is denied
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({
    location: DEFAULT_LOCATION,
    isLoading: true,
    error: null,
    isUsingDefault: true
  })

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: new GeolocationPositionError(),
        isUsingDefault: true
      }))
      return
    }

    const successHandler = (position: GeolocationPosition) => {
      setState({
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        },
        isLoading: false,
        error: null,
        isUsingDefault: false
      })
    }

    const errorHandler = (error: GeolocationPositionError) => {
      console.error('Geolocation error:', error.message)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error,
        isUsingDefault: true
      }))
    }

    setState(prev => ({ ...prev, isLoading: true }))
    
    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    }

    const watchId = navigator.geolocation.watchPosition(
      successHandler,
      errorHandler,
      options
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  return state
}

/**
 * Calculate the walking distance between two points
 * @param origin Starting location
 * @param destination Ending location
 * @returns Distance in miles
 */
export function calculateDistance(origin: Location, destination: Location): number {
  const R = 3958.8 // Earth's radius in miles
  const dLat = degreesToRadians(destination.lat - origin.lat)
  const dLng = degreesToRadians(destination.lng - origin.lng)
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(origin.lat)) * 
    Math.cos(degreesToRadians(destination.lat)) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Convert degrees to radians
 */
function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

/**
 * Calculate approximate walking time in minutes
 * @param distanceInMiles Distance in miles
 * @returns Walking time in minutes (average walking speed of 3mph)
 */
export function calculateWalkingTime(distanceInMiles: number): number {
  const walkingSpeedMph = 3
  return Math.round((distanceInMiles / walkingSpeedMph) * 60)
} 