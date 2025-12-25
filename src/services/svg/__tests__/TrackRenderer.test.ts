import { TrackRenderer } from "../TrackRenderer";
import { BitmapUtils } from "../BitmapUtils";
import { GPXTrack, ViewportConfig, RenderOptions } from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("TrackRenderer", () => {
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

  const createRenderOptions = (
    overrides: Partial<RenderOptions> = {},
  ): RenderOptions => ({
    lineWidth: 2,
    pointRadius: 3,
    showPoints: true,
    showLine: true,
    highlightCurrentPosition: true,
    showDirection: false,
    antiAlias: false,
    ...overrides,
  });

  const createTrack = (
    points: Array<{ latitude: number; longitude: number }> = [
      { latitude: 51.507, longitude: -0.128 },
      { latitude: 51.508, longitude: -0.127 },
      { latitude: 51.509, longitude: -0.126 },
    ],
  ): GPXTrack => ({
    name: "Test Track",
    segments: [
      {
        points: points.map((p) => ({
          ...p,
          altitude: 0,
          timestamp: new Date(),
        })),
      },
    ],
  });

  describe("renderTrack", () => {
    it("should return 0 for empty track", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const track = createTrack([]);

      const result = TrackRenderer.renderTrack(
        bitmap,
        track,
        viewport,
        options,
      );

      expect(result).toBe(0);
    });

    it("should return 0 for track with no segments", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const track: GPXTrack = { name: "Empty", segments: [] };

      const result = TrackRenderer.renderTrack(
        bitmap,
        track,
        viewport,
        options,
      );

      expect(result).toBe(0);
    });

    it("should render track points onto bitmap", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const track = createTrack();

      const result = TrackRenderer.renderTrack(
        bitmap,
        track,
        viewport,
        options,
      );

      expect(result).toBe(3);
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should render track lines when showLine is true", () => {
      const withLineBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const withoutLineBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const track = createTrack();

      TrackRenderer.renderTrack(
        withLineBitmap,
        track,
        viewport,
        createRenderOptions({ showLine: true, showPoints: false }),
      );
      TrackRenderer.renderTrack(
        withoutLineBitmap,
        track,
        viewport,
        createRenderOptions({ showLine: false, showPoints: false }),
      );

      const withLinePixels = countBlackPixels(withLineBitmap);
      const withoutLinePixels = countBlackPixels(withoutLineBitmap);

      expect(withLinePixels).toBeGreaterThan(withoutLinePixels);
    });

    it("should render track points when showPoints is true", () => {
      const withPointsBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const withoutPointsBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const track = createTrack();

      TrackRenderer.renderTrack(
        withPointsBitmap,
        track,
        viewport,
        createRenderOptions({ showLine: false, showPoints: true }),
      );
      TrackRenderer.renderTrack(
        withoutPointsBitmap,
        track,
        viewport,
        createRenderOptions({ showLine: false, showPoints: false }),
      );

      const withPointsPixels = countBlackPixels(withPointsBitmap);
      const withoutPointsPixels = countBlackPixels(withoutPointsBitmap);

      expect(withPointsPixels).toBeGreaterThan(withoutPointsPixels);
    });

    it("should apply rotation when rotateWithBearing is true", () => {
      const rotatedBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const unrotatedBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport({
        centerPoint: {
          latitude: 51.5074,
          longitude: -0.1278,
          bearing: 90,
          timestamp: new Date(),
        },
      });
      const track = createTrack();

      TrackRenderer.renderTrack(
        rotatedBitmap,
        track,
        viewport,
        createRenderOptions({ rotateWithBearing: true }),
      );
      TrackRenderer.renderTrack(
        unrotatedBitmap,
        track,
        viewport,
        createRenderOptions({ rotateWithBearing: false }),
      );

      let differences = 0;
      for (let i = 0; i < rotatedBitmap.data.length; i++) {
        if (rotatedBitmap.data[i] !== unrotatedBitmap.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it("should not rotate when bearing is undefined", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport(); // No bearing
      const options = createRenderOptions({ rotateWithBearing: true });
      const track = createTrack();

      const result = TrackRenderer.renderTrack(
        bitmap,
        track,
        viewport,
        options,
      );

      expect(result).toBe(3);
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("renderTrackInArea", () => {
    it("should render track within constrained area", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const track = createTrack();

      const result = TrackRenderer.renderTrackInArea(
        bitmap,
        track,
        viewport,
        options,
        400,
      );

      expect(result).toBe(3);
    });

    it("should return 0 for empty track", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const track = createTrack([]);

      const result = TrackRenderer.renderTrackInArea(
        bitmap,
        track,
        viewport,
        options,
        400,
      );

      expect(result).toBe(0);
    });

    it("should clip rendering at maxX boundary", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions({ showLine: true });
      // Create track spanning the center
      const track = createTrack([
        { latitude: 51.5074, longitude: -0.13 },
        { latitude: 51.5074, longitude: -0.12 },
      ]);

      TrackRenderer.renderTrackInArea(bitmap, track, viewport, options, 400);

      // Count pixels in right half - should be minimal
      let rightHalfBlack = 0;
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      for (let y = 0; y < 480; y++) {
        for (let x = 50; x < 100; x++) {
          rightHalfBlack += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      expect(rightHalfBlack).toBeLessThan(500);
    });
  });

  describe("renderProjectedPoints", () => {
    it("should draw lines between projected points", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [
        { x: 20, y: 20 },
        { x: 80, y: 80 },
      ];
      const options = createRenderOptions({
        showLine: true,
        showPoints: false,
      });

      TrackRenderer.renderProjectedPoints(bitmap, points, options);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw circles at each point when showPoints is true", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [
        { x: 30, y: 30 },
        { x: 70, y: 70 },
      ];
      const options = createRenderOptions({
        showLine: false,
        showPoints: true,
      });

      TrackRenderer.renderProjectedPoints(bitmap, points, options);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle single point", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [{ x: 50, y: 50 }];
      const options = createRenderOptions({ showLine: true, showPoints: true });

      TrackRenderer.renderProjectedPoints(bitmap, points, options);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("renderProjectedPointsInArea", () => {
    it("should only render points within maxX", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [
        { x: 20, y: 50 },
        { x: 80, y: 50 }, // Outside maxX=50
      ];
      const options = createRenderOptions({
        showLine: false,
        showPoints: true,
      });

      TrackRenderer.renderProjectedPointsInArea(bitmap, points, options, 50);

      // Count pixels in left half
      let leftHalfBlack = 0;
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 6; x++) {
          // First 6 bytes = 48 pixels
          leftHalfBlack += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      expect(leftHalfBlack).toBeGreaterThan(0);
    });

    it("should draw line segment if one point is in area", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [
        { x: 20, y: 50 },
        { x: 80, y: 50 },
      ];
      const options = createRenderOptions({
        showLine: true,
        showPoints: false,
      });

      TrackRenderer.renderProjectedPointsInArea(bitmap, points, options, 50);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("renderPositionMarker", () => {
    it("should draw position marker", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderPositionMarker(bitmap, center);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should use custom radius", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const largeBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderPositionMarker(smallBitmap, center, 5);
      TrackRenderer.renderPositionMarker(largeBitmap, center, 15);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });
  });

  describe("renderWaypointMarker", () => {
    it("should draw waypoint marker with double circle", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderWaypointMarker(bitmap, center);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should use custom radii", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderWaypointMarker(bitmap, center, 4, 10);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("renderStartMarker", () => {
    it("should draw start marker", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderStartMarker(bitmap, center);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should scale with radius parameter", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const largeBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderStartMarker(smallBitmap, center, 8);
      TrackRenderer.renderStartMarker(largeBitmap, center, 16);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });
  });

  describe("renderEndMarker", () => {
    it("should draw end marker (checkered flag)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderEndMarker(bitmap, center);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should scale with size parameter", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const largeBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const center = { x: 50, y: 50 };

      TrackRenderer.renderEndMarker(smallBitmap, center, 10);
      TrackRenderer.renderEndMarker(largeBitmap, center, 20);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });
  });

  describe("renderRouteGeometry", () => {
    it("should render route from geometry array", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const geometry: [number, number][] = [
        [51.507, -0.128],
        [51.508, -0.127],
        [51.509, -0.126],
      ];

      const result = TrackRenderer.renderRouteGeometry(
        bitmap,
        geometry,
        viewport,
        options,
      );

      expect(result).toBe(3);
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should return 0 for geometry with less than 2 points", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();

      const result1 = TrackRenderer.renderRouteGeometry(
        bitmap,
        [],
        viewport,
        options,
      );
      const result2 = TrackRenderer.renderRouteGeometry(
        bitmap,
        [[51.5, -0.1]],
        viewport,
        options,
      );

      expect(result1).toBe(0);
      expect(result2).toBe(0);
    });

    it("should respect maxX constraint", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const geometry: [number, number][] = [
        [51.5074, -0.13],
        [51.5074, -0.12],
      ];

      TrackRenderer.renderRouteGeometry(
        bitmap,
        geometry,
        viewport,
        options,
        400,
      );

      // Count pixels in right half - should be minimal
      let rightHalfBlack = 0;
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      for (let y = 0; y < 480; y++) {
        for (let x = 50; x < 100; x++) {
          rightHalfBlack += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      expect(rightHalfBlack).toBeLessThan(500);
    });

    it("should not render points (line only)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions({ showPoints: true, showLine: true });
      const geometry: [number, number][] = [
        [51.507, -0.128],
        [51.508, -0.127],
      ];

      TrackRenderer.renderRouteGeometry(bitmap, geometry, viewport, options);

      // Should have rendered something (lines only, not points)
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("renderProjectedPointsWithCount", () => {
    it("should only render specified count of points", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [
        { x: 20, y: 20 },
        { x: 50, y: 50 },
        { x: 80, y: 80 },
        { x: 90, y: 90 },
      ];
      const options = createRenderOptions({ showLine: true, showPoints: true });

      // Only render first 2 points
      TrackRenderer.renderProjectedPointsWithCount(bitmap, points, 2, options);

      const pixelCount = countBlackPixels(bitmap);
      expect(pixelCount).toBeGreaterThan(0);

      // Render all 4 points for comparison
      const fullBitmap = BitmapUtils.createBlankBitmap(100, 100);
      TrackRenderer.renderProjectedPointsWithCount(
        fullBitmap,
        points,
        4,
        options,
      );
      const fullPixelCount = countBlackPixels(fullBitmap);

      expect(fullPixelCount).toBeGreaterThan(pixelCount);
    });
  });

  describe("renderProjectedPointsInAreaWithCount", () => {
    it("should render with count and area constraint", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);
      const points = [
        { x: 20, y: 20 },
        { x: 40, y: 40 },
        { x: 60, y: 60 }, // Outside maxX=50
        { x: 80, y: 80 }, // Outside maxX=50
      ];
      const options = createRenderOptions({ showLine: true, showPoints: true });

      TrackRenderer.renderProjectedPointsInAreaWithCount(
        bitmap,
        points,
        4,
        options,
        50,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle track with single point", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const options = createRenderOptions();
      const track = createTrack([{ latitude: 51.5074, longitude: -0.1278 }]);

      const result = TrackRenderer.renderTrack(
        bitmap,
        track,
        viewport,
        options,
      );

      expect(result).toBe(1);
    });

    it("should handle position marker at edge of bitmap", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      // Should not throw
      TrackRenderer.renderPositionMarker(bitmap, { x: 5, y: 5 });
      TrackRenderer.renderPositionMarker(bitmap, { x: 95, y: 95 });

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle markers outside bitmap bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      // Should not throw
      TrackRenderer.renderPositionMarker(bitmap, { x: -10, y: -10 });
      TrackRenderer.renderStartMarker(bitmap, { x: 110, y: 110 });
      TrackRenderer.renderEndMarker(bitmap, { x: -20, y: 50 });

      // Bitmap should still be valid
      expect(bitmap.data.length).toBeGreaterThan(0);
    });
  });
});

// Helper functions for tests
function countBits(byte: number): number {
  let count = 0;
  while (byte) {
    count += byte & 1;
    byte >>= 1;
  }
  return count;
}

function countBlackPixels(bitmap: { data: Uint8Array }): number {
  let count = 0;
  for (let i = 0; i < bitmap.data.length; i++) {
    count += 8 - countBits(bitmap.data[i]);
  }
  return count;
}
