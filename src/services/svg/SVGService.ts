import { ISVGService, FollowTrackInfo } from "@core/interfaces";
import {
  Result,
  GPXTrack,
  GPSCoordinate,
  ViewportConfig,
  Bitmap1Bit,
  RenderOptions,
  Point2D,
  success,
  failure,
} from "@core/types";
import { DisplayError } from "@core/errors";
import { getLogger } from "@utils/logger";

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
    logger.debug(
      `Rendering viewport: ${viewport.width}x${viewport.height}, zoom=${viewport.zoomLevel}`,
    );
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

      logger.info(
        `Multiple tracks rendered: ${renderedTracks} tracks, ${totalPoints} total points`,
      );
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
    logger.debug(
      `Adding compass at (${x}, ${y}), radius=${radius}, heading=${heading}°`,
    );
    // TODO: Implement compass rendering
    // For now, just draw a circle
    this.drawCircle(bitmap, { x, y }, radius);
    logger.warn(
      "Compass rendering not fully implemented (showing circle only)",
    );
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
    logger.debug(
      `Adding scale bar at (${x}, ${y}), width=${width}, metersPerPixel=${metersPerPixel}`,
    );
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

  /**
   * Render the "Follow Track" screen with 80/20 split layout
   * Left area (80%): Track map centered on current position
   * Right area (20%): Speed and satellite information
   */
  async renderFollowTrackScreen(
    track: GPXTrack,
    currentPosition: GPSCoordinate,
    viewport: ViewportConfig,
    info: FollowTrackInfo,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug("Rendering Follow Track screen with 80/20 split layout");

    try {
      const { width, height } = viewport;

      // Calculate split dimensions (80/20)
      const mapWidth = Math.floor(width * 0.8);
      const infoWidth = width - mapWidth;

      // Create main bitmap
      const bitmap = this.createBlankBitmap(width, height, false);

      // Render the map section (left 80%)
      const mapViewport: ViewportConfig = {
        ...viewport,
        width: mapWidth,
        centerPoint: currentPosition,
      };

      const renderOpts = { ...this.getDefaultRenderOptions(), ...options };

      // Render track on left portion
      if (track.segments.length > 0 && track.segments[0].points.length > 0) {
        // Project all track points to pixel coordinates
        const projectedPoints = track.segments[0].points.map((point) =>
          this.projectToPixels(point.latitude, point.longitude, mapViewport),
        );

        // Draw connecting lines if enabled
        if (renderOpts.showLine && projectedPoints.length > 1) {
          for (let i = 0; i < projectedPoints.length - 1; i++) {
            // Only draw if at least one point is in the map area
            if (
              projectedPoints[i].x < mapWidth ||
              projectedPoints[i + 1].x < mapWidth
            ) {
              this.drawLine(
                bitmap,
                projectedPoints[i],
                projectedPoints[i + 1],
                renderOpts.lineWidth,
              );
            }
          }
        }

        // Draw points if enabled
        if (renderOpts.showPoints) {
          for (const point of projectedPoints) {
            if (point.x < mapWidth) {
              this.drawCircle(bitmap, point, renderOpts.pointRadius);
            }
          }
        }
      }

      // Highlight current position (center of map area)
      if (renderOpts.highlightCurrentPosition) {
        const centerPoint = {
          x: Math.floor(mapWidth / 2),
          y: Math.floor(height / 2),
        };
        const radius = renderOpts.currentPositionRadius || 8;
        this.drawCircle(bitmap, centerPoint, radius);
        this.drawFilledCircle(bitmap, centerPoint, radius - 2);
      }

      // Draw vertical divider line
      this.drawVerticalLine(bitmap, mapWidth, 0, height, 2);

      // Render info panel (right 20%)
      this.renderInfoPanel(bitmap, mapWidth + 10, info, infoWidth - 20, height);

      logger.info("Follow Track screen rendered successfully");
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render Follow Track screen:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  /**
   * Render the info panel for the Follow Track screen
   * Displays speed, satellites, progress in a vertical layout
   */
  private renderInfoPanel(
    bitmap: Bitmap1Bit,
    x: number,
    info: FollowTrackInfo,
    width: number,
    height: number,
  ): void {
    logger.debug(`Rendering info panel at x=${x}, width=${width}`);

    // Panel layout constants
    const padding = 10;
    const sectionHeight = Math.floor(height / 4);

    // Section 1: Speed (top)
    const speedY = padding + 20;
    this.renderSimpleText(bitmap, x + padding, speedY, "SPEED");
    this.renderLargeNumber(
      bitmap,
      x + padding,
      speedY + 25,
      Math.round(info.speed),
      width - padding * 2,
    );
    this.renderSimpleText(bitmap, x + padding, speedY + 80, "km/h");

    // Section 2: Satellites
    const satY = sectionHeight + padding + 20;
    this.renderSimpleText(bitmap, x + padding, satY, "SATS");
    this.renderLargeNumber(
      bitmap,
      x + padding,
      satY + 25,
      info.satellites,
      width - padding * 2,
    );

    // Section 3: Progress (if available)
    if (info.progress !== undefined) {
      const progY = sectionHeight * 2 + padding + 20;
      this.renderSimpleText(bitmap, x + padding, progY, "PROGRESS");

      // Draw progress bar
      const barWidth = width - padding * 2;
      const barHeight = 15;
      const barY = progY + 25;

      // Outline
      this.drawHorizontalLine(bitmap, x + padding, barY, barWidth);
      this.drawHorizontalLine(bitmap, x + padding, barY + barHeight, barWidth);
      this.drawVerticalLine(bitmap, x + padding, barY, barHeight, 1);
      this.drawVerticalLine(bitmap, x + padding + barWidth, barY, barHeight, 1);

      // Fill based on progress
      const fillWidth = Math.floor((barWidth - 4) * (info.progress / 100));
      for (let row = barY + 2; row < barY + barHeight - 2; row++) {
        for (
          let col = x + padding + 2;
          col < x + padding + 2 + fillWidth;
          col++
        ) {
          this.setPixel(bitmap, col, row, true);
        }
      }

      // Progress percentage text
      this.renderSimpleText(
        bitmap,
        x + padding,
        progY + 50,
        `${Math.round(info.progress)}%`,
      );
    }

    // Section 4: Distance remaining (if available)
    if (info.distanceRemaining !== undefined) {
      const distY = sectionHeight * 3 + padding + 20;
      this.renderSimpleText(bitmap, x + padding, distY, "REMAINING");

      // Format distance (meters or km)
      let distText: string;
      if (info.distanceRemaining >= 1000) {
        distText = `${(info.distanceRemaining / 1000).toFixed(1)} km`;
      } else {
        distText = `${Math.round(info.distanceRemaining)} m`;
      }
      this.renderSimpleText(bitmap, x + padding, distY + 20, distText);
    }
  }

  /**
   * Render simple text using a basic 5x7 pixel font
   * This is a minimal implementation for e-paper display
   */
  private renderSimpleText(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    text: string,
  ): void {
    // Basic 5x7 pixel font for uppercase letters, numbers, and some symbols
    const charWidth = 6; // 5 pixels + 1 space

    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i).toUpperCase();
      const charX = x + i * charWidth;
      this.drawChar(bitmap, charX, y, char);
    }
  }

  /**
   * Render a large number for the info panel
   */
  private renderLargeNumber(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    value: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _maxWidth: number,
  ): void {
    // Draw larger digits (scale up the basic font)
    const text = value.toString();
    const charWidth = 18; // Larger spacing for big numbers

    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      const charX = x + i * charWidth;
      this.drawLargeChar(bitmap, charX, y, char);
    }
  }

  /**
   * Draw a single character using a 5x7 pixel font
   */
  private drawChar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    char: string,
  ): void {
    const font: Record<string, number[]> = {
      "0": [0x7c, 0x82, 0x82, 0x82, 0x7c, 0x00, 0x00],
      "1": [0x00, 0x84, 0xfe, 0x80, 0x00, 0x00, 0x00],
      "2": [0xc4, 0xa2, 0x92, 0x92, 0x8c, 0x00, 0x00],
      "3": [0x44, 0x82, 0x92, 0x92, 0x6c, 0x00, 0x00],
      "4": [0x30, 0x28, 0x24, 0xfe, 0x20, 0x00, 0x00],
      "5": [0x4e, 0x8a, 0x8a, 0x8a, 0x72, 0x00, 0x00],
      "6": [0x78, 0x94, 0x92, 0x92, 0x60, 0x00, 0x00],
      "7": [0x02, 0xe2, 0x12, 0x0a, 0x06, 0x00, 0x00],
      "8": [0x6c, 0x92, 0x92, 0x92, 0x6c, 0x00, 0x00],
      "9": [0x0c, 0x92, 0x92, 0x52, 0x3c, 0x00, 0x00],
      A: [0xfc, 0x12, 0x12, 0x12, 0xfc, 0x00, 0x00],
      B: [0xfe, 0x92, 0x92, 0x92, 0x6c, 0x00, 0x00],
      C: [0x7c, 0x82, 0x82, 0x82, 0x44, 0x00, 0x00],
      D: [0xfe, 0x82, 0x82, 0x82, 0x7c, 0x00, 0x00],
      E: [0xfe, 0x92, 0x92, 0x92, 0x82, 0x00, 0x00],
      F: [0xfe, 0x12, 0x12, 0x12, 0x02, 0x00, 0x00],
      G: [0x7c, 0x82, 0x92, 0x92, 0x74, 0x00, 0x00],
      H: [0xfe, 0x10, 0x10, 0x10, 0xfe, 0x00, 0x00],
      I: [0x00, 0x82, 0xfe, 0x82, 0x00, 0x00, 0x00],
      J: [0x40, 0x80, 0x80, 0x80, 0x7e, 0x00, 0x00],
      K: [0xfe, 0x10, 0x28, 0x44, 0x82, 0x00, 0x00],
      L: [0xfe, 0x80, 0x80, 0x80, 0x80, 0x00, 0x00],
      M: [0xfe, 0x04, 0x08, 0x04, 0xfe, 0x00, 0x00],
      N: [0xfe, 0x04, 0x08, 0x10, 0xfe, 0x00, 0x00],
      O: [0x7c, 0x82, 0x82, 0x82, 0x7c, 0x00, 0x00],
      P: [0xfe, 0x12, 0x12, 0x12, 0x0c, 0x00, 0x00],
      Q: [0x7c, 0x82, 0xa2, 0x42, 0xbc, 0x00, 0x00],
      R: [0xfe, 0x12, 0x32, 0x52, 0x8c, 0x00, 0x00],
      S: [0x4c, 0x92, 0x92, 0x92, 0x64, 0x00, 0x00],
      T: [0x02, 0x02, 0xfe, 0x02, 0x02, 0x00, 0x00],
      U: [0x7e, 0x80, 0x80, 0x80, 0x7e, 0x00, 0x00],
      V: [0x3e, 0x40, 0x80, 0x40, 0x3e, 0x00, 0x00],
      W: [0xfe, 0x40, 0x20, 0x40, 0xfe, 0x00, 0x00],
      X: [0xc6, 0x28, 0x10, 0x28, 0xc6, 0x00, 0x00],
      Y: [0x06, 0x08, 0xf0, 0x08, 0x06, 0x00, 0x00],
      Z: [0xc2, 0xa2, 0x92, 0x8a, 0x86, 0x00, 0x00],
      " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      ".": [0x00, 0x00, 0xc0, 0xc0, 0x00, 0x00, 0x00],
      "/": [0xc0, 0x20, 0x10, 0x08, 0x06, 0x00, 0x00],
      "%": [0x86, 0x46, 0x20, 0x10, 0xc4, 0xc2, 0x00],
    };

    const charData = font[char];
    if (!charData) return;

    for (let row = 0; row < 7; row++) {
      const rowData = charData[row] || 0;
      for (let col = 0; col < 8; col++) {
        if (rowData & (0x80 >> col)) {
          this.setPixel(bitmap, x + col, y + row, true);
        }
      }
    }
  }

  /**
   * Draw a large character (3x scale)
   */
  private drawLargeChar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    char: string,
  ): void {
    const font: Record<string, number[]> = {
      "0": [0x7c, 0x82, 0x82, 0x82, 0x7c, 0x00, 0x00],
      "1": [0x00, 0x84, 0xfe, 0x80, 0x00, 0x00, 0x00],
      "2": [0xc4, 0xa2, 0x92, 0x92, 0x8c, 0x00, 0x00],
      "3": [0x44, 0x82, 0x92, 0x92, 0x6c, 0x00, 0x00],
      "4": [0x30, 0x28, 0x24, 0xfe, 0x20, 0x00, 0x00],
      "5": [0x4e, 0x8a, 0x8a, 0x8a, 0x72, 0x00, 0x00],
      "6": [0x78, 0x94, 0x92, 0x92, 0x60, 0x00, 0x00],
      "7": [0x02, 0xe2, 0x12, 0x0a, 0x06, 0x00, 0x00],
      "8": [0x6c, 0x92, 0x92, 0x92, 0x6c, 0x00, 0x00],
      "9": [0x0c, 0x92, 0x92, 0x52, 0x3c, 0x00, 0x00],
    };

    const charData = font[char];
    if (!charData) return;

    const scale = 3;

    for (let row = 0; row < 7; row++) {
      const rowData = charData[row] || 0;
      for (let col = 0; col < 8; col++) {
        if (rowData & (0x80 >> col)) {
          // Draw scaled pixel (3x3 block)
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              this.setPixel(
                bitmap,
                x + col * scale + sx,
                y + row * scale + sy,
                true,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Draw a vertical line
   */
  private drawVerticalLine(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    height: number,
    width: number = 1,
  ): void {
    for (let row = y; row < y + height; row++) {
      for (let w = 0; w < width; w++) {
        this.setPixel(bitmap, x + w, row, true);
      }
    }
  }

  /**
   * Draw a horizontal line
   */
  private drawHorizontalLine(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    thickness: number = 1,
  ): void {
    for (let col = x; col < x + width; col++) {
      for (let t = 0; t < thickness; t++) {
        this.setPixel(bitmap, col, y + t, true);
      }
    }
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
