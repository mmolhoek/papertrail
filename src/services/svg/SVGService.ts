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

    // Draw "N" label near the north arrow
    const labelDistance = radius + 12;
    const northRadians = ((northAngle - 90) * Math.PI) / 180;
    const labelX = Math.round(x + labelDistance * Math.cos(northRadians)) - 2;
    const labelY = Math.round(y + labelDistance * Math.sin(northRadians)) - 3;
    this.drawChar(bitmap, labelX, labelY, "N");

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
    // Sort points by y coordinate
    const points = [p1, p2, p3].sort((a, b) => a.y - b.y);
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
   */
  addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    maxWidth: number,
    metersPerPixel: number,
  ): Result<Bitmap1Bit> {
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

    // Draw the distance label centered above the bar
    const labelY = y - 24;
    const labelX =
      x + Math.floor(barWidth / 2) - Math.floor((label.length * 6) / 2);
    this.renderSimpleText(bitmap, labelX, labelY, label);

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
      const compassPadding = 65; // Distance from edges (accounts for "N" label)
      const compassX = compassPadding;
      const compassY = compassPadding;
      const heading = info.bearing ?? 0;
      this.addCompass(bitmap, compassX, compassY, compassRadius, heading);

      // Draw scale bar in bottom-right of map area
      const scale = Math.pow(2, viewport.zoomLevel);
      const metersPerPixel =
        (156543.03392 * Math.cos((currentPosition.latitude * Math.PI) / 180)) /
        scale;
      const scaleBarMaxWidth = 200;
      const scaleBarPadding = 30;
      const scaleBarX = mapWidth - scaleBarMaxWidth - scaleBarPadding;
      const scaleBarY = height - scaleBarPadding;
      this.addScaleBar(
        bitmap,
        scaleBarX,
        scaleBarY,
        scaleBarMaxWidth,
        metersPerPixel,
      );

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
    const sectionHeight = Math.floor(height / 3);

    // Section 1: Speed (top)
    const speedY = padding;
    this.renderRotatedMediumText(bitmap, x + padding, speedY, "SPEED");
    this.renderRotatedLargeNumber(
      bitmap,
      x + padding + 20,
      speedY + 30,
      Math.round(info.speed),
    );
    this.renderRotatedMediumText(bitmap, x + padding, speedY + 100, "KM/H");

    // Section 2: Satellites
    const satY = sectionHeight + padding;
    this.renderRotatedMediumText(bitmap, x + padding, satY, "SATS");
    this.renderRotatedLargeNumber(
      bitmap,
      x + padding + 20,
      satY + 30,
      info.satellites,
    );

    // Section 3: Bearing (if available)
    if (info.bearing !== undefined) {
      const bearY = sectionHeight * 2 + padding;
      this.renderRotatedMediumText(bitmap, x + padding, bearY, "BEAR");
      this.renderRotatedLargeNumber(
        bitmap,
        x + padding + 20,
        bearY + 30,
        Math.round(info.bearing),
      );
      // Draw degree symbol (small circle)
      const degX = x + padding + 80;
      const degY = bearY + 50;
      this.drawCircle(bitmap, { x: degX, y: degY }, 3);
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

    // Font data is column-based: each array element is a column,
    // each bit represents a row (MSB = top row)
    for (let col = 0; col < 5; col++) {
      const colData = charData[col] || 0;
      for (let row = 0; row < 7; row++) {
        if (colData & (0x80 >> row)) {
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

    // Font data is column-based: each array element is a column,
    // each bit represents a row (MSB = top row)
    for (let col = 0; col < 5; col++) {
      const colData = charData[col] || 0;
      for (let row = 0; row < 7; row++) {
        if (colData & (0x80 >> row)) {
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
   * Render medium-sized text (2x scale) for headers
   */
  private renderMediumText(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    text: string,
  ): void {
    const charWidth = 12; // 2x scale: 5*2 + 2 space
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i).toUpperCase();
      const charX = x + i * charWidth;
      this.drawScaledChar(bitmap, charX, y, char, 2);
    }
  }

  /**
   * Render medium-sized text rotated 90 degrees counter-clockwise
   * Text reads from bottom to top
   */
  private renderRotatedMediumText(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    text: string,
  ): void {
    const scale = 2;
    const charSpacing = 8 * scale;

    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i).toUpperCase();
      // Characters stack vertically (top to bottom)
      const charOffsetY = i * charSpacing;
      this.drawRotatedScaledChar(bitmap, x, y + charOffsetY, char, scale);
    }
  }

  /**
   * Draw a character rotated 90 degrees counter-clockwise at specified scale
   */
  private drawRotatedScaledChar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    char: string,
    scale: number,
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
      "/": [0xc0, 0x20, 0x10, 0x08, 0x06, 0x00, 0x00],
    };

    const charData = font[char];
    if (!charData) return;

    const charHeight = 7 * scale;

    for (let row = 0; row < 7; row++) {
      const rowData = charData[row] || 0;
      for (let col = 0; col < 8; col++) {
        if (rowData & (0x80 >> col)) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const localX = col * scale + sx;
              const localY = row * scale + sy;

              // 90° counter-clockwise rotation
              const rotX = localY;
              const rotY = charHeight - localX;

              this.setPixel(bitmap, x + rotX, y + rotY, true);
            }
          }
        }
      }
    }
  }

  /**
   * Draw a character at specified scale
   */
  private drawScaledChar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    char: string,
    scale: number,
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
   * Render a large number rotated 90 degrees counter-clockwise
   * Text reads from bottom to top
   */
  private renderRotatedLargeNumber(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    value: number,
  ): void {
    const text = value.toString();
    const scale = 3;
    const charHeight = 7 * scale;
    const charSpacing = 8 * scale;

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

    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      const charData = font[char];
      if (!charData) continue;

      // For 90° CCW rotation, characters stack vertically (top to bottom)
      const charOffsetY = i * charSpacing;

      for (let row = 0; row < 7; row++) {
        const rowData = charData[row] || 0;
        for (let col = 0; col < 8; col++) {
          if (rowData & (0x80 >> col)) {
            // For each pixel in the scaled character
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const localX = col * scale + sx;
                const localY = row * scale + sy;

                // 90° counter-clockwise: (x, y) -> (-y, x) or (y, -x) depending on direction
                // For CCW: new_x = y, new_y = -x (but we offset to keep positive)
                const rotX = localY;
                const rotY = charHeight - localX;

                const finalX = x + rotX;
                const finalY = y + charOffsetY + rotY;

                this.setPixel(bitmap, finalX, finalY, true);
              }
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
   */
  async renderTurnScreen(
    maneuverType: ManeuverType,
    distance: number,
    instruction: string,
    streetName: string | undefined,
    viewport: ViewportConfig,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(`Rendering turn screen: ${maneuverType}, ${distance}m`);

    try {
      const { width, height } = viewport;
      const bitmap = this.createBlankBitmap(width, height, false);

      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 3); // Upper third for arrow

      // Draw the large turn arrow
      this.drawManeuverArrow(bitmap, centerX, centerY, maneuverType, 120);

      // Draw distance text (large)
      const distanceText = this.formatDistanceForDisplay(distance);
      const distanceY = Math.floor(height / 2) + 40;
      this.renderLargeText(bitmap, centerX, distanceY, distanceText);

      // Draw instruction text
      const instructionY = Math.floor(height * 0.7);
      this.renderSimpleText(
        bitmap,
        centerX - Math.floor((instruction.length * 6) / 2),
        instructionY,
        instruction.toUpperCase(),
      );

      // Draw street name if provided
      if (streetName) {
        const streetY = instructionY + 25;
        this.renderSimpleText(
          bitmap,
          centerX - Math.floor((streetName.length * 6) / 2),
          streetY,
          streetName.toUpperCase(),
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
    logger.debug("Rendering drive map screen");

    try {
      const { width, height } = viewport;
      const renderOpts = { ...this.getDefaultRenderOptions(), ...options };

      // Calculate split dimensions (70/30 for drive mode)
      const mapWidth = Math.floor(width * 0.7);
      const infoWidth = width - mapWidth;

      // Create main bitmap
      const bitmap = this.createBlankBitmap(width, height, false);

      // Render the route on the map section
      const mapViewport: ViewportConfig = {
        ...viewport,
        width: mapWidth,
        centerPoint: currentPosition,
      };

      // Draw route line using geometry
      if (route.geometry && route.geometry.length > 1) {
        const projectedRoute = route.geometry.map(([lat, lon]) =>
          this.projectToPixels(lat, lon, mapViewport),
        );

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
      const waypointPixel = this.projectToPixels(
        nextWaypoint.latitude,
        nextWaypoint.longitude,
        mapViewport,
      );
      if (waypointPixel.x < mapWidth) {
        this.drawCircle(bitmap, waypointPixel, 6);
        this.drawCircle(bitmap, waypointPixel, 8);
      }

      // Draw vertical divider line
      this.drawVerticalLine(bitmap, mapWidth, 0, height, 2);

      // Render info panel (right 30%)
      this.renderDriveInfoPanel(
        bitmap,
        mapWidth + 10,
        info,
        infoWidth - 20,
        height,
      );

      logger.info("Drive map screen rendered successfully");
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

      // Draw distance text
      const distanceText = this.formatDistanceForDisplay(distance);
      const distanceY = Math.floor(height / 2) + 40;
      this.renderLargeText(bitmap, centerX, distanceY, distanceText);

      // Draw "TO ROUTE" text
      const labelY = Math.floor(height / 2) + 100;
      const label = "TO ROUTE";
      this.renderSimpleText(
        bitmap,
        centerX - Math.floor((label.length * 6) / 2),
        labelY,
        label,
      );

      // Draw instruction at bottom
      const instructionY = Math.floor(height * 0.8);
      const instruction =
        "HEAD " + this.bearingToDirection(bearing) + " TO REACH PAVED ROAD";
      this.renderSimpleText(
        bitmap,
        centerX - Math.floor((instruction.length * 6) / 2),
        instructionY,
        instruction,
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
      const markerY = Math.floor(height / 3);
      this.drawCheckmark(bitmap, centerX, markerY, 80);

      // Draw "ARRIVED" text
      const arrivedY = Math.floor(height / 2) + 20;
      const arrivedText = "ARRIVED";
      this.renderLargeText(bitmap, centerX, arrivedY, arrivedText);

      // Draw destination name
      const destY = Math.floor(height * 0.7);
      // Truncate if too long
      const truncatedDest =
        destination.length > 40
          ? destination.substring(0, 37) + "..."
          : destination;
      this.renderSimpleText(
        bitmap,
        centerX - Math.floor((truncatedDest.length * 6) / 2),
        destY,
        truncatedDest.toUpperCase(),
      );

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
   */
  private renderDriveInfoPanel(
    bitmap: Bitmap1Bit,
    x: number,
    info: DriveNavigationInfo,
    width: number,
    height: number,
  ): void {
    const padding = 10;
    let currentY = padding + 20;

    // Next turn section
    this.renderSimpleText(bitmap, x + padding, currentY, "NEXT TURN");
    currentY += 20;

    // Small turn arrow
    this.drawManeuverArrow(
      bitmap,
      x + padding + 30,
      currentY + 25,
      info.nextManeuver,
      50,
    );
    currentY += 70;

    // Distance to turn
    const distText = this.formatDistanceForDisplay(info.distanceToTurn);
    this.renderSimpleText(bitmap, x + padding, currentY, distText);
    currentY += 30;

    // Divider
    this.drawHorizontalLine(bitmap, x + padding, currentY, width - padding * 2);
    currentY += 20;

    // Speed
    this.renderSimpleText(bitmap, x + padding, currentY, "SPEED");
    currentY += 20;
    this.renderLargeNumber(
      bitmap,
      x + padding,
      currentY,
      Math.round(info.speed),
      width - padding * 2,
    );
    this.renderSimpleText(bitmap, x + padding, currentY + 55, "KM/H");
    currentY += 80;

    // Progress
    this.renderSimpleText(bitmap, x + padding, currentY, "PROGRESS");
    currentY += 20;

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

    this.renderSimpleText(
      bitmap,
      x + padding,
      currentY,
      `${Math.round(info.progress)}%`,
    );
    currentY += 30;

    // Remaining distance
    this.renderSimpleText(bitmap, x + padding, currentY, "REMAINING");
    currentY += 20;
    const remainingText = this.formatDistanceForDisplay(info.distanceRemaining);
    this.renderSimpleText(bitmap, x + padding, currentY, remainingText);
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

  /**
   * Render large text centered at position
   */
  private renderLargeText(
    bitmap: Bitmap1Bit,
    centerX: number,
    y: number,
    text: string,
  ): void {
    const charWidth = 18; // Larger spacing
    const totalWidth = text.length * charWidth;
    const startX = centerX - totalWidth / 2;

    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      this.drawLargeChar(bitmap, Math.round(startX + i * charWidth), y, char);
    }
  }
}
