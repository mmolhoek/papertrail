import {
  ISVGService,
  FollowTrackInfo,
  DriveNavigationInfo,
} from "@core/interfaces";
import {
  Result,
  GPXTrack,
  GPSCoordinate,
  ViewportConfig,
  Bitmap1Bit,
  RenderOptions,
  Point2D,
  ManeuverType,
  DriveRoute,
  DriveWaypoint,
  success,
  failure,
} from "@core/types";
import { DisplayError } from "@core/errors";
import { getLogger } from "@utils/logger";
import {
  renderTextOnBitmap,
  renderLabeledValueOnBitmap,
  calculateTextHeight,
} from "@utils/unifiedTextRenderer";
import {
  renderBitmapText,
  calculateBitmapTextHeight,
  calculateBitmapTextWidth,
} from "@utils/bitmapFont";

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
      logger.info(`Rendering track with ${totalPoints} points`);
      logger.info(
        `Render options: showLine=${renderOpts.showLine}, lineWidth=${renderOpts.lineWidth}, showPoints=${renderOpts.showPoints}`,
      );

      // Log first track point for debugging
      const firstTrackPoint = track.segments[0].points[0];
      logger.info(
        `First track point: ${firstTrackPoint.latitude.toFixed(6)}, ${firstTrackPoint.longitude.toFixed(6)}`,
      );

      // Project all track points to pixel coordinates
      let projectedPoints = track.segments[0].points.map((point) =>
        this.projectToPixels(point.latitude, point.longitude, viewport),
      );

      // Apply rotation if rotateWithBearing is enabled and bearing is available
      const bearing = viewport.centerPoint.bearing;
      if (renderOpts.rotateWithBearing && bearing !== undefined) {
        logger.info(`Rotating map by ${bearing.toFixed(1)}° for track-up view`);
        const centerX = viewport.width / 2;
        const centerY = viewport.height / 2;
        projectedPoints = projectedPoints.map((p) =>
          this.rotatePoint(p, centerX, centerY, -bearing),
        );
      }

      // Debug: Log first few projected points to see where they end up
      logger.info(
        `Track projection: centerPoint=${viewport.centerPoint.latitude.toFixed(6)},${viewport.centerPoint.longitude.toFixed(6)}, zoom=${viewport.zoomLevel}`,
      );
      const firstFew = projectedPoints.slice(0, 5);
      logger.info(
        `First ${firstFew.length} projected points: ${firstFew.map((p) => `(${p.x},${p.y})`).join(", ")}`,
      );

      // Count how many points are within viewport bounds
      const inViewport = projectedPoints.filter(
        (p) =>
          p.x >= 0 && p.x < viewport.width && p.y >= 0 && p.y < viewport.height,
      );
      logger.info(
        `Points in viewport: ${inViewport.length}/${projectedPoints.length}`,
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
   * Uses SVG-based text rendering for the "N" label
   */
  async addCompass(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    radius: number,
    heading: number,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(
      `Adding compass at (${x}, ${y}), radius=${radius}, heading=${heading}°`,
    );

    const center = { x, y };

    // Draw outer circle
    this.drawCircle(bitmap, center, radius);
    this.drawCircle(bitmap, center, radius - 1);

    // Draw inner circle (smaller)
    this.drawCircle(bitmap, center, Math.floor(radius * 0.3));

    // Calculate north direction (adjusted by heading)
    // When heading is 0, north is up. As heading increases, north rotates clockwise
    // So we need to rotate the north indicator counter-clockwise by heading
    const northAngle = -heading; // degrees

    // Draw north arrow/triangle
    this.drawCompassArrow(bitmap, center, radius, northAngle, true);

    // Draw south indicator (opposite direction, smaller)
    this.drawCompassArrow(bitmap, center, radius, northAngle + 180, false);

    // Draw "N" label near the north arrow using bitmap font (no Sharp)
    const labelScale = 2; // ~14px height
    const labelDistance = radius + 16;
    const northRadians = ((northAngle - 90) * Math.PI) / 180;
    const labelX = Math.round(x + labelDistance * Math.cos(northRadians));
    const labelY = Math.round(y + labelDistance * Math.sin(northRadians));

    // Center the "N" label
    const nWidth = calculateBitmapTextWidth("N", labelScale);
    const nHeight = calculateBitmapTextHeight(labelScale);
    renderBitmapText(
      bitmap,
      "N",
      labelX - Math.floor(nWidth / 2),
      labelY - Math.floor(nHeight / 2),
      { scale: labelScale, bold: true },
    );

    return success(bitmap);
  }

  /**
   * Draw a compass arrow pointing in a direction
   */
  private drawCompassArrow(
    bitmap: Bitmap1Bit,
    center: { x: number; y: number },
    radius: number,
    angleDegrees: number,
    isNorth: boolean,
  ): void {
    const angleRadians = ((angleDegrees - 90) * Math.PI) / 180; // -90 to make 0 degrees point up

    // Arrow tip at the edge of the compass
    const tipDistance = radius - 3;
    const tipX = Math.round(center.x + tipDistance * Math.cos(angleRadians));
    const tipY = Math.round(center.y + tipDistance * Math.sin(angleRadians));

    // Arrow base (closer to center)
    const baseDistance = isNorth ? radius * 0.35 : radius * 0.5;
    const baseX = Math.round(center.x + baseDistance * Math.cos(angleRadians));
    const baseY = Math.round(center.y + baseDistance * Math.sin(angleRadians));

    // Draw the main arrow line
    this.drawLine(bitmap, { x: baseX, y: baseY }, { x: tipX, y: tipY }, 2);

    if (isNorth) {
      // Draw arrowhead for north
      const headSize = Math.max(4, Math.floor(radius * 0.25));
      const perpAngle = angleRadians + Math.PI / 2;

      const leftX = Math.round(
        tipX -
          headSize * Math.cos(angleRadians) +
          (headSize / 2) * Math.cos(perpAngle),
      );
      const leftY = Math.round(
        tipY -
          headSize * Math.sin(angleRadians) +
          (headSize / 2) * Math.sin(perpAngle),
      );

      const rightX = Math.round(
        tipX -
          headSize * Math.cos(angleRadians) -
          (headSize / 2) * Math.cos(perpAngle),
      );
      const rightY = Math.round(
        tipY -
          headSize * Math.sin(angleRadians) -
          (headSize / 2) * Math.sin(perpAngle),
      );

      this.drawLine(bitmap, { x: tipX, y: tipY }, { x: leftX, y: leftY }, 2);
      this.drawLine(bitmap, { x: tipX, y: tipY }, { x: rightX, y: rightY }, 2);
      this.drawLine(
        bitmap,
        { x: leftX, y: leftY },
        { x: rightX, y: rightY },
        1,
      );

      // Fill the arrowhead
      this.fillTriangle(
        bitmap,
        { x: tipX, y: tipY },
        { x: leftX, y: leftY },
        { x: rightX, y: rightY },
      );
    }
  }

  /**
   * Fill a triangle defined by three points
   */
  private fillTriangle(
    bitmap: Bitmap1Bit,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
  ): void {
    // Round coordinates to integers for proper scan-line fill
    const rp1 = { x: Math.round(p1.x), y: Math.round(p1.y) };
    const rp2 = { x: Math.round(p2.x), y: Math.round(p2.y) };
    const rp3 = { x: Math.round(p3.x), y: Math.round(p3.y) };

    // Sort points by y coordinate
    const points = [rp1, rp2, rp3].sort((a, b) => a.y - b.y);
    const [top, mid, bottom] = points;

    // Scan line fill
    for (let y = top.y; y <= bottom.y; y++) {
      let xStart: number, xEnd: number;

      if (y < mid.y) {
        // Upper part of triangle
        xStart = this.interpolateX(top, mid, y);
        xEnd = this.interpolateX(top, bottom, y);
      } else {
        // Lower part of triangle
        xStart = this.interpolateX(mid, bottom, y);
        xEnd = this.interpolateX(top, bottom, y);
      }

      if (xStart > xEnd) {
        [xStart, xEnd] = [xEnd, xStart];
      }

      for (let x = Math.floor(xStart); x <= Math.ceil(xEnd); x++) {
        this.setPixel(bitmap, x, y, true);
      }
    }
  }

  /**
   * Interpolate x coordinate for a given y on a line segment
   */
  private interpolateX(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    y: number,
  ): number {
    if (p2.y === p1.y) return p1.x;
    return p1.x + ((y - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y);
  }

  /**
   * Add a scale bar to the bitmap
   * Uses SVG-based text rendering for the distance label
   */
  async addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    maxWidth: number,
    metersPerPixel: number,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(
      `Adding scale bar at (${x}, ${y}), maxWidth=${maxWidth}, metersPerPixel=${metersPerPixel}`,
    );

    // Calculate max distance the bar could represent
    const maxDistance = maxWidth * metersPerPixel;

    // Find a nice round distance that fits within maxWidth
    const niceDistance = this.getNiceScaleDistance(maxDistance);

    // Calculate actual bar width for this nice distance
    const barWidth = Math.round(niceDistance / metersPerPixel);

    // Format the distance label
    const label = this.formatDistance(niceDistance);

    // Bar dimensions
    const barHeight = 8;
    const capHeight = 20;

    // Draw the main horizontal bar
    this.drawHorizontalLine(bitmap, x, y, barWidth, barHeight);

    // Draw left end cap (vertical line)
    this.drawVerticalLine(
      bitmap,
      x,
      y - Math.floor((capHeight - barHeight) / 2),
      capHeight,
      4,
    );

    // Draw right end cap (vertical line)
    this.drawVerticalLine(
      bitmap,
      x + barWidth - 4,
      y - Math.floor((capHeight - barHeight) / 2),
      capHeight,
      4,
    );

    // Draw the distance label centered above the bar using bitmap font (no Sharp)
    const labelScale = 4; // ~28px height
    const labelHeight = calculateBitmapTextHeight(labelScale);
    const labelY = y - labelHeight - 12; // Position above bar with gap
    const labelWidth = calculateBitmapTextWidth(label, labelScale);
    const labelX = x + Math.floor(barWidth / 2) - Math.floor(labelWidth / 2);

    renderBitmapText(bitmap, label, labelX, labelY, {
      scale: labelScale,
      bold: true,
    });

    return success(bitmap);
  }

  /**
   * Get a nice round distance for scale bar
   */
  private getNiceScaleDistance(maxDistance: number): number {
    // Nice distances in meters
    const niceDistances = [
      10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
    ];

    // Find the largest nice distance that fits
    for (let i = niceDistances.length - 1; i >= 0; i--) {
      if (niceDistances[i] <= maxDistance) {
        return niceDistances[i];
      }
    }

    return niceDistances[0];
  }

  /**
   * Format distance for display (m or km)
   */
  private formatDistance(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      return km % 1 === 0 ? `${km} KM` : `${km.toFixed(1)} KM`;
    }
    return `${meters} M`;
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
   * Render the "Follow Track" screen with 70/30 split layout
   * Left area (70%): Track map centered on current position
   * Right area (30%): Speed and satellite information
   */
  async renderFollowTrackScreen(
    track: GPXTrack,
    currentPosition: GPSCoordinate,
    viewport: ViewportConfig,
    info: FollowTrackInfo,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug("Rendering Follow Track screen with 70/30 split layout");

    try {
      const { width, height } = viewport;

      // Calculate split dimensions (70/30)
      const mapWidth = Math.floor(width * 0.7);
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
        let projectedPoints = track.segments[0].points.map((point) =>
          this.projectToPixels(point.latitude, point.longitude, mapViewport),
        );

        // Apply rotation if rotateWithBearing is enabled and bearing is available
        const bearing = info.bearing;
        if (renderOpts.rotateWithBearing && bearing !== undefined) {
          logger.info(
            `Rotating map by ${bearing.toFixed(1)}° for track-up view`,
          );
          const centerX = mapWidth / 2;
          const centerY = height / 2;
          projectedPoints = projectedPoints.map((p) =>
            this.rotatePoint(p, centerX, centerY, -bearing),
          );
        }

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

      // Draw compass in top-left corner of map area
      const compassRadius = 50;
      // Padding accounts for "N" label at radius + 16 from center
      const compassPadding = 85;
      const compassX = compassPadding;
      const compassY = compassPadding;
      const heading = info.bearing ?? 0;
      await this.addCompass(bitmap, compassX, compassY, compassRadius, heading);

      // Draw scale bar in bottom-right of map area
      const scale = Math.pow(2, viewport.zoomLevel);
      const metersPerPixel =
        (156543.03392 * Math.cos((currentPosition.latitude * Math.PI) / 180)) /
        scale;
      const scaleBarMaxWidth = 200;
      const scaleBarPadding = 30;
      const scaleBarX = mapWidth - scaleBarMaxWidth - scaleBarPadding;
      const scaleBarY = height - scaleBarPadding;
      await this.addScaleBar(
        bitmap,
        scaleBarX,
        scaleBarY,
        scaleBarMaxWidth,
        metersPerPixel,
      );

      // Draw vertical divider line
      this.drawVerticalLine(bitmap, mapWidth, 0, height, 2);

      // Render info panel (right 20%) - uses bitmap font, no Sharp
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
   * Uses bitmap font rendering (no Sharp) for stability
   */
  private renderInfoPanel(
    bitmap: Bitmap1Bit,
    x: number,
    info: FollowTrackInfo,
    _width: number,
    _height: number,
  ): void {
    logger.debug(`Rendering info panel at x=${x} using bitmap font (no Sharp)`);

    // Panel layout constants - using bitmap font scales
    const padding = 10;
    const labelScale = 4; // ~28px
    const valueScale = 5; // ~35px
    const lineSpacing = 4;
    const sectionSpacing = 16;

    let currentY = padding;

    // Section 1: Speed label
    renderBitmapText(bitmap, "SPEED", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

    // Speed value with unit inline (e.g., "42 KM/H")
    const speedText = `${Math.round(info.speed)} KM/H`;
    renderBitmapText(bitmap, speedText, x + padding, currentY, {
      scale: valueScale,
      bold: true,
    });
    currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;

    // Section 2: Satellites label
    renderBitmapText(bitmap, "SATS", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

    // Satellites value
    renderBitmapText(
      bitmap,
      info.satellites.toString(),
      x + padding,
      currentY,
      {
        scale: valueScale,
        bold: true,
      },
    );
    currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;

    // Section 3: Progress percentage
    if (info.progress !== undefined) {
      renderBitmapText(bitmap, "DONE", x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

      const progressText = `${Math.round(info.progress)}%`;
      renderBitmapText(bitmap, progressText, x + padding, currentY, {
        scale: valueScale,
        bold: true,
      });
      currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;
    }

    // Section 4: Time remaining
    if (info.estimatedTimeRemaining !== undefined) {
      renderBitmapText(bitmap, "ETA", x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

      const timeStr = this.formatTimeRemaining(info.estimatedTimeRemaining);
      renderBitmapText(bitmap, timeStr, x + padding, currentY, {
        scale: valueScale,
        bold: true,
      });
    }
  }

  /**
   * Format time remaining in seconds to a readable string (e.g., "1H 23M" or "45M")
   */
  private formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return "<1M";
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}H ${minutes}M`;
    }
    return `${minutes}M`;
  }

  // Note: Old bitmap font methods (renderSimpleText, drawChar, drawScaledChar, etc.)
  // have been removed in favor of SVG-based text rendering via svgTextRenderer utility

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
    // Round coordinates to integers - Bresenham requires integer math
    // Without this, floating point coordinates can cause infinite loops
    const x1 = Math.round(p1.x);
    const y1 = Math.round(p1.y);
    const x2 = Math.round(p2.x);
    const y2 = Math.round(p2.y);

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Draw pixel with width
      if (width === 1) {
        this.setPixel(bitmap, x, y);
      } else {
        this.drawFilledCircle(bitmap, { x, y }, Math.floor(width / 2));
      }

      if (x === x2 && y === y2) break;

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
   * Draw a circle outline using Midpoint circle algorithm
   */
  private drawCircle(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number,
  ): void {
    // Round inputs to integers for proper pixel-based rendering
    const cx = Math.round(center.x);
    const cy = Math.round(center.y);
    const r = Math.round(radius);

    let x = 0;
    let y = r;
    let d = 3 - 2 * r;

    while (y >= x) {
      this.setPixel(bitmap, cx + x, cy + y);
      this.setPixel(bitmap, cx - x, cy + y);
      this.setPixel(bitmap, cx + x, cy - y);
      this.setPixel(bitmap, cx - x, cy - y);
      this.setPixel(bitmap, cx + y, cy + x);
      this.setPixel(bitmap, cx - y, cy + x);
      this.setPixel(bitmap, cx + y, cy - x);
      this.setPixel(bitmap, cx - y, cy - x);

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
    // Round inputs to integers for proper pixel-based rendering
    const cx = Math.round(center.x);
    const cy = Math.round(center.y);
    const r = Math.round(radius);

    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          this.setPixel(bitmap, cx + x, cy + y);
        }
      }
    }
  }

  /**
   * Rotate a point around a center by given angle in degrees
   */
  private rotatePoint(
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

  // ============================================
  // Drive Navigation Rendering Methods
  // ============================================

  /**
   * Render full-screen turn display for drive navigation
   * Uses SVG-based text rendering for better font quality
   * If nextTurn is provided, renders two turns side-by-side with "THEN" between
   */
  async renderTurnScreen(
    maneuverType: ManeuverType,
    distance: number,
    instruction: string,
    streetName: string | undefined,
    viewport: ViewportConfig,
    nextTurn?: {
      maneuverType: ManeuverType;
      distance: number;
      instruction: string;
      streetName?: string;
    },
    progress?: number,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(
      `Rendering turn screen: ${maneuverType}, ${distance}m${nextTurn ? `, then ${nextTurn.maneuverType}` : ""}`,
    );

    try {
      const { width, height } = viewport;
      const bitmap = this.createBlankBitmap(width, height, false);

      if (nextTurn) {
        // Two-turn layout: current turn | THEN | next turn
        this.renderDualTurnScreen(
          bitmap,
          width,
          height,
          { maneuverType, distance, instruction, streetName },
          nextTurn,
          progress,
        );
      } else {
        // Single turn layout (original behavior)
        this.renderSingleTurnScreen(
          bitmap,
          width,
          height,
          maneuverType,
          distance,
          instruction,
          streetName,
        );
      }

      logger.info("Turn screen rendered successfully");
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render turn screen:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  /**
   * Render single turn screen (original layout)
   */
  private renderSingleTurnScreen(
    bitmap: Bitmap1Bit,
    width: number,
    height: number,
    maneuverType: ManeuverType,
    distance: number,
    instruction: string,
    streetName: string | undefined,
  ): void {
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 3); // Upper third for arrow

    // Draw the large turn arrow
    this.drawManeuverArrow(bitmap, centerX, centerY, maneuverType, 120);

    // Draw distance text (large) using bitmap font
    const distanceText = this.formatDistanceForDisplay(distance);
    const distanceY = Math.floor(height / 2) + 20;
    const distanceScale = 7; // Large text (~49px)
    const distanceWidth = calculateBitmapTextWidth(distanceText, distanceScale);
    renderBitmapText(
      bitmap,
      distanceText,
      centerX - distanceWidth / 2,
      distanceY,
      {
        scale: distanceScale,
        bold: true,
      },
    );

    // Draw instruction text using bitmap font
    const instructionY = Math.floor(height * 0.7);
    const instructionScale = 3; // ~28px (doubled from 2)
    const instructionText = instruction.toUpperCase();
    const instructionWidth = calculateBitmapTextWidth(
      instructionText,
      instructionScale,
    );
    renderBitmapText(
      bitmap,
      instructionText,
      centerX - instructionWidth / 2,
      instructionY,
      {
        scale: instructionScale,
        bold: true,
      },
    );

    // Draw street name if provided
    if (streetName) {
      const streetY = Math.floor(height * 0.8);
      const streetScale = 4; // ~28px (doubled from 2)
      const streetText = streetName.toUpperCase();
      const streetWidth = calculateBitmapTextWidth(streetText, streetScale);
      renderBitmapText(bitmap, streetText, centerX - streetWidth / 2, streetY, {
        scale: streetScale,
        bold: true,
      });
    }
  }

  /**
   * Render dual turn screen with current turn on left half, next turn on right half
   * Each half shows: arrow, distance, instruction, street name
   * "THEN" text displayed between the two halves
   * Progress bar at the bottom if progress is provided
   */
  private renderDualTurnScreen(
    bitmap: Bitmap1Bit,
    width: number,
    height: number,
    currentTurn: {
      maneuverType: ManeuverType;
      distance: number;
      instruction: string;
      streetName?: string;
    },
    nextTurn: {
      maneuverType: ManeuverType;
      distance: number;
      instruction: string;
      streetName?: string;
    },
    progress?: number,
  ): void {
    // 50/50 split layout - each turn gets half the screen
    const leftCenterX = Math.floor(width * 0.25); // Center of left half
    const rightCenterX = Math.floor(width * 0.75); // Center of right half
    const centerX = Math.floor(width / 2);

    // Arrow position - upper portion of screen
    const arrowY = Math.floor(height * 0.18);
    const arrowSize = 80;

    // Draw current turn arrow (left half)
    this.drawManeuverArrow(
      bitmap,
      leftCenterX,
      arrowY,
      currentTurn.maneuverType,
      arrowSize,
    );

    // Draw next turn arrow (right half)
    this.drawManeuverArrow(
      bitmap,
      rightCenterX,
      arrowY,
      nextTurn.maneuverType,
      arrowSize,
    );

    // Draw "THEN" text in the center between the two turns
    const thenY = Math.floor(height * 0.16);
    const thenScale = 3;
    const thenText = "THEN";
    const thenWidth = calculateBitmapTextWidth(thenText, thenScale);
    renderBitmapText(bitmap, thenText, centerX - thenWidth / 2, thenY, {
      scale: thenScale,
      bold: true,
    });

    // Draw distance for current turn (left half)
    const distanceY = Math.floor(height * 0.4);
    const distanceScale = 6;
    const distanceText = this.formatDistanceForDisplay(currentTurn.distance);
    const distanceWidth = calculateBitmapTextWidth(distanceText, distanceScale);
    renderBitmapText(
      bitmap,
      distanceText,
      leftCenterX - distanceWidth / 2,
      distanceY,
      { scale: distanceScale, bold: true },
    );

    // Draw distance for next turn (right half)
    const nextDistanceText = this.formatDistanceForDisplay(nextTurn.distance);
    const nextDistanceWidth = calculateBitmapTextWidth(
      nextDistanceText,
      distanceScale,
    );
    renderBitmapText(
      bitmap,
      nextDistanceText,
      rightCenterX - nextDistanceWidth / 2,
      distanceY,
      { scale: distanceScale, bold: true },
    );

    // Draw instruction for current turn (left half)
    const instructionY = Math.floor(height * 0.55);
    const instructionScale = 2;
    const currentInstructionText = currentTurn.instruction.toUpperCase();
    const currentInstructionWidth = calculateBitmapTextWidth(
      currentInstructionText,
      instructionScale,
    );
    renderBitmapText(
      bitmap,
      currentInstructionText,
      leftCenterX - currentInstructionWidth / 2,
      instructionY,
      { scale: instructionScale, bold: true },
    );

    // Draw instruction for next turn (right half)
    const nextInstructionText = nextTurn.instruction.toUpperCase();
    const nextInstructionWidth = calculateBitmapTextWidth(
      nextInstructionText,
      instructionScale,
    );
    renderBitmapText(
      bitmap,
      nextInstructionText,
      rightCenterX - nextInstructionWidth / 2,
      instructionY,
      { scale: instructionScale, bold: true },
    );

    // Draw street name for current turn (left half)
    const streetY = Math.floor(height * 0.67);
    const streetScale = 2;
    if (currentTurn.streetName) {
      const streetText = currentTurn.streetName.toUpperCase();
      const streetWidth = calculateBitmapTextWidth(streetText, streetScale);
      renderBitmapText(
        bitmap,
        streetText,
        leftCenterX - streetWidth / 2,
        streetY,
        { scale: streetScale, bold: true },
      );
    }

    // Draw street name for next turn (right half)
    if (nextTurn.streetName) {
      const nextStreetText = nextTurn.streetName.toUpperCase();
      const nextStreetWidth = calculateBitmapTextWidth(
        nextStreetText,
        streetScale,
      );
      renderBitmapText(
        bitmap,
        nextStreetText,
        rightCenterX - nextStreetWidth / 2,
        streetY,
        { scale: streetScale, bold: true },
      );
    }

    // Draw progress bar at the bottom if progress is provided
    if (progress !== undefined) {
      const progressBarY = Math.floor(height * 0.88);
      const progressBarHeight = 8;
      const progressBarMargin = 40;
      const progressBarWidth = width - progressBarMargin * 2;

      // Draw progress bar outline
      this.drawHorizontalLine(
        bitmap,
        progressBarMargin,
        progressBarY,
        progressBarWidth,
      );
      this.drawHorizontalLine(
        bitmap,
        progressBarMargin,
        progressBarY + progressBarHeight,
        progressBarWidth,
      );
      this.drawVerticalLine(
        bitmap,
        progressBarMargin,
        progressBarY,
        progressBarHeight,
      );
      this.drawVerticalLine(
        bitmap,
        progressBarMargin + progressBarWidth,
        progressBarY,
        progressBarHeight,
      );

      // Draw progress bar fill
      const fillWidth = Math.floor((progressBarWidth - 2) * (progress / 100));
      if (fillWidth > 0) {
        for (
          let y = progressBarY + 1;
          y < progressBarY + progressBarHeight;
          y++
        ) {
          this.drawHorizontalLine(bitmap, progressBarMargin + 1, y, fillWidth);
        }
      }

      // Draw percentage text to the right of the bar
      const percentText = `${Math.round(progress)}%`;
      const percentScale = 2;
      const percentX = progressBarMargin + progressBarWidth + 10;
      const percentY = progressBarY - 2;
      renderBitmapText(bitmap, percentText, percentX, percentY, {
        scale: percentScale,
        bold: true,
      });
    }
  }

  /**
   * Render drive navigation map screen with turn overlay
   */
  async renderDriveMapScreen(
    route: DriveRoute,
    currentPosition: GPSCoordinate,
    nextWaypoint: DriveWaypoint,
    viewport: ViewportConfig,
    info: DriveNavigationInfo,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>> {
    const methodStart = Date.now();
    logger.info("renderDriveMapScreen: starting...");

    try {
      const { width, height } = viewport;
      const renderOpts = { ...this.getDefaultRenderOptions(), ...options };

      // Calculate split dimensions (70/30 for drive mode)
      const mapWidth = Math.floor(width * 0.7);
      const infoWidth = width - mapWidth;

      // Create main bitmap
      const bitmap = this.createBlankBitmap(width, height, false);
      logger.info(
        `renderDriveMapScreen: bitmap created (${Date.now() - methodStart}ms)`,
      );

      // Render the route on the map section
      const mapViewport: ViewportConfig = {
        ...viewport,
        width: mapWidth,
        centerPoint: currentPosition,
      };

      // Draw route line using geometry
      if (route.geometry && route.geometry.length > 1) {
        let projectedRoute = route.geometry.map(([lat, lon]) =>
          this.projectToPixels(lat, lon, mapViewport),
        );
        logger.info(
          `renderDriveMapScreen: projected ${projectedRoute.length} points (${Date.now() - methodStart}ms)`,
        );

        // Apply rotation if rotateWithBearing is enabled (track-up mode)
        const bearing = currentPosition.bearing;
        logger.info(
          `renderDriveMapScreen: rotateWithBearing=${renderOpts.rotateWithBearing}, bearing=${bearing !== undefined ? bearing.toFixed(1) : "undefined"}`,
        );
        if (renderOpts.rotateWithBearing && bearing !== undefined) {
          logger.info(
            `renderDriveMapScreen: rotating map by ${bearing.toFixed(1)}° for track-up view`,
          );
          const centerX = mapWidth / 2;
          const centerY = height / 2;
          projectedRoute = projectedRoute.map((p) =>
            this.rotatePoint(p, centerX, centerY, -bearing),
          );
        }

        if (renderOpts.showLine) {
          for (let i = 0; i < projectedRoute.length - 1; i++) {
            if (
              projectedRoute[i].x < mapWidth ||
              projectedRoute[i + 1].x < mapWidth
            ) {
              this.drawLine(
                bitmap,
                projectedRoute[i],
                projectedRoute[i + 1],
                renderOpts.lineWidth,
              );
            }
          }
          logger.info(
            `renderDriveMapScreen: drew route lines (${Date.now() - methodStart}ms)`,
          );
        }
      }

      // Highlight current position
      if (renderOpts.highlightCurrentPosition) {
        const centerPoint = {
          x: Math.floor(mapWidth / 2),
          y: Math.floor(height / 2),
        };
        const radius = renderOpts.currentPositionRadius || 8;
        this.drawCircle(bitmap, centerPoint, radius);
        this.drawFilledCircle(bitmap, centerPoint, radius - 2);
      }

      // Draw next waypoint marker
      let waypointPixel = this.projectToPixels(
        nextWaypoint.latitude,
        nextWaypoint.longitude,
        mapViewport,
      );
      // Apply same rotation as route if in track-up mode
      const bearing = currentPosition.bearing;
      if (renderOpts.rotateWithBearing && bearing !== undefined) {
        waypointPixel = this.rotatePoint(
          waypointPixel,
          mapWidth / 2,
          height / 2,
          -bearing,
        );
      }
      if (waypointPixel.x < mapWidth) {
        this.drawCircle(bitmap, waypointPixel, 6);
        this.drawCircle(bitmap, waypointPixel, 8);
      }

      // Draw compass in top-left corner of map area
      const compassRadius = 40; // Slightly smaller for drive mode
      const compassPadding = 60;
      const compassX = compassPadding;
      const compassY = compassPadding;
      const heading = currentPosition.bearing ?? 0;
      await this.addCompass(bitmap, compassX, compassY, compassRadius, heading);

      // Draw vertical divider line
      this.drawVerticalLine(bitmap, mapWidth, 0, height, 2);
      logger.info(
        `renderDriveMapScreen: drew map elements (${Date.now() - methodStart}ms)`,
      );

      // Render info panel (right 30%) - uses bitmap font, no Sharp
      logger.info(`renderDriveMapScreen: starting info panel render...`);
      this.renderDriveInfoPanel(
        bitmap,
        mapWidth + 10,
        info,
        infoWidth - 20,
        height,
      );
      logger.info(
        `renderDriveMapScreen: info panel done (${Date.now() - methodStart}ms)`,
      );

      logger.info(
        `Drive map screen rendered successfully in ${Date.now() - methodStart}ms`,
      );
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render drive map screen:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  /**
   * Render off-road arrow screen for drive navigation
   * Uses SVG-based text rendering for better font quality
   */
  async renderOffRoadScreen(
    bearing: number,
    distance: number,
    viewport: ViewportConfig,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(
      `Rendering off-road screen: bearing=${bearing}, distance=${distance}m`,
    );

    try {
      const { width, height } = viewport;
      const bitmap = this.createBlankBitmap(width, height, false);

      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 3);

      // Draw large directional arrow pointing to route
      this.drawDirectionalArrow(bitmap, centerX, centerY, bearing, 100);

      // Draw distance text using bitmap font
      const distanceText = this.formatDistanceForDisplay(distance);
      const distanceY = Math.floor(height / 2) + 40;
      const distanceScale = 7; // Large text (~49px)
      const distanceWidth = calculateBitmapTextWidth(
        distanceText,
        distanceScale,
      );
      renderBitmapText(
        bitmap,
        distanceText,
        centerX - distanceWidth / 2,
        distanceY,
        {
          scale: distanceScale,
          bold: true,
        },
      );

      // Draw "TO ROUTE" text using bitmap font
      const labelY = Math.floor(height / 2) + 100;
      const labelScale = 3; // ~21px
      const labelText = "TO ROUTE";
      const labelWidth = calculateBitmapTextWidth(labelText, labelScale);
      renderBitmapText(bitmap, labelText, centerX - labelWidth / 2, labelY, {
        scale: labelScale,
        bold: true,
      });

      // Draw instruction at bottom using bitmap font
      const instructionY = Math.floor(height * 0.8);
      const instruction =
        "HEAD " + this.bearingToDirection(bearing) + " TO REACH PAVED ROAD";
      const instructionScale = 2; // ~14px
      const instructionWidth = calculateBitmapTextWidth(
        instruction,
        instructionScale,
      );
      renderBitmapText(
        bitmap,
        instruction,
        centerX - instructionWidth / 2,
        instructionY,
        {
          scale: instructionScale,
        },
      );

      logger.info("Off-road screen rendered successfully");
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render off-road screen:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  /**
   * Render arrival screen for drive navigation
   * Uses SVG-based text rendering for better font quality
   */
  async renderArrivalScreen(
    destination: string,
    viewport: ViewportConfig,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(`Rendering arrival screen: ${destination}`);

    try {
      const { width, height } = viewport;
      const bitmap = this.createBlankBitmap(width, height, false);

      const centerX = Math.floor(width / 2);

      // Draw checkmark or destination marker
      const markerY = Math.floor(height / 8);
      this.drawCheckmark(bitmap, centerX, markerY, 80);

      // Draw "ARRIVED" text using bitmap font
      const arrivedY = height - 80;
      const arrivedScale = 7; // Large text (~49px)
      const arrivedText = "ARRIVED";
      const arrivedWidth = calculateBitmapTextWidth(arrivedText, arrivedScale);
      renderBitmapText(
        bitmap,
        arrivedText,
        centerX - arrivedWidth / 2,
        arrivedY,
        {
          scale: arrivedScale,
          bold: true,
        },
      );

      // Draw destination name using bitmap font - split into lines of 2 words each
      const words = destination.toUpperCase().split(/\s+/);
      const lines: string[] = [];
      for (let i = 0; i < words.length; i += 2) {
        const line = words.slice(i, i + 2).join(" ");
        lines.push(line);
      }

      const lineHeight = 36; // spacing between lines
      const destScale = 4; // ~28px
      const startY =
        Math.floor(height * 0.5) -
        Math.floor(((lines.length - 1) * lineHeight) / 2);
      for (let i = 0; i < lines.length; i++) {
        const lineWidth = calculateBitmapTextWidth(lines[i], destScale);
        renderBitmapText(
          bitmap,
          lines[i],
          centerX - lineWidth / 2,
          startY + i * lineHeight,
          {
            scale: destScale,
          },
        );
      }

      logger.info("Arrival screen rendered successfully");
      return success(bitmap);
    } catch (error) {
      logger.error("Failed to render arrival screen:", error);
      if (error instanceof Error) {
        return failure(DisplayError.renderFailed(error.message, error));
      }
      return failure(DisplayError.renderFailed("Unknown error"));
    }
  }

  // ============================================
  // Drive Navigation Helper Methods
  // ============================================

  /**
   * Draw a maneuver arrow for turn display
   */
  private drawManeuverArrow(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    maneuverType: ManeuverType,
    size: number,
  ): void {
    // Get arrow angle based on maneuver type
    const angle = this.getManeuverAngle(maneuverType);

    if (maneuverType === ManeuverType.UTURN) {
      this.drawUturnArrow(bitmap, x, y, size);
    } else if (maneuverType === ManeuverType.STRAIGHT) {
      this.drawStraightArrow(bitmap, x, y, size);
    } else if (maneuverType === ManeuverType.ARRIVE) {
      this.drawDestinationMarker(bitmap, x, y, size);
    } else if (maneuverType.startsWith("roundabout")) {
      this.drawRoundaboutArrow(bitmap, x, y, size, maneuverType);
    } else {
      // Turn arrows (left, right, slight, sharp)
      this.drawTurnArrow(bitmap, x, y, size, angle);
    }
  }

  /**
   * Get angle for maneuver type
   */
  private getManeuverAngle(maneuverType: ManeuverType): number {
    switch (maneuverType) {
      case ManeuverType.SHARP_LEFT:
        return -135;
      case ManeuverType.LEFT:
        return -90;
      case ManeuverType.SLIGHT_LEFT:
        return -45;
      case ManeuverType.STRAIGHT:
        return 0;
      case ManeuverType.SLIGHT_RIGHT:
        return 45;
      case ManeuverType.RIGHT:
        return 90;
      case ManeuverType.SHARP_RIGHT:
        return 135;
      case ManeuverType.UTURN:
        return 180;
      case ManeuverType.FORK_LEFT:
        return -30;
      case ManeuverType.FORK_RIGHT:
        return 30;
      case ManeuverType.RAMP_LEFT:
        return -45;
      case ManeuverType.RAMP_RIGHT:
        return 45;
      default:
        return 0;
    }
  }

  /**
   * Draw a turn arrow at specified angle
   */
  private drawTurnArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
    angleDegrees: number,
  ): void {
    const arrowLength = size * 0.8;
    const headSize = size * 0.3;
    const lineWidth = Math.max(4, Math.floor(size / 20));

    // Arrow shaft
    const angleRad = ((angleDegrees - 90) * Math.PI) / 180; // -90 to make 0 degrees point up
    const endX = Math.round(centerX + arrowLength * Math.cos(angleRad));
    const endY = Math.round(centerY + arrowLength * Math.sin(angleRad));

    // Draw curved path from bottom to turn direction
    const startY = centerY + size * 0.4;

    // Draw shaft
    this.drawLine(
      bitmap,
      { x: centerX, y: startY },
      { x: centerX, y: centerY },
      lineWidth,
    );
    this.drawLine(
      bitmap,
      { x: centerX, y: centerY },
      { x: endX, y: endY },
      lineWidth,
    );

    // Draw arrowhead
    const headAngle1 = angleRad + Math.PI * 0.8;
    const headAngle2 = angleRad - Math.PI * 0.8;

    const head1X = Math.round(endX + headSize * Math.cos(headAngle1));
    const head1Y = Math.round(endY + headSize * Math.sin(headAngle1));
    const head2X = Math.round(endX + headSize * Math.cos(headAngle2));
    const head2Y = Math.round(endY + headSize * Math.sin(headAngle2));

    this.drawLine(
      bitmap,
      { x: endX, y: endY },
      { x: head1X, y: head1Y },
      lineWidth,
    );
    this.drawLine(
      bitmap,
      { x: endX, y: endY },
      { x: head2X, y: head2Y },
      lineWidth,
    );

    // Fill arrowhead
    this.fillTriangle(
      bitmap,
      { x: endX, y: endY },
      { x: head1X, y: head1Y },
      { x: head2X, y: head2Y },
    );
  }

  /**
   * Draw straight arrow
   */
  private drawStraightArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lineWidth = Math.max(4, Math.floor(size / 20));
    const arrowLength = size * 0.8;
    const headSize = size * 0.25;

    const topY = centerY - arrowLength / 2;
    const bottomY = centerY + arrowLength / 2;

    // Draw shaft
    this.drawLine(
      bitmap,
      { x: centerX, y: bottomY },
      { x: centerX, y: topY },
      lineWidth,
    );

    // Draw arrowhead
    const head1 = { x: centerX - headSize, y: topY + headSize };
    const head2 = { x: centerX + headSize, y: topY + headSize };

    this.drawLine(bitmap, { x: centerX, y: topY }, head1, lineWidth);
    this.drawLine(bitmap, { x: centerX, y: topY }, head2, lineWidth);
    this.fillTriangle(bitmap, { x: centerX, y: topY }, head1, head2);
  }

  /**
   * Draw U-turn arrow
   */
  private drawUturnArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lineWidth = Math.max(4, Math.floor(size / 20));
    const arcRadius = size * 0.3;

    // Draw the U shape
    const startX = centerX + arcRadius;
    const endX = centerX - arcRadius;
    const bottomY = centerY + size * 0.3;
    const topY = centerY - size * 0.2;

    // Right side going up
    this.drawLine(
      bitmap,
      { x: startX, y: bottomY },
      { x: startX, y: topY },
      lineWidth,
    );

    // Arc at top (simplified as lines)
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const angle1 = (Math.PI * i) / steps;
      const angle2 = (Math.PI * (i + 1)) / steps;
      const x1 = Math.round(centerX + arcRadius * Math.cos(angle1));
      const y1 = Math.round(topY - arcRadius * Math.sin(angle1));
      const x2 = Math.round(centerX + arcRadius * Math.cos(angle2));
      const y2 = Math.round(topY - arcRadius * Math.sin(angle2));
      this.drawLine(bitmap, { x: x1, y: y1 }, { x: x2, y: y2 }, lineWidth);
    }

    // Left side going down with arrowhead
    const arrowY = bottomY;
    this.drawLine(
      bitmap,
      { x: endX, y: topY },
      { x: endX, y: arrowY },
      lineWidth,
    );

    // Arrowhead pointing down
    const headSize = size * 0.15;
    this.drawLine(
      bitmap,
      { x: endX, y: arrowY },
      { x: endX - headSize, y: arrowY - headSize },
      lineWidth,
    );
    this.drawLine(
      bitmap,
      { x: endX, y: arrowY },
      { x: endX + headSize, y: arrowY - headSize },
      lineWidth,
    );
  }

  /**
   * Draw destination marker
   */
  private drawDestinationMarker(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    // Draw location pin shape
    const pinHeight = size * 0.8;
    const pinWidth = size * 0.5;
    const circleRadius = size * 0.2;

    // Draw outer pin shape
    const topY = centerY - pinHeight / 2;
    const bottomY = centerY + pinHeight / 2;

    // Circle part at top
    this.drawCircle(
      bitmap,
      { x: centerX, y: topY + circleRadius },
      circleRadius,
    );
    this.drawCircle(
      bitmap,
      { x: centerX, y: topY + circleRadius },
      circleRadius + 2,
    );

    // Triangular point
    const leftX = centerX - pinWidth / 2;
    const rightX = centerX + pinWidth / 2;
    const pointY = bottomY;

    this.drawLine(
      bitmap,
      { x: leftX, y: topY + circleRadius },
      { x: centerX, y: pointY },
      3,
    );
    this.drawLine(
      bitmap,
      { x: rightX, y: topY + circleRadius },
      { x: centerX, y: pointY },
      3,
    );
  }

  /**
   * Draw roundabout arrow
   */
  private drawRoundaboutArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
    maneuverType: ManeuverType,
  ): void {
    const lineWidth = Math.max(3, Math.floor(size / 25));
    const circleRadius = size * 0.25;

    // Draw roundabout circle
    this.drawCircle(bitmap, { x: centerX, y: centerY }, circleRadius);
    this.drawCircle(bitmap, { x: centerX, y: centerY }, circleRadius - 2);

    // Draw entry from bottom
    const entryY = centerY + size * 0.4;
    this.drawLine(
      bitmap,
      { x: centerX, y: entryY },
      { x: centerX, y: centerY + circleRadius },
      lineWidth,
    );

    // Draw exit based on exit number
    const exitNumber = this.getExitNumber(maneuverType);
    const exitAngle = -90 + (exitNumber - 1) * 45; // First exit is straight
    const exitRad = (exitAngle * Math.PI) / 180;

    const exitStartX = Math.round(centerX + circleRadius * Math.cos(exitRad));
    const exitStartY = Math.round(centerY + circleRadius * Math.sin(exitRad));
    const exitEndX = Math.round(
      centerX + (circleRadius + size * 0.3) * Math.cos(exitRad),
    );
    const exitEndY = Math.round(
      centerY + (circleRadius + size * 0.3) * Math.sin(exitRad),
    );

    this.drawLine(
      bitmap,
      { x: exitStartX, y: exitStartY },
      { x: exitEndX, y: exitEndY },
      lineWidth,
    );

    // Draw arrowhead on exit
    const headSize = size * 0.1;
    const headAngle1 = exitRad + Math.PI * 0.8;
    const headAngle2 = exitRad - Math.PI * 0.8;

    this.drawLine(
      bitmap,
      { x: exitEndX, y: exitEndY },
      {
        x: Math.round(exitEndX + headSize * Math.cos(headAngle1)),
        y: Math.round(exitEndY + headSize * Math.sin(headAngle1)),
      },
      lineWidth,
    );
    this.drawLine(
      bitmap,
      { x: exitEndX, y: exitEndY },
      {
        x: Math.round(exitEndX + headSize * Math.cos(headAngle2)),
        y: Math.round(exitEndY + headSize * Math.sin(headAngle2)),
      },
      lineWidth,
    );
  }

  /**
   * Get exit number from roundabout maneuver type
   */
  private getExitNumber(maneuverType: ManeuverType): number {
    switch (maneuverType) {
      case ManeuverType.ROUNDABOUT_EXIT_1:
        return 1;
      case ManeuverType.ROUNDABOUT_EXIT_2:
        return 2;
      case ManeuverType.ROUNDABOUT_EXIT_3:
        return 3;
      case ManeuverType.ROUNDABOUT_EXIT_4:
        return 4;
      case ManeuverType.ROUNDABOUT_EXIT_5:
        return 5;
      case ManeuverType.ROUNDABOUT_EXIT_6:
        return 6;
      case ManeuverType.ROUNDABOUT_EXIT_7:
        return 7;
      case ManeuverType.ROUNDABOUT_EXIT_8:
        return 8;
      default:
        return 1;
    }
  }

  /**
   * Draw directional arrow for off-road display
   */
  private drawDirectionalArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    bearing: number,
    size: number,
  ): void {
    const lineWidth = Math.max(4, Math.floor(size / 20));
    const arrowLength = size * 0.7;
    const headSize = size * 0.25;

    // Convert bearing to radians (0 = north/up)
    const angleRad = ((bearing - 90) * Math.PI) / 180;

    const endX = Math.round(centerX + arrowLength * Math.cos(angleRad));
    const endY = Math.round(centerY + arrowLength * Math.sin(angleRad));

    // Draw shaft
    this.drawLine(
      bitmap,
      { x: centerX, y: centerY },
      { x: endX, y: endY },
      lineWidth,
    );

    // Draw arrowhead
    const headAngle1 = angleRad + Math.PI * 0.85;
    const headAngle2 = angleRad - Math.PI * 0.85;

    const head1 = {
      x: Math.round(endX + headSize * Math.cos(headAngle1)),
      y: Math.round(endY + headSize * Math.sin(headAngle1)),
    };
    const head2 = {
      x: Math.round(endX + headSize * Math.cos(headAngle2)),
      y: Math.round(endY + headSize * Math.sin(headAngle2)),
    };

    this.drawLine(bitmap, { x: endX, y: endY }, head1, lineWidth);
    this.drawLine(bitmap, { x: endX, y: endY }, head2, lineWidth);
    this.fillTriangle(bitmap, { x: endX, y: endY }, head1, head2);

    // Draw circle at base
    this.drawCircle(bitmap, { x: centerX, y: centerY }, 10);
  }

  /**
   * Draw checkmark for arrival screen
   */
  private drawCheckmark(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lineWidth = Math.max(5, Math.floor(size / 15));

    // Draw circle
    this.drawCircle(bitmap, { x: centerX, y: centerY }, size / 2);
    this.drawCircle(bitmap, { x: centerX, y: centerY }, size / 2 - 2);

    // Draw checkmark
    const checkStart = {
      x: centerX - size * 0.25,
      y: centerY,
    };
    const checkMid = {
      x: centerX - size * 0.05,
      y: centerY + size * 0.2,
    };
    const checkEnd = {
      x: centerX + size * 0.25,
      y: centerY - size * 0.15,
    };

    this.drawLine(bitmap, checkStart, checkMid, lineWidth);
    this.drawLine(bitmap, checkMid, checkEnd, lineWidth);
  }

  /**
   * Render the info panel for drive navigation
   * Uses bitmap font rendering (no Sharp) for stability
   */
  private renderDriveInfoPanel(
    bitmap: Bitmap1Bit,
    x: number,
    info: DriveNavigationInfo,
    width: number,
    _height: number,
  ): void {
    const padding = 10;
    let currentY = padding + 20;
    const labelScale = 2; // ~14px
    const valueScale = 3; // ~21px

    logger.info("renderDriveInfoPanel: step 1 - NEXT TURN label");

    // Next turn section
    renderBitmapText(bitmap, "NEXT TURN", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += 20;

    logger.info("renderDriveInfoPanel: step 2 - maneuver arrow");

    // Small turn arrow
    this.drawManeuverArrow(
      bitmap,
      x + padding + 30,
      currentY + 25,
      info.nextManeuver,
      50,
    );
    currentY += 70;

    logger.info("renderDriveInfoPanel: step 3 - distance to turn");

    // Distance to turn
    const distText = this.formatDistanceForDisplay(info.distanceToTurn);
    renderBitmapText(bitmap, distText, x + padding, currentY, {
      scale: valueScale,
      bold: true,
    });
    currentY += 30;

    logger.info("renderDriveInfoPanel: step 4 - divider");

    // Divider
    this.drawHorizontalLine(bitmap, x + padding, currentY, width - padding * 2);
    currentY += 20;

    logger.info("renderDriveInfoPanel: step 5 - speed label");

    // Speed section - label
    renderBitmapText(bitmap, "SPEED", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += calculateBitmapTextHeight(labelScale) + 4;

    logger.info("renderDriveInfoPanel: step 6 - speed value");

    // Speed value
    renderBitmapText(
      bitmap,
      `${Math.round(info.speed)} KM/H`,
      x + padding,
      currentY,
      { scale: valueScale, bold: true },
    );
    currentY += calculateBitmapTextHeight(valueScale) + 20;

    logger.info("renderDriveInfoPanel: step 7 - progress label");

    // Progress label
    renderBitmapText(bitmap, "PROGRESS", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += 20;

    logger.info("renderDriveInfoPanel: step 8 - progress bar");

    // Progress bar
    const barWidth = width - padding * 2;
    const barHeight = 12;
    this.drawHorizontalLine(bitmap, x + padding, currentY, barWidth);
    this.drawHorizontalLine(
      bitmap,
      x + padding,
      currentY + barHeight,
      barWidth,
    );
    this.drawVerticalLine(bitmap, x + padding, currentY, barHeight, 1);
    this.drawVerticalLine(
      bitmap,
      x + padding + barWidth,
      currentY,
      barHeight,
      1,
    );

    logger.info("renderDriveInfoPanel: step 9 - progress bar fill");

    const fillWidth = Math.floor((barWidth - 4) * (info.progress / 100));
    for (let row = currentY + 2; row < currentY + barHeight - 2; row++) {
      for (
        let col = x + padding + 2;
        col < x + padding + 2 + fillWidth;
        col++
      ) {
        this.setPixel(bitmap, col, row, true);
      }
    }
    currentY += barHeight + 15;

    logger.info("renderDriveInfoPanel: step 10 - progress percentage");

    // Progress percentage
    renderBitmapText(
      bitmap,
      `${Math.round(info.progress)}%`,
      x + padding,
      currentY,
      {
        scale: valueScale,
        bold: true,
      },
    );
    currentY += 30;

    logger.info("renderDriveInfoPanel: step 11 - remaining label");

    // Remaining distance label
    renderBitmapText(bitmap, "REMAINING", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += 20;

    logger.info("renderDriveInfoPanel: step 12 - remaining value");

    // Remaining distance value
    const remainingText = this.formatDistanceForDisplay(info.distanceRemaining);
    renderBitmapText(bitmap, remainingText, x + padding, currentY, {
      scale: valueScale,
      bold: true,
    });

    logger.info("renderDriveInfoPanel: completed all steps");
  }

  /**
   * Format distance for display (m or km)
   */
  private formatDistanceForDisplay(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      if (km >= 10) {
        return `${Math.round(km)} KM`;
      }
      return `${km.toFixed(1)} KM`;
    }
    return `${Math.round(meters)} M`;
  }

  /**
   * Convert bearing to cardinal direction
   */
  private bearingToDirection(bearing: number): string {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }
}
