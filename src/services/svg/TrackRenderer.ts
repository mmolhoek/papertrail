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

    // Project all track points to pixel coordinates
    let projectedPoints = track.segments[0].points.map((point) =>
      ProjectionService.projectToPixels(
        point.latitude,
        point.longitude,
        viewport,
      ),
    );

    // Apply rotation if rotateWithBearing is enabled and bearing is available
    const bearing = viewport.centerPoint.bearing;
    if (options.rotateWithBearing && bearing !== undefined) {
      logger.debug(
        `Rotating track by ${bearing.toFixed(1)}° for track-up view`,
      );
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      projectedPoints = projectedPoints.map((p) =>
        ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
      );
    }

    // Draw the track
    TrackRenderer.renderProjectedPoints(
      bitmap,
      projectedPoints,
      options,
      viewport.width,
      viewport.height,
    );

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

    // Project all track points to pixel coordinates
    let projectedPoints = track.segments[0].points.map((point) =>
      ProjectionService.projectToPixels(
        point.latitude,
        point.longitude,
        viewport,
      ),
    );

    // Apply rotation if needed
    const bearing = viewport.centerPoint.bearing;
    if (options.rotateWithBearing && bearing !== undefined) {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      projectedPoints = projectedPoints.map((p) =>
        ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
      );
    }

    // Render with area constraint
    TrackRenderer.renderProjectedPointsInArea(
      bitmap,
      projectedPoints,
      options,
      maxX,
    );

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
    viewportWidth?: number,
    viewportHeight?: number,
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

    // Project route points
    let projectedRoute = geometry.map(([lat, lon]) =>
      ProjectionService.projectToPixels(lat, lon, viewport),
    );

    // Apply rotation if needed
    const bearing = viewport.centerPoint.bearing;
    if (options.rotateWithBearing && bearing !== undefined) {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      projectedRoute = projectedRoute.map((p) =>
        ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
      );
    }

    // Draw the route
    if (maxX !== undefined) {
      TrackRenderer.renderProjectedPointsInArea(
        bitmap,
        projectedRoute,
        { ...options, showPoints: false },
        maxX,
      );
    } else {
      TrackRenderer.renderProjectedPoints(bitmap, projectedRoute, {
        ...options,
        showPoints: false,
      });
    }

    return geometry.length;
  }
}
