import { Point2D, ViewportConfig } from "@core/types";

/**
 * Meters per degree of latitude (approximately constant)
 */
const METERS_PER_DEGREE_LAT = 111320;

/**
 * Web Mercator constant for meters per pixel at zoom level 0 at equator
 * Calculated as: EARTH_CIRCUMFERENCE_METERS / 256 (tile size)
 */
const METERS_PER_PIXEL_AT_EQUATOR_ZOOM_0 = 156543.03392;

/**
 * Service for coordinate projection and transformation operations.
 *
 * Handles:
 * - GPS to pixel coordinate conversion (equirectangular projection)
 * - Point rotation for track-up views
 * - Meters per pixel calculations at various zoom levels
 */
export class ProjectionService {
  /**
   * Project GPS coordinates to pixel coordinates using equirectangular projection.
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @param viewport - Viewport configuration with center point, zoom, and dimensions
   * @returns Pixel coordinates relative to the viewport
   */
  static projectToPixels(
    lat: number,
    lon: number,
    viewport: ViewportConfig,
  ): Point2D {
    const { centerPoint, zoomLevel, width, height, panOffset } = viewport;

    // Meters per pixel at this zoom level (approximate)
    const metersPerPixel = ProjectionService.calculateMetersPerPixel(
      centerPoint.latitude,
      zoomLevel,
    );

    // Calculate offset from center in meters
    const latDiff = lat - centerPoint.latitude;
    const lonDiff = lon - centerPoint.longitude;

    // Convert to meters (approximate)
    const yMeters = latDiff * METERS_PER_DEGREE_LAT;
    const xMeters =
      lonDiff *
      METERS_PER_DEGREE_LAT *
      Math.cos((centerPoint.latitude * Math.PI) / 180);

    // Convert to pixels from center
    const xOffset = xMeters / metersPerPixel;
    const yOffset = -yMeters / metersPerPixel; // Negative because y increases downward

    // Apply pan offset if present (shifts the entire map)
    const panX = panOffset?.x ?? 0;
    const panY = panOffset?.y ?? 0;

    // Calculate final pixel position with pan offset applied
    const x = Math.round(width / 2 + xOffset - panX);
    const y = Math.round(height / 2 + yOffset - panY);

    return { x, y };
  }

  /**
   * Calculate meters per pixel at a given latitude and zoom level.
   *
   * Uses the Web Mercator projection formula to calculate the ground resolution.
   *
   * @param latitude - Latitude in degrees
   * @param zoomLevel - Zoom level (typically 0-20)
   * @returns Meters per pixel at the given location and zoom
   */
  static calculateMetersPerPixel(latitude: number, zoomLevel: number): number {
    const scale = Math.pow(2, zoomLevel);
    return (
      (METERS_PER_PIXEL_AT_EQUATOR_ZOOM_0 *
        Math.cos((latitude * Math.PI) / 180)) /
      scale
    );
  }

  /**
   * Rotate a point around a center by given angle in degrees.
   *
   * Used for track-up map rotation where the map is rotated to align
   * with the direction of travel.
   *
   * @param point - Point to rotate
   * @param centerX - X coordinate of rotation center
   * @param centerY - Y coordinate of rotation center
   * @param angleDegrees - Rotation angle in degrees (positive = clockwise)
   * @returns Rotated point coordinates
   */
  static rotatePoint(
    point: Point2D,
    centerX: number,
    centerY: number,
    angleDegrees: number,
  ): Point2D {
    const angleRadians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);

    const dx = point.x - centerX;
    const dy = point.y - centerY;

    return {
      x: Math.round(centerX + dx * cos - dy * sin),
      y: Math.round(centerY + dx * sin + dy * cos),
    };
  }

  /**
   * Project an array of GPS coordinates to pixel coordinates.
   *
   * @param coordinates - Array of [latitude, longitude] pairs
   * @param viewport - Viewport configuration
   * @returns Array of pixel coordinates
   */
  static projectCoordinates(
    coordinates: Array<{ latitude: number; longitude: number }>,
    viewport: ViewportConfig,
  ): Point2D[] {
    return coordinates.map((coord) =>
      ProjectionService.projectToPixels(
        coord.latitude,
        coord.longitude,
        viewport,
      ),
    );
  }

  /**
   * Project and rotate an array of GPS coordinates.
   *
   * Useful for track-up views where the map needs to be rotated
   * to align with the direction of travel.
   *
   * @param coordinates - Array of coordinate objects with latitude and longitude
   * @param viewport - Viewport configuration
   * @param bearing - Rotation angle in degrees (typically the current bearing)
   * @returns Array of projected and rotated pixel coordinates
   */
  static projectAndRotateCoordinates(
    coordinates: Array<{ latitude: number; longitude: number }>,
    viewport: ViewportConfig,
    bearing: number,
  ): Point2D[] {
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;

    const projected = ProjectionService.projectCoordinates(
      coordinates,
      viewport,
    );
    return projected.map((p) =>
      ProjectionService.rotatePoint(p, centerX, centerY, -bearing),
    );
  }
}
