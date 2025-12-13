import {
  haversineDistance,
  distanceBetween,
  calculateBearing,
  degreesToRadians,
  radiansToDegrees,
  normalizeBearing,
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
});
