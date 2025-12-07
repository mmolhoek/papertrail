import {
  renderTextToBitmap,
  renderTextOnBitmap,
  renderLabeledValueOnBitmap,
  compositeBlackPixels,
  calculateTextWidth,
  calculateTextHeight,
} from "../svgTextRenderer";
import { Bitmap1Bit } from "@core/types";

describe("svgTextRenderer", () => {
  describe("calculateTextWidth", () => {
    it("should calculate text width based on font size", () => {
      // Width is max(10, ceil(length * fontSize * 0.6))
      const expected = Math.max(10, Math.ceil(4 * 14 * 0.6));
      expect(calculateTextWidth("TEST", 14)).toBe(expected);
    });

    it("should return 0 for empty string", () => {
      expect(calculateTextWidth("", 14)).toBe(0);
    });

    it("should have minimum width of 10", () => {
      // Even a single character with small font should have min width 10
      expect(calculateTextWidth("A", 10)).toBeGreaterThanOrEqual(10);
    });
  });

  describe("calculateTextHeight", () => {
    it("should calculate text height based on font size", () => {
      expect(calculateTextHeight(14)).toBe(Math.ceil(14 * 1.2));
    });

    it("should scale with font size", () => {
      const height14 = calculateTextHeight(14);
      const height28 = calculateTextHeight(28);
      expect(height28).toBe(height14 * 2);
    });
  });

  describe("renderTextToBitmap", () => {
    it("should render text to a 1-bit bitmap", async () => {
      const bitmap = await renderTextToBitmap("TEST", 100, 30);

      expect(bitmap.width).toBe(100);
      expect(bitmap.height).toBe(30);
      expect(bitmap.data).toBeInstanceOf(Uint8Array);
      expect(bitmap.metadata).toBeDefined();
      expect(bitmap.metadata?.description).toContain("TEST");
    });

    it("should create bitmap with correct byte size", async () => {
      const width = 100;
      const height = 30;
      const bitmap = await renderTextToBitmap("A", width, height);

      const expectedBytes = Math.ceil(width / 8) * height;
      expect(bitmap.data.length).toBe(expectedBytes);
    });

    it("should handle empty text", async () => {
      const bitmap = await renderTextToBitmap("", 50, 20);

      expect(bitmap.width).toBe(50);
      expect(bitmap.height).toBe(20);
    });

    it("should render bold text", async () => {
      const bitmap = await renderTextToBitmap("BOLD", 100, 30, {
        fontWeight: "bold",
      });

      expect(bitmap.data).toBeInstanceOf(Uint8Array);
    });

    it("should render with different alignments", async () => {
      const leftBitmap = await renderTextToBitmap("A", 100, 30, {
        alignment: "left",
      });
      const centerBitmap = await renderTextToBitmap("A", 100, 30, {
        alignment: "center",
      });
      const rightBitmap = await renderTextToBitmap("A", 100, 30, {
        alignment: "right",
      });

      // All should produce valid bitmaps
      expect(leftBitmap.data).toBeInstanceOf(Uint8Array);
      expect(centerBitmap.data).toBeInstanceOf(Uint8Array);
      expect(rightBitmap.data).toBeInstanceOf(Uint8Array);
    });
  });

  describe("compositeBlackPixels", () => {
    const createTestBitmap = (
      width: number,
      height: number,
      fill: boolean = false,
    ): Bitmap1Bit => {
      const bytesPerRow = Math.ceil(width / 8);
      const data = new Uint8Array(bytesPerRow * height);
      data.fill(fill ? 0x00 : 0xff); // 0x00 = all black, 0xff = all white
      return {
        width,
        height,
        data,
        metadata: { createdAt: new Date() },
      };
    };

    it("should composite black pixels from source to target", () => {
      const target = createTestBitmap(100, 100, false); // all white
      const source = createTestBitmap(10, 10, true); // all black

      compositeBlackPixels(target, source, 50, 50);

      // Check that some pixels at the target position are now black
      const targetBytesPerRow = Math.ceil(target.width / 8);
      const byteIndex = 50 * targetBytesPerRow + Math.floor(50 / 8);
      const bitIndex = 7 - (50 % 8);
      const isBlack = (target.data[byteIndex] & (1 << bitIndex)) === 0;
      expect(isBlack).toBe(true);
    });

    it("should handle source extending beyond target bounds", () => {
      const target = createTestBitmap(50, 50, false);
      const source = createTestBitmap(20, 20, true);

      // This should not throw even though source extends beyond target
      expect(() => {
        compositeBlackPixels(target, source, 40, 40);
      }).not.toThrow();
    });

    it("should handle negative positions", () => {
      const target = createTestBitmap(50, 50, false);
      const source = createTestBitmap(20, 20, true);

      expect(() => {
        compositeBlackPixels(target, source, -10, -10);
      }).not.toThrow();
    });
  });

  describe("renderTextOnBitmap", () => {
    const createTestBitmap = (width: number, height: number): Bitmap1Bit => {
      const bytesPerRow = Math.ceil(width / 8);
      const data = new Uint8Array(bytesPerRow * height);
      data.fill(0xff); // All white
      return {
        width,
        height,
        data,
        metadata: { createdAt: new Date() },
      };
    };

    it("should render text onto existing bitmap without throwing", async () => {
      const bitmap = createTestBitmap(200, 100);

      // Should not throw
      await expect(
        renderTextOnBitmap(bitmap, "TEST", 10, 10, { fontSize: 14 }),
      ).resolves.toBeUndefined();
    });

    it("should render centered text without throwing", async () => {
      const bitmap = createTestBitmap(200, 100);

      await expect(
        renderTextOnBitmap(bitmap, "CENTER", 100, 50, {
          fontSize: 20,
          alignment: "center",
        }),
      ).resolves.toBeUndefined();
    });

    it("should render with custom options without throwing", async () => {
      const bitmap = createTestBitmap(200, 100);

      await expect(
        renderTextOnBitmap(bitmap, "STYLED", 10, 10, {
          fontSize: 24,
          fontWeight: "bold",
          alignment: "left",
        }),
      ).resolves.toBeUndefined();
    });

    it("should handle empty text gracefully", async () => {
      const bitmap = createTestBitmap(200, 100);

      await expect(
        renderTextOnBitmap(bitmap, "", 10, 10, { fontSize: 14 }),
      ).resolves.toBeUndefined();
    });
  });

  describe("renderLabeledValueOnBitmap", () => {
    const createTestBitmap = (width: number, height: number): Bitmap1Bit => {
      const bytesPerRow = Math.ceil(width / 8);
      const data = new Uint8Array(bytesPerRow * height);
      data.fill(0xff);
      return {
        width,
        height,
        data,
        metadata: { createdAt: new Date() },
      };
    };

    it("should render labeled value onto bitmap", async () => {
      const bitmap = createTestBitmap(200, 200);

      const result = await renderLabeledValueOnBitmap(
        bitmap,
        "SPEED",
        42,
        "KM/H",
        10,
        10,
      );

      expect(result.height).toBeGreaterThan(0);
    });

    it("should render with string value", async () => {
      const bitmap = createTestBitmap(200, 200);

      // Empty unit should still work
      await expect(
        renderLabeledValueOnBitmap(bitmap, "STATUS", "OK", "", 10, 10),
      ).resolves.toBeDefined();
    });

    it("should render with custom sizes", async () => {
      const bitmap = createTestBitmap(200, 200);

      const result = await renderLabeledValueOnBitmap(
        bitmap,
        "LABEL",
        100,
        "UNIT",
        10,
        10,
        {
          labelSize: 10,
          valueSize: 24,
          unitSize: 10,
          alignment: "center",
        },
      );

      expect(result.height).toBeGreaterThan(0);
    });
  });
});
