import { useRef, useEffect, useState } from 'react'
import { type Location } from '#app/utils/geolocation'

interface Restaurant {
  id: string
  name: string
  lat: number
  lng: number
  attendeeCount?: number
  userIsAttending?: boolean
}

interface RestaurantMapProps {
  restaurants: Restaurant[]
  userLocation: Location
  onRestaurantClick: (restaurantId: string) => void
  isUsingDefaultLocation?: boolean
}

export function RestaurantMap({ 
  restaurants, 
  userLocation, 
  onRestaurantClick,
  isUsingDefaultLocation = true
}: RestaurantMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [markers, setMarkers] = useState<google.maps.Marker[]>([])
  const [infoWindow, setInfoWindow] = useState<google.maps.InfoWindow | null>(null)
  const [userMarker, setUserMarker] = useState<google.maps.Marker | null>(null)

  // Initialize the map
  useEffect(() => {
    if (!mapRef.current || map) return

    // Check if Google Maps API is loaded
    if (!window.google || !window.google.maps) {
      console.error('Google Maps API not loaded')
      return
    }

    const newMap = new google.maps.Map(mapRef.current, {
      center: userLocation,
      zoom: 14,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    })
    
    setMap(newMap)
    setInfoWindow(new google.maps.InfoWindow())
  }, [userLocation, map])

  // Create or update user location marker
  useEffect(() => {
    if (!map) return

    // Remove existing user marker if it exists
    if (userMarker) {
      userMarker.setMap(null)
    }

    // Create a new marker
    const newUserMarker = new google.maps.Marker({
      position: userLocation,
      map: map,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="30">🐨</text>
          </svg>`
        )}`,
        scaledSize: new google.maps.Size(40, 40),
        anchor: new google.maps.Point(20, 20),
      },
      title: isUsingDefaultLocation ? 'Venue Location' : 'Your Location',
      zIndex: 1000, // Ensure user marker appears on top of other markers
    })

    // If using live location, add accuracy circle
    if (!isUsingDefaultLocation) {
      // Add a pulsing effect to show it's a live location
      const pulseCircle = new google.maps.Marker({
        position: userLocation,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4285F4',
          fillOpacity: 0.4,
          strokeColor: '#4285F4',
          strokeWeight: 2,
          strokeOpacity: 0.7,
        },
        zIndex: 999,
      })
      
      // Animation for pulse effect
      let opacity = 0.7;
      let expanding = false;
      const animatePulse = () => {
        if (opacity >= 0.7) expanding = false;
        if (opacity <= 0.2) expanding = true;
        
        opacity = expanding ? opacity + 0.01 : opacity - 0.01;
        
        if (pulseCircle.getIcon()) {
          const icon = { ...(pulseCircle.getIcon() as google.maps.Symbol) };
          icon.fillOpacity = opacity;
          icon.strokeOpacity = opacity;
          pulseCircle.setIcon(icon);
        }
        
        requestAnimationFrame(animatePulse);
      };
      
      requestAnimationFrame(animatePulse);
    }

    setUserMarker(newUserMarker)

    // Center map on user location and maintain proper zoom
    map.panTo(userLocation)
    
    // Wait until other markers are updated before fitting bounds
  }, [map, userLocation, isUsingDefaultLocation])

  // Update markers when restaurants change
  useEffect(() => {
    if (!map || !infoWindow) return

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null))
    
    // Create new markers
    const newMarkers = restaurants.map(restaurant => {
      const isUserAttending = restaurant.userIsAttending || false
      const attendeeCount = restaurant.attendeeCount || 0
      
      // Create marker
      const marker = new google.maps.Marker({
        position: { lat: restaurant.lat, lng: restaurant.lng },
        map,
        title: restaurant.name,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="15" fill="${isUserAttending ? '#4CAF50' : '#2563EB'}" stroke="#fff" stroke-width="2" />
              <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14" fill="white" font-weight="bold">${attendeeCount}</text>
            </svg>`
          )}`,
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 20),
        },
      })

      // Add click event to marker
      marker.addListener('click', () => {
        infoWindow.setContent(`
          <div style="padding: 8px; max-width: 200px;">
            <h3 style="font-weight: bold; margin-bottom: 4px;">${restaurant.name}</h3>
            <div style="margin-top: 8px;">
              <div style="margin-bottom: 4px;"><b>${attendeeCount}</b> attending</div>
              <button id="restaurant-button-${restaurant.id}" style="
                background-color: ${isUserAttending ? '#f1f5f9' : '#2563EB'};
                color: ${isUserAttending ? '#111' : '#fff'};
                border: 1px solid ${isUserAttending ? '#e2e8f0' : '#2563EB'};
                padding: 4px 12px;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
              ">
                ${isUserAttending ? 'Attending' : 'Join Dinner'}
              </button>
            </div>
          </div>
        `)
        infoWindow.open(map, marker)
        
        // Add event listener to button after the window opens
        setTimeout(() => {
          const button = document.getElementById(`restaurant-button-${restaurant.id}`)
          if (button) {
            button.addEventListener('click', () => {
              onRestaurantClick(restaurant.id)
              infoWindow.close()
            })
          }
        }, 0)
      })

      return marker
    })
    
    setMarkers(newMarkers)
    
    // Fit map to show all markers plus user location
    if (newMarkers.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      bounds.extend(userLocation)
      newMarkers.forEach(marker => bounds.extend(marker.getPosition()!))
      map.fitBounds(bounds, 50) // 50px padding
      
      // Don't zoom in too close if there's only one marker
      const zoom = map.getZoom()
      if (zoom && zoom > 16) {
        map.setZoom(16)
      }
    }
  }, [restaurants, map, infoWindow, markers, userLocation, onRestaurantClick])

  return (
    <div className="h-full min-h-[500px] relative">
      <div ref={mapRef} className="h-full w-full rounded-lg"></div>
      <div className="absolute bottom-4 right-4 bg-background p-2 rounded-md shadow-md">
        <p className="text-xs text-muted-foreground mb-1">Map Markers:</p>
        <div className="flex items-center mb-1">
          <div className="w-4 h-4 bg-blue-600 rounded-full mr-2"></div>
          <span className="text-xs">Restaurant</span>
        </div>
        <div className="flex items-center mb-1">
          <div className="w-4 h-4 bg-green-600 rounded-full mr-2"></div>
          <span className="text-xs">You're attending</span>
        </div>
        <div className="flex items-center">
          <span className="text-lg mr-2">🐨</span>
          <span className="text-xs">{isUsingDefaultLocation ? 'Venue location' : 'Your location'}</span>
        </div>
        {!isUsingDefaultLocation && (
          <div className="mt-2">
            <span className="text-xs text-green-600">✓ Using live location</span>
          </div>
        )}
      </div>
    </div>
  )
} 