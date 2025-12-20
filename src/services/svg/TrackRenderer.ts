import {
  Bitmap1Bit,
  Point2D,
  GPXTrack,
  ViewportConfig,
  RenderOptions,
} from "@core/types";
import { getLogger } from "@utils/logger";
import { BitmapUtils } from "./BitmapUtils";
import { ProjectionService } from "./ProjectionService";
import { getCoordinatePool } from "./CoordinatePool";

const logger = getLogger("TrackRenderer");

/**
 * Renderer for GPX track data.
 *
 * Handles rendering track lines, points, and position markers onto bitmaps.
 * Works with projected pixel coordinates and supports rotation for track-up views.
 */
export class TrackRenderer {
  /**
   * Render a track onto a bitmap.
   *
   * @param bitmap - Target bitmap to render onto
   * @param track - GPX track data
   * @param viewport - Viewport configuration for projection
   * @param options - Render options (line width, point radius, etc.)
   * @returns Number of points rendered
   */
  static renderTrack(
    bitmap: Bitmap1Bit,
    track: GPXTrack,
    viewport: ViewportConfig,
    options: RenderOptions,
  ): number {
    // Check if track has points
    if (track.segments.length === 0 || track.segments[0].points.length === 0) {
      logger.debug("Track has no points to render");
      return 0;
    }

    const totalPoints = track.segments[0].points.length;
    logger.debug(`Rendering track with ${totalPoints} points`);

    // Get coordinate pool for reusable arrays
    const pool = getCoordinatePool();
    const projectedPoints = pool.acquire(totalPoints);

    // Project all track points to pixel coordinates using pooled array
    const trackPoints = track.segments[0].points;
    for (let i = 0; i < totalPoints; i++) {
      const projected = ProjectionService.projectToPixels(
        trackPoints[i].latitude,
        trackPoints[i].longitude,
        viewport,
      );
      projectedPoints[i].x = projected.x;
      projectedPoints[i].y = projected.y;
    }

    // Apply rotation if rotateWithBearing is enabled and bearing is available
    const bearing = viewport.centerPoint.bearing;
    if (options.rotateWithBearing && bearing !== undefined) {
      logger.debug(
        `Rotating track by ${bearing.toFixed(1)}° for track-up view`,
      );
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      // Transform in place to avoid additional allocation
      pool.transformInPlace(projectedPoints, totalPoints, (p) =>
        ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
      );
    }

    // Draw the track (only use totalPoints elements, not full array capacity)
    TrackRenderer.renderProjectedPointsWithCount(
      bitmap,
      projectedPoints,
      totalPoints,
      options,
      viewport.width,
      viewport.height,
    );

    // Release array back to pool
    pool.release(projectedPoints);

    return totalPoints;
  }

  /**
   * Render a track onto a partial area of a bitmap (for split-screen layouts).
   *
   * @param bitmap - Target bitmap to render onto
   * @param track - GPX track data
   * @param viewport - Viewport configuration (uses full dimensions for projection)
   * @param options - Render options
   * @param maxX - Maximum X coordinate for rendering (for split layouts)
   * @returns Number of points rendered
   */
  static renderTrackInArea(
    bitmap: Bitmap1Bit,
    track: GPXTrack,
    viewport: ViewportConfig,
    options: RenderOptions,
    maxX: number,
  ): number {
    // Check if track has points
    if (track.segments.length === 0 || track.segments[0].points.length === 0) {
      logger.debug("Track has no points to render");
      return 0;
    }

    const totalPoints = track.segments[0].points.length;

    // Get coordinate pool for reusable arrays
    const pool = getCoordinatePool();
    const projectedPoints = pool.acquire(totalPoints);

    // Project all track points to pixel coordinates using pooled array
    const trackPoints = track.segments[0].points;
    for (let i = 0; i < totalPoints; i++) {
      const projected = ProjectionService.projectToPixels(
        trackPoints[i].latitude,
        trackPoints[i].longitude,
        viewport,
      );
      projectedPoints[i].x = projected.x;
      projectedPoints[i].y = projected.y;
    }

    // Apply rotation if needed
    const bearing = viewport.centerPoint.bearing;
    if (options.rotateWithBearing && bearing !== undefined) {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      // Transform in place to avoid additional allocation
      pool.transformInPlace(projectedPoints, totalPoints, (p) =>
        ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
      );
    }

    // Render with area constraint
    TrackRenderer.renderProjectedPointsInAreaWithCount(
      bitmap,
      projectedPoints,
      totalPoints,
      options,
      maxX,
    );

    // Release array back to pool
    pool.release(projectedPoints);

    return totalPoints;
  }

