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
  renderBitmapText,
  calculateBitmapTextHeight,
  calculateBitmapTextWidth,
} from "@utils/bitmapFont";
import { BitmapUtils } from "./BitmapUtils";
import { ProjectionService } from "./ProjectionService";
import { TrackRenderer } from "./TrackRenderer";
import { UIRenderer } from "./UIRenderer";
import { ManeuverRenderer } from "./ManeuverRenderer";

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

      // Render the track
      const totalPoints = TrackRenderer.renderTrack(
        bitmap,
        track,
        viewport,
        renderOpts,
      );

      if (totalPoints === 0) {
        logger.debug("Track has no points, returning blank bitmap");
        return success(bitmap);
      }

      // Highlight current position if enabled
      if (renderOpts.highlightCurrentPosition) {
        let centerPoint = this.projectToPixels(
          viewport.centerPoint.latitude,
          viewport.centerPoint.longitude,
          viewport,
        );

        // Apply rotation if needed
        const bearing = viewport.centerPoint.bearing;
        if (renderOpts.rotateWithBearing && bearing !== undefined) {
          centerPoint = this.rotatePoint(
            centerPoint,
            viewport.width / 2,
            viewport.height / 2,
            -bearing,
          );
        }

        const radius = renderOpts.currentPositionRadius || 8;
        TrackRenderer.renderPositionMarker(bitmap, centerPoint, radius);
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

      // Render each track using TrackRenderer
      for (const track of tracks) {
        const points = TrackRenderer.renderTrack(
          bitmap,
          track,
          viewport,
          renderOpts,
        );
        if (points > 0) {
          renderedTracks++;
          totalPoints += points;
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
        TrackRenderer.renderPositionMarker(bitmap, centerPoint, radius);
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
    return BitmapUtils.createBlankBitmap(width, height, fill);
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
  async addCompass(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    radius: number,
    heading: number,
  ): Promise<Result<Bitmap1Bit>> {
    return UIRenderer.addCompass(bitmap, x, y, radius, heading);
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
    BitmapUtils.fillTriangle(bitmap, p1, p2, p3);
  }

  /**
   * Add a scale bar to the bitmap
   */
  async addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    maxWidth: number,
    metersPerPixel: number,
  ): Promise<Result<Bitmap1Bit>> {
    return UIRenderer.addScaleBar(bitmap, x, y, maxWidth, metersPerPixel);
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

      // Render track on left portion using TrackRenderer with area constraint
      TrackRenderer.renderTrackInArea(
        bitmap,
        track,
        mapViewport,
        renderOpts,
        mapWidth,
      );

      // Highlight current position (center of map area)
      if (renderOpts.highlightCurrentPosition) {
        const centerPoint = {
          x: Math.floor(mapWidth / 2),
          y: Math.floor(height / 2),
        };
        const radius = renderOpts.currentPositionRadius || 8;
        TrackRenderer.renderPositionMarker(bitmap, centerPoint, radius);
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
      const metersPerPixel = ProjectionService.calculateMetersPerPixel(
        currentPosition.latitude,
        viewport.zoomLevel,
      );
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
    width: number,
    height: number,
  ): void {
    UIRenderer.renderFollowTrackInfoPanel(bitmap, x, info, width, height);
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
    BitmapUtils.drawVerticalLine(bitmap, x, y, height, width);
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
    BitmapUtils.drawHorizontalLine(bitmap, x, y, width, thickness);
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
    return ProjectionService.projectToPixels(lat, lon, viewport);
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
    BitmapUtils.setPixel(bitmap, x, y, value);
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
    BitmapUtils.drawLine(bitmap, p1, p2, width);
  }

  /**
   * Draw a circle outline using Midpoint circle algorithm
   */
  private drawCircle(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number,
  ): void {
    BitmapUtils.drawCircle(bitmap, center, radius);
  }

  /**
   * Draw a filled circle
   */
  private drawFilledCircle(
    bitmap: Bitmap1Bit,
    center: Point2D,
    radius: number,
  ): void {
    BitmapUtils.drawFilledCircle(bitmap, center, radius);
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
    return ProjectionService.rotatePoint(point, centerX, centerY, angleDegrees);
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
          progress,
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
    progress?: number,
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

    // Draw progress bar at the bottom if progress is provided
    if (progress !== undefined) {
      this.drawProgressBar(bitmap, width, height, progress);
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

    // Draw instruction text centered (same size as single turn screen)
    const instructionY = Math.floor(height * 0.58);
    const instructionScale = 3; // Same as single turn screen
    const instructionText = currentTurn.instruction.toUpperCase();
    const instructionWidth = calculateBitmapTextWidth(
      instructionText,
      instructionScale,
    );
    renderBitmapText(
      bitmap,
      instructionText,
      centerX - instructionWidth / 2,
      instructionY,
      { scale: instructionScale, bold: true },
    );

    // Draw street name centered if provided (same size as single turn screen)
    if (currentTurn.streetName) {
      const streetY = Math.floor(height * 0.7);
      const streetScale = 4; // Same as single turn screen
      const streetText = currentTurn.streetName.toUpperCase();
      const streetWidth = calculateBitmapTextWidth(streetText, streetScale);
      renderBitmapText(bitmap, streetText, centerX - streetWidth / 2, streetY, {
        scale: streetScale,
        bold: true,
      });
    }

    // Draw progress bar at the bottom if progress is provided
    if (progress !== undefined) {
      this.drawProgressBar(bitmap, width, height, progress);
    }
  }

  /**
   * Draw a progress bar at the bottom of the screen
   */
  private drawProgressBar(
    bitmap: Bitmap1Bit,
    width: number,
    height: number,
    progress: number,
  ): void {
    UIRenderer.drawProgressBar(bitmap, width, height, progress);
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

      // Draw route line using geometry via TrackRenderer
      if (route.geometry && route.geometry.length > 1) {
        const pointCount = TrackRenderer.renderRouteGeometry(
          bitmap,
          route.geometry,
          mapViewport,
          renderOpts,
          mapWidth,
        );
        logger.info(
          `renderDriveMapScreen: rendered ${pointCount} route points (${Date.now() - methodStart}ms)`,
        );
      }

      // Highlight current position
      if (renderOpts.highlightCurrentPosition) {
        const centerPoint = {
          x: Math.floor(mapWidth / 2),
          y: Math.floor(height / 2),
        };
        const radius = renderOpts.currentPositionRadius || 8;
        TrackRenderer.renderPositionMarker(bitmap, centerPoint, radius);
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
        TrackRenderer.renderWaypointMarker(bitmap, waypointPixel, 6, 8);
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
    ManeuverRenderer.drawManeuverArrow(bitmap, x, y, maneuverType, size);
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
    ManeuverRenderer.drawDirectionalArrow(
      bitmap,
      centerX,
      centerY,
      bearing,
      size,
    );
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
    ManeuverRenderer.drawCheckmark(bitmap, centerX, centerY, size);
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
    return UIRenderer.formatDistanceForDisplay(meters);
  }

  /**
   * Convert bearing to cardinal direction
   */
  private bearingToDirection(bearing: number): string {
    return UIRenderer.bearingToDirection(bearing);
  }
}
