export function getMarkerColor(distance: number): string {
  if (distance <= 5) return '#10B981'; // emerald-500
  if (distance <= 10) return '#F59E0B'; // amber-500
  return '#EF4444'; // red-500
}

export function getResourceColor(type: string): string {
  const typeMap: Record<string, string> = {
    'Union': '#3B82F6',      // blue-500
    'Non-Union': '#EF4444',  // red-500
    'Non-union': '#EF4444',  // red-500
    'Veg': '#10B981',        // emerald-500
    'HVAC': '#F59E0B',       // amber-500
    'DAT': '#8B5CF6',        // violet-500
    'Consulting': '#EC4899', // pink-500
    'Logistics': '#06B6D4',  // cyan-500
    'Unknown': '#6B7280',    // gray-500
    'Other': '#6B7280',      // gray-500
  };
  
  return typeMap[type] || '#6B7280'; // gray-500 for unknown types
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

export function calculateStraightLineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}