  /**
   * Render already-projected points onto a bitmap.
   *
   * @param bitmap - Target bitmap
   * @param projectedPoints - Array of projected pixel coordinates
   * @param options - Render options
   * @param viewportWidth - Viewport width for bounds checking
   * @param viewportHeight - Viewport height for bounds checking
   */
  static renderProjectedPoints(
    bitmap: Bitmap1Bit,
    projectedPoints: Point2D[],
    options: RenderOptions,
    _viewportWidth?: number,
    _viewportHeight?: number,
  ): void {
    // Draw connecting lines if enabled
    if (options.showLine && projectedPoints.length > 1) {
      for (let i = 0; i < projectedPoints.length - 1; i++) {
        BitmapUtils.drawLine(
          bitmap,
          projectedPoints[i],
          projectedPoints[i + 1],
          options.lineWidth,
        );
      }
    }

    // Draw points if enabled
    if (options.showPoints) {
      for (const point of projectedPoints) {
        BitmapUtils.drawCircle(bitmap, point, options.pointRadius);
      }
    }
  }

  /**
   * Render projected points within a constrained area (for split layouts).
   *
   * Only draws elements where at least one point is within the maxX boundary.
   *
   * @param bitmap - Target bitmap
   * @param projectedPoints - Array of projected pixel coordinates
   * @param options - Render options
   * @param maxX - Maximum X coordinate for rendering
   */
  static renderProjectedPointsInArea(
    bitmap: Bitmap1Bit,
    projectedPoints: Point2D[],
    options: RenderOptions,
    maxX: number,
  ): void {
    // Draw connecting lines if enabled, only if at least one point is in area
    if (options.showLine && projectedPoints.length > 1) {
      for (let i = 0; i < projectedPoints.length - 1; i++) {
        if (projectedPoints[i].x < maxX || projectedPoints[i + 1].x < maxX) {
          BitmapUtils.drawLine(
            bitmap,
            projectedPoints[i],
            projectedPoints[i + 1],
            options.lineWidth,
            maxX,
          );
        }
      }
    }

    // Draw points if enabled, only if within area
    if (options.showPoints) {
      for (const point of projectedPoints) {
        if (point.x < maxX) {
          BitmapUtils.drawCircle(bitmap, point, options.pointRadius);
        }
      }
    }
  }

  /**
   * Render a position marker (current position indicator).
   *
   * Draws a filled circle with an outer ring to indicate the current position.
   *
   * @param bitmap - Target bitmap
   * @param center - Center point for the marker
   * @param radius - Radius of the marker
   */
  static renderPositionMarker(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number = 8,
  ): void {
    // Draw outer circle
    BitmapUtils.drawCircle(bitmap, center, radius);
    // Draw inner filled circle
    BitmapUtils.drawFilledCircle(bitmap, center, radius - 2);
  }

  /**
   * Render a waypoint marker.
   *
   * Draws a double circle to indicate a waypoint or destination.
   *
   * @param bitmap - Target bitmap
   * @param center - Center point for the marker
   * @param innerRadius - Inner circle radius
   * @param outerRadius - Outer circle radius
   */
  static renderWaypointMarker(
    bitmap: Bitmap1Bit,
    center: Point2D,
    innerRadius: number = 6,
    outerRadius: number = 8,
  ): void {
    BitmapUtils.drawCircle(bitmap, center, innerRadius);
    BitmapUtils.drawCircle(bitmap, center, outerRadius);
  }

