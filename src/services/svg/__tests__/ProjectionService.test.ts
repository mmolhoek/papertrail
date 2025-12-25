import { ProjectionService } from "../ProjectionService";
import { ViewportConfig } from "@core/types";

describe("ProjectionService", () => {
  const createViewport = (
    overrides: Partial<ViewportConfig> = {},
  ): ViewportConfig => ({
    width: 800,
    height: 480,
    centerPoint: {
      latitude: 51.5074,
      longitude: -0.1278,
      timestamp: new Date(),
    },
    zoomLevel: 15,
    ...overrides,
  });

  describe("projectToPixels", () => {
    it("should project center point to center of viewport", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectToPixels(
        viewport.centerPoint.latitude,
        viewport.centerPoint.longitude,
        viewport,
      );

      expect(result.x).toBe(viewport.width / 2);
      expect(result.y).toBe(viewport.height / 2);
    });

    it("should project point north of center to upper half of viewport", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectToPixels(
        viewport.centerPoint.latitude + 0.001, // Slightly north
        viewport.centerPoint.longitude,
        viewport,
      );

      // Y should be less than center (north is up, y increases down)
      expect(result.y).toBeLessThan(viewport.height / 2);
    });

    it("should project point south of center to lower half of viewport", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectToPixels(
        viewport.centerPoint.latitude - 0.001, // Slightly south
        viewport.centerPoint.longitude,
        viewport,
      );

      expect(result.y).toBeGreaterThan(viewport.height / 2);
    });

    it("should project point east of center to right half of viewport", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectToPixels(
        viewport.centerPoint.latitude,
        viewport.centerPoint.longitude + 0.001, // Slightly east
        viewport,
      );

      expect(result.x).toBeGreaterThan(viewport.width / 2);
    });

    it("should project point west of center to left half of viewport", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectToPixels(
        viewport.centerPoint.latitude,
        viewport.centerPoint.longitude - 0.001, // Slightly west
        viewport,
      );

      expect(result.x).toBeLessThan(viewport.width / 2);
    });

    it("should move points further from center at lower zoom levels", () => {
      const highZoomViewport = createViewport({ zoomLevel: 15 });
      const lowZoomViewport = createViewport({ zoomLevel: 10 });

      const highZoomResult = ProjectionService.projectToPixels(
        51.51, // North of center
        -0.12, // East of center
        highZoomViewport,
      );

      const lowZoomResult = ProjectionService.projectToPixels(
        51.51,
        -0.12,
        lowZoomViewport,
      );

      // At lower zoom, the same coordinate should be closer to center in pixels
      const highZoomDistance = Math.sqrt(
        Math.pow(highZoomResult.x - 400, 2) +
          Math.pow(highZoomResult.y - 240, 2),
      );
      const lowZoomDistance = Math.sqrt(
        Math.pow(lowZoomResult.x - 400, 2) + Math.pow(lowZoomResult.y - 240, 2),
      );

      expect(lowZoomDistance).toBeLessThan(highZoomDistance);
    });

    it("should handle coordinates at the equator", () => {
      const viewport = createViewport({
        centerPoint: {
          latitude: 0,
          longitude: 0,
          timestamp: new Date(),
        },
      });

      const result = ProjectionService.projectToPixels(0.001, 0.001, viewport);

      expect(result.x).toBeGreaterThan(viewport.width / 2);
      expect(result.y).toBeLessThan(viewport.height / 2);
    });

    it("should handle coordinates near poles with latitude correction", () => {
      const viewport = createViewport({
        centerPoint: {
          latitude: 70, // High latitude
          longitude: 0,
          timestamp: new Date(),
        },
      });

      const result = ProjectionService.projectToPixels(70.001, 0.01, viewport);

      // Should still produce valid coordinates
      expect(typeof result.x).toBe("number");
      expect(typeof result.y).toBe("number");
      expect(isFinite(result.x)).toBe(true);
      expect(isFinite(result.y)).toBe(true);
    });

    it("should return rounded pixel coordinates", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectToPixels(
        51.5075,
        -0.1277,
        viewport,
      );

      expect(Number.isInteger(result.x)).toBe(true);
      expect(Number.isInteger(result.y)).toBe(true);
    });
  });

  describe("calculateMetersPerPixel", () => {
    it("should return smaller value at higher zoom levels", () => {
      const lowZoom = ProjectionService.calculateMetersPerPixel(51.5, 10);
      const highZoom = ProjectionService.calculateMetersPerPixel(51.5, 15);

      expect(highZoom).toBeLessThan(lowZoom);
    });

    it("should halve the value when zoom increases by 1", () => {
      const zoom10 = ProjectionService.calculateMetersPerPixel(51.5, 10);
      const zoom11 = ProjectionService.calculateMetersPerPixel(51.5, 11);

      expect(zoom11).toBeCloseTo(zoom10 / 2, 5);
    });

    it("should return larger value at equator than at high latitude", () => {
      const equator = ProjectionService.calculateMetersPerPixel(0, 15);
      const highLat = ProjectionService.calculateMetersPerPixel(60, 15);

      expect(equator).toBeGreaterThan(highLat);
    });

    it("should return approximately 1m per pixel at zoom 17 mid-latitudes", () => {
      const result = ProjectionService.calculateMetersPerPixel(45, 17);

      // At zoom 17, ~1.19m per pixel at equator, less at higher latitudes
      expect(result).toBeLessThan(2);
      expect(result).toBeGreaterThan(0.5);
    });

    it("should handle zoom level 0", () => {
      const result = ProjectionService.calculateMetersPerPixel(0, 0);

      // At zoom 0, whole world in 256 pixels, so ~156km per pixel
      expect(result).toBeCloseTo(156543.03392, 0);
    });

    it("should handle negative latitude (southern hemisphere)", () => {
      const northern = ProjectionService.calculateMetersPerPixel(45, 15);
      const southern = ProjectionService.calculateMetersPerPixel(-45, 15);

      // Should be the same due to cosine symmetry
      expect(northern).toBeCloseTo(southern, 5);
    });
  });

  describe("rotatePoint", () => {
    it("should not change point at 0 degrees rotation", () => {
      const point = { x: 100, y: 50 };

      const result = ProjectionService.rotatePoint(point, 50, 50, 0);

      expect(result.x).toBe(100);
      expect(result.y).toBe(50);
    });

    it("should rotate point 90 degrees clockwise", () => {
      const point = { x: 100, y: 50 }; // 50 to the right of center

      const result = ProjectionService.rotatePoint(point, 50, 50, 90);

      // After 90 degree rotation, should be 50 below center
      expect(result.x).toBe(50);
      expect(result.y).toBe(100);
    });

    it("should rotate point 180 degrees", () => {
      const point = { x: 100, y: 50 };

      const result = ProjectionService.rotatePoint(point, 50, 50, 180);

      expect(result.x).toBe(0);
      expect(result.y).toBe(50);
    });

    it("should rotate point 270 degrees clockwise", () => {
      const point = { x: 100, y: 50 };

      const result = ProjectionService.rotatePoint(point, 50, 50, 270);

      expect(result.x).toBe(50);
      expect(result.y).toBe(0);
    });

    it("should rotate point -90 degrees (counterclockwise)", () => {
      const point = { x: 100, y: 50 };

      const result = ProjectionService.rotatePoint(point, 50, 50, -90);

      expect(result.x).toBe(50);
      expect(result.y).toBe(0);
    });

    it("should not move center point", () => {
      const point = { x: 50, y: 50 };

      const result = ProjectionService.rotatePoint(point, 50, 50, 45);

      expect(result.x).toBe(50);
      expect(result.y).toBe(50);
    });

    it("should rotate point 45 degrees", () => {
      const point = { x: 60, y: 50 }; // 10 to the right of center

      const result = ProjectionService.rotatePoint(point, 50, 50, 45);

      // After 45 degree rotation, x and y offsets should be equal
      const dx = result.x - 50;
      const dy = result.y - 50;
      expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy), 0);
    });

    it("should return rounded coordinates", () => {
      const point = { x: 55, y: 45 };

      const result = ProjectionService.rotatePoint(point, 50, 50, 33);

      expect(Number.isInteger(result.x)).toBe(true);
      expect(Number.isInteger(result.y)).toBe(true);
    });
  });

  describe("projectCoordinates", () => {
    it("should project array of coordinates", () => {
      const viewport = createViewport();
      const coordinates = [
        { latitude: 51.5074, longitude: -0.1278 },
        { latitude: 51.508, longitude: -0.127 },
        { latitude: 51.509, longitude: -0.126 },
      ];

      const result = ProjectionService.projectCoordinates(
        coordinates,
        viewport,
      );

      expect(result).toHaveLength(3);
      result.forEach((point) => {
        expect(typeof point.x).toBe("number");
        expect(typeof point.y).toBe("number");
      });
    });

    it("should return empty array for empty input", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectCoordinates([], viewport);

      expect(result).toEqual([]);
    });

    it("should project each coordinate independently", () => {
      const viewport = createViewport();
      const coordinates = [
        { latitude: 51.5074, longitude: -0.1278 },
        { latitude: 51.51, longitude: -0.12 },
      ];

      const result = ProjectionService.projectCoordinates(
        coordinates,
        viewport,
      );

      const individual1 = ProjectionService.projectToPixels(
        51.5074,
        -0.1278,
        viewport,
      );
      const individual2 = ProjectionService.projectToPixels(
        51.51,
        -0.12,
        viewport,
      );

      expect(result[0]).toEqual(individual1);
      expect(result[1]).toEqual(individual2);
    });
  });

  describe("projectAndRotateCoordinates", () => {
    it("should project and rotate coordinates", () => {
      const viewport = createViewport();
      const coordinates = [
        { latitude: 51.5074, longitude: -0.1278 },
        { latitude: 51.508, longitude: -0.127 },
      ];

      const result = ProjectionService.projectAndRotateCoordinates(
        coordinates,
        viewport,
        45,
      );

      expect(result).toHaveLength(2);
    });

    it("should return same as projectCoordinates when bearing is 0", () => {
      const viewport = createViewport();
      const coordinates = [
        { latitude: 51.5074, longitude: -0.1278 },
        { latitude: 51.508, longitude: -0.127 },
      ];

      const rotated = ProjectionService.projectAndRotateCoordinates(
        coordinates,
        viewport,
        0,
      );
      const projected = ProjectionService.projectCoordinates(
        coordinates,
        viewport,
      );

      expect(rotated[0]).toEqual(projected[0]);
      expect(rotated[1]).toEqual(projected[1]);
    });

    it("should rotate around viewport center", () => {
      const viewport = createViewport();
      const centerCoord = {
        latitude: viewport.centerPoint.latitude,
        longitude: viewport.centerPoint.longitude,
      };

      const result = ProjectionService.projectAndRotateCoordinates(
        [centerCoord],
        viewport,
        90,
      );

      // Center point should stay at center after rotation
      expect(result[0].x).toBe(viewport.width / 2);
      expect(result[0].y).toBe(viewport.height / 2);
    });

    it("should handle empty array", () => {
      const viewport = createViewport();

      const result = ProjectionService.projectAndRotateCoordinates(
        [],
        viewport,
        45,
      );

      expect(result).toEqual([]);
    });

    it("should apply negative bearing for track-up rotation", () => {
      const viewport = createViewport();
      const coordinates = [
        { latitude: 51.51, longitude: -0.1278 }, // Point north of center
      ];

      // With bearing 90 (facing east), the point north should appear to the left
      const result = ProjectionService.projectAndRotateCoordinates(
        coordinates,
        viewport,
        90,
      );

      // After rotating by -90 degrees, point that was above should be to the left
      expect(result[0].x).toBeLessThan(viewport.width / 2);
    });
  });

  describe("integration tests", () => {
    it("should handle a complete GPS track projection", () => {
      const viewport = createViewport({
        width: 800,
        height: 480,
        centerPoint: {
          latitude: 51.5074,
          longitude: -0.1278,
          timestamp: new Date(),
        },
        zoomLevel: 16,
      });

      // Simulate a short GPS track
      const track = [
        { latitude: 51.507, longitude: -0.128 },
        { latitude: 51.5072, longitude: -0.1278 },
        { latitude: 51.5074, longitude: -0.1276 },
        { latitude: 51.5076, longitude: -0.1274 },
        { latitude: 51.5078, longitude: -0.1272 },
      ];

      const projected = ProjectionService.projectCoordinates(track, viewport);

      // All points should be within reasonable range of viewport
      projected.forEach((point) => {
        expect(point.x).toBeGreaterThan(-100);
        expect(point.x).toBeLessThan(900);
        expect(point.y).toBeGreaterThan(-100);
        expect(point.y).toBeLessThan(580);
      });

      // Track should progress in a consistent direction
      for (let i = 1; i < projected.length; i++) {
        // Each point should be northeast of the previous one
        expect(projected[i].x).toBeGreaterThan(projected[i - 1].x);
        expect(projected[i].y).toBeLessThan(projected[i - 1].y);
      }
    });

    it("should maintain relative positions after rotation", () => {
      const viewport = createViewport();
      const coordinates = [
        { latitude: 51.5074, longitude: -0.1278 }, // Center
        { latitude: 51.51, longitude: -0.1278 }, // North of center
      ];

      const rotated = ProjectionService.projectAndRotateCoordinates(
        coordinates,
        viewport,
        90,
      );

      // Distance between points should be preserved
      const projected = ProjectionService.projectCoordinates(
        coordinates,
        viewport,
      );
      const originalDist = Math.sqrt(
        Math.pow(projected[1].x - projected[0].x, 2) +
          Math.pow(projected[1].y - projected[0].y, 2),
      );
      const rotatedDist = Math.sqrt(
        Math.pow(rotated[1].x - rotated[0].x, 2) +
          Math.pow(rotated[1].y - rotated[0].y, 2),
      );

      expect(rotatedDist).toBeCloseTo(originalDist, 0);
    });
  });
});
