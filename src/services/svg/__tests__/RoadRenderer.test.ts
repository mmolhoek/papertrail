import { RoadRenderer } from "../RoadRenderer";
import { BitmapUtils } from "../BitmapUtils";
import { CachedRoad } from "@core/interfaces";
import { ViewportConfig } from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("RoadRenderer", () => {
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

  const createRoad = (overrides: Partial<CachedRoad> = {}): CachedRoad => ({
    wayId: 12345,
    highwayType: "residential",
    name: "Test Road",
    geometry: [
      [51.507, -0.128],
      [51.508, -0.127],
      [51.509, -0.126],
    ],
    ...overrides,
  });

  describe("renderRoads", () => {
    it("should return 0 for empty roads array", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();

      const result = RoadRenderer.renderRoads(bitmap, [], viewport);

      expect(result).toBe(0);
    });

    it("should render roads onto bitmap", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [createRoad()];

      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(1);
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should render multiple roads", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({ wayId: 1 }),
        createRoad({
          wayId: 2,
          geometry: [
            [51.506, -0.129],
            [51.507, -0.128],
          ],
        }),
        createRoad({
          wayId: 3,
          geometry: [
            [51.508, -0.127],
            [51.509, -0.126],
          ],
        }),
      ];

      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(3);
    });

    it("should render major roads last (on top)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({ wayId: 1, highwayType: "motorway" }),
        createRoad({ wayId: 2, highwayType: "residential" }),
        createRoad({ wayId: 3, highwayType: "primary" }),
      ];

      // Should render without error (priority sorting)
      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(3);
    });

    it("should skip roads outside viewport", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({
          geometry: [
            [52.5, 0.1], // Far from viewport center
            [52.51, 0.11],
          ],
        }),
      ];

      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(0);
    });

    it("should apply rotation when rotateWithBearing is true", () => {
      const bitmap1 = BitmapUtils.createBlankBitmap(800, 480);
      const bitmap2 = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport({
        centerPoint: {
          latitude: 51.5074,
          longitude: -0.1278,
          bearing: 90,
          timestamp: new Date(),
        },
      });
      const roads = [createRoad()];

      RoadRenderer.renderRoads(bitmap1, roads, viewport, false);
      RoadRenderer.renderRoads(bitmap2, roads, viewport, true);

      // Bitmaps should be different due to rotation
      let differences = 0;
      for (let i = 0; i < bitmap1.data.length; i++) {
        if (bitmap1.data[i] !== bitmap2.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it("should not rotate when bearing is undefined", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport(); // No bearing
      const roads = [createRoad()];

      const result = RoadRenderer.renderRoads(bitmap, roads, viewport, true);

      expect(result).toBe(1);
    });

    it("should respect maxX clipping", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({
          geometry: [
            [51.5074, -0.13],
            [51.5074, -0.12], // Horizontal line across center
          ],
        }),
      ];

      RoadRenderer.renderRoads(bitmap, roads, viewport, false, 400);

      // Check that right half is mostly white
      let rightHalfBlack = 0;
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      for (let y = 0; y < 480; y++) {
        for (let x = 50; x < 100; x++) {
          // Bytes 50-99 cover pixels 400-800
          rightHalfBlack += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      // Right half should have far fewer black pixels
      expect(rightHalfBlack).toBeLessThan(1000);
    });

    it("should use different line widths for different road types", () => {
      const motorwayBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const residentialBitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();

      const motorwayRoad = createRoad({ highwayType: "motorway" });
      const residentialRoad = createRoad({ highwayType: "residential" });

      RoadRenderer.renderRoads(motorwayBitmap, [motorwayRoad], viewport);
      RoadRenderer.renderRoads(residentialBitmap, [residentialRoad], viewport);

      // Motorway should have more black pixels (wider lines)
      const motorwayPixels = countBlackPixels(motorwayBitmap);
      const residentialPixels = countBlackPixels(residentialBitmap);

      expect(motorwayPixels).toBeGreaterThan(residentialPixels);
    });
  });

  describe("filterRoadsInBounds", () => {
    it("should return empty array for empty roads", () => {
      const result = RoadRenderer.filterRoadsInBounds([], 51, 52, -1, 0);

      expect(result).toEqual([]);
    });

    it("should filter roads within bounds", () => {
      const roads = [
        createRoad({
          wayId: 1,
          geometry: [
            [51.5, -0.1],
            [51.51, -0.09],
          ],
        }),
        createRoad({
          wayId: 2,
          geometry: [
            [52.5, 0.1], // Outside bounds
            [52.51, 0.11],
          ],
        }),
      ];

      const result = RoadRenderer.filterRoadsInBounds(
        roads,
        51.0,
        52.0,
        -0.5,
        0.0,
      );

      expect(result).toHaveLength(1);
      expect(result[0].wayId).toBe(1);
    });

    it("should include roads partially within bounds", () => {
      const roads = [
        createRoad({
          geometry: [
            [51.0, -0.1], // One end inside
            [52.5, -0.1], // Other end outside
          ],
        }),
      ];

      const result = RoadRenderer.filterRoadsInBounds(
        roads,
        51.0,
        52.0,
        -0.5,
        0.0,
      );

      expect(result).toHaveLength(1);
    });

    it("should use margin to expand bounds", () => {
      const roads = [
        createRoad({
          geometry: [
            [51.005, -0.1], // Just outside minLat=51.01
            [51.006, -0.1],
          ],
        }),
      ];

      // Without margin, road would be outside
      const withoutMargin = RoadRenderer.filterRoadsInBounds(
        roads,
        51.01,
        52.0,
        -0.5,
        0.0,
        0,
      );
      expect(withoutMargin).toHaveLength(0);

      // With margin, road should be included
      const withMargin = RoadRenderer.filterRoadsInBounds(
        roads,
        51.01,
        52.0,
        -0.5,
        0.0,
        0.01,
      );
      expect(withMargin).toHaveLength(1);
    });

    it("should return all roads if all are within bounds", () => {
      const roads = [
        createRoad({
          wayId: 1,
          geometry: [
            [51.5, -0.1],
            [51.51, -0.09],
          ],
        }),
        createRoad({
          wayId: 2,
          geometry: [
            [51.6, -0.15],
            [51.61, -0.14],
          ],
        }),
        createRoad({
          wayId: 3,
          geometry: [
            [51.7, -0.2],
            [51.71, -0.19],
          ],
        }),
      ];

      const result = RoadRenderer.filterRoadsInBounds(
        roads,
        51.0,
        52.0,
        -0.5,
        0.0,
      );

      expect(result).toHaveLength(3);
    });
  });

  describe("getViewportBounds", () => {
    it("should return bounds centered on viewport center", () => {
      const viewport = createViewport({
        centerPoint: {
          latitude: 51.5,
          longitude: -0.1,
          timestamp: new Date(),
        },
      });

      const bounds = RoadRenderer.getViewportBounds(viewport);

      expect(bounds.minLat).toBeLessThan(51.5);
      expect(bounds.maxLat).toBeGreaterThan(51.5);
      expect(bounds.minLon).toBeLessThan(-0.1);
      expect(bounds.maxLon).toBeGreaterThan(-0.1);
    });

    it("should return symmetric bounds around center", () => {
      const viewport = createViewport({
        centerPoint: {
          latitude: 51.5,
          longitude: -0.1,
          timestamp: new Date(),
        },
      });

      const bounds = RoadRenderer.getViewportBounds(viewport);

      const latRange = bounds.maxLat - bounds.minLat;
      const centerLat = (bounds.maxLat + bounds.minLat) / 2;

      expect(centerLat).toBeCloseTo(51.5, 4);
      expect(latRange).toBeGreaterThan(0);
    });

    it("should return smaller bounds at higher zoom levels", () => {
      const lowZoomViewport = createViewport({ zoomLevel: 12 });
      const highZoomViewport = createViewport({ zoomLevel: 16 });

      const lowZoomBounds = RoadRenderer.getViewportBounds(lowZoomViewport);
      const highZoomBounds = RoadRenderer.getViewportBounds(highZoomViewport);

      const lowZoomLatRange = lowZoomBounds.maxLat - lowZoomBounds.minLat;
      const highZoomLatRange = highZoomBounds.maxLat - highZoomBounds.minLat;

      expect(highZoomLatRange).toBeLessThan(lowZoomLatRange);
    });

    it("should scale with viewport dimensions", () => {
      const smallViewport = createViewport({ width: 400, height: 240 });
      const largeViewport = createViewport({ width: 800, height: 480 });

      const smallBounds = RoadRenderer.getViewportBounds(smallViewport);
      const largeBounds = RoadRenderer.getViewportBounds(largeViewport);

      const smallLatRange = smallBounds.maxLat - smallBounds.minLat;
      const largeLatRange = largeBounds.maxLat - largeBounds.minLat;

      expect(largeLatRange).toBeGreaterThan(smallLatRange);
    });

    it("should handle equator correctly", () => {
      const viewport = createViewport({
        centerPoint: {
          latitude: 0,
          longitude: 0,
          timestamp: new Date(),
        },
      });

      const bounds = RoadRenderer.getViewportBounds(viewport);

      expect(bounds.minLat).toBeLessThan(0);
      expect(bounds.maxLat).toBeGreaterThan(0);
      expect(bounds.minLon).toBeLessThan(0);
      expect(bounds.maxLon).toBeGreaterThan(0);
    });

    it("should calculate valid longitude extent at different latitudes", () => {
      const equatorViewport = createViewport({
        centerPoint: {
          latitude: 0,
          longitude: 0,
          timestamp: new Date(),
        },
      });
      const highLatViewport = createViewport({
        centerPoint: {
          latitude: 60,
          longitude: 0,
          timestamp: new Date(),
        },
      });

      const equatorBounds = RoadRenderer.getViewportBounds(equatorViewport);
      const highLatBounds = RoadRenderer.getViewportBounds(highLatViewport);

      // Both should have valid, positive longitude ranges
      const equatorLonRange = equatorBounds.maxLon - equatorBounds.minLon;
      const highLatLonRange = highLatBounds.maxLon - highLatBounds.minLon;

      expect(equatorLonRange).toBeGreaterThan(0);
      expect(highLatLonRange).toBeGreaterThan(0);

      // Both should be reasonable values for map rendering
      expect(equatorLonRange).toBeLessThan(1); // Less than 1 degree
      expect(highLatLonRange).toBeLessThan(1);
    });
  });

  describe("edge cases", () => {
    it("should handle road with single point", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({
          geometry: [[51.5074, -0.1278]], // Single point
        }),
      ];

      // Should not throw
      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      // May or may not render (depends on implementation)
      expect(typeof result).toBe("number");
    });

    it("should handle road with empty geometry", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({
          geometry: [],
        }),
      ];

      // Should not throw
      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(0);
    });

    it("should handle unknown highway type", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const roads = [
        createRoad({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          highwayType: "unknown_type" as any,
        }),
      ];

      // Should render with default line width
      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(1);
    });

    it("should handle very long roads", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);
      const viewport = createViewport();
      const geometry: [number, number][] = [];
      // Create road around viewport center (51.5074, -0.1278)
      for (let i = 0; i < 100; i++) {
        geometry.push([51.505 + i * 0.0001, -0.13 + i * 0.00005]);
      }
      const roads = [createRoad({ geometry })];

      const result = RoadRenderer.renderRoads(bitmap, roads, viewport);

      expect(result).toBe(1);
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
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
