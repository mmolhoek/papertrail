/**
 * Geographic Utility Functions
 *
 * Centralized geo calculations including distance, bearing, and coordinate
 * operations. Uses the Haversine formula for accurate distance calculations
 * on the Earth's surface.
 */

/** Earth radius in meters */
export const EARTH_RADIUS_METERS = 6371e3;

/** Degrees to radians conversion factor */
const DEG_TO_RAD = Math.PI / 180;

/**
 * Calculate distance between two coordinates using the Haversine formula.
 *
 * The Haversine formula determines the great-circle distance between two points
 * on a sphere given their longitudes and latitudes.
 *
 * @param lat1 - Latitude of first point in degrees
 * @param lon1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lon2 - Longitude of second point in degrees
 * @returns Distance in meters
 *
 * @example
 * ```typescript
 * // Distance between New York and Los Angeles
 * const distance = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
 * // Returns approximately 3935746 meters (3936 km)
 * ```
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δφ = (lat2 - lat1) * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const sinΔφHalf = Math.sin(Δφ / 2);
  const sinΔλHalf = Math.sin(Δλ / 2);

  const a =
    sinΔφHalf * sinΔφHalf + Math.cos(φ1) * Math.cos(φ2) * sinΔλHalf * sinΔλHalf;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Coordinate interface for object-based distance calculations
 */
export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Calculate distance between two coordinate objects using Haversine formula.
 *
 * @param coord1 - First coordinate with latitude and longitude
 * @param coord2 - Second coordinate with latitude and longitude
 * @returns Distance in meters
 *
 * @example
 * ```typescript
 * const coord1 = { latitude: 40.7128, longitude: -74.0060 };
 * const coord2 = { latitude: 34.0522, longitude: -118.2437 };
 * const distance = distanceBetween(coord1, coord2);
 * ```
 */
export function distanceBetween(
  coord1: GeoCoordinate,
  coord2: GeoCoordinate,
): number {
  return haversineDistance(
    coord1.latitude,
    coord1.longitude,
    coord2.latitude,
    coord2.longitude,
  );
}

/**
 * Calculate the initial bearing from one coordinate to another.
 *
 * @param lat1 - Latitude of start point in degrees
 * @param lon1 - Longitude of start point in degrees
 * @param lat2 - Latitude of end point in degrees
 * @param lon2 - Longitude of end point in degrees
 * @returns Bearing in degrees (0-360)
 *
 * @example
 * ```typescript
 * const bearing = calculateBearing(40.7128, -74.0060, 34.0522, -118.2437);
 * // Returns approximately 273.4 degrees (roughly west)
 * ```
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const y = Math.sin(Δλ) * Math.cos(φ2);

  const θ = Math.atan2(y, x);
  const bearing = ((θ * 180) / Math.PI + 360) % 360;

  return bearing;
}

/**
 * Convert degrees to radians.
 *
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

/**
 * Convert radians to degrees.
 *
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians / DEG_TO_RAD;
}

/**
 * Normalize a bearing to 0-360 degrees.
 *
 * @param bearing - Bearing in degrees (can be negative or >360)
 * @returns Normalized bearing (0-360)
 */
export function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}
