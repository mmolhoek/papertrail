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

/**
 * Result of finding the closest point on a route to a target point.
 */
export interface RouteProximityResult {
  /** Minimum distance from point to route in meters */
  distanceToRoute: number;
  /** Distance along route from start to the closest point (meters) */
  distanceAlongRoute: number;
  /** Index of the route segment where closest point lies */
  segmentIndex: number;
  /** The closest point on the route [lat, lon] */
  closestPoint: [number, number];
}

/**
 * Calculate the perpendicular distance from a point to a line segment,
 * and the closest point on that segment.
 *
 * @param pointLat - Latitude of the point
 * @param pointLon - Longitude of the point
 * @param segStartLat - Latitude of segment start
 * @param segStartLon - Longitude of segment start
 * @param segEndLat - Latitude of segment end
 * @param segEndLon - Longitude of segment end
 * @returns Object with distance and closest point on segment
 */
function distanceToSegment(
  pointLat: number,
  pointLon: number,
  segStartLat: number,
  segStartLon: number,
  segEndLat: number,
  segEndLon: number,
): { distance: number; closestPoint: [number, number]; t: number } {
  // Convert to a local coordinate system centered on segment start
  // Using equirectangular approximation for small distances
  const cosLat = Math.cos(segStartLat * DEG_TO_RAD);

  const px = (pointLon - segStartLon) * cosLat;
  const py = pointLat - segStartLat;
  const ax = 0;
  const ay = 0;
  const bx = (segEndLon - segStartLon) * cosLat;
  const by = segEndLat - segStartLat;

  // Vector from A to B
  const abx = bx - ax;
  const aby = by - ay;

  // Vector from A to P
  const apx = px - ax;
  const apy = py - ay;

  // Project AP onto AB to find parameter t
  const abLenSq = abx * abx + aby * aby;

  let t: number;
  if (abLenSq < 1e-12) {
    // Segment is essentially a point
    t = 0;
  } else {
    t = (apx * abx + apy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t)); // Clamp to segment
  }

  // Calculate the closest point in local coords
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;

  // Convert back to lat/lon
  const closestLon = segStartLon + closestX / cosLat;
  const closestLat = segStartLat + closestY;

  // Calculate actual distance using haversine for accuracy
  const distance = haversineDistance(
    pointLat,
    pointLon,
    closestLat,
    closestLon,
  );

  return {
    distance,
    closestPoint: [closestLat, closestLon],
    t,
  };
}

/**
 * Find the closest point on a route to a given point.
 * Returns the perpendicular distance to the route and the distance
 * along the route from the start to that closest point.
 *
 * This is useful for determining if a POI is actually on/near the route
 * (not just within a radius corridor) and how far along the route it is.
 *
 * @param pointLat - Latitude of the target point
 * @param pointLon - Longitude of the target point
 * @param routeGeometry - Route as array of [lat, lon] pairs
 * @returns RouteProximityResult with distance info, or null if route is empty
 *
 * @example
 * ```typescript
 * const route = [[52.5, 13.4], [52.51, 13.41], [52.52, 13.42]];
 * const result = findClosestPointOnRoute(52.505, 13.405, route);
 * // result.distanceToRoute: ~50 meters
 * // result.distanceAlongRoute: ~700 meters from start
 * ```
 */
/**
 * Calculate the curvature of a path at a given point using three consecutive points.
 * Curvature is measured as the rate of change of bearing (degrees per meter).
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second (center) point
 * @param lon2 - Longitude of second (center) point
 * @param lat3 - Latitude of third point
 * @param lon3 - Longitude of third point
 * @returns Curvature in degrees per meter (higher = tighter curve)
 */
export function calculateCurvature(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  lat3: number,
  lon3: number,
): number {
  const bearing1 = calculateBearing(lat1, lon1, lat2, lon2);
  const bearing2 = calculateBearing(lat2, lon2, lat3, lon3);

  // Calculate bearing change, normalized to -180 to 180
  let bearingChange = bearing2 - bearing1;
  if (bearingChange > 180) bearingChange -= 360;
  if (bearingChange < -180) bearingChange += 360;

  // Calculate distance over which the change occurs
  const distance1 = haversineDistance(lat1, lon1, lat2, lon2);
  const distance2 = haversineDistance(lat2, lon2, lat3, lon3);
  const totalDistance = distance1 + distance2;

  if (totalDistance < 1) return 0; // Avoid division by zero

  // Curvature = bearing change per meter (absolute value)
  return Math.abs(bearingChange) / totalDistance;
}

/**
 * Calculate the appropriate cornering speed based on curvature.
 * Uses a physics-based approach with lateral acceleration limits.
 *
 * The formula is based on: v = sqrt(a_lat * r)
 * Where a_lat is acceptable lateral acceleration and r is turn radius.
 * Turn radius can be approximated from curvature.
 *
 * @param curvature - Curvature in degrees per meter
 * @param maxSpeed - Maximum speed in km/h (used when road is straight)
 * @param comfortLevel - Lateral acceleration limit in m/s² (default 2.5, comfortable for passengers)
 * @returns Recommended speed in km/h
 */
