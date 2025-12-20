import {
  haversineDistance,
  distanceBetween,
  calculateBearing,
  degreesToRadians,
  radiansToDegrees,
  normalizeBearing,
  findClosestPointOnRoute,
  calculateCurvature,
  calculateCorneringSpeed,
  calculateSpeedForUpcomingCurve,
  findMaxCurvatureAhead,
  EARTH_RADIUS_METERS,
} from "../geo";

describe("geo utilities", () => {
  describe("haversineDistance", () => {
    it("should return 0 for identical coordinates", () => {
      const distance = haversineDistance(40.7128, -74.006, 40.7128, -74.006);
      expect(distance).toBe(0);
    });

    it("should calculate distance between New York and Los Angeles", () => {
      // New York: 40.7128, -74.0060
      // Los Angeles: 34.0522, -118.2437
      const distance = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
      // Expected: approximately 3935 km
      expect(distance).toBeGreaterThan(3900000);
      expect(distance).toBeLessThan(4000000);
    });

    it("should calculate distance between London and Paris", () => {
      // London: 51.5074, -0.1278
      // Paris: 48.8566, 2.3522
      const distance = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
      // Expected: approximately 344 km
      expect(distance).toBeGreaterThan(340000);
      expect(distance).toBeLessThan(350000);
    });

    it("should handle crossing the prime meridian", () => {
      const distance = haversineDistance(51.5, -0.5, 51.5, 0.5);
      // Approximately 70 km at 51.5° latitude
      expect(distance).toBeGreaterThan(60000);
      expect(distance).toBeLessThan(80000);
    });

    it("should handle crossing the international date line", () => {
      const distance = haversineDistance(0, 179, 0, -179);
      // Should be approximately 2 degrees at equator (about 222 km)
      expect(distance).toBeGreaterThan(200000);
      expect(distance).toBeLessThan(250000);
    });

    it("should return quarter circumference for points 90 degrees apart on equator", () => {
      const distance = haversineDistance(0, 0, 0, 90);
      const expectedQuarterCircumference = (Math.PI * EARTH_RADIUS_METERS) / 2;
      expect(distance).toBeCloseTo(expectedQuarterCircumference, -3);
    });

    it("should handle negative coordinates", () => {
      // Sydney: -33.8688, 151.2093
      // Melbourne: -37.8136, 144.9631
      const distance = haversineDistance(
        -33.8688,
        151.2093,
        -37.8136,
        144.9631,
      );
      // Expected: approximately 714 km
      expect(distance).toBeGreaterThan(700000);
      expect(distance).toBeLessThan(730000);
    });

    it("should calculate short distances accurately", () => {
      // Two points about 100 meters apart
      const distance = haversineDistance(51.5, 0, 51.5009, 0);
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });
  });

  describe("distanceBetween", () => {
    it("should calculate distance between coordinate objects", () => {
      const coord1 = { latitude: 40.7128, longitude: -74.006 };
      const coord2 = { latitude: 34.0522, longitude: -118.2437 };

      const distance = distanceBetween(coord1, coord2);

      // Same as haversineDistance test for NY to LA
      expect(distance).toBeGreaterThan(3900000);
      expect(distance).toBeLessThan(4000000);
    });

    it("should return 0 for identical coordinates", () => {
      const coord = { latitude: 51.5074, longitude: -0.1278 };
      expect(distanceBetween(coord, coord)).toBe(0);
    });

    it("should be symmetric", () => {
      const coord1 = { latitude: 40.7128, longitude: -74.006 };
      const coord2 = { latitude: 34.0522, longitude: -118.2437 };

      expect(distanceBetween(coord1, coord2)).toBe(
        distanceBetween(coord2, coord1),
      );
    });
  });

  describe("calculateBearing", () => {
    it("should return 0 for due north", () => {
      const bearing = calculateBearing(0, 0, 10, 0);
      expect(bearing).toBeCloseTo(0, 1);
    });

    it("should return 90 for due east", () => {
      const bearing = calculateBearing(0, 0, 0, 10);
      expect(bearing).toBeCloseTo(90, 1);
    });

    it("should return 180 for due south", () => {
      const bearing = calculateBearing(10, 0, 0, 0);
      expect(bearing).toBeCloseTo(180, 1);
    });

    it("should return 270 for due west", () => {
      const bearing = calculateBearing(0, 10, 0, 0);
      expect(bearing).toBeCloseTo(270, 1);
    });

    it("should return northeast bearing (~45 degrees)", () => {
      // At high latitude for more accurate NE
      const bearing = calculateBearing(45, 0, 46, 1.4);
      expect(bearing).toBeGreaterThan(35);
      expect(bearing).toBeLessThan(55);
    });

    it("should handle crossing the date line", () => {
      const bearing = calculateBearing(0, 179, 0, -179);
      expect(bearing).toBeCloseTo(90, 1);
    });
  });

  describe("degreesToRadians", () => {
    it("should convert 0 degrees to 0 radians", () => {
      expect(degreesToRadians(0)).toBe(0);
    });

    it("should convert 180 degrees to pi radians", () => {
      expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 10);
    });

    it("should convert 360 degrees to 2*pi radians", () => {
      expect(degreesToRadians(360)).toBeCloseTo(2 * Math.PI, 10);
    });

    it("should convert 90 degrees to pi/2 radians", () => {
      expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 10);
    });

    it("should handle negative degrees", () => {
      expect(degreesToRadians(-90)).toBeCloseTo(-Math.PI / 2, 10);
    });
  });

  describe("radiansToDegrees", () => {
    it("should convert 0 radians to 0 degrees", () => {
      expect(radiansToDegrees(0)).toBe(0);
    });

    it("should convert pi radians to 180 degrees", () => {
      expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 10);
    });

    it("should convert 2*pi radians to 360 degrees", () => {
      expect(radiansToDegrees(2 * Math.PI)).toBeCloseTo(360, 10);
    });

    it("should be inverse of degreesToRadians", () => {
      const degrees = 123.456;
      expect(radiansToDegrees(degreesToRadians(degrees))).toBeCloseTo(
        degrees,
        10,
      );
    });
  });

  describe("normalizeBearing", () => {
    it("should keep valid bearings unchanged", () => {
      expect(normalizeBearing(0)).toBe(0);
      expect(normalizeBearing(90)).toBe(90);
      expect(normalizeBearing(180)).toBe(180);
      expect(normalizeBearing(270)).toBe(270);
    });

    it("should normalize 360 to 0", () => {
      expect(normalizeBearing(360)).toBe(0);
    });

    it("should normalize bearings over 360", () => {
      expect(normalizeBearing(450)).toBe(90);
      expect(normalizeBearing(720)).toBe(0);
      expect(normalizeBearing(810)).toBe(90);
    });

    it("should normalize negative bearings", () => {
      expect(normalizeBearing(-90)).toBe(270);
      expect(normalizeBearing(-180)).toBe(180);
      expect(normalizeBearing(-270)).toBe(90);
      expect(normalizeBearing(-360)).toBe(0);
    });

    it("should normalize large negative bearings", () => {
      expect(normalizeBearing(-450)).toBe(270);
    });
  });

  describe("findClosestPointOnRoute", () => {
    it("should return null for empty route", () => {
      expect(findClosestPointOnRoute(52.5, 13.4, [])).toBeNull();
    });

    it("should return null for single-point route", () => {
      expect(findClosestPointOnRoute(52.5, 13.4, [[52.5, 13.4]])).toBeNull();
    });

    it("should find point directly on route", () => {
      // Simple north-south route
      const route: [number, number][] = [
        [52.5, 13.4],
        [52.6, 13.4],
      ];
      // Point exactly on the route
      const result = findClosestPointOnRoute(52.55, 13.4, route);

      expect(result).not.toBeNull();
      expect(result!.distanceToRoute).toBeLessThan(10); // Should be very close (within 10m)
      expect(result!.distanceAlongRoute).toBeGreaterThan(0);
      expect(result!.segmentIndex).toBe(0);
    });

    it("should calculate perpendicular distance correctly", () => {
      // West-east route at lat 52.5
      const route: [number, number][] = [
        [52.5, 13.0],
        [52.5, 14.0],
      ];
      // Point 0.01 degrees north of route (about 1.1km)
      const result = findClosestPointOnRoute(52.51, 13.5, route);

      expect(result).not.toBeNull();
      expect(result!.distanceToRoute).toBeGreaterThan(1000);
      expect(result!.distanceToRoute).toBeLessThan(1200);
    });

    it("should find closest point on multi-segment route", () => {
      // L-shaped route
      const route: [number, number][] = [
        [52.5, 13.0],
        [52.5, 13.5],
        [52.6, 13.5],
      ];
      // Point near the second segment
      const result = findClosestPointOnRoute(52.55, 13.5, route);

      expect(result).not.toBeNull();
      expect(result!.segmentIndex).toBe(1); // Should be on second segment
      expect(result!.distanceToRoute).toBeLessThan(100);
    });

    it("should calculate distance along route correctly", () => {
      // Simple route
      const route: [number, number][] = [
        [52.5, 13.0],
        [52.5, 13.1],
        [52.5, 13.2],
      ];
      // Point near the middle of the second segment
      const result = findClosestPointOnRoute(52.5, 13.15, route);

      expect(result).not.toBeNull();
      // Distance along route should be first segment + half of second segment
      const seg1Length = haversineDistance(52.5, 13.0, 52.5, 13.1);
      const expectedDistance =
        seg1Length + haversineDistance(52.5, 13.1, 52.5, 13.15);
      expect(result!.distanceAlongRoute).toBeCloseTo(expectedDistance, -1);
    });

    it("should handle point closest to segment endpoint", () => {
      // Route segment
      const route: [number, number][] = [
        [52.5, 13.0],
        [52.5, 13.1],
      ];
      // Point beyond the end of the route
      const result = findClosestPointOnRoute(52.5, 13.2, route);

      expect(result).not.toBeNull();
      // Should clamp to endpoint
      expect(result!.closestPoint[0]).toBeCloseTo(52.5, 2);
      expect(result!.closestPoint[1]).toBeCloseTo(13.1, 2);
    });

    it("should correctly identify POI far from highway", () => {
      // Simulating a highway going east-west
      const highway: [number, number][] = [
        [52.5, 13.0],
        [52.5, 13.1],
        [52.5, 13.2],
        [52.5, 13.3],
      ];
      // Fuel station 500m south of highway (should be filtered out)
      const result = findClosestPointOnRoute(52.4955, 13.15, highway);

      expect(result).not.toBeNull();
      expect(result!.distanceToRoute).toBeGreaterThan(400);
      expect(result!.distanceToRoute).toBeLessThan(600);
    });

    it("should correctly identify POI on highway service area", () => {
      // Simulating a highway going east-west
      const highway: [number, number][] = [
        [52.5, 13.0],
        [52.5, 13.1],
        [52.5, 13.2],
        [52.5, 13.3],
      ];
      // Service area fuel station right on the highway (within 50m)
      const result = findClosestPointOnRoute(52.5004, 13.15, highway);

      expect(result).not.toBeNull();
      expect(result!.distanceToRoute).toBeLessThan(50);
    });
  });

  describe("calculateCurvature", () => {
    it("should return 0 for straight path", () => {
      // Three points in a straight line going north
      const curvature = calculateCurvature(
        52.5,
        13.4,
        52.51,
        13.4,
        52.52,
        13.4,
      );
      expect(curvature).toBeLessThan(0.01);
    });

    it("should detect 90-degree turn", () => {
      // Three points forming a right angle
      // Going east then north
      const curvature = calculateCurvature(
        52.5,
        13.4,
        52.5,
        13.41,
        52.51,
        13.41,
      );
      // Should have significant curvature (90 degree turn over ~1500m)
      expect(curvature).toBeGreaterThan(0.03);
      expect(curvature).toBeLessThan(0.15);
    });

    it("should detect sharp turn (180 degrees)", () => {
      // Three points forming a U-turn
      const curvature = calculateCurvature(52.5, 13.4, 52.5, 13.41, 52.5, 13.4);
      // Should have high curvature for U-turn
      expect(curvature).toBeGreaterThan(0.1);
    });

    it("should return 0 for very short distances", () => {
      // Points very close together (< 1m)
      const curvature = calculateCurvature(
        52.5,
        13.4,
        52.5000001,
        13.4,
        52.5000002,
        13.4,
      );
      expect(curvature).toBe(0);
    });

    it("should detect gentle curve", () => {
      // Slight curve (about 30 degrees over ~1km)
      const curvature = calculateCurvature(
        52.5,
        13.4,
        52.505,
        13.402,
        52.51,
        13.407,
      );
      // Gentle curve should have low but measurable curvature
      expect(curvature).toBeGreaterThan(0.005);
      expect(curvature).toBeLessThan(0.05);
    });
  });

  describe("calculateCorneringSpeed", () => {
    it("should return max speed for straight road", () => {
      const speed = calculateCorneringSpeed(0.05, 100);
      expect(speed).toBe(100);
    });

    it("should reduce speed for sharp turns", () => {
      // High curvature (sharp turn)
      const speed = calculateCorneringSpeed(1.0, 100);
      expect(speed).toBeLessThan(50);
      expect(speed).toBeGreaterThan(5);
    });

    it("should reduce speed moderately for gentle curves", () => {
      // Moderate curvature
      const speed = calculateCorneringSpeed(0.3, 100);
      expect(speed).toBeLessThan(100);
      expect(speed).toBeGreaterThan(30);
    });

    it("should never go below minimum speed", () => {
      // Extreme curvature
      const speed = calculateCorneringSpeed(10, 100);
      expect(speed).toBeGreaterThanOrEqual(5);
    });

    it("should respect comfort level parameter", () => {
      const normalComfort = calculateCorneringSpeed(0.5, 100, 2.5);
      const highComfort = calculateCorneringSpeed(0.5, 100, 4.0);
      // Higher comfort level (more lateral acceleration) allows faster speed
      expect(highComfort).toBeGreaterThan(normalComfort);
    });
  });

  describe("calculateSpeedForUpcomingCurve", () => {
    it("should return current speed if target is higher", () => {
      const speed = calculateSpeedForUpcomingCurve(50, 60, 100);
      expect(speed).toBe(50);
    });

    it("should return current speed if far from curve", () => {
      const speed = calculateSpeedForUpcomingCurve(100, 30, 500);
      // With default deceleration (2.0 m/s²), can slow from 100 to 30 km/h over ~500m
      expect(speed).toBeGreaterThan(90);
    });

    it("should reduce speed when close to curve", () => {
      const speed = calculateSpeedForUpcomingCurve(100, 30, 50);
      // Only 50m to curve, need to slow down
      expect(speed).toBeLessThan(100);
    });

    it("should require braking very close to curve", () => {
      const speed = calculateSpeedForUpcomingCurve(100, 20, 20);
      // Very close to sharp curve
      expect(speed).toBeLessThan(50);
    });

    it("should respect deceleration parameter", () => {
      const gentleBraking = calculateSpeedForUpcomingCurve(100, 30, 100, 1.5);
      const hardBraking = calculateSpeedForUpcomingCurve(100, 30, 100, 3.0);
      // Hard braking allows maintaining higher speed longer
      expect(hardBraking).toBeGreaterThan(gentleBraking);
    });
  });

  describe("findMaxCurvatureAhead", () => {
    it("should return null for insufficient points", () => {
      const points: [number, number][] = [
        [52.5, 13.4],
        [52.51, 13.4],
      ];
      expect(findMaxCurvatureAhead(points, 0, 1000)).toBeNull();
    });

    it("should return null if starting at end", () => {
      const points: [number, number][] = [
        [52.5, 13.4],
        [52.51, 13.4],
        [52.52, 13.4],
      ];
      expect(findMaxCurvatureAhead(points, 2, 1000)).toBeNull();
    });

    it("should find curvature in straight path", () => {
      const points: [number, number][] = [
        [52.5, 13.4],
        [52.51, 13.4],
        [52.52, 13.4],
        [52.53, 13.4],
      ];
      const result = findMaxCurvatureAhead(points, 0, 5000);
      expect(result).not.toBeNull();
      expect(result!.maxCurvature).toBeLessThan(0.1);
    });

    it("should find curve ahead", () => {
      const points: [number, number][] = [
        [52.5, 13.4], // Start
        [52.51, 13.4], // Going north
        [52.52, 13.4], // Still north
        [52.52, 13.41], // Turn east (90 degree turn)
        [52.52, 13.42], // Continue east
      ];
      const result = findMaxCurvatureAhead(points, 0, 10000);
      expect(result).not.toBeNull();
      expect(result!.maxCurvature).toBeGreaterThan(0.02);
      expect(result!.distanceToCurve).toBeGreaterThan(0);
    });

    it("should respect lookahead distance", () => {
      const points: [number, number][] = [
        [52.5, 13.4],
        [52.51, 13.4],
        [52.52, 13.4], // Curve is here (2.2km from start)
        [52.52, 13.41],
        [52.52, 13.42],
      ];
      // With short lookahead, should not detect distant curve
      const shortResult = findMaxCurvatureAhead(points, 0, 500);
      const longResult = findMaxCurvatureAhead(points, 0, 5000);

      expect(shortResult).not.toBeNull();
      expect(longResult).not.toBeNull();
      // Short lookahead might not see the curve
      expect(longResult!.maxCurvature).toBeGreaterThanOrEqual(
        shortResult!.maxCurvature,
      );
    });
  });
});
