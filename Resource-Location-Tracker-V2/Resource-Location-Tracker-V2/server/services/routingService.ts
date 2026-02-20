import type { AnalysisPoint, Resource } from '@shared/schema';

interface RouteResponse {
  distance: number; // in meters
  duration: number; // in seconds
  geometry?: any;
}

export class RoutingService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.MAPBOX_ACCESS_TOKEN || '';
    if (!this.apiKey) {
      console.warn('Mapbox access token not found. Falling back to distance calculations.');
    }
  }

  async calculateRoute(from: AnalysisPoint, to: Resource): Promise<RouteResponse> {
    if (!this.apiKey) {
      // Fallback to straight-line distance calculation
      return this.calculateStraightLineDistance(from, to);
    }

    try {
      // Use Mapbox Matrix API - much more cost-effective (100k free elements/month)
      // Note: Mapbox uses longitude,latitude format (not latitude,longitude)
      const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
      const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}?annotations=distance,duration&access_token=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Mapbox Matrix API error: ${response.status} - ${errorText}`);
        console.warn('Falling back to straight-line distance calculation');
        return this.calculateStraightLineDistance(from, to);
      }

      const data = await response.json();

      if (data.code !== 'Ok') {
        console.error(`Mapbox API status: ${data.code}`);
        console.warn('Falling back to straight-line distance calculation');
        return this.calculateStraightLineDistance(from, to);
      }

      // Mapbox returns durations and distances as 2D arrays
      // For a single origin to single destination, we want [0][1] (origin 0 to destination 1)
      const distanceMeters = data.distances[0][1];
      const durationSeconds = data.durations[0][1];

      if (!distanceMeters || !durationSeconds) {
        console.error('Mapbox API returned null distance or duration');
        console.warn('Falling back to straight-line distance calculation');
        return this.calculateStraightLineDistance(from, to);
      }

      console.log(`Mapbox Matrix API success: ${(distanceMeters * 0.000621371).toFixed(1)} miles, ${Math.round(durationSeconds / 60)} minutes`);

      return {
        distance: distanceMeters,
        duration: Math.round(durationSeconds), // Convert to integer for database
      };
    } catch (error) {
      console.error('Mapbox Matrix API request failed:', error);
      console.warn('Falling back to straight-line distance calculation');
      return this.calculateStraightLineDistance(from, to);
    }
  }

  async calculateBatchRoutes(from: AnalysisPoint, resources: Resource[]): Promise<RouteResponse[]> {
    if (!this.apiKey || resources.length === 0) {
      // Fallback to straight-line distance
      return resources.map(resource => this.calculateStraightLineDistance(from, resource));
    }

    // Use Mapbox Matrix API for efficient batch processing
    // Split into batches of 24 destinations (1 source + 24 destinations = 25 total coordinates, Mapbox's limit)
    const batchSize = 24;
    const allResults: RouteResponse[] = [];

    for (let i = 0; i < resources.length; i += batchSize) {
      const batch = resources.slice(i, i + batchSize);
      const batchResults = await this.calculateBatchWithMatrix(from, batch);
      allResults.push(...batchResults);
    }

    return allResults;
  }

  private async calculateBatchWithMatrix(from: AnalysisPoint, resources: Resource[]): Promise<RouteResponse[]> {
    try {
      // Build coordinate string: origin;destination1;destination2;...
      // Note: Mapbox uses longitude,latitude format (not latitude,longitude)
      const originCoord = `${from.longitude},${from.latitude}`;
      const destCoords = resources.map(r => `${r.longitude},${r.latitude}`).join(';');
      const coordinates = `${originCoord};${destCoords}`;
      
      // Build URL with sources=0 (only first coordinate is origin) and destinations=all others
      const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}?sources=0&annotations=distance,duration&access_token=${this.apiKey}`;

      console.log(`Calculating batch of ${resources.length} routes using Mapbox Matrix API (cost-effective)`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Mapbox Matrix API error: ${response.status} - ${errorText}`);
        return resources.map(r => this.calculateStraightLineDistance(from, r));
      }

      const data = await response.json();

      if (data.code !== 'Ok') {
        console.error(`Mapbox API status: ${data.code}`);
        return resources.map(r => this.calculateStraightLineDistance(from, r));
      }

      console.log(`Received ${data.distances[0].length - 1} route elements from Mapbox Matrix API`);

      // Mapbox returns durations and distances as 2D arrays
      // For 1 origin to N destinations, we have distances[0][1...N] and durations[0][1...N]
      // Index 0 is the origin itself (0 distance/duration), indices 1+ are the destinations
      return resources.map((resource, index) => {
        const destIndex = index + 1; // +1 because index 0 is the origin
        const distanceMeters = data.distances[0][destIndex];
        const durationSeconds = data.durations[0][destIndex];

        // Handle null values (no route found between origin and destination)
        if (distanceMeters === null || durationSeconds === null || 
            distanceMeters === undefined || durationSeconds === undefined) {
          console.warn(`No route found for destination ${index}, using straight-line distance`);
          return this.calculateStraightLineDistance(from, resource);
        }

        return {
          distance: distanceMeters,
          duration: Math.round(durationSeconds), // Convert to integer for database
        };
      });
    } catch (error) {
      console.error('Mapbox Matrix API request failed:', error);
      return resources.map(r => this.calculateStraightLineDistance(from, r));
    }
  }

  private calculateStraightLineDistance(from: AnalysisPoint, to: Resource): RouteResponse {
    // Haversine formula for great-circle distance
    const R = 6371000; // Earth's radius in meters
    const φ1 = (from.latitude * Math.PI) / 180;
    const φ2 = (to.latitude * Math.PI) / 180;
    const Δφ = ((to.latitude - from.latitude) * Math.PI) / 180;
    const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // in meters
    
    // Estimate duration based on distance (assume average speed of 55 mph for driving)
    const averageSpeedMph = 55;
    const distanceMiles = distance * 0.000621371; // Convert meters to miles
    const duration = (distanceMiles / averageSpeedMph) * 3600; // in seconds

    return {
      distance: distance * 1.2, // Add 20% for road routing vs straight line
      duration: Math.round(duration * 1.3), // Add 30% for traffic and stops
    };
  }
}

export const routingService = new RoutingService();