export function calculateCorneringSpeed(
  curvature: number,
  maxSpeed: number,
  comfortLevel: number = 2.5,
): number {
  // If curvature is very low, allow max speed
  if (curvature < 0.1) return maxSpeed; // Less than 0.1 deg/m is essentially straight

  // Convert curvature (deg/m) to approximate turn radius (meters)
  // For a circle: arc_length = r * theta (in radians)
  // If we have deg/m curvature, then for 1m we turn 'curvature' degrees
  // radius = 1m / (curvature * DEG_TO_RAD) = 180 / (PI * curvature)
  const turnRadius = 180 / (Math.PI * curvature);

  // v = sqrt(a * r) gives speed in m/s
  const speedMs = Math.sqrt(comfortLevel * turnRadius);

  // Convert to km/h
  const speedKmh = (speedMs * 3600) / 1000;

  // Clamp between minimum (5 km/h) and max speed
  return Math.max(5, Math.min(maxSpeed, speedKmh));
}

/**
 * Analyze a segment of track points and find the maximum curvature within it.
 * This is useful for lookahead to detect upcoming curves.
 *
 * @param points - Array of [lat, lon] coordinate pairs
 * @param startIndex - Start index in the points array
 * @param lookaheadDistance - Maximum distance to look ahead in meters
 * @returns Object with max curvature and distance to it, or null if not enough points
 */
export function findMaxCurvatureAhead(
  points: [number, number][],
  startIndex: number,
  lookaheadDistance: number,
): { maxCurvature: number; distanceToCurve: number } | null {
  if (startIndex >= points.length - 2) return null;

  let maxCurvature = 0;
  let distanceToMaxCurvature = 0;
  let accumulatedDistance = 0;

  for (let i = startIndex; i < points.length - 2; i++) {
    const dist = haversineDistance(
      points[i][0],
      points[i][1],
      points[i + 1][0],
      points[i + 1][1],
    );
    accumulatedDistance += dist;

    if (accumulatedDistance > lookaheadDistance) break;

    const curvature = calculateCurvature(
      points[i][0],
      points[i][1],
      points[i + 1][0],
      points[i + 1][1],
      points[i + 2][0],
      points[i + 2][1],
    );

    if (curvature > maxCurvature) {
      maxCurvature = curvature;
      distanceToMaxCurvature = accumulatedDistance;
    }
  }

  return { maxCurvature, distanceToCurve: distanceToMaxCurvature };
}

/**
 * Calculate the speed to use now, considering an upcoming curve.
 * Uses deceleration physics to ensure we can slow down in time.
 *
 * @param currentSpeed - Current speed in km/h
 * @param targetSpeed - Required speed for the curve in km/h
 * @param distanceToCurve - Distance to the curve in meters
 * @param deceleration - Comfortable deceleration in m/s² (default 2.0)
 * @returns Speed to use now in km/h
 */
export function calculateSpeedForUpcomingCurve(
  currentSpeed: number,
  targetSpeed: number,
  distanceToCurve: number,
  deceleration: number = 2.0,
): number {
  if (targetSpeed >= currentSpeed) return currentSpeed;

  // Convert target speed to m/s for kinematics calculation
  const targetMs = (targetSpeed * 1000) / 3600;

  // Using kinematic equation: v² = v₀² + 2*a*d
  // We need: v_now² = v_target² + 2 * decel * distance
  // This gives us the speed we need to be at NOW to reach target speed at the curve
  const requiredSpeedNowMs = Math.sqrt(
    targetMs * targetMs + 2 * deceleration * distanceToCurve,
  );

  // Convert back to km/h
  const requiredSpeedNowKmh = (requiredSpeedNowMs * 3600) / 1000;

  // Return the lower of current speed or required speed
  return Math.min(currentSpeed, requiredSpeedNowKmh);
}

export function findClosestPointOnRoute(
  pointLat: number,
  pointLon: number,
  routeGeometry: [number, number][],
): RouteProximityResult | null {
  if (routeGeometry.length < 2) {
    return null;
  }

  let minDistance = Infinity;
  let bestSegmentIndex = 0;
  let bestClosestPoint: [number, number] = routeGeometry[0];
  let distanceAlongRouteToSegmentStart = 0;
  let bestT = 0;

  // Iterate through each segment
  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const [lat1, lon1] = routeGeometry[i];
    const [lat2, lon2] = routeGeometry[i + 1];

    const result = distanceToSegment(
      pointLat,
      pointLon,
      lat1,
      lon1,
      lat2,
      lon2,
    );

    if (result.distance < minDistance) {
      minDistance = result.distance;
      bestSegmentIndex = i;
      bestClosestPoint = result.closestPoint;
      bestT = result.t;
    }
  }

  // Calculate distance along route to the best segment start
  distanceAlongRouteToSegmentStart = 0;
  for (let i = 0; i < bestSegmentIndex; i++) {
    distanceAlongRouteToSegmentStart += haversineDistance(
      routeGeometry[i][0],
      routeGeometry[i][1],
      routeGeometry[i + 1][0],
      routeGeometry[i + 1][1],
    );
  }

  // Add partial segment distance
  const segmentLength = haversineDistance(
    routeGeometry[bestSegmentIndex][0],
    routeGeometry[bestSegmentIndex][1],
    routeGeometry[bestSegmentIndex + 1][0],
    routeGeometry[bestSegmentIndex + 1][1],
  );

  const distanceAlongRoute =
    distanceAlongRouteToSegmentStart + bestT * segmentLength;

  return {
    distanceToRoute: minDistance,
    distanceAlongRoute,
    segmentIndex: bestSegmentIndex,
    closestPoint: bestClosestPoint,
  };
}
