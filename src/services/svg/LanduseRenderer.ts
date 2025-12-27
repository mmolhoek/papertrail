import { Bitmap1Bit, Point2D, ViewportConfig } from "@core/types";
import { CachedLanduse, LanduseType } from "@core/interfaces";
import { getLogger } from "@utils/logger";
import { BitmapUtils } from "./BitmapUtils";
import { ProjectionService } from "./ProjectionService";

const logger = getLogger("LanduseRenderer");

/**
 * Dither pattern spacing for different landuse types
 * Lower values = denser pattern (more visible)
 */
const LANDUSE_PATTERN_SPACING: Record<LanduseType, number> = {
  forest: 4, // Dense dot pattern
  wood: 4, // Same as forest
  park: 6, // Slightly less dense
  meadow: 8, // Sparse pattern
  grass: 8, // Same as meadow
  farmland: 10, // Very sparse
};

/**
 * Renderer for landuse features from OpenStreetMap.
 *
 * Renders landuse areas as filled polygons with distinct dithered patterns
 * for 1-bit e-paper display:
 * - Forest/Wood: dense dot pattern
 * - Park: medium dot pattern
 * - Meadow/Grass: sparse dot pattern
 * - Farmland: very sparse diagonal pattern
 */
export class LanduseRenderer {
  /**
   * Render landuse features onto a bitmap as background layer.
   * Should be rendered before water and roads (lowest layer).
   *
   * @param bitmap - Target bitmap to render onto
   * @param landuse - Cached landuse data from VectorMapService
   * @param viewport - Viewport configuration for projection
   * @param rotateWithBearing - Whether to apply rotation for track-up view
   * @param maxX - Optional max X coordinate for split-screen layouts
   * @returns Number of landuse features rendered
   */
  static renderLanduse(
    bitmap: Bitmap1Bit,
    landuse: CachedLanduse[],
    viewport: ViewportConfig,
    rotateWithBearing: boolean = false,
    maxX?: number,
  ): number {
    if (landuse.length === 0) {
      return 0;
    }

    logger.debug(`Rendering ${landuse.length} landuse features`);

    let landuseRendered = 0;
    const bearing = viewport.centerPoint.bearing;
    const shouldRotate = rotateWithBearing && bearing !== undefined;
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const effectiveMaxX = maxX ?? bitmap.width;

    for (const feature of landuse) {
      if (
        LanduseRenderer.renderLanduseFeature(
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
        landuseRendered++;
      }
    }

    logger.debug(`Rendered ${landuseRendered} landuse features`);
    return landuseRendered;
  }

  /**
   * Render a single landuse feature onto the bitmap.
   *
   * @returns true if any part of the feature was rendered
   */
  private static renderLanduseFeature(
    bitmap: Bitmap1Bit,
    feature: CachedLanduse,
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

    // Render as filled polygon with pattern
    const spacing = LANDUSE_PATTERN_SPACING[feature.landuseType] ?? 6;
    LanduseRenderer.renderPatternedPolygon(
      bitmap,
      points,
      maxX,
      spacing,
      feature.landuseType,
    );

    return true;
  }

  /**
   * Render a filled polygon with a landuse-specific dither pattern
   * Uses scanline algorithm with various patterns for 1-bit display
   */
  private static renderPatternedPolygon(
    bitmap: Bitmap1Bit,
    points: Point2D[],
    maxX: number,
    spacing: number,
    landuseType: LanduseType,
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

    // Scanline fill with pattern
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

      // Fill between pairs of intersections with pattern
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = Math.max(0, Math.floor(intersections[i]));
        const x2 = Math.min(maxX - 1, Math.ceil(intersections[i + 1]));

        for (let x = x1; x <= x2; x++) {
          if (LanduseRenderer.shouldFillPixel(x, y, spacing, landuseType)) {
            BitmapUtils.setPixel(bitmap, x, y, true);
          }
        }
      }
    }
  }

  /**
   * Determine if a pixel should be filled based on landuse type pattern
   */
  private static shouldFillPixel(
    x: number,
    y: number,
    spacing: number,
    landuseType: LanduseType,
  ): boolean {
    switch (landuseType) {
      case "forest":
      case "wood":
        // Dense dot pattern with slight randomness effect
        return x % spacing === 0 && y % spacing === 0;

      case "park":
        // Medium dot pattern offset every other row
        return x % spacing === (y % (spacing * 2) < spacing ? 0 : spacing / 2);

      case "meadow":
      case "grass":
        // Sparse horizontal dash pattern
        return y % spacing === 0 && x % (spacing * 2) < spacing / 2;

      case "farmland":
        // Very sparse diagonal line pattern
        return (x + y) % spacing === 0;

      default:
        // Default sparse dot pattern
        return x % spacing === 0 && y % spacing === 0;
    }
  }
}
