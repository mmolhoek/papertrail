import { ManeuverRenderer } from "../ManeuverRenderer";
import { BitmapUtils } from "../BitmapUtils";
import { ManeuverType } from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("ManeuverRenderer", () => {
  describe("getManeuverAngle", () => {
    it("should return -135 for SHARP_LEFT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.SHARP_LEFT)).toBe(
        -135,
      );
    });

    it("should return -90 for LEFT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.LEFT)).toBe(-90);
    });

    it("should return -45 for SLIGHT_LEFT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.SLIGHT_LEFT)).toBe(
        -45,
      );
    });

    it("should return 0 for STRAIGHT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.STRAIGHT)).toBe(0);
    });

    it("should return 45 for SLIGHT_RIGHT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.SLIGHT_RIGHT)).toBe(
        45,
      );
    });

    it("should return 90 for RIGHT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.RIGHT)).toBe(90);
    });

    it("should return 135 for SHARP_RIGHT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.SHARP_RIGHT)).toBe(
        135,
      );
    });

    it("should return 180 for UTURN", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.UTURN)).toBe(180);
    });

    it("should return -30 for FORK_LEFT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.FORK_LEFT)).toBe(
        -30,
      );
    });

    it("should return 30 for FORK_RIGHT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.FORK_RIGHT)).toBe(
        30,
      );
    });

    it("should return -45 for RAMP_LEFT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.RAMP_LEFT)).toBe(
        -45,
      );
    });

    it("should return 45 for RAMP_RIGHT", () => {
      expect(ManeuverRenderer.getManeuverAngle(ManeuverType.RAMP_RIGHT)).toBe(
        45,
      );
    });

    it("should return 0 for unknown maneuver type", () => {
      expect(ManeuverRenderer.getManeuverAngle("unknown" as ManeuverType)).toBe(
        0,
      );
    });
  });

  describe("getExitNumber", () => {
    it("should return 1 for ROUNDABOUT_EXIT_1", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_1),
      ).toBe(1);
    });

    it("should return 2 for ROUNDABOUT_EXIT_2", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_2),
      ).toBe(2);
    });

    it("should return 3 for ROUNDABOUT_EXIT_3", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_3),
      ).toBe(3);
    });

    it("should return 4 for ROUNDABOUT_EXIT_4", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_4),
      ).toBe(4);
    });

    it("should return 5 for ROUNDABOUT_EXIT_5", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_5),
      ).toBe(5);
    });

    it("should return 6 for ROUNDABOUT_EXIT_6", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_6),
      ).toBe(6);
    });

    it("should return 7 for ROUNDABOUT_EXIT_7", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_7),
      ).toBe(7);
    });

    it("should return 8 for ROUNDABOUT_EXIT_8", () => {
      expect(
        ManeuverRenderer.getExitNumber(ManeuverType.ROUNDABOUT_EXIT_8),
      ).toBe(8);
    });

    it("should return 1 for unknown roundabout exit", () => {
      expect(ManeuverRenderer.getExitNumber(ManeuverType.STRAIGHT)).toBe(1);
    });
  });

  describe("drawManeuverArrow", () => {
    it("should draw U-turn arrow for UTURN", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.UTURN,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw straight arrow for STRAIGHT", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.STRAIGHT,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw destination marker for ARRIVE", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.ARRIVE,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw roundabout arrow for roundabout maneuvers", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.ROUNDABOUT_EXIT_2,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow for LEFT", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(bitmap, 50, 50, ManeuverType.LEFT, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow for RIGHT", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.RIGHT,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow for SHARP_LEFT", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.SHARP_LEFT,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow for SLIGHT_RIGHT", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        50,
        50,
        ManeuverType.SLIGHT_RIGHT,
        40,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });
  });

  describe("drawTurnArrow", () => {
    it("should draw turn arrow at 0 degrees", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawTurnArrow(bitmap, 50, 50, 40, 0);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow at 90 degrees", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawTurnArrow(bitmap, 50, 50, 40, 90);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow at -90 degrees", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawTurnArrow(bitmap, 50, 50, 40, -90);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw turn arrow at 180 degrees", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawTurnArrow(bitmap, 50, 50, 40, 180);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should scale with size parameter", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const largeBitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawTurnArrow(smallBitmap, 50, 50, 20, 45);
      ManeuverRenderer.drawTurnArrow(largeBitmap, 50, 50, 60, 45);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });
  });

  describe("drawStraightArrow", () => {
    it("should draw a straight arrow", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawStraightArrow(bitmap, 50, 50, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should center arrow at specified position", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawStraightArrow(bitmap, 50, 50, 40);

      // Check that center column has pixels
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      const centerByte = 50 >> 3; // Byte containing x=50
      let foundBlack = false;
      for (let y = 0; y < 100; y++) {
        if (bitmap.data[y * bytesPerRow + centerByte] !== 0xff) {
          foundBlack = true;
          break;
        }
      }
      expect(foundBlack).toBe(true);
    });

    it("should scale with size parameter", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const largeBitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawStraightArrow(smallBitmap, 50, 50, 20);
      ManeuverRenderer.drawStraightArrow(largeBitmap, 50, 50, 60);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });
  });

  describe("drawUturnArrow", () => {
    it("should draw a U-turn arrow", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawUturnArrow(bitmap, 50, 50, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw arc at top of U shape", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawUturnArrow(bitmap, 50, 50, 40);

      // Check upper portion has pixels
      let upperPixels = 0;
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      for (let y = 0; y < 50; y++) {
        for (let x = 0; x < bytesPerRow; x++) {
          upperPixels += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      expect(upperPixels).toBeGreaterThan(0);
    });
  });

  describe("drawDestinationMarker", () => {
    it("should draw a destination marker", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDestinationMarker(bitmap, 50, 50, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw circular top portion", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDestinationMarker(bitmap, 50, 50, 40);

      // Marker should have pixels in upper area (circle)
      let upperPixels = 0;
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      for (let y = 30; y < 45; y++) {
        for (let x = 0; x < bytesPerRow; x++) {
          upperPixels += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      expect(upperPixels).toBeGreaterThan(0);
    });
  });

  describe("drawRoundaboutArrow", () => {
    it("should draw roundabout with exit 1", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawRoundaboutArrow(
        bitmap,
        50,
        50,
        40,
        ManeuverType.ROUNDABOUT_EXIT_1,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw roundabout with exit 2", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawRoundaboutArrow(
        bitmap,
        50,
        50,
        40,
        ManeuverType.ROUNDABOUT_EXIT_2,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw roundabout with exit 3", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawRoundaboutArrow(
        bitmap,
        50,
        50,
        40,
        ManeuverType.ROUNDABOUT_EXIT_3,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw different exits at different angles", () => {
      const bitmap1 = BitmapUtils.createBlankBitmap(100, 100);
      const bitmap2 = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawRoundaboutArrow(
        bitmap1,
        50,
        50,
        40,
        ManeuverType.ROUNDABOUT_EXIT_1,
      );
      ManeuverRenderer.drawRoundaboutArrow(
        bitmap2,
        50,
        50,
        40,
        ManeuverType.ROUNDABOUT_EXIT_4,
      );

      // Bitmaps should be different (different exit angles)
      let differences = 0;
      for (let i = 0; i < bitmap1.data.length; i++) {
        if (bitmap1.data[i] !== bitmap2.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });
  });

  describe("drawDirectionalArrow", () => {
    it("should draw directional arrow pointing north", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDirectionalArrow(bitmap, 50, 50, 0, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw directional arrow pointing east", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDirectionalArrow(bitmap, 50, 50, 90, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw directional arrow pointing south", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDirectionalArrow(bitmap, 50, 50, 180, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw directional arrow pointing west", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDirectionalArrow(bitmap, 50, 50, 270, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw circle at base of arrow", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDirectionalArrow(bitmap, 50, 50, 0, 40);

      // Check center area for circle pixels
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      let centerPixels = 0;
      for (let y = 45; y < 55; y++) {
        for (let x = 5; x < 8; x++) {
          centerPixels += 8 - countBits(bitmap.data[y * bytesPerRow + x]);
        }
      }
      expect(centerPixels).toBeGreaterThan(0);
    });

    it("should draw different directions differently", () => {
      const northBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const eastBitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawDirectionalArrow(northBitmap, 50, 50, 0, 40);
      ManeuverRenderer.drawDirectionalArrow(eastBitmap, 50, 50, 90, 40);

      let differences = 0;
      for (let i = 0; i < northBitmap.data.length; i++) {
        if (northBitmap.data[i] !== eastBitmap.data[i]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });
  });

  describe("drawCheckmark", () => {
    it("should draw a checkmark", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawCheckmark(bitmap, 50, 50, 40);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should draw circle around checkmark", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawCheckmark(bitmap, 50, 50, 40);

      // Check periphery for circle pixels
      const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
      let peripheryPixels = 0;
      // Check top edge
      for (let x = 3; x < 10; x++) {
        peripheryPixels += 8 - countBits(bitmap.data[30 * bytesPerRow + x]);
      }
      expect(peripheryPixels).toBeGreaterThan(0);
    });

    it("should scale with size parameter", () => {
      const smallBitmap = BitmapUtils.createBlankBitmap(100, 100);
      const largeBitmap = BitmapUtils.createBlankBitmap(100, 100);

      ManeuverRenderer.drawCheckmark(smallBitmap, 50, 50, 20);
      ManeuverRenderer.drawCheckmark(largeBitmap, 50, 50, 60);

      const smallPixels = countBlackPixels(smallBitmap);
      const largePixels = countBlackPixels(largeBitmap);

      expect(largePixels).toBeGreaterThan(smallPixels);
    });
  });

  describe("edge cases", () => {
    it("should handle very small size", () => {
      const bitmap = BitmapUtils.createBlankBitmap(50, 50);

      // Should not throw
      ManeuverRenderer.drawManeuverArrow(bitmap, 25, 25, ManeuverType.LEFT, 5);

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle very large size", () => {
      const bitmap = BitmapUtils.createBlankBitmap(200, 200);

      ManeuverRenderer.drawManeuverArrow(
        bitmap,
        100,
        100,
        ManeuverType.RIGHT,
        150,
      );

      expect(countBlackPixels(bitmap)).toBeGreaterThan(0);
    });

    it("should handle position at edge of bitmap", () => {
      const bitmap = BitmapUtils.createBlankBitmap(100, 100);

      // Should not throw even if drawing goes out of bounds
      ManeuverRenderer.drawManeuverArrow(bitmap, 10, 10, ManeuverType.LEFT, 40);

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
