import { BitmapUtils } from "../BitmapUtils";
import { Bitmap1Bit } from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("BitmapUtils", () => {
  describe("createBlankBitmap", () => {
    it("should create a bitmap with correct dimensions", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 50);

      expect(bitmap.width).toBe(100);
      expect(bitmap.height).toBe(50);
    });

    it("should create a white-filled bitmap by default", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      // 0xFF = all white (each bit is 1)
      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should create a black-filled bitmap when fill is true", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1, true);

      // 0x00 = all black (each bit is 0)
      expect(bitmap.data[0]).toBe(0x00);
    });

    it("should calculate correct data size for aligned width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 2);

      // 16 pixels = 2 bytes per row, 2 rows = 4 bytes
      expect(bitmap.data.length).toBe(4);
    });

    it("should calculate correct data size for unaligned width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(10, 1);

      // 10 pixels = 2 bytes (ceil(10/8))
      expect(bitmap.data.length).toBe(2);
    });

    it("should include metadata with creation timestamp", () => {
      const before = new Date();
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);
      const after = new Date();

      expect(bitmap.metadata).toBeDefined();
      expect(bitmap.metadata?.createdAt).toBeDefined();
      expect(bitmap.metadata!.createdAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(bitmap.metadata!.createdAt.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });
  });

  describe("getBytesPerRow", () => {
    it("should return 1 for 8 pixel width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);
      expect(BitmapUtils.getBytesPerRow(bitmap)).toBe(1);
    });

    it("should return 2 for 9 pixel width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(9, 1);
      expect(BitmapUtils.getBytesPerRow(bitmap)).toBe(2);
    });

    it("should return 100 for 800 pixel width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(800, 1);
      expect(BitmapUtils.getBytesPerRow(bitmap)).toBe(100);
    });
  });

  describe("setPixel", () => {
    it("should set a pixel to black", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.setPixel(bitmap, 0, 0, true);

      // Bit 7 (MSB) should be 0, rest 1: 0111 1111 = 0x7F
      expect(bitmap.data[0]).toBe(0x7f);
    });

    it("should set a pixel to white", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1, true); // Start black

      BitmapUtils.setPixel(bitmap, 0, 0, false);

      // Bit 7 (MSB) should be 1, rest 0: 1000 0000 = 0x80
      expect(bitmap.data[0]).toBe(0x80);
    });

    it("should set pixel at correct position within byte", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.setPixel(bitmap, 7, 0, true); // Last bit

      // Bit 0 (LSB) should be 0, rest 1: 1111 1110 = 0xFE
      expect(bitmap.data[0]).toBe(0xfe);
    });

    it("should handle multi-byte rows", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 1);

      BitmapUtils.setPixel(bitmap, 8, 0, true); // First pixel of second byte

      expect(bitmap.data[0]).toBe(0xff); // First byte unchanged
      expect(bitmap.data[1]).toBe(0x7f); // Second byte has MSB set to 0
    });

    it("should handle multi-row bitmaps", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 2);

      BitmapUtils.setPixel(bitmap, 0, 1, true); // First pixel of second row

      expect(bitmap.data[0]).toBe(0xff); // First row unchanged
      expect(bitmap.data[1]).toBe(0x7f); // Second row modified
    });

    it("should ignore out of bounds coordinates (negative x)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.setPixel(bitmap, -1, 0, true);

      expect(bitmap.data[0]).toBe(0xff); // Unchanged
    });

    it("should ignore out of bounds coordinates (x >= width)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.setPixel(bitmap, 8, 0, true);

      expect(bitmap.data[0]).toBe(0xff); // Unchanged
    });

    it("should ignore out of bounds coordinates (negative y)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.setPixel(bitmap, 0, -1, true);

      expect(bitmap.data[0]).toBe(0xff); // Unchanged
    });

    it("should ignore out of bounds coordinates (y >= height)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.setPixel(bitmap, 0, 8, true);

      // All bytes unchanged
      for (let i = 0; i < bitmap.data.length; i++) {
        expect(bitmap.data[i]).toBe(0xff);
      }
    });

    it("should default value to true (black)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.setPixel(bitmap, 0, 0);

      expect(bitmap.data[0]).toBe(0x7f);
    });
  });

  describe("setPixelFast", () => {
    it("should set a pixel to black", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);

      BitmapUtils.setPixelFast(
        bitmap.data,
        bytesPerRow,
        bitmap.width,
        bitmap.height,
        0,
        0,
        true,
      );

      expect(bitmap.data[0]).toBe(0x7f);
    });

    it("should ignore out of bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);

      BitmapUtils.setPixelFast(
        bitmap.data,
        bytesPerRow,
        bitmap.width,
        bitmap.height,
        100,
        100,
        true,
      );

      expect(bitmap.data[0]).toBe(0xff); // Unchanged
    });
  });

  describe("drawLine", () => {
    it("should draw a horizontal line", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.drawLine(bitmap, { x: 0, y: 0 }, { x: 7, y: 0 });

      expect(bitmap.data[0]).toBe(0x00); // All pixels black
    });

    it("should draw a vertical line", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 4);

      BitmapUtils.drawLine(bitmap, { x: 0, y: 0 }, { x: 0, y: 3 });

      // First pixel of each row should be black
      expect(bitmap.data[0]).toBe(0x7f);
      expect(bitmap.data[1]).toBe(0x7f);
      expect(bitmap.data[2]).toBe(0x7f);
      expect(bitmap.data[3]).toBe(0x7f);
    });

    it("should draw a diagonal line", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawLine(bitmap, { x: 0, y: 0 }, { x: 7, y: 7 });

      // Diagonal should have one pixel per row
      for (let i = 0; i < 8; i++) {
        const expected = 0xff & ~(1 << (7 - i));
        expect(bitmap.data[i]).toBe(expected);
      }
    });

    it("should draw a single point when start equals end", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawLine(bitmap, { x: 3, y: 3 }, { x: 3, y: 3 });

      // Only pixel at (3, 3) should be black
      expect(bitmap.data[3]).toBe(0xff & ~(1 << (7 - 3)));
    });

    it("should handle floating point coordinates by rounding", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.drawLine(bitmap, { x: 0.4, y: 0 }, { x: 2.6, y: 0 });

      // Should draw from 0 to 3
      expect(bitmap.data[0] & 0xf0).toBe(0x00); // First 4 pixels black
    });

    it("should draw thicker lines when width > 1", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 8);

      BitmapUtils.drawLine(bitmap, { x: 0, y: 4 }, { x: 15, y: 4 }, 3);

      // Multiple rows should have pixels set
      expect(bitmap.data[3 * 2]).not.toBe(0xff); // Row 3
      expect(bitmap.data[4 * 2]).not.toBe(0xff); // Row 4
      expect(bitmap.data[5 * 2]).not.toBe(0xff); // Row 5
    });

    it("should respect maxX clipping", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 1);

      BitmapUtils.drawLine(bitmap, { x: 0, y: 0 }, { x: 15, y: 0 }, 1, 8);

      expect(bitmap.data[0]).toBe(0x00); // First 8 pixels black
      expect(bitmap.data[1]).toBe(0xff); // Second 8 pixels white (clipped)
    });
  });

  describe("drawCircle", () => {
    it("should draw a circle outline", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.drawCircle(bitmap, { x: 8, y: 8 }, 4);

      // Check that some pixels are set (circle exists)
      let blackPixelCount = 0;
      for (let i = 0; i < bitmap.data.length; i++) {
        blackPixelCount += 8 - countBits(bitmap.data[i]);
      }
      expect(blackPixelCount).toBeGreaterThan(0);
    });

    it("should not modify pixels outside circle", () => {
      const bitmap = BitmapUtils.createBlankBitmap(32, 32);

      BitmapUtils.drawCircle(bitmap, { x: 16, y: 16 }, 4);

      // Corner pixels should be white
      expect(bitmap.data[0]).toBe(0xff);
      expect(bitmap.data[bitmap.data.length - 1]).toBe(0xff);
    });

    it("should handle floating point center by rounding", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.drawCircle(bitmap, { x: 8.5, y: 8.5 }, 3.7);

      // Should not throw and should draw something
      let blackPixelCount = 0;
      for (let i = 0; i < bitmap.data.length; i++) {
        blackPixelCount += 8 - countBits(bitmap.data[i]);
      }
      expect(blackPixelCount).toBeGreaterThan(0);
    });
  });

  describe("drawFilledCircle", () => {
    it("should draw a filled circle", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.drawFilledCircle(bitmap, { x: 8, y: 8 }, 4);

      // Center should be black
      const centerByteIndex = 8 * 2; // Row 8, byte 0
      expect(bitmap.data[centerByteIndex]).not.toBe(0xff);
    });

    it("should fill more pixels than outline", () => {
      const outlineBitmap = BitmapUtils.createBlankBitmap(32, 32);
      const filledBitmap = BitmapUtils.createBlankBitmap(32, 32);

      BitmapUtils.drawCircle(outlineBitmap, { x: 16, y: 16 }, 8);
      BitmapUtils.drawFilledCircle(filledBitmap, { x: 16, y: 16 }, 8);

      const outlinePixels = countBlackPixels(outlineBitmap);
      const filledPixels = countBlackPixels(filledBitmap);

      expect(filledPixels).toBeGreaterThan(outlinePixels);
    });
  });

  describe("drawFilledCircleFast", () => {
    it("should draw the same as drawFilledCircle", () => {
      const bitmap1 = BitmapUtils.createBlankBitmap(16, 16);
      const bitmap2 = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.drawFilledCircle(bitmap1, { x: 8, y: 8 }, 4);

      BitmapUtils.drawFilledCircleFast(
        bitmap2.data,
        BitmapUtils.getBytesPerRow(bitmap2),
        bitmap2.width,
        bitmap2.height,
        8,
        8,
        4,
      );

      expect(Buffer.from(bitmap1.data)).toEqual(Buffer.from(bitmap2.data));
    });

    it("should handle circles partially outside bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      // Should not throw
      BitmapUtils.drawFilledCircleFast(
        bitmap.data,
        BitmapUtils.getBytesPerRow(bitmap),
        bitmap.width,
        bitmap.height,
        0,
        0,
        8,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("drawVerticalLine", () => {
    it("should draw a vertical line", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawVerticalLine(bitmap, 0, 0, 8);

      // First pixel of each row should be black
      for (let i = 0; i < 8; i++) {
        expect(bitmap.data[i]).toBe(0x7f);
      }
    });

    it("should draw a vertical line with width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 4);

      BitmapUtils.drawVerticalLine(bitmap, 0, 0, 4, 2);

      // First two pixels of each row should be black
      for (let i = 0; i < 4; i++) {
        expect(bitmap.data[i]).toBe(0x3f); // 0011 1111
      }
    });

    it("should handle negative x", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawVerticalLine(bitmap, -1, 0, 8);

      // Nothing should be drawn
      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should handle x >= width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawVerticalLine(bitmap, 8, 0, 8);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should handle y >= height", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawVerticalLine(bitmap, 0, 8, 4);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should handle height <= 0", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawVerticalLine(bitmap, 0, 0, 0);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should clip to bitmap bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 4);

      BitmapUtils.drawVerticalLine(bitmap, 0, 2, 10);

      // Only rows 2 and 3 should be affected
      expect(bitmap.data[0]).toBe(0xff);
      expect(bitmap.data[1]).toBe(0xff);
      expect(bitmap.data[2]).toBe(0x7f);
      expect(bitmap.data[3]).toBe(0x7f);
    });
  });

  describe("drawHorizontalLine", () => {
    it("should draw a horizontal line", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.drawHorizontalLine(bitmap, 0, 0, 8);

      expect(bitmap.data[0]).toBe(0x00);
    });

    it("should draw a horizontal line with thickness", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 4);

      BitmapUtils.drawHorizontalLine(bitmap, 0, 1, 8, 2);

      expect(bitmap.data[0]).toBe(0xff); // Row 0 unchanged
      expect(bitmap.data[1]).toBe(0x00); // Row 1 filled
      expect(bitmap.data[2]).toBe(0x00); // Row 2 filled
      expect(bitmap.data[3]).toBe(0xff); // Row 3 unchanged
    });

    it("should handle y < 0", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawHorizontalLine(bitmap, 0, -1, 8);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should handle y >= height", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawHorizontalLine(bitmap, 0, 8, 8);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should handle x >= width", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawHorizontalLine(bitmap, 8, 0, 8);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should handle width <= 0", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 8);

      BitmapUtils.drawHorizontalLine(bitmap, 0, 0, 0);

      expect(bitmap.data[0]).toBe(0xff);
    });

    it("should clip to bitmap bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.drawHorizontalLine(bitmap, 4, 0, 10);

      // Only last 4 pixels should be black
      expect(bitmap.data[0]).toBe(0xf0); // 1111 0000
    });

    it("should use optimized fill for long lines", () => {
      const bitmap = BitmapUtils.createBlankBitmap(32, 1);

      BitmapUtils.drawHorizontalLine(bitmap, 0, 0, 32);

      // All bytes should be 0
      for (let i = 0; i < 4; i++) {
        expect(bitmap.data[i]).toBe(0x00);
      }
    });

    it("should use pixel-by-pixel for short lines", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 1);

      BitmapUtils.drawHorizontalLine(bitmap, 2, 0, 4);

      // Pixels 2-5 should be black
      expect(bitmap.data[0]).toBe(0xc3); // 1100 0011
    });
  });

  describe("fillHorizontalSpan", () => {
    it("should fill a span within a single byte", () => {
      const bitmap = BitmapUtils.createBlankBitmap(8, 1);

      BitmapUtils.fillHorizontalSpan(
        bitmap.data,
        BitmapUtils.getBytesPerRow(bitmap),
        bitmap.width,
        2,
        6,
        0,
      );

      // Pixels 2-5 should be black: 1100 0011 = 0xC3
      expect(bitmap.data[0]).toBe(0xc3);
    });

    it("should fill a span across multiple bytes", () => {
      const bitmap = BitmapUtils.createBlankBitmap(24, 1);

      BitmapUtils.fillHorizontalSpan(
        bitmap.data,
        BitmapUtils.getBytesPerRow(bitmap),
        bitmap.width,
        4,
        20,
        0,
      );

      // First byte: pixels 4-7 black = 0xF0
      expect(bitmap.data[0]).toBe(0xf0);
      // Middle byte: all black = 0x00
      expect(bitmap.data[1]).toBe(0x00);
      // Last byte: pixels 16-19 black = 0x0F
      expect(bitmap.data[2]).toBe(0x0f);
    });
  });

  describe("fillTriangle", () => {
    it("should fill a triangle", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.fillTriangle(
        bitmap,
        { x: 8, y: 0 },
        { x: 0, y: 15 },
        { x: 15, y: 15 },
      );

      // Some pixels should be black
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle floating point coordinates", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.fillTriangle(
        bitmap,
        { x: 8.5, y: 0.5 },
        { x: 0.5, y: 15.5 },
        { x: 15.5, y: 15.5 },
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle triangle outside bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.fillTriangle(
        bitmap,
        { x: 20, y: 20 },
        { x: 30, y: 30 },
        { x: 25, y: 40 },
      );

      // Nothing should be drawn
      expect(countBlackPixels(bitmap)).toBe(0);
    });

    it("should clip triangle to bitmap bounds", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      BitmapUtils.fillTriangle(
        bitmap,
        { x: 8, y: -10 },
        { x: -10, y: 25 },
        { x: 25, y: 25 },
      );

      // Some pixels should be drawn (the part inside)
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle degenerate triangles (collinear points)", () => {
      const bitmap = BitmapUtils.createBlankBitmap(16, 16);

      // Vertical line
      BitmapUtils.fillTriangle(
        bitmap,
        { x: 8, y: 0 },
        { x: 8, y: 8 },
        { x: 8, y: 15 },
      );

      // Should draw something (vertical line)
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("interpolateX", () => {
    it("should interpolate x correctly", () => {
      const result = BitmapUtils.interpolateX(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        5,
      );

      expect(result).toBe(5);
    });

    it("should handle horizontal lines", () => {
      const result = BitmapUtils.interpolateX(
        { x: 0, y: 5 },
        { x: 10, y: 5 },
        5,
      );

      expect(result).toBe(0); // Returns p1.x when y1 === y2
    });

    it("should interpolate negative slopes", () => {
      const result = BitmapUtils.interpolateX(
        { x: 10, y: 0 },
        { x: 0, y: 10 },
        5,
      );

      expect(result).toBe(5);
    });

    it("should handle y outside segment range", () => {
      const result = BitmapUtils.interpolateX(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        15,
      );

      expect(result).toBe(15); // Extrapolates
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

function countBlackPixels(bitmap: Bitmap1Bit): number {
  let count = 0;
  for (let i = 0; i < bitmap.data.length; i++) {
    count += 8 - countBits(bitmap.data[i]);
  }
  return count;
}
