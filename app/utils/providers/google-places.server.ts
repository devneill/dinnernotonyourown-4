import { type Restaurant } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'

// Default Salt Lake City venue coordinates
export const DEFAULT_VENUE_LOCATION = {
  lat: 40.7608, // Salt Palace Convention Center
  lng: -111.8910,
}

// Function to get photo URL from photo reference
export function getPhotoUrl(photoReference: string, maxWidth = 400) {
  if (!photoReference) {
    return 'https://placehold.co/400x300?text=Restaurant';
  }
  const apiKey = 'AIzaSyChrcKc85KZGdGxmGQ0hU--XaNNE8NmH3g';
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${apiKey}`;
}

// Simple function to search for restaurants near a location
export async function searchRestaurants({
  lat,
  lng,
  radius = 2000, // 2km radius
  type = 'restaurant',
  keyword = '',
  minPrice,
  maxPrice,
  minRating,
}: {
  lat: number
  lng: number
  radius?: number
  type?: string
  keyword?: string
  minPrice?: number
  maxPrice?: number
  minRating?: number
}) {
  // API key is required - use the one provided by the user
  const apiKey = 'AIzaSyChrcKc85KZGdGxmGQ0hU--XaNNE8NmH3g';
  
  try {
    // Build the URL for Google Places API - be careful not to duplicate parameters
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    
    // Add parameters one by one
    url.searchParams.append('location', `${lat},${lng}`);
    url.searchParams.append('radius', radius.toString());
    url.searchParams.append('type', type);
    url.searchParams.append('key', apiKey);
    
    if (keyword) url.searchParams.append('keyword', keyword);
    if (minPrice !== undefined) url.searchParams.append('minprice', minPrice.toString());
    if (maxPrice !== undefined) url.searchParams.append('maxprice', maxPrice.toString());
    
    const urlString = url.toString();
    console.log('Fetching from Google Places API:', urlString.replace(apiKey, '***'));
    
    // Make the API request
    const response = await fetch(urlString);
    
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Google Places API response status:', data.status);
    
    // Check the status from the API response
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API returned status: ${data.status}`);
    }
    
    // Log the actual results for debugging
    console.log(`Found ${data.results?.length || 0} raw results from Google API`);
    
    // Filter by rating if specified (API doesn't support this natively)
    let results = data.results || [];
    if (minRating !== undefined) {
      results = results.filter(place => (place.rating || 0) >= minRating);
    }
    
    console.log(`Returning ${results.length} filtered results`);
    return results;
  } catch (error) {
    console.error('Error searching for restaurants:', error);
    // Return a fallback of empty results
    return [];
  }
}

// Calculate walking distance between two points
export function calculateDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (originLat * Math.PI) / 180;
  const φ2 = (destLat * Math.PI) / 180;
  const Δφ = ((destLat - originLat) * Math.PI) / 180;
  const Δλ = ((destLng - originLng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // in meters
  return distance / 1609.34; // convert to miles
} 