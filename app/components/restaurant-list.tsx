import { Button } from '#app/components/ui/button'

interface Restaurant {
  id: string
  name: string
  address: string
  cuisineType: string
  priceLevel: number
  rating: number
  lat: number
  lng: number
  photoUrl?: string
  mapsUrl?: string
  websiteUrl?: string
  walkingTimeMinutes?: number
  distance?: number
  attendeeCount?: number
  userIsAttending?: boolean
  dinnerGroupId?: string
}

interface RestaurantListProps {
  restaurants: Restaurant[]
  onJoinDinner: (restaurantId: string) => void
  onLeaveDinner: () => void
  isActionInProgress?: boolean
}

export function RestaurantList({ 
  restaurants, 
  onJoinDinner, 
  onLeaveDinner,
  isActionInProgress = false
}: RestaurantListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {restaurants.length === 0 ? (
        <div className="col-span-full text-center py-12">
          <p className="text-lg text-muted-foreground">No restaurants found matching your criteria.</p>
        </div>
      ) : (
        restaurants.map(restaurant => (
          <RestaurantCard 
            key={restaurant.id} 
            restaurant={restaurant} 
            onJoinDinner={onJoinDinner}
            onLeaveDinner={onLeaveDinner}
            isActionInProgress={isActionInProgress}
          />
        ))
      )}
    </div>
  )
}

function RestaurantCard({ 
  restaurant, 
  onJoinDinner, 
  onLeaveDinner,
  isActionInProgress 
}: { 
  restaurant: Restaurant
  onJoinDinner: (restaurantId: string) => void
  onLeaveDinner: () => void
  isActionInProgress: boolean
}) {
  const {
    id,
    name,
    address,
    cuisineType,
    priceLevel,
    rating,
    photoUrl,
    mapsUrl,
    websiteUrl,
    walkingTimeMinutes,
    distance,
    attendeeCount = 0,
    userIsAttending = false
  } = restaurant

  // Format walking time in a user-friendly way
  const formattedWalkingTime = () => {
    if (walkingTimeMinutes === undefined) return null;
    
    if (walkingTimeMinutes < 1) {
      return 'Less than 1 min walk';
    } else if (walkingTimeMinutes === 1) {
      return '1 min walk';
    } else if (walkingTimeMinutes < 60) {
      return `${walkingTimeMinutes} min walk`;
    } else {
      const hours = Math.floor(walkingTimeMinutes / 60);
      const mins = walkingTimeMinutes % 60;
      if (mins === 0) {
        return `${hours} hr walk`;
      } else {
        return `${hours} hr ${mins} min walk`;
      }
    }
  };

  return (
    <div className={`rounded-lg border shadow-sm overflow-hidden flex flex-col h-full ${userIsAttending ? 'border-green-500 border-2' : ''}`}>
      {/* Restaurant Image */}
      <div className="relative h-48 bg-muted">
        {photoUrl ? (
          <img 
            src={photoUrl} 
            alt={name} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="text-muted-foreground">No image available</span>
          </div>
        )}
        {userIsAttending && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
            You're attending
          </div>
        )}
      </div>
      
      {/* Restaurant Info */}
      <div className="flex-grow p-4 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold">{name}</h3>
          <div className="flex items-center">
            <span className="text-sm font-medium mr-1">{rating.toFixed(1)}</span>
            <span className="text-yellow-400">★</span>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground mb-1">{cuisineType}</p>
        <p className="text-sm text-muted-foreground mb-3">{address}</p>
        
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center text-sm">
            <span className="font-medium">{'$'.repeat(priceLevel)}</span>
          </div>
          
          {walkingTimeMinutes !== undefined && (
            <div className="flex items-center text-sm rounded-full bg-blue-50 px-2 py-1">
              <span className="mr-1">🚶</span>
              <span>{formattedWalkingTime()}</span>
            </div>
          )}
          
          <div className="flex items-center text-sm rounded-full bg-gray-50 px-2 py-1">
            <span className="mr-1">👥</span>
            <span>{attendeeCount} attending</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-auto pt-3">
          {websiteUrl ? (
            <a 
              href={websiteUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm text-blue-600 hover:underline"
            >
              Website
            </a>
          ) : null}
          
          {mapsUrl ? (
            <a 
              href={mapsUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm text-blue-600 hover:underline ml-3"
            >
              Directions
            </a>
          ) : null}
        </div>
      </div>
      
      {/* Action Footer */}
      <div className="p-4 border-t">
        {userIsAttending ? (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => onLeaveDinner()}
            disabled={isActionInProgress}
          >
            {isActionInProgress ? 'Updating...' : 'Leave Dinner'}
          </Button>
        ) : (
          <Button 
            variant="default" 
            className="w-full" 
            onClick={() => onJoinDinner(id)}
            disabled={isActionInProgress}
          >
            {isActionInProgress ? 'Updating...' : 'Join Dinner'}
          </Button>
        )}
      </div>
    </div>
  )
} 