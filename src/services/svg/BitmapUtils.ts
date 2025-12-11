import { Bitmap1Bit, Point2D } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("BitmapUtils");

/**
 * Utility class for bitmap manipulation operations.
 *
 * Provides low-level drawing primitives for 1-bit bitmaps including:
 * - Bitmap creation
 * - Pixel manipulation
 * - Line drawing (Bresenham's algorithm)
 * - Circle drawing (Midpoint algorithm)
 * - Shape filling
 */
export class BitmapUtils {
  /**
   * Create a blank bitmap of specified dimensions
   */
  static createBlankBitmap(
    width: number,
    height: number,
    fill: boolean = false,
  ): Bitmap1Bit {
    logger.debug(`Creating blank bitmap: ${width}x${height}, fill=${fill}`);
    // Calculate bytes needed (1 bit per pixel, packed into bytes)
    const bytesPerRow = Math.ceil(width / 8);
    const totalBytes = bytesPerRow * height;

    // Create buffer filled with 0xFF (white) or 0x00 (black)
    const data = new Uint8Array(totalBytes);
    data.fill(fill ? 0x00 : 0xff);

    return {
      width,
      height,
      data,
      metadata: {
        createdAt: new Date(),
      },
    };
  }

  /**
   * Set a pixel in the bitmap (1 = black, 0 = white in the bit)
   */
  static setPixel(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    value: boolean = true,
  ): void {
    // Bounds check
    if (x < 0 || x >= bitmap.width || y < 0 || y >= bitmap.height) {
      return;
    }

    const bytesPerRow = Math.ceil(bitmap.width / 8);
    const byteIndex = y * bytesPerRow + Math.floor(x / 8);
    const bitIndex = 7 - (x % 8); // MSB first

    if (value) {
      // Set bit to 0 (black)
      bitmap.data[byteIndex] &= ~(1 << bitIndex);
    } else {
      // Set bit to 1 (white)
      bitmap.data[byteIndex] |= 1 << bitIndex;
    }
  }

  /**
   * Draw a line between two points using Bresenham's algorithm
   */
  static drawLine(
    bitmap: Bitmap1Bit,
    p1: Point2D,
    p2: Point2D,
    width: number = 1,
  ): void {
    // Round coordinates to integers - Bresenham requires integer math
    // Without this, floating point coordinates can cause infinite loops
    const x1 = Math.round(p1.x);
    const y1 = Math.round(p1.y);
    const x2 = Math.round(p2.x);
    const y2 = Math.round(p2.y);

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Draw pixel with width
      if (width === 1) {
        BitmapUtils.setPixel(bitmap, x, y);
      } else {
        BitmapUtils.drawFilledCircle(bitmap, { x, y }, Math.floor(width / 2));
      }

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * Draw a circle outline using Midpoint circle algorithm
   */
  static drawCircle(bitmap: Bitmap1Bit, center: Point2D, radius: number): void {
    // Round inputs to integers for proper pixel-based rendering
    const cx = Math.round(center.x);
    const cy = Math.round(center.y);
    const r = Math.round(radius);

    let x = 0;
    let y = r;
    let d = 3 - 2 * r;

    while (y >= x) {
      BitmapUtils.setPixel(bitmap, cx + x, cy + y);
      BitmapUtils.setPixel(bitmap, cx - x, cy + y);
      BitmapUtils.setPixel(bitmap, cx + x, cy - y);
      BitmapUtils.setPixel(bitmap, cx - x, cy - y);
      BitmapUtils.setPixel(bitmap, cx + y, cy + x);
      BitmapUtils.setPixel(bitmap, cx - y, cy + x);
      BitmapUtils.setPixel(bitmap, cx + y, cy - x);
      BitmapUtils.setPixel(bitmap, cx - y, cy - x);

      x++;

      if (d > 0) {
        y--;
        d = d + 4 * (x - y) + 10;
      } else {
        d = d + 4 * x + 6;
      }
    }
  }

  /**
   * Draw a filled circle
   */
  static drawFilledCircle(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number,
  ): void {
    // Round inputs to integers for proper pixel-based rendering
    const cx = Math.round(center.x);
    const cy = Math.round(center.y);
    const r = Math.round(radius);

    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          BitmapUtils.setPixel(bitmap, cx + x, cy + y);
        }
      }
    }
  }

  /**
   * Draw a vertical line
   */
  static drawVerticalLine(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    height: number,
    width: number = 1,
  ): void {
    for (let row = y; row < y + height; row++) {
      for (let w = 0; w < width; w++) {
        BitmapUtils.setPixel(bitmap, x + w, row, true);
      }
    }
  }

  /**
   * Draw a horizontal line
   */
  static drawHorizontalLine(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    thickness: number = 1,
  ): void {
    for (let col = x; col < x + width; col++) {
      for (let t = 0; t < thickness; t++) {
        BitmapUtils.setPixel(bitmap, col, y + t, true);
      }
    }
  }

  /**
   * Fill a triangle defined by three points
   */
  static fillTriangle(
    bitmap: Bitmap1Bit,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): void {
    // Round coordinates to integers for proper scan-line fill
    const rp1 = { x: Math.round(p1.x), y: Math.round(p1.y) };
    const rp2 = { x: Math.round(p2.x), y: Math.round(p2.y) };
    const rp3 = { x: Math.round(p3.x), y: Math.round(p3.y) };

    // Sort points by y coordinate
    const points = [rp1, rp2, rp3].sort((a, b) => a.y - b.y);
    const [top, mid, bottom] = points;

    // Scan line fill
    for (let y = top.y; y <= bottom.y; y++) {
      let xStart: number, xEnd: number;

      if (y < mid.y) {
        // Upper part of triangle
        xStart = BitmapUtils.interpolateX(top, mid, y);
        xEnd = BitmapUtils.interpolateX(top, bottom, y);
      } else {
        // Lower part of triangle
        xStart = BitmapUtils.interpolateX(mid, bottom, y);
        xEnd = BitmapUtils.interpolateX(top, bottom, y);
      }

      if (xStart > xEnd) {
        [xStart, xEnd] = [xEnd, xStart];
      }

      for (let x = Math.floor(xStart); x <= Math.ceil(xEnd); x++) {
        BitmapUtils.setPixel(bitmap, x, y, true);
      }
    }
  }

  /**
   * Interpolate x coordinate for a given y on a line segment
   */
  static interpolateX(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    y: number,
  ): number {
    if (p2.y === p1.y) return p1.x;
    return p1.x + ((y - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y);
  }
}
