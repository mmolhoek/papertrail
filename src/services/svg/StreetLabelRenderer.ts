import { Bitmap1Bit, Point2D, ViewportConfig } from "@core/types";
import { CachedRoad, HIGHWAY_RENDER_PRIORITY } from "@core/interfaces";
import { getLogger } from "@utils/logger";
import { ProjectionService } from "./ProjectionService";
import { renderBitmapText, calculateBitmapTextWidth } from "@utils/bitmapFont";

const logger = getLogger("StreetLabelRenderer");

/**
 * Minimum road types to label (lower priority roads are skipped)
 * Only label major roads to avoid clutter
 */
const MIN_LABEL_PRIORITY = 3; // tertiary and above

/**
 * Minimum length in pixels for a road segment to be labeled
 */
const MIN_SEGMENT_LENGTH = 100;

/**
 * Label padding in pixels (space around text)
 */
const LABEL_PADDING = 4;

/**
 * Placed label with bounding box for collision detection
 */
interface PlacedLabel {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Renderer for street name labels on the map.
 *
 * Labels are placed along major roads, avoiding overlaps.
 * Uses bitmap font rendering for 1-bit e-paper display.
 */
export class StreetLabelRenderer {
  /**
   * Render street name labels onto a bitmap.
   *
   * @param bitmap - Target bitmap to render onto
   * @param roads - Cached road data with names
   * @param viewport - Viewport configuration for projection
   * @param rotateWithBearing - Whether to apply rotation for track-up view
   * @param maxX - Optional max X coordinate for split-screen layouts
   * @returns Number of labels rendered
   */
  static renderLabels(
    bitmap: Bitmap1Bit,
    roads: CachedRoad[],
    viewport: ViewportConfig,
    rotateWithBearing: boolean = false,
    maxX?: number,
  ): number {
    // Filter roads that have names and are major enough to label
    const labelableRoads = roads.filter((road) => {
      if (!road.name) return false;
      const priority = HIGHWAY_RENDER_PRIORITY[road.highwayType] ?? 0;
      return priority >= MIN_LABEL_PRIORITY;
    });

    if (labelableRoads.length === 0) {
      return 0;
    }

    logger.debug(`Attempting to label ${labelableRoads.length} named roads`);

    // Sort by priority (major roads first for better label placement)
    const sortedRoads = [...labelableRoads].sort((a, b) => {
      const priorityA = HIGHWAY_RENDER_PRIORITY[a.highwayType] ?? 0;
      const priorityB = HIGHWAY_RENDER_PRIORITY[b.highwayType] ?? 0;
      return priorityB - priorityA;
    });

    const bearing = viewport.centerPoint.bearing;
    const shouldRotate = rotateWithBearing && bearing !== undefined;
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const effectiveMaxX = maxX ?? bitmap.width;

    const placedLabels: PlacedLabel[] = [];
    let labelsRendered = 0;

    for (const road of sortedRoads) {
      const labelResult = StreetLabelRenderer.tryPlaceLabel(
        bitmap,
        road,
        viewport,
        shouldRotate,
        bearing ?? 0,
        centerX,
        centerY,
        effectiveMaxX,
        placedLabels,
      );

      if (labelResult) {
        placedLabels.push(labelResult);
        labelsRendered++;
      }
    }

    logger.debug(`Rendered ${labelsRendered} street labels`);
    return labelsRendered;
  }

  /**
   * Try to place a label for a road segment.
   *
   * @returns PlacedLabel if successful, null if couldn't place
   */
  private static tryPlaceLabel(
    bitmap: Bitmap1Bit,
    road: CachedRoad,
    viewport: ViewportConfig,
    shouldRotate: boolean,
    bearing: number,
    centerX: number,
    centerY: number,
    maxX: number,
    placedLabels: PlacedLabel[],
  ): PlacedLabel | null {
    if (!road.name) return null;

    // Project road points
    const points: Point2D[] = [];
    for (const [lat, lon] of road.geometry) {
      let projected = ProjectionService.projectToPixels(lat, lon, viewport);

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

    // Find the longest visible segment
    let bestSegment: { start: Point2D; end: Point2D; length: number } | null =
      null;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Check if segment is in visible area
      const segmentVisible =
        (p1.x >= 0 || p2.x >= 0) &&
        (p1.x < maxX || p2.x < maxX) &&
        (p1.y >= 0 || p2.y >= 0) &&
        (p1.y < bitmap.height || p2.y < bitmap.height);

      if (!segmentVisible) continue;

      const length = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2),
      );

      if (length >= MIN_SEGMENT_LENGTH) {
        if (!bestSegment || length > bestSegment.length) {
          bestSegment = { start: p1, end: p2, length };
        }
      }
    }

    if (!bestSegment) return null;

    // Calculate label position (midpoint of segment)
    const midX = (bestSegment.start.x + bestSegment.end.x) / 2;
    const midY = (bestSegment.start.y + bestSegment.end.y) / 2;

    // Truncate name if too long
    const maxNameLength = 15;
    const displayName =
      road.name.length > maxNameLength
        ? road.name.substring(0, maxNameLength - 2) + ".."
        : road.name;

    // Calculate label dimensions
    const labelScale = 1; // Small text for map labels
    const labelWidth = calculateBitmapTextWidth(displayName, labelScale);
    const labelHeight = 7 * labelScale; // Approximate height

    // Position label centered on midpoint
    const labelX = Math.floor(midX - labelWidth / 2);
    const labelY = Math.floor(midY - labelHeight / 2);

    // Check bounds
    if (
      labelX < LABEL_PADDING ||
      labelX + labelWidth > maxX - LABEL_PADDING ||
      labelY < LABEL_PADDING ||
      labelY + labelHeight > bitmap.height - LABEL_PADDING
    ) {
      return null;
    }

    // Check for collisions with existing labels
    const newLabel: PlacedLabel = {
      x: labelX - LABEL_PADDING,
      y: labelY - LABEL_PADDING,
      width: labelWidth + LABEL_PADDING * 2,
      height: labelHeight + LABEL_PADDING * 2,
    };

    for (const existing of placedLabels) {
      if (StreetLabelRenderer.labelsOverlap(newLabel, existing)) {
        return null;
      }
    }

    // Clear background area (white rectangle behind text)
    StreetLabelRenderer.clearLabelBackground(
      bitmap,
      labelX - 2,
      labelY - 1,
      labelWidth + 4,
      labelHeight + 2,
    );

    // Render the label
    renderBitmapText(bitmap, displayName, labelX, labelY, {
      scale: labelScale,
    });

    return newLabel;
  }

  /**
   * Check if two labels overlap
   */
  private static labelsOverlap(a: PlacedLabel, b: PlacedLabel): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * Clear a rectangular area (set to white/0) for label background
   */
  private static clearLabelBackground(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const startX = Math.max(0, Math.floor(x));
    const startY = Math.max(0, Math.floor(y));
    const endX = Math.min(bitmap.width, Math.ceil(x + width));
    const endY = Math.min(bitmap.height, Math.ceil(y + height));
    const bytesPerRow = Math.ceil(bitmap.width / 8);

    for (let py = startY; py < endY; py++) {
      for (let px = startX; px < endX; px++) {
        const byteIndex = py * bytesPerRow + Math.floor(px / 8);
        const bitIndex = 7 - (px % 8);
        // Clear bit (set to white/0)
        bitmap.data[byteIndex] &= ~(1 << bitIndex);
      }
    }
  }
}