  /**
   * Render a start marker for route overview.
   *
   * Draws a large filled circle with "S" indicator.
   *
   * @param bitmap - Target bitmap
   * @param center - Center point for the marker
   * @param radius - Radius of the marker (default 12 for visibility)
   */
  static renderStartMarker(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number = 12,
  ): void {
    const rowBytes = Math.ceil(bitmap.width / 8);
    // Draw outer circle (white/unfilled)
    BitmapUtils.drawCircle(bitmap, center, radius + 2);
    // Draw filled inner circle
    BitmapUtils.drawFilledCircle(bitmap, center, radius);
    // Draw white "S" by clearing pixels in center area
    // Create a small unfilled rectangle in center for "S" visibility
    const innerSize = Math.floor(radius * 0.6);
    for (let dy = -innerSize; dy <= innerSize; dy++) {
      for (let dx = -innerSize; dx <= innerSize; dx++) {
        const px = center.x + dx;
        const py = center.y + dy;
        if (px >= 0 && px < bitmap.width && py >= 0 && py < bitmap.height) {
          // Clear center pixels to create contrast
          if (Math.abs(dx) <= innerSize - 2 && Math.abs(dy) <= innerSize - 2) {
            const byteIndex = py * rowBytes + Math.floor(px / 8);
            const bitIndex = 7 - (px % 8);
            bitmap.data[byteIndex] &= ~(1 << bitIndex); // Clear bit (white)
          }
        }
      }
    }
  }

  /**
   * Render an end marker for route overview.
   *
   * Draws a flag/destination marker shape.
   *
   * @param bitmap - Target bitmap
   * @param center - Center point for the marker
   * @param size - Size of the marker (default 14 for visibility)
   */
  static renderEndMarker(
    bitmap: Bitmap1Bit,
    center: Point2D,
    size: number = 14,
  ): void {
    const rowBytes = Math.ceil(bitmap.width / 8);
    // Draw a checkered flag / destination marker
    // Vertical pole
    const poleTop = center.y - size;
    const poleBottom = center.y + Math.floor(size / 2);
    for (let y = poleTop; y <= poleBottom; y++) {
      if (
        y >= 0 &&
        y < bitmap.height &&
        center.x >= 0 &&
        center.x < bitmap.width
      ) {
        const byteIndex = y * rowBytes + Math.floor(center.x / 8);
        const bitIndex = 7 - (center.x % 8);
        bitmap.data[byteIndex] |= 1 << bitIndex;
        // Make pole 2px wide
        if (center.x + 1 < bitmap.width) {
          const byteIndex2 = y * rowBytes + Math.floor((center.x + 1) / 8);
          const bitIndex2 = 7 - ((center.x + 1) % 8);
          bitmap.data[byteIndex2] |= 1 << bitIndex2;
        }
      }
    }
    // Flag rectangle (filled)
    const flagWidth = size;
    const flagHeight = Math.floor(size * 0.6);
    for (let dy = 0; dy < flagHeight; dy++) {
      for (let dx = 0; dx < flagWidth; dx++) {
        const px = center.x + 2 + dx;
        const py = poleTop + dy;
        if (px >= 0 && px < bitmap.width && py >= 0 && py < bitmap.height) {
          const byteIndex = py * rowBytes + Math.floor(px / 8);
          const bitIndex = 7 - (px % 8);
          bitmap.data[byteIndex] |= 1 << bitIndex;
        }
      }
    }
    // Add checkered pattern (clear some pixels)
    for (let dy = 0; dy < flagHeight; dy++) {
      for (let dx = 0; dx < flagWidth; dx++) {
        const px = center.x + 2 + dx;
        const py = poleTop + dy;
        // Checkered pattern: clear alternating 3x3 squares
        const checkX = Math.floor(dx / 3) % 2;
        const checkY = Math.floor(dy / 3) % 2;
        if (checkX === checkY) {
          if (px >= 0 && px < bitmap.width && py >= 0 && py < bitmap.height) {
            const byteIndex = py * rowBytes + Math.floor(px / 8);
            const bitIndex = 7 - (px % 8);
            bitmap.data[byteIndex] &= ~(1 << bitIndex); // Clear bit
          }
        }
      }
    }
  }

