import { Point2D, ViewportConfig } from "@core/types";

/**
 * Projection Interface
 *
 * Defines how GPS coordinates are projected to 2D pixel coordinates.
 * Different projections can be implemented (Mercator, Equirectangular, etc.)
 */
export interface IProjection {
  /**
   * Project GPS coordinates to pixel coordinates
   * @param lat Latitude in decimal degrees
   * @param lon Longitude in decimal degrees
   * @param viewport Viewport configuration
   * @returns Pixel coordinates
   */
  project(lat: number, lon: number, viewport: ViewportConfig): Point2D;

  /**
   * Unproject pixel coordinates back to GPS coordinates
   * @param x Pixel x coordinate
   * @param y Pixel y coordinate
   * @param viewport Viewport configuration
   * @returns GPS coordinates { lat, lon }
   */
  unproject(
    x: number,
    y: number,
    viewport: ViewportConfig,
  ): { lat: number; lon: number };

  /**
   * Get the name of this projection
   */
  getName(): string;
}

/**
 * Simple Equirectangular Projection
 * Fast but distorts at high latitudes
 */
export class EquirectangularProjection implements IProjection {
  project(lat: number, lon: number, viewport: ViewportConfig): Point2D {
    const { centerPoint, zoomLevel, width, height } = viewport;

    // Zoom factor (exponential scale)
    const scale = Math.pow(2, zoomLevel);

    // Meters per pixel at this zoom level (approximate)
    const metersPerPixel =
      (156543.03392 * Math.cos((centerPoint.latitude * Math.PI) / 180)) / scale;

    // Calculate offset from center in meters
    const latDiff = lat - centerPoint.latitude;
    const lonDiff = lon - centerPoint.longitude;

    // Convert to meters (approximate)
    const yMeters = latDiff * 111320; // 1 degree latitude ≈ 111.32 km
    const xMeters =
      lonDiff * 111320 * Math.cos((centerPoint.latitude * Math.PI) / 180);

    // Convert to pixels from center
    const xOffset = xMeters / metersPerPixel;
    const yOffset = -yMeters / metersPerPixel; // Negative because y increases downward

    // Calculate final pixel position
    const x = Math.round(width / 2 + xOffset);
    const y = Math.round(height / 2 + yOffset);

    return { x, y };
  }

  unproject(
    x: number,
    y: number,
    viewport: ViewportConfig,
  ): { lat: number; lon: number } {
    const { centerPoint, zoomLevel, width, height } = viewport;

    // Zoom factor
    const scale = Math.pow(2, zoomLevel);
    const metersPerPixel =
      (156543.03392 * Math.cos((centerPoint.latitude * Math.PI) / 180)) / scale;

    // Calculate pixel offset from center
    const xOffset = x - width / 2;
    const yOffset = y - height / 2;

    // Convert to meters
    const xMeters = xOffset * metersPerPixel;
    const yMeters = -yOffset * metersPerPixel;

    // Convert to degrees
    const latDiff = yMeters / 111320;
    const lonDiff =
      xMeters / (111320 * Math.cos((centerPoint.latitude * Math.PI) / 180));

    return {
      lat: centerPoint.latitude + latDiff,
      lon: centerPoint.longitude + lonDiff,
    };
  }

  getName(): string {
    return "Equirectangular";
  }
}

