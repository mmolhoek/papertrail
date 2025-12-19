import { Bitmap1Bit, Point2D, ViewportConfig } from "@core/types";
import {
  CachedRoad,
  HIGHWAY_LINE_WIDTHS,
  HIGHWAY_RENDER_PRIORITY,
} from "@core/interfaces";
import { getLogger } from "@utils/logger";
import { BitmapUtils } from "./BitmapUtils";
import { ProjectionService } from "./ProjectionService";

const logger = getLogger("RoadRenderer");

/**
 * Renderer for road network data from OpenStreetMap.
 *
 * Renders roads as background layer with varying line widths by road type.
 * Major roads (motorway, trunk) are drawn last to appear on top.
 */
export class RoadRenderer {
  /**
   * Render roads onto a bitmap as background layer.
   *
   * @param bitmap - Target bitmap to render onto
   * @param roads - Cached road data from VectorMapService
   * @param viewport - Viewport configuration for projection
   * @param rotateWithBearing - Whether to apply rotation for track-up view
   * @param maxX - Optional max X coordinate for split-screen layouts
   * @returns Number of roads rendered
   */
  static renderRoads(
    bitmap: Bitmap1Bit,
    roads: CachedRoad[],
    viewport: ViewportConfig,
    rotateWithBearing: boolean = false,
    maxX?: number,
  ): number {
    if (roads.length === 0) {
      return 0;
    }

    logger.debug(`Rendering ${roads.length} roads`);

    // Sort by render priority (minor roads first, major roads last)
    const sortedRoads = [...roads].sort((a, b) => {
      const priorityA = HIGHWAY_RENDER_PRIORITY[a.highwayType] ?? 0;
      const priorityB = HIGHWAY_RENDER_PRIORITY[b.highwayType] ?? 0;
      return priorityA - priorityB;
    });

    let roadsRendered = 0;
    const bearing = viewport.centerPoint.bearing;
    const shouldRotate = rotateWithBearing && bearing !== undefined;
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const effectiveMaxX = maxX ?? bitmap.width;

    for (const road of sortedRoads) {
      if (
        RoadRenderer.renderRoad(
          bitmap,
          road,
          viewport,
          shouldRotate,
          bearing ?? 0,
          centerX,
          centerY,
          effectiveMaxX,
        )
      ) {
        roadsRendered++;
      }
    }

    logger.debug(`Rendered ${roadsRendered} roads`);
    return roadsRendered;
  }

  /**
   * Render a single road onto the bitmap.
   *
   * @returns true if any part of the road was rendered
   */
  private static renderRoad(
    bitmap: Bitmap1Bit,
    road: CachedRoad,
    viewport: ViewportConfig,
    shouldRotate: boolean,
    bearing: number,
    centerX: number,
    centerY: number,
    maxX: number,
  ): boolean {
    const lineWidth = HIGHWAY_LINE_WIDTHS[road.highwayType] ?? 1;
    const points: Point2D[] = [];

    // Project all points
    for (const [lat, lon] of road.geometry) {
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

    // Check if any point is potentially visible (with margin for line width)
    const margin = 100 + lineWidth;
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

    // Draw line segments
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Skip if both points are far outside the viewport
      // (simple culling - not full line clipping)
      if (
        (p1.x < -margin && p2.x < -margin) ||
        (p1.x >= maxX + margin && p2.x >= maxX + margin) ||
        (p1.y < -margin && p2.y < -margin) ||
        (p1.y >= bitmap.height + margin && p2.y >= bitmap.height + margin)
      ) {
        continue;
      }

      BitmapUtils.drawLine(bitmap, p1, p2, lineWidth);
    }

    return true;
  }

  /**
   * Get roads that are within or near a bounding box.
   * Useful for viewport-based filtering before rendering.
   *
   * @param roads - All cached roads
   * @param minLat - Minimum latitude
   * @param maxLat - Maximum latitude
   * @param minLon - Minimum longitude
   * @param maxLon - Maximum longitude
   * @param margin - Margin in degrees to expand the bounds (default 0.01 ~1km)
   * @returns Filtered roads that intersect the bounds
   */
  static filterRoadsInBounds(
    roads: CachedRoad[],
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
    margin: number = 0.01,
  ): CachedRoad[] {
    const expandedMinLat = minLat - margin;
    const expandedMaxLat = maxLat + margin;
    const expandedMinLon = minLon - margin;
    const expandedMaxLon = maxLon + margin;

    return roads.filter((road) =>
      road.geometry.some(
        ([lat, lon]) =>
          lat >= expandedMinLat &&
          lat <= expandedMaxLat &&
          lon >= expandedMinLon &&
          lon <= expandedMaxLon,
      ),
    );
  }

  /**
   * Calculate the geographic bounds for a viewport.
   * Useful for filtering roads before rendering.
   *
   * @param viewport - Viewport configuration
   * @returns Bounding box in degrees
   */
  static getViewportBounds(viewport: ViewportConfig): {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } {
    const metersPerPixel = ProjectionService.calculateMetersPerPixel(
      viewport.centerPoint.latitude,
      viewport.zoomLevel,
    );

    // Calculate viewport extent in meters
    const halfWidthMeters = (viewport.width / 2) * metersPerPixel;
    const halfHeightMeters = (viewport.height / 2) * metersPerPixel;

    // Convert to degrees (approximate)
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon =
      111320 * Math.cos((viewport.centerPoint.latitude * Math.PI) / 180);

    const latExtent = halfHeightMeters / metersPerDegreeLat;
    const lonExtent = halfWidthMeters / metersPerDegreeLon;

    return {
      minLat: viewport.centerPoint.latitude - latExtent,
      maxLat: viewport.centerPoint.latitude + latExtent,
      minLon: viewport.centerPoint.longitude - lonExtent,
      maxLon: viewport.centerPoint.longitude + lonExtent,
    };
  }
}