  /**
   * Render a route geometry as a line (for drive navigation).
   *
   * @param bitmap - Target bitmap
   * @param geometry - Array of [latitude, longitude] pairs
   * @param viewport - Viewport configuration
   * @param options - Render options
   * @param maxX - Optional maximum X for area-constrained rendering
   * @returns Number of points in the geometry
   */
  static renderRouteGeometry(
    bitmap: Bitmap1Bit,
    geometry: Array<[number, number]>,
    viewport: ViewportConfig,
    options: RenderOptions,
    maxX?: number,
  ): number {
    if (!geometry || geometry.length < 2) {
      return 0;
    }

    const pointCount = geometry.length;

    // Get coordinate pool for reusable arrays
    const pool = getCoordinatePool();
    const projectedRoute = pool.acquire(pointCount);

    // Project route points using pooled array
    for (let i = 0; i < pointCount; i++) {
      const [lat, lon] = geometry[i];
      const projected = ProjectionService.projectToPixels(lat, lon, viewport);
      projectedRoute[i].x = projected.x;
      projectedRoute[i].y = projected.y;
    }

    // Log first and middle projected points for debugging
    const firstProj = projectedRoute[0];
    const midIdx = Math.floor(pointCount / 2);
    const midProj = projectedRoute[midIdx];
    logger.info(
      `renderRouteGeometry: projected points - first=[${firstProj.x}, ${firstProj.y}], mid=[${midProj.x}, ${midProj.y}], viewportCenter=[${viewport.width / 2}, ${viewport.height / 2}]`,
    );

    // Apply rotation if needed
    const bearing = viewport.centerPoint.bearing;
    if (options.rotateWithBearing && bearing !== undefined) {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      // Transform in place to avoid additional allocation
      pool.transformInPlace(projectedRoute, pointCount, (p) =>
        ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
      );
    }

    // Create render options without showPoints
    const lineOnlyOptions: RenderOptions = {
      ...options,
      showPoints: false,
    };

    // Draw the route
    if (maxX !== undefined) {
      TrackRenderer.renderProjectedPointsInAreaWithCount(
        bitmap,
        projectedRoute,
        pointCount,
        lineOnlyOptions,
        maxX,
      );
    } else {
      TrackRenderer.renderProjectedPointsWithCount(
        bitmap,
        projectedRoute,
        pointCount,
        lineOnlyOptions,
      );
    }

    // Release array back to pool
    pool.release(projectedRoute);

    return pointCount;
  }

  /**
   * Render projected points with explicit count (for pooled arrays).
   *
   * @param bitmap - Target bitmap
   * @param projectedPoints - Array of projected pixel coordinates
   * @param count - Number of points to render (may be less than array length)
   * @param options - Render options
   * @param viewportWidth - Viewport width for bounds checking
   * @param viewportHeight - Viewport height for bounds checking
   */
  static renderProjectedPointsWithCount(
    bitmap: Bitmap1Bit,
    projectedPoints: Point2D[],
    count: number,
    options: RenderOptions,
    _viewportWidth?: number,
    _viewportHeight?: number,
  ): void {
    // Draw connecting lines if enabled
    if (options.showLine && count > 1) {
      for (let i = 0; i < count - 1; i++) {
        BitmapUtils.drawLine(
          bitmap,
          projectedPoints[i],
          projectedPoints[i + 1],
          options.lineWidth,
        );
      }
    }

    // Draw points if enabled
    if (options.showPoints) {
      for (let i = 0; i < count; i++) {
        BitmapUtils.drawCircle(bitmap, projectedPoints[i], options.pointRadius);
      }
    }
  }

  /**
   * Render projected points within a constrained area with explicit count.
   *
   * @param bitmap - Target bitmap
   * @param projectedPoints - Array of projected pixel coordinates
   * @param count - Number of points to render
   * @param options - Render options
   * @param maxX - Maximum X coordinate for rendering
   */
  static renderProjectedPointsInAreaWithCount(
    bitmap: Bitmap1Bit,
    projectedPoints: Point2D[],
    count: number,
    options: RenderOptions,
    maxX: number,
  ): void {
    // Draw connecting lines if enabled, only if at least one point is in area
    if (options.showLine && count > 1) {
      for (let i = 0; i < count - 1; i++) {
        if (projectedPoints[i].x < maxX || projectedPoints[i + 1].x < maxX) {
          BitmapUtils.drawLine(
            bitmap,
            projectedPoints[i],
            projectedPoints[i + 1],
            options.lineWidth,
            maxX,
          );
        }
      }
    }

    // Draw points if enabled, only if within area
    if (options.showPoints) {
      for (let i = 0; i < count; i++) {
        if (projectedPoints[i].x < maxX) {
          BitmapUtils.drawCircle(
            bitmap,
            projectedPoints[i],
            options.pointRadius,
          );
        }
      }
    }
  }
}
