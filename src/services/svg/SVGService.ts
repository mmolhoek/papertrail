import { ISVGService } from "@core/interfaces";
import {
  Result,
  GPXTrack,
  ViewportConfig,
  Bitmap1Bit,
  RenderOptions,
  Point2D,
  success,
  failure,
} from "../../core/types";
import { DisplayError } from "../../core/errors";
import { getLogger } from "../../utils/logger";

const logger = getLogger("SVGService");

/**
 * SVG Service Implementation
 *
 * Renders GPX tracks to 1-bit bitmaps for e-paper display.
 * Handles coordinate projection, track rendering, and bitmap generation.
 */
export class SVGService implements ISVGService {
  constructor() {}

  /**
   * Render a viewport with a GPX track centered on a coordinate
   */
  async renderViewport(
    track: GPXTrack,
    viewport: ViewportConfig,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(`Rendering viewport: ${viewport.width}x${viewport.height}, zoom=${viewport.zoomLevel}`);
    try {
      const renderOpts = { ...this.getDefaultRenderOptions(), ...options };

      // Create blank bitmap
      const bitmap = this.createBlankBitmap(
        viewport.width,
        viewport.height,
        false,
      );

      // Check if track has points
      if (
        track.segments.length === 0 ||
        track.segments[0].points.length === 0
      ) {
        logger.debug("Track has no points, returning blank bitmap");
        return success(bitmap); // Return blank bitmap
      }

      const totalPoints = track.segments[0].points.length;
      logger.debug(`Rendering track with ${totalPoints} points`);

      // Project all track points to pixel coordinates
      const projectedPoints = track.segments[0].points.map((point) =>
        this.projectToPixels(point.latitude, point.longitude, viewport),
      );

      // Draw connecting lines if enabled
      if (renderOpts.showLine && projectedPoints.length > 1) {
        for (let i = 0; i < projectedPoints.length - 1; i++) {
          this.drawLine(
            bitmap,
            projectedPoints[i],
            projectedPoints[i + 1],
            renderOpts.lineWidth,
          );
        }
      }

      // Draw points if enabled
      if (renderOpts.showPoints) {
        for (const point of projectedPoints) {
          this.drawCircle(bitmap, point, renderOpts.pointRadius);
        }
      }

      // Highlight current position if enabled
      if (renderOpts.highlightCurrentPosition) {
        const centerPoint = this.projectToPixels(
          viewport.centerPoint.latitude,
          viewport.centerPoint.longitude,
          viewport,
        );

        const radius = renderOpts.currentPositionRadius || 8;

        // Draw outer circle
        this.drawCircle(bitmap, centerPoint, radius);
        // Draw inner filled circle
        this.drawFilledCircle(bitmap, centerPoint, radius - 2);
      }

      logger.info(`Viewport rendered successfully: ${totalPoints} points`);
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render viewport:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  /**
   * Render multiple tracks in the same viewport
   */
  async renderMultipleTracks(
    tracks: GPXTrack[],
    viewport: ViewportConfig,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(`Rendering ${tracks.length} tracks in viewport`);
    try {
      const renderOpts = { ...this.getDefaultRenderOptions(), ...options };

      // Create blank bitmap
      const bitmap = this.createBlankBitmap(
        viewport.width,
        viewport.height,
        false,
      );

      let renderedTracks = 0;
      let totalPoints = 0;

      // Render each track
      for (const track of tracks) {
        if (
          track.segments.length === 0 ||
          track.segments[0].points.length === 0
        ) {
          continue;
        }

        const trackPoints = track.segments[0].points.length;
        totalPoints += trackPoints;
        renderedTracks++;

        const projectedPoints = track.segments[0].points.map((point) =>
          this.projectToPixels(point.latitude, point.longitude, viewport),
        );

        // Draw lines
        if (renderOpts.showLine && projectedPoints.length > 1) {
          for (let i = 0; i < projectedPoints.length - 1; i++) {
            this.drawLine(
              bitmap,
              projectedPoints[i],
              projectedPoints[i + 1],
              renderOpts.lineWidth,
            );
          }
        }

        // Draw points
        if (renderOpts.showPoints) {
          for (const point of projectedPoints) {
            this.drawCircle(bitmap, point, renderOpts.pointRadius);
          }
        }
      }

      // Highlight current position
      if (renderOpts.highlightCurrentPosition) {
        const centerPoint = this.projectToPixels(
          viewport.centerPoint.latitude,
          viewport.centerPoint.longitude,
          viewport,
        );

        const radius = renderOpts.currentPositionRadius || 8;
        this.drawCircle(bitmap, centerPoint, radius);
        this.drawFilledCircle(bitmap, centerPoint, radius - 2);
      }

      logger.info(`Multiple tracks rendered: ${renderedTracks} tracks, ${totalPoints} total points`);
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render multiple tracks:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  /**
   * Create a blank bitmap of specified dimensions
   */
  createBlankBitmap(
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
   * Add text to a bitmap
   */
  addText(
    bitmap: Bitmap1Bit,
    text: string,
    x: number,
    y: number,
    fontSize: number = 12,
  ): Result<Bitmap1Bit> {
    logger.debug(`Adding text: "${text}" at (${x}, ${y}), size=${fontSize}`);
    // TODO: Implement text rendering
    // For now, just return the bitmap unchanged
    logger.warn("Text rendering not yet implemented");
    return success(bitmap);
  }

  /**
   * Add a compass rose to indicate direction
   */
  addCompass(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    radius: number,
    heading: number,
  ): Result<Bitmap1Bit> {
    logger.debug(`Adding compass at (${x}, ${y}), radius=${radius}, heading=${heading}°`);
    // TODO: Implement compass rendering
    // For now, just draw a circle
    this.drawCircle(bitmap, { x, y }, radius);
    logger.warn("Compass rendering not fully implemented (showing circle only)");
    return success(bitmap);
  }

  /**
   * Add a scale bar to the bitmap
   */
  addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    metersPerPixel: number,
  ): Result<Bitmap1Bit> {
    logger.debug(`Adding scale bar at (${x}, ${y}), width=${width}, metersPerPixel=${metersPerPixel}`);
    // TODO: Implement scale bar rendering
    logger.warn("Scale bar rendering not yet implemented");
    return success(bitmap);
  }

  /**
   * Overlay information panel on the bitmap
   */
  addInfoPanel(
    bitmap: Bitmap1Bit,
    info: {
      speed?: string;
      distance?: string;
      elevation?: string;
      time?: string;
    },
    position:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right" = "top-left",
  ): Result<Bitmap1Bit> {
    logger.debug(`Adding info panel at ${position}:`, info);
    // TODO: Implement info panel rendering
    logger.warn("Info panel rendering not yet implemented");
    return success(bitmap);
  }

  /**
   * Get the default render options
   */
  getDefaultRenderOptions(): RenderOptions {
    return {
      lineWidth: 2,
      pointRadius: 3,
      showPoints: true,
      showLine: true,
      highlightCurrentPosition: true,
      currentPositionRadius: 8,
      showDirection: false,
      antiAlias: false,
    };
  }

  // Private helper methods

  /**
   * Project GPS coordinates to pixel coordinates
   * Uses simple equirectangular projection
   */
  private projectToPixels(
    lat: number,
    lon: number,
    viewport: ViewportConfig,
  ): Point2D {
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

  /**
   * Set a pixel in the bitmap (1 = black, 0 = white in the bit)
   */
  private setPixel(
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
  private drawLine(
    bitmap: Bitmap1Bit,
    p1: Point2D,
    p2: Point2D,
    width: number = 1,
  ): void {
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const sx = p1.x < p2.x ? 1 : -1;
    const sy = p1.y < p2.y ? 1 : -1;
    let err = dx - dy;

    let x = p1.x;
    let y = p1.y;

    while (true) {
      // Draw pixel with width
      if (width === 1) {
        this.setPixel(bitmap, x, y);
      } else {
        this.drawFilledCircle(bitmap, { x, y }, Math.floor(width / 2));
      }

      if (x === p2.x && y === p2.y) break;

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
   * Draw a circle outline
   */
  private drawCircle(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number,
  ): void {
    let x = 0;
    let y = radius;
    let d = 3 - 2 * radius;

    while (y >= x) {
      this.setPixel(bitmap, center.x + x, center.y + y);
      this.setPixel(bitmap, center.x - x, center.y + y);
      this.setPixel(bitmap, center.x + x, center.y - y);
      this.setPixel(bitmap, center.x - x, center.y - y);
      this.setPixel(bitmap, center.x + y, center.y + x);
      this.setPixel(bitmap, center.x - y, center.y + x);
      this.setPixel(bitmap, center.x + y, center.y - x);
      this.setPixel(bitmap, center.x - y, center.y - x);

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
  private drawFilledCircle(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number,
  ): void {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius) {
          this.setPixel(bitmap, center.x + x, center.y + y);
        }
      }
    }
  }
}
