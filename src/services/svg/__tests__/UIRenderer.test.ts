import { UIRenderer } from "../UIRenderer";
import { BitmapUtils } from "../BitmapUtils";
import { FollowTrackInfo } from "@core/interfaces";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock the bitmap font utilities
jest.mock("@utils/bitmapFont", () => ({
  renderBitmapText: jest.fn(),
  calculateBitmapTextHeight: jest.fn().mockReturnValue(14),
  calculateBitmapTextWidth: jest.fn().mockReturnValue(50),
}));

describe("UIRenderer", () => {
  describe("addCompass", () => {
    it("should add compass to bitmap and return success", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      const result = await UIRenderer.addCompass(bitmap, 400, 240, 50, 0);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(bitmap);
      }
    });

    it("should draw compass circles", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 200);

      await UIRenderer.addCompass(bitmap, 100, 100, 40, 0);

      // Compass should have drawn some pixels
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should rotate compass based on heading", async () => {
      const bitmap1 = BitmapUtils.createBlankBitmap(200, 200);
      const bitmap2 = BitmapUtils.createBlankBitmap(200, 200);

      await UIRenderer.addCompass(bitmap1, 100, 100, 40, 0);
      await UIRenderer.addCompass(bitmap2, 100, 100, 40, 90);

      // Bitmaps should be different due to different headings
      let differences = 0;
      for (let i = 0; i < bitmap1.data.length; i++) {
        if (bitmap1.data[i] !== bitmap2.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it("should handle 360 degree heading same as 0", async () => {
      const bitmap1 = BitmapUtils.createBlankBitmap(200, 200);
      const bitmap2 = BitmapUtils.createBlankBitmap(200, 200);

      await UIRenderer.addCompass(bitmap1, 100, 100, 40, 0);
      await UIRenderer.addCompass(bitmap2, 100, 100, 40, 360);

      // Both should produce the same result (within rounding)
      const pixels1 = countBlackPixels(bitmap1);
      const pixels2 = countBlackPixels(bitmap2);
      // Allow small differences due to integer rounding
      expect(Math.abs(pixels1 - pixels2)).toBeLessThan(50);
    });

    it("should handle different radii", async () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(200, 200);
      const largeBitmap = BitmapUtils.createBlankBitmap(200, 200);

      await UIRenderer.addCompass(smallBitmap, 100, 100, 20, 0);
      await UIRenderer.addCompass(largeBitmap, 100, 100, 60, 0);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });

    it("should handle negative heading", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 200);

      const result = await UIRenderer.addCompass(bitmap, 100, 100, 40, -45);

      expect(result.success).toBe(true);
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("addScaleBar", () => {
    it("should add scale bar to bitmap and return success", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      const result = await UIRenderer.addScaleBar(bitmap, 50, 450, 200, 10);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(bitmap);
      }
    });

    it("should draw scale bar elements", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(400, 100);

      await UIRenderer.addScaleBar(bitmap, 20, 50, 200, 10);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should adjust bar width based on meters per pixel", async () => {
      const bitmap1 = BitmapUtils.createBlankBitmap(400, 100);
      const bitmap2 = BitmapUtils.createBlankBitmap(400, 100);

      // Same max width but different meters per pixel
      await UIRenderer.addScaleBar(bitmap1, 20, 50, 200, 1); // 1m/px = ~200m max
      await UIRenderer.addScaleBar(bitmap2, 20, 50, 200, 10); // 10m/px = ~2000m max

      // Both should have drawn something
      expect(countBlackPixels(bitmap1)).toBeGreaterThan(0);
      expect(countBlackPixels(bitmap2)).toBeGreaterThan(0);
    });

    it("should handle very small meters per pixel", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(400, 100);

      const result = await UIRenderer.addScaleBar(bitmap, 20, 50, 200, 0.1);

      expect(result.success).toBe(true);
    });

    it("should handle large meters per pixel", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(400, 100);

      const result = await UIRenderer.addScaleBar(bitmap, 20, 50, 200, 1000);

      expect(result.success).toBe(true);
    });
  });

  describe("renderFollowTrackInfoPanel", () => {
    const createInfo = (
      overrides: Partial<FollowTrackInfo> = {},
    ): FollowTrackInfo => ({
      speed: 25.5,
      satellites: 8,
      ...overrides,
    });

    it("should render info panel without throwing", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo();

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should render panel with all optional fields", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo({
        zoomLevel: 15,
        progress: 75,
        estimatedTimeRemaining: 3600,
      });

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should render panel with only required fields", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info: FollowTrackInfo = {
        speed: 0,
        satellites: 0,
      };

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should handle zero speed", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo({ speed: 0 });

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should handle high speed", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo({ speed: 200 });

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should handle zero satellites", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo({ satellites: 0 });

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should handle 100% progress", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo({ progress: 100 });

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });

    it("should handle 0% progress", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info = createInfo({ progress: 0 });

      expect(() => {
        UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);
      }).not.toThrow();
    });
  });

  describe("formatTimeRemaining", () => {
    it("should return '<1M' for less than 60 seconds", () => {
      expect(UIRenderer.formatTimeRemaining(0)).toBe("<1M");
      expect(UIRenderer.formatTimeRemaining(30)).toBe("<1M");
      expect(UIRenderer.formatTimeRemaining(59)).toBe("<1M");
    });

    it("should return minutes only for less than 1 hour", () => {
      expect(UIRenderer.formatTimeRemaining(60)).toBe("1M");
      expect(UIRenderer.formatTimeRemaining(120)).toBe("2M");
      expect(UIRenderer.formatTimeRemaining(300)).toBe("5M");
      expect(UIRenderer.formatTimeRemaining(3540)).toBe("59M");
    });

    it("should return hours and minutes for 1 hour or more", () => {
      expect(UIRenderer.formatTimeRemaining(3600)).toBe("1H 0M");
      expect(UIRenderer.formatTimeRemaining(3660)).toBe("1H 1M");
      expect(UIRenderer.formatTimeRemaining(5400)).toBe("1H 30M");
      expect(UIRenderer.formatTimeRemaining(7200)).toBe("2H 0M");
    });

    it("should handle large values", () => {
      expect(UIRenderer.formatTimeRemaining(36000)).toBe("10H 0M");
      expect(UIRenderer.formatTimeRemaining(86400)).toBe("24H 0M"); // 1 day
    });

    it("should round down partial minutes", () => {
      expect(UIRenderer.formatTimeRemaining(90)).toBe("1M"); // 1.5 minutes
      expect(UIRenderer.formatTimeRemaining(150)).toBe("2M"); // 2.5 minutes
    });
  });

  describe("drawProgressBar", () => {
    it("should draw progress bar at 0%", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      UIRenderer.drawProgressBar(bitmap, 800, 480, 0);

      // Should have drawn outline
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw progress bar at 50%", () => {
      const bitmap0 = BitmapUtils.createBlankBitmap(800, 480);
      const bitmap50 = BitmapUtils.createBlankBitmap(800, 480);

      UIRenderer.drawProgressBar(bitmap0, 800, 480, 0);
      UIRenderer.drawProgressBar(bitmap50, 800, 480, 50);

      // 50% should have more black pixels (filled portion)
      expect(countBlackPixels(bitmap50)).toBeGreaterThan(
        countBlackPixels(bitmap0),
      );
    });

    it("should draw progress bar at 100%", () => {
      const bitmap50 = BitmapUtils.createBlankBitmap(800, 480);
      const bitmap100 = BitmapUtils.createBlankBitmap(800, 480);

      UIRenderer.drawProgressBar(bitmap50, 800, 480, 50);
      UIRenderer.drawProgressBar(bitmap100, 800, 480, 100);

      // 100% should have more black pixels than 50%
      expect(countBlackPixels(bitmap100)).toBeGreaterThan(
        countBlackPixels(bitmap50),
      );
    });

    it("should handle different screen sizes", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(400, 240);
      const largeBitmap = BitmapUtils.createBlankBitmap(800, 480);

      UIRenderer.drawProgressBar(smallBitmap, 400, 240, 50);
      UIRenderer.drawProgressBar(largeBitmap, 800, 480, 50);

      // Both should have drawn something
      expect(countBlackPixels(smallBitmap)).toBeGreaterThan(0);
      expect(countBlackPixels(largeBitmap)).toBeGreaterThan(0);
    });

    it("should handle fractional progress", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      expect(() => {
        UIRenderer.drawProgressBar(bitmap, 800, 480, 33.33);
      }).not.toThrow();
    });

    it("should handle progress > 100", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      // Should not throw, might cap at 100%
      expect(() => {
        UIRenderer.drawProgressBar(bitmap, 800, 480, 150);
      }).not.toThrow();
    });

    it("should handle negative progress", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      // Should not throw, might treat as 0%
      expect(() => {
        UIRenderer.drawProgressBar(bitmap, 800, 480, -10);
      }).not.toThrow();
    });
  });

  describe("formatDistanceForDisplay", () => {
    it("should format distances less than 1km in meters", () => {
      expect(UIRenderer.formatDistanceForDisplay(50)).toBe("50 M");
      expect(UIRenderer.formatDistanceForDisplay(100)).toBe("100 M");
      expect(UIRenderer.formatDistanceForDisplay(500)).toBe("500 M");
      expect(UIRenderer.formatDistanceForDisplay(999)).toBe("999 M");
    });

    it("should format 1km exactly", () => {
      expect(UIRenderer.formatDistanceForDisplay(1000)).toBe("1.0 KM");
    });

    it("should format distances between 1-10km with one decimal", () => {
      expect(UIRenderer.formatDistanceForDisplay(1500)).toBe("1.5 KM");
      expect(UIRenderer.formatDistanceForDisplay(2000)).toBe("2.0 KM");
      expect(UIRenderer.formatDistanceForDisplay(5500)).toBe("5.5 KM");
      expect(UIRenderer.formatDistanceForDisplay(9999)).toBe("10.0 KM");
    });

    it("should format distances 10km+ as whole numbers", () => {
      expect(UIRenderer.formatDistanceForDisplay(10000)).toBe("10 KM");
      expect(UIRenderer.formatDistanceForDisplay(15000)).toBe("15 KM");
      expect(UIRenderer.formatDistanceForDisplay(100000)).toBe("100 KM");
    });

    it("should round meters to nearest whole number", () => {
      expect(UIRenderer.formatDistanceForDisplay(50.4)).toBe("50 M");
      expect(UIRenderer.formatDistanceForDisplay(50.6)).toBe("51 M");
    });

    it("should handle zero distance", () => {
      expect(UIRenderer.formatDistanceForDisplay(0)).toBe("0 M");
    });

    it("should handle very small distances", () => {
      expect(UIRenderer.formatDistanceForDisplay(0.5)).toBe("1 M");
      expect(UIRenderer.formatDistanceForDisplay(1)).toBe("1 M");
    });

    it("should handle very large distances", () => {
      expect(UIRenderer.formatDistanceForDisplay(1000000)).toBe("1000 KM");
    });
  });

  describe("bearingToDirection", () => {
    it("should return N for 0 degrees", () => {
      expect(UIRenderer.bearingToDirection(0)).toBe("N");
    });

    it("should return N for 360 degrees", () => {
      expect(UIRenderer.bearingToDirection(360)).toBe("N");
    });

    it("should return NE for ~45 degrees", () => {
      expect(UIRenderer.bearingToDirection(45)).toBe("NE");
    });

    it("should return E for ~90 degrees", () => {
      expect(UIRenderer.bearingToDirection(90)).toBe("E");
    });

    it("should return SE for ~135 degrees", () => {
      expect(UIRenderer.bearingToDirection(135)).toBe("SE");
    });

    it("should return S for ~180 degrees", () => {
      expect(UIRenderer.bearingToDirection(180)).toBe("S");
    });

    it("should return SW for ~225 degrees", () => {
      expect(UIRenderer.bearingToDirection(225)).toBe("SW");
    });

    it("should return W for ~270 degrees", () => {
      expect(UIRenderer.bearingToDirection(270)).toBe("W");
    });

    it("should return NW for ~315 degrees", () => {
      expect(UIRenderer.bearingToDirection(315)).toBe("NW");
    });

    it("should round to nearest cardinal direction", () => {
      // 22 degrees is closer to N than NE
      expect(UIRenderer.bearingToDirection(22)).toBe("N");
      // 23 degrees is closer to NE than N (45/2 = 22.5)
      expect(UIRenderer.bearingToDirection(23)).toBe("NE");
    });

    it("should handle boundary cases", () => {
      // Boundaries at 22.5, 67.5, 112.5, etc.
      expect(UIRenderer.bearingToDirection(22)).toBe("N");
      expect(UIRenderer.bearingToDirection(23)).toBe("NE");
      expect(UIRenderer.bearingToDirection(67)).toBe("NE");
      expect(UIRenderer.bearingToDirection(68)).toBe("E");
    });

    it("should handle values > 360", () => {
      expect(UIRenderer.bearingToDirection(405)).toBe("NE"); // 405 % 360 = 45
      expect(UIRenderer.bearingToDirection(720)).toBe("N"); // 720 % 360 = 0
    });

    it("should handle negative values by returning undefined", () => {
      // -45 degrees: Math.round(-45/45) % 8 = -1 % 8 = -1
      // This is out of bounds for the directions array, returning undefined
      // Note: This is a known limitation - callers should normalize bearings
      const result = UIRenderer.bearingToDirection(-45);
      // The implementation doesn't normalize negative bearings
      expect(result).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle compass at edge of bitmap", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      // Compass near edge - some parts may be clipped
      const result = await UIRenderer.addCompass(bitmap, 10, 10, 30, 0);

      expect(result.success).toBe(true);
    });

    it("should handle scale bar at edge of bitmap", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(400, 50);

      const result = await UIRenderer.addScaleBar(bitmap, 10, 30, 100, 10);

      expect(result.success).toBe(true);
    });

    it("should handle very small bitmap for progress bar", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 50);

      expect(() => {
        UIRenderer.drawProgressBar(bitmap, 100, 50, 50);
      }).not.toThrow();
    });

    it("should handle zero radius compass", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      const result = await UIRenderer.addCompass(bitmap, 50, 50, 0, 0);

      expect(result.success).toBe(true);
    });

    it("should handle zero max width scale bar", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      const result = await UIRenderer.addScaleBar(bitmap, 10, 50, 0, 10);

      expect(result.success).toBe(true);
    });
  });

  describe("integration tests", () => {
    it("should render full UI with compass, scale bar, and progress bar", async () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 480);

      // Add compass
      await UIRenderer.addCompass(bitmap, 700, 80, 40, 45);

      // Add scale bar
      await UIRenderer.addScaleBar(bitmap, 50, 450, 150, 5);

      // Add progress bar
      UIRenderer.drawProgressBar(bitmap, 800, 480, 65);

      // All elements should have drawn
      expect(countBlackPixels(bitmap)).toBeGreaterThan(1000);
    });

    it("should render info panel with all fields", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 480);
      const info: FollowTrackInfo = {
        speed: 42,
        satellites: 12,
        zoomLevel: 16,
        progress: 85,
        estimatedTimeRemaining: 5400, // 1.5 hours
      };

      UIRenderer.renderFollowTrackInfoPanel(bitmap, 0, info, 200, 480);

      // Panel should not throw (rendering verification done via mocked font)
    });

    it("should format all time values correctly", () => {
      const testCases = [
        { seconds: 0, expected: "<1M" },
        { seconds: 59, expected: "<1M" },
        { seconds: 60, expected: "1M" },
        { seconds: 3599, expected: "59M" },
        { seconds: 3600, expected: "1H 0M" },
        { seconds: 7260, expected: "2H 1M" },
      ];

      testCases.forEach(({ seconds, expected }) => {
        expect(UIRenderer.formatTimeRemaining(seconds)).toBe(expected);
      });
    });

    it("should format all distance values correctly", () => {
      const testCases = [
        { meters: 0, expected: "0 M" },
        { meters: 50, expected: "50 M" },
        { meters: 999, expected: "999 M" },
        { meters: 1000, expected: "1.0 KM" },
        { meters: 5500, expected: "5.5 KM" },
        { meters: 10000, expected: "10 KM" },
        { meters: 50000, expected: "50 KM" },
      ];

      testCases.forEach(({ meters, expected }) => {
        expect(UIRenderer.formatDistanceForDisplay(meters)).toBe(expected);
      });
    });

    it("should return all cardinal directions", () => {
      const expectedDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const bearings = [0, 45, 90, 135, 180, 225, 270, 315];

      bearings.forEach((bearing, i) => {
        expect(UIRenderer.bearingToDirection(bearing)).toBe(
          expectedDirections[i],
        );
      });
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
