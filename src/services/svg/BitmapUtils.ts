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
 *
 * Performance optimizations:
 * - Typed arrays (Uint8Array) for efficient memory access
 * - Pre-computed bytesPerRow for batch operations
 * - Bitwise operations for pixel manipulation
 * - Horizontal line optimization using byte-level fills
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
   * Get pre-computed bytes per row for a bitmap (optimization helper)
   */
  static getBytesPerRow(bitmap: Bitmap1Bit): number {
    return Math.ceil(bitmap.width / 8);
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
    // Bounds check using bitwise operations for slight speedup
    if (
      (x | 0) !== x ||
      x < 0 ||
      x >= bitmap.width ||
      (y | 0) !== y ||
      y < 0 ||
      y >= bitmap.height
    ) {
      // Fallback for non-integer or out of bounds
      if (x < 0 || x >= bitmap.width || y < 0 || y >= bitmap.height) {
        return;
      }
    }

    const bytesPerRow = Math.ceil(bitmap.width / 8);
    const byteIndex = y * bytesPerRow + (x >> 3); // x >> 3 is faster than Math.floor(x / 8)
    const bitIndex = 7 - (x & 7); // x & 7 is faster than x % 8

    if (value) {
      // Set bit to 0 (black)
      bitmap.data[byteIndex] &= ~(1 << bitIndex);
    } else {
      // Set bit to 1 (white)
      bitmap.data[byteIndex] |= 1 << bitIndex;
    }
  }

  /**
   * Set a pixel with pre-computed bytesPerRow (optimized for loops)
   * @internal Use in tight loops where bytesPerRow is known
   */
  static setPixelFast(
    data: Uint8Array,
    bytesPerRow: number,
    width: number,
    height: number,
    x: number,
    y: number,
    value: boolean = true,
  ): void {
    // Bounds check
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }

    const byteIndex = y * bytesPerRow + (x >> 3);
    const bitIndex = 7 - (x & 7);

    if (value) {
      data[byteIndex] &= ~(1 << bitIndex);
    } else {
      data[byteIndex] |= 1 << bitIndex;
    }
  }

  /**
   * Draw a line between two points using Bresenham's algorithm
   * Optimized with pre-computed bytesPerRow for better performance
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

    // Pre-compute for faster pixel access in loop
    const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
    const data = bitmap.data;
    const bitmapWidth = bitmap.width;
    const bitmapHeight = bitmap.height;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Draw pixel with width
      if (width === 1) {
        BitmapUtils.setPixelFast(
          data,
          bytesPerRow,
          bitmapWidth,
          bitmapHeight,
          x,
          y,
          true,
        );
      } else {
        BitmapUtils.drawFilledCircleFast(
          data,
          bytesPerRow,
          bitmapWidth,
          bitmapHeight,
          x,
          y,
          Math.floor(width / 2),
        );
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
   * Optimized with pre-computed bytesPerRow
   */
  static drawCircle(bitmap: Bitmap1Bit, center: Point2D, radius: number): void {
    // Round inputs to integers for proper pixel-based rendering
    const cx = Math.round(center.x);
    const cy = Math.round(center.y);
    const r = Math.round(radius);

    // Pre-compute for faster pixel access
    const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
    const data = bitmap.data;
    const width = bitmap.width;
    const height = bitmap.height;

    let x = 0;
    let y = r;
    let d = 3 - 2 * r;

    while (y >= x) {
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx + x,
        cy + y,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx - x,
        cy + y,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx + x,
        cy - y,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx - x,
        cy - y,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx + y,
        cy + x,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx - y,
        cy + x,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx + y,
        cy - x,
        true,
      );
      BitmapUtils.setPixelFast(
        data,
        bytesPerRow,
        width,
        height,
        cx - y,
        cy - x,
        true,
      );

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

    // Pre-compute for faster pixel access
    const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
    const data = bitmap.data;
    const width = bitmap.width;
    const height = bitmap.height;

    BitmapUtils.drawFilledCircleFast(
      data,
      bytesPerRow,
      width,
      height,
      cx,
      cy,
      r,
    );
  }

  /**
   * Draw a filled circle with pre-computed bitmap parameters (optimized for loops)
   * @internal
   */
  static drawFilledCircleFast(
    data: Uint8Array,
    bytesPerRow: number,
    width: number,
    height: number,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const r = Math.round(radius);
    const rSquared = r * r;

    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= height) continue;

      // Calculate x range for this row using circle equation
      const dySquared = dy * dy;
      const xRange = Math.sqrt(rSquared - dySquared);
      const xStart = Math.max(0, Math.ceil(cx - xRange));
      const xEnd = Math.min(width - 1, Math.floor(cx + xRange));

      // Fill the row
      for (let x = xStart; x <= xEnd; x++) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        const bitIndex = 7 - (x & 7);
        data[byteIndex] &= ~(1 << bitIndex);
      }
    }
  }

  /**
   * Draw a vertical line
   * Optimized with pre-computed bytesPerRow
   */
  static drawVerticalLine(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    height: number,
    width: number = 1,
  ): void {
    // Bounds check early
    if (x < 0 || x >= bitmap.width || y >= bitmap.height || height <= 0) {
      return;
    }

    const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
    const data = bitmap.data;
    const bitmapWidth = bitmap.width;
    const bitmapHeight = bitmap.height;
    const endY = Math.min(y + height, bitmapHeight);
    const startY = Math.max(y, 0);
    const endX = Math.min(x + width, bitmapWidth);

    for (let row = startY; row < endY; row++) {
      for (let col = x; col < endX; col++) {
        BitmapUtils.setPixelFast(
          data,
          bytesPerRow,
          bitmapWidth,
          bitmapHeight,
          col,
          row,
          true,
        );
      }
    }
  }

  /**
   * Draw a horizontal line
   * Optimized to set entire bytes when possible for better performance
   */
  static drawHorizontalLine(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    thickness: number = 1,
  ): void {
    // Bounds check early
    if (y < 0 || y >= bitmap.height || x >= bitmap.width || width <= 0) {
      return;
    }

    const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
    const endX = Math.min(x + width, bitmap.width);
    const startX = Math.max(x, 0);

    for (let t = 0; t < thickness; t++) {
      const currentY = y + t;
      if (currentY >= bitmap.height) break;

      // Use optimized byte-level fill for single-thickness lines
      if (endX - startX >= 8) {
        BitmapUtils.fillHorizontalSpan(
          bitmap.data,
          bytesPerRow,
          bitmap.width,
          startX,
          endX,
          currentY,
        );
      } else {
        // Fall back to pixel-by-pixel for short lines
        for (let col = startX; col < endX; col++) {
          BitmapUtils.setPixelFast(
            bitmap.data,
            bytesPerRow,
            bitmap.width,
            bitmap.height,
            col,
            currentY,
            true,
          );
        }
      }
    }
  }

  /**
   * Fill a horizontal span efficiently using byte-level operations
   * @internal
   */
  static fillHorizontalSpan(
    data: Uint8Array,
    bytesPerRow: number,
    bitmapWidth: number,
    startX: number,
    endX: number,
    y: number,
  ): void {
    const rowOffset = y * bytesPerRow;

    // First partial byte (if start is not byte-aligned)
    const startByte = startX >> 3;
    const startBit = startX & 7;

    // Last partial byte (if end is not byte-aligned)
    const endByte = (endX - 1) >> 3;
    const endBit = (endX - 1) & 7;

    if (startByte === endByte) {
      // All pixels in the same byte
      const mask = ((1 << (8 - startBit)) - 1) & ~((1 << (7 - endBit)) - 1);
      data[rowOffset + startByte] &= ~mask;
    } else {
      // First partial byte
      if (startBit > 0) {
        const mask = (1 << (8 - startBit)) - 1;
        data[rowOffset + startByte] &= ~mask;
      } else {
        data[rowOffset + startByte] = 0x00;
      }

      // Full bytes in between (set to 0x00 for black)
      for (let b = startByte + (startBit > 0 ? 1 : 0); b < endByte; b++) {
        data[rowOffset + b] = 0x00;
      }

      // Last partial byte
      if (endBit < 7) {
        const mask = ~((1 << (7 - endBit)) - 1) & 0xff;
        data[rowOffset + endByte] &= ~mask;
      } else {
        data[rowOffset + endByte] = 0x00;
      }
    }
  }

  /**
   * Fill a triangle defined by three points
   * Optimized with pre-computed bytesPerRow and bounds checking
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

    // Pre-compute for faster pixel access
    const bytesPerRow = BitmapUtils.getBytesPerRow(bitmap);
    const data = bitmap.data;
    const width = bitmap.width;
    const height = bitmap.height;

    // Clamp y range to bitmap bounds
    const startY = Math.max(top.y, 0);
    const endY = Math.min(bottom.y, height - 1);

    // Scan line fill
    for (let y = startY; y <= endY; y++) {
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

      // Clamp x range to bitmap bounds
      const rowStart = Math.max(Math.floor(xStart), 0);
      const rowEnd = Math.min(Math.ceil(xEnd), width - 1);

      for (let x = rowStart; x <= rowEnd; x++) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        const bitIndex = 7 - (x & 7);
        data[byteIndex] &= ~(1 << bitIndex);
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
