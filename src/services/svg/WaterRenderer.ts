import { Bitmap1Bit, Point2D, ViewportConfig } from "@core/types";
import { CachedWater } from "@core/interfaces";
import { getLogger } from "@utils/logger";
import { BitmapUtils } from "./BitmapUtils";
import { ProjectionService } from "./ProjectionService";

const logger = getLogger("WaterRenderer");

/**
 * Line widths for water types (in pixels)
 */
const WATER_LINE_WIDTHS: Record<string, number> = {
  river: 4,
  stream: 2,
  canal: 3,
  lake: 1,
  pond: 1,
  reservoir: 1,
  water: 1,
};

/**
 * Renderer for water features from OpenStreetMap.
 *
 * Renders water as:
 * - Linear features (rivers, streams, canals): lines with varying widths
 * - Area features (lakes, ponds): filled polygons with dithered pattern
 */
export class WaterRenderer {
  /**
   * Render water features onto a bitmap as background layer.
   *
   * @param bitmap - Target bitmap to render onto
   * @param water - Cached water data from VectorMapService
   * @param viewport - Viewport configuration for projection
   * @param rotateWithBearing - Whether to apply rotation for track-up view
   * @param maxX - Optional max X coordinate for split-screen layouts
   * @returns Number of water features rendered
   */
  static renderWater(
    bitmap: Bitmap1Bit,
    water: CachedWater[],
    viewport: ViewportConfig,
    rotateWithBearing: boolean = false,
    maxX?: number,
  ): number {
    if (water.length === 0) {
      return 0;
    }

    logger.debug(`Rendering ${water.length} water features`);

    // Sort: render areas first (below), then linear features (on top)
    const sortedWater = [...water].sort((a, b) => {
      if (a.isArea && !b.isArea) return -1;
      if (!a.isArea && b.isArea) return 1;
      return 0;
    });

    let waterRendered = 0;
    const bearing = viewport.centerPoint.bearing;
    const shouldRotate = rotateWithBearing && bearing !== undefined;
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const effectiveMaxX = maxX ?? bitmap.width;

    for (const feature of sortedWater) {
      if (
        WaterRenderer.renderWaterFeature(
          bitmap,
          feature,
          viewport,
          shouldRotate,
          bearing ?? 0,
          centerX,
          centerY,
          effectiveMaxX,
        )
      ) {
        waterRendered++;
      }
    }

    logger.debug(`Rendered ${waterRendered} water features`);
    return waterRendered;
  }

  /**
   * Render a single water feature onto the bitmap.
   *
   * @returns true if any part of the feature was rendered
   */
  private static renderWaterFeature(
    bitmap: Bitmap1Bit,
    feature: CachedWater,
    viewport: ViewportConfig,
    shouldRotate: boolean,
    bearing: number,
    centerX: number,
    centerY: number,
    maxX: number,
  ): boolean {
    const points: Point2D[] = [];

    // Project all points
    for (const [lat, lon] of feature.geometry) {
      let projected = ProjectionService.projectToPixels(lat, lon, viewport);

      // Apply rotation if track-up mode
      if (shouldRotate) {
        projected = ProjectionService.rotatePoint(
          projected,
          centerX,
          centerY,
          -bearing,
        );
      }

      points.push(projected);
    }

    // Check if any point is potentially visible
    const margin = 100;
    const hasVisiblePoint = points.some(
      (p) =>
        p.x >= -margin &&
        p.x < maxX + margin &&
        p.y >= -margin &&
        p.y < bitmap.height + margin,
    );

    if (!hasVisiblePoint) {
      return false;
    }

    if (feature.isArea) {
      // Render as filled polygon with dithered pattern
      WaterRenderer.renderFilledPolygon(bitmap, points, maxX);
    } else {
      // Render as line
      const lineWidth = WATER_LINE_WIDTHS[feature.waterType] ?? 2;
      WaterRenderer.renderLine(bitmap, points, lineWidth, maxX);
    }

    return true;
  }

  /**
   * Render a line (for rivers, streams, canals)
   */
  private static renderLine(
    bitmap: Bitmap1Bit,
    points: Point2D[],
    lineWidth: number,
    maxX: number,
  ): void {
    const margin = 100 + lineWidth;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Skip if both points are far outside the viewport
      if (
        (p1.x < -margin && p2.x < -margin) ||
        (p1.x >= maxX + margin && p2.x >= maxX + margin) ||
        (p1.y < -margin && p2.y < -margin) ||
        (p1.y >= bitmap.height + margin && p2.y >= bitmap.height + margin)
      ) {
        continue;
      }

      BitmapUtils.drawLine(bitmap, p1, p2, lineWidth, maxX);
    }
  }

  /**
   * Render a filled polygon with dithered pattern (for lakes, ponds)
   * Uses scanline algorithm with 50% dither pattern for 1-bit display
   */
  private static renderFilledPolygon(
    bitmap: Bitmap1Bit,
    points: Point2D[],
    maxX: number,
  ): void {
    if (points.length < 3) {
      return;
    }

    // Find bounding box
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    // Clamp to bitmap bounds
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(bitmap.height - 1, Math.ceil(maxY));

    // Scanline fill with dither pattern
    for (let y = minY; y <= maxY; y++) {
      const intersections: number[] = [];

      // Find intersections with polygon edges
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];

        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x);
          intersections.push(x);
        }
      }

      // Sort intersections
      intersections.sort((a, b) => a - b);

      // Fill between pairs of intersections with dither pattern
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = Math.max(0, Math.floor(intersections[i]));
        const x2 = Math.min(maxX - 1, Math.ceil(intersections[i + 1]));

        for (let x = x1; x <= x2; x++) {
          // 50% checkerboard dither pattern for water
          if ((x + y) % 2 === 0) {
            BitmapUtils.setPixel(bitmap, x, y, true);
          }
        }
      }
    }

    // Draw outline
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      BitmapUtils.drawLine(bitmap, p1, p2, 1, maxX);
    }
  }
}
