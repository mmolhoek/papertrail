import {
  calculateBitmapTextWidth,
  calculateBitmapTextHeight,
  renderBitmapText,
} from "../bitmapFont";
import { Bitmap1Bit } from "@core/types";

describe("bitmapFont", () => {
  // Helper to create a blank bitmap
  const createBitmap = (width: number, height: number): Bitmap1Bit => {
    const bytesPerRow = Math.ceil(width / 8);
    return {
      width,
      height,
      data: new Uint8Array(bytesPerRow * height).fill(0xff), // All white
    };
  };

  // Helper to count black pixels
  const countBlackPixels = (bitmap: Bitmap1Bit): number => {
    let count = 0;
    for (let i = 0; i < bitmap.data.length; i++) {
      let byte = bitmap.data[i];
      while (byte < 0xff) {
        if ((byte & 0x80) === 0) count++;
        byte = ((byte << 1) | 1) & 0xff;
      }
    }
    // Actually count the bits that are 0
    count = 0;
    for (let i = 0; i < bitmap.data.length; i++) {
      for (let bit = 7; bit >= 0; bit--) {
        if (!((bitmap.data[i] >> bit) & 1)) {
          count++;
        }
      }
    }
    return count;
  };

  describe("calculateBitmapTextWidth", () => {
    it("should return 0 for empty string", () => {
      expect(calculateBitmapTextWidth("", 1)).toBe(0);
      expect(calculateBitmapTextWidth("", 2)).toBe(0);
    });

    it("should calculate width for single character at scale 1", () => {
      // Single char: 5 pixels wide
      expect(calculateBitmapTextWidth("A", 1)).toBe(5);
    });

    it("should calculate width for multiple characters at scale 1", () => {
      // 2 chars: 2 * 5 + 1 * 1 (spacing) = 11
      expect(calculateBitmapTextWidth("AB", 1)).toBe(11);
      // 3 chars: 3 * 5 + 2 * 1 = 17
      expect(calculateBitmapTextWidth("ABC", 1)).toBe(17);
    });

    it("should scale width correctly", () => {
      // Single char at scale 2: 5 * 2 = 10
      expect(calculateBitmapTextWidth("A", 2)).toBe(10);
      // 2 chars at scale 2: 2 * 5 * 2 + 1 * 1 * 2 = 22
      expect(calculateBitmapTextWidth("AB", 2)).toBe(22);
    });

    it("should handle scale 3", () => {
      // Single char at scale 3: 5 * 3 = 15
      expect(calculateBitmapTextWidth("A", 3)).toBe(15);
      // 2 chars at scale 3: 2 * 5 * 3 + 1 * 1 * 3 = 33
      expect(calculateBitmapTextWidth("AB", 3)).toBe(33);
    });

    it("should handle numbers", () => {
      expect(calculateBitmapTextWidth("123", 1)).toBe(17);
    });

    it("should handle spaces", () => {
      expect(calculateBitmapTextWidth("A B", 1)).toBe(17);
    });
  });

  describe("calculateBitmapTextHeight", () => {
    it("should return 7 at scale 1", () => {
      expect(calculateBitmapTextHeight(1)).toBe(7);
    });

    it("should return 14 at scale 2", () => {
      expect(calculateBitmapTextHeight(2)).toBe(14);
    });

    it("should return 21 at scale 3", () => {
      expect(calculateBitmapTextHeight(3)).toBe(21);
    });

    it("should return 35 at scale 5", () => {
      expect(calculateBitmapTextHeight(5)).toBe(35);
    });
  });

  describe("renderBitmapText", () => {
    it("should render text onto bitmap", () => {
      const bitmap = createBitmap(50, 20);

      renderBitmapText(bitmap, "A", 0, 0);

      // Should have some black pixels
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should render at specified position", () => {
      const bitmap1 = createBitmap(100, 50);
      const bitmap2 = createBitmap(100, 50);

      renderBitmapText(bitmap1, "A", 0, 0);
      renderBitmapText(bitmap2, "A", 50, 25);

      // Both should have same number of black pixels
      expect(countBlackPixels(bitmap1)).toBe(countBlackPixels(bitmap2));

      // But bitmaps should be different
      let differences = 0;
      for (let i = 0; i < bitmap1.data.length; i++) {
        if (bitmap1.data[i] !== bitmap2.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it("should scale text correctly", () => {
      const bitmap1 = createBitmap(50, 30);
      const bitmap2 = createBitmap(50, 30);

      renderBitmapText(bitmap1, "A", 0, 0, { scale: 1 });
      renderBitmapText(bitmap2, "A", 0, 0, { scale: 2 });

      // Scale 2 should have ~4x the pixels (2x2)
      const pixels1 = countBlackPixels(bitmap1);
      const pixels2 = countBlackPixels(bitmap2);
      expect(pixels2).toBeGreaterThan(pixels1 * 3);
      expect(pixels2).toBeLessThan(pixels1 * 5);
    });

    it("should render bold text with more pixels", () => {
      const bitmap1 = createBitmap(50, 20);
      const bitmap2 = createBitmap(50, 20);

      renderBitmapText(bitmap1, "A", 0, 0, { bold: false });
      renderBitmapText(bitmap2, "A", 0, 0, { bold: true });

      expect(countBlackPixels(bitmap2)).toBeGreaterThan(
        countBlackPixels(bitmap1),
      );
    });

    it("should render extra bold text with even more pixels", () => {
      const bitmapNormal = createBitmap(50, 20);
      const bitmapBold = createBitmap(50, 20);
      const bitmapExtraBold = createBitmap(50, 20);

      renderBitmapText(bitmapNormal, "A", 0, 0);
      renderBitmapText(bitmapBold, "A", 0, 0, { bold: true });
      renderBitmapText(bitmapExtraBold, "A", 0, 0, { extraBold: true });

      const normalPixels = countBlackPixels(bitmapNormal);
      const boldPixels = countBlackPixels(bitmapBold);
      const extraBoldPixels = countBlackPixels(bitmapExtraBold);

      expect(boldPixels).toBeGreaterThan(normalPixels);
      expect(extraBoldPixels).toBeGreaterThan(boldPixels);
    });

    it("should handle all uppercase letters", () => {
      const bitmap = createBitmap(300, 20);

      renderBitmapText(bitmap, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0, 0);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle all numbers", () => {
      const bitmap = createBitmap(100, 20);

      renderBitmapText(bitmap, "0123456789", 0, 0);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle supported symbols", () => {
      const bitmap = createBitmap(100, 20);

      renderBitmapText(bitmap, "/:%-.<>", 0, 0);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle spaces without crashing", () => {
      const bitmap = createBitmap(100, 20);

      expect(() => {
        renderBitmapText(bitmap, "HELLO WORLD", 0, 0);
      }).not.toThrow();
    });

    it("should handle unknown characters by skipping them", () => {
      const bitmap = createBitmap(100, 20);

      // Unknown chars like @ should be skipped with space width
      expect(() => {
        renderBitmapText(bitmap, "A@B", 0, 0);
      }).not.toThrow();
    });

    it("should convert lowercase to uppercase", () => {
      const bitmap1 = createBitmap(50, 20);
      const bitmap2 = createBitmap(50, 20);

      renderBitmapText(bitmap1, "abc", 0, 0);
      renderBitmapText(bitmap2, "ABC", 0, 0);

      // Should produce identical results
      let identical = true;
      for (let i = 0; i < bitmap1.data.length; i++) {
        if (bitmap1.data[i] !== bitmap2.data[i]) {
          identical = false;
          break;
        }
      }
      expect(identical).toBe(true);
    });

    it("should clip text that goes outside bitmap bounds", () => {
      const bitmap = createBitmap(10, 10);

      // Render text that would go outside bounds
      expect(() => {
        renderBitmapText(bitmap, "HELLO", 0, 0);
      }).not.toThrow();

      // Should have some pixels (the ones that fit)
      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle negative coordinates", () => {
      const bitmap = createBitmap(50, 20);

      expect(() => {
        renderBitmapText(bitmap, "A", -5, -5);
      }).not.toThrow();
    });

    it("should round coordinates", () => {
      const bitmap = createBitmap(50, 20);

      expect(() => {
        renderBitmapText(bitmap, "A", 0.5, 0.7);
      }).not.toThrow();

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("character rendering", () => {
    it("should render different characters differently", () => {
      const bitmapA = createBitmap(20, 20);
      const bitmapB = createBitmap(20, 20);

      renderBitmapText(bitmapA, "A", 0, 0);
      renderBitmapText(bitmapB, "B", 0, 0);

      let differences = 0;
      for (let i = 0; i < bitmapA.data.length; i++) {
        if (bitmapA.data[i] !== bitmapB.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it("should render numbers correctly", () => {
      const bitmaps: Bitmap1Bit[] = [];
      for (let i = 0; i <= 9; i++) {
        const bitmap = createBitmap(20, 20);
        renderBitmapText(bitmap, String(i), 0, 0);
        bitmaps.push(bitmap);
      }

      // All numbers should render with some pixels
      for (const bitmap of bitmaps) {
        expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
      }

      // Each number should be unique
      for (let i = 0; i < 10; i++) {
        for (let j = i + 1; j < 10; j++) {
          let identical = true;
          for (let k = 0; k < bitmaps[i].data.length; k++) {
            if (bitmaps[i].data[k] !== bitmaps[j].data[k]) {
              identical = false;
              break;
            }
          }
          expect(identical).toBe(false);
        }
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const bitmap = createBitmap(50, 20);

      renderBitmapText(bitmap, "", 0, 0);

      // Should have no black pixels
      expect(countBlackPixels(bitmap)).toBe(0);
    });

    it("should handle very large scale", () => {
      const bitmap = createBitmap(100, 100);

      expect(() => {
        renderBitmapText(bitmap, "A", 0, 0, { scale: 10 });
      }).not.toThrow();
    });

    it("should handle rendering at exact bitmap edge", () => {
      const bitmap = createBitmap(5, 7); // Exactly one character size

      renderBitmapText(bitmap, "A", 0, 0);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle default options", () => {
      const bitmap = createBitmap(50, 20);

      renderBitmapText(bitmap, "TEST", 0, 0);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });
});
