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
 * Renders GPX tracks and navigation screens to 1-bit bitmaps for e-paper display.
 * This service is the core rendering engine that handles:
 * - Coordinate projection (GPS to pixel space)
 * - Track rendering with configurable line styles
 * - Navigation UI (turn arrows, progress bars, info panels)
 * - Bitmap manipulation for 1-bit e-paper displays
 *
 * The service delegates specialized rendering to sub-modules:
 * - {@link BitmapUtils} - Low-level bitmap operations
 * - {@link ProjectionService} - GPS coordinate projection
 * - {@link TrackRenderer} - GPX track rendering
 * - {@link UIRenderer} - UI elements (compass, scale bar, info panels)
 * - {@link ManeuverRenderer} - Turn-by-turn navigation arrows
 *
 * @example
 * ```typescript
 * const svgService = new SVGService();
 * const viewport: ViewportConfig = {
 *   width: 800,
 *   height: 480,
 *   zoomLevel: 15,
 *   centerPoint: { latitude: 51.5074, longitude: -0.1278 }
 * };
 * const result = await svgService.renderViewport(track, viewport);
 * if (result.success) {
 *   // Use result.data (Bitmap1Bit) with e-paper service
 * }
 * ```
 */
export class SVGService implements ISVGService {
  constructor() {}

  /**
   * Render a viewport with a GPX track centered on a coordinate.
   *
   * Projects the track onto a 1-bit bitmap using the specified viewport configuration.
   * The track is rendered as connected line segments with optional position highlighting.
   *
   * @param track - The GPX track to render
   * @param viewport - Viewport configuration including dimensions, zoom level, and center point
   * @param options - Optional rendering options (line width, point display, etc.)
   * @returns Result containing the rendered bitmap or an error
   *
   * @example
   * ```typescript
   * const result = await svgService.renderViewport(track, {
   *   width: 800,
   *   height: 480,
   *   zoomLevel: 15,
   *   centerPoint: currentPosition
   * }, { lineWidth: 3, highlightCurrentPosition: true });
   * ```
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
   * Render multiple tracks in the same viewport.
   *
   * Projects all tracks onto a single bitmap, useful for displaying
   * multiple routes or comparing tracks in the same view.
   *
   * @param tracks - Array of GPX tracks to render
   * @param viewport - Viewport configuration including dimensions, zoom level, and center point
   * @param options - Optional rendering options (line width, point display, etc.)
   * @returns Result containing the rendered bitmap or an error
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
   * Create a blank bitmap of specified dimensions.
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param fill - If true, fill with black (1); if false, fill with white (0)
   * @returns A new blank bitmap with the specified dimensions
   */
  createBlankBitmap(
    width: number,
    height: number,
    fill: boolean = false,
  ): Bitmap1Bit {
    return BitmapUtils.createBlankBitmap(width, height, fill);
  }

  /**
   * Add a compass rose to indicate direction.
   *
   * Draws a compass with North indicator at the specified position.
   * The compass rotates based on the current heading to show
   * which direction is north relative to the current view.
   *
   * @param bitmap - The bitmap to add the compass to
   * @param x - X coordinate for compass center
   * @param y - Y coordinate for compass center
   * @param radius - Radius of the compass in pixels
   * @param heading - Current heading in degrees (0 = north, 90 = east)
   * @returns Result containing the modified bitmap
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
   * Add a scale bar to the bitmap.
   *
   * Draws a scale bar showing the real-world distance represented
   * by a portion of the map. Automatically selects appropriate
   * distance units (meters or kilometers).
   *
   * @param bitmap - The bitmap to add the scale bar to
   * @param x - X coordinate for scale bar start
   * @param y - Y coordinate for scale bar
   * @param maxWidth - Maximum width of the scale bar in pixels
   * @param metersPerPixel - Conversion factor from pixels to meters
   * @returns Result containing the modified bitmap
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
   * Get the default render options.
   *
   * Returns a RenderOptions object with sensible defaults for
   * rendering tracks on e-paper displays.
   *
   * @returns Default rendering options
   *
   * @example
   * ```typescript
   * const defaults = svgService.getDefaultRenderOptions();
   * // { lineWidth: 2, pointRadius: 3, showPoints: true, ... }
   * ```
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
   * Render the "Follow Track" screen with 70/30 split layout.
   *
   * Creates a display optimized for following a GPX track:
   * - Left area (70%): Track map centered on current GPS position with compass and scale bar
   * - Right area (30%): Information panel showing speed, satellites, and progress
   *
   * @param track - The GPX track being followed
   * @param currentPosition - Current GPS position (used as map center)
   * @param viewport - Viewport configuration (dimensions and zoom)
   * @param info - Track following information (speed, satellites, progress, bearing)
   * @param options - Optional rendering options
   * @returns Result containing the rendered bitmap or an error
   *
   * @example
   * ```typescript
   * const result = await svgService.renderFollowTrackScreen(
   *   activeTrack,
   *   gpsPosition,
   *   { width: 800, height: 480, zoomLevel: 16, centerPoint: gpsPosition },
   *   { speed: 25.5, satellites: 8, progress: 45.2, bearing: 180 }
   * );
   * ```
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
   * Render full-screen turn display for drive navigation.
   *
   * Creates a high-visibility turn instruction screen with:
   * - Large maneuver arrow (left, right, straight, etc.)
   * - Distance to turn in meters or kilometers
   * - Instruction text (e.g., "TURN LEFT")
   * - Street name (if available)
   * - Optional progress bar
   *
   * If nextTurn is provided, renders a dual-turn layout showing
   * the current turn on the left and next turn on the right
   * with "THEN" indicator between them.
   *
   * @param maneuverType - Type of maneuver to display (turn_left, turn_right, etc.)
   * @param distance - Distance to the turn in meters
   * @param instruction - Text instruction for the turn
   * @param streetName - Name of the street to turn onto (optional)
   * @param viewport - Viewport configuration (dimensions)
   * @param nextTurn - Optional next turn information for dual-turn display
   * @param progress - Optional route progress percentage (0-100)
   * @returns Result containing the rendered bitmap or an error
   *
   * @example
   * ```typescript
   * // Single turn display
   * const result = await svgService.renderTurnScreen(
   *   ManeuverType.TURN_LEFT,
   *   150,
   *   "Turn left",
   *   "Main Street",
   *   viewport
   * );
   *
   * // Dual turn display (current + next)
   * const result = await svgService.renderTurnScreen(
   *   ManeuverType.TURN_LEFT, 150, "Turn left", "Main St", viewport,
   *   { maneuverType: ManeuverType.TURN_RIGHT, distance: 300, instruction: "Turn right" },
   *   75 // 75% progress
   * );
   * ```
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
   * Render drive navigation map screen with turn overlay.
   *
   * Creates a 70/30 split layout for active drive navigation:
   * - Left area (70%): Route map centered on current position with compass
   * - Right area (30%): Navigation info panel with next turn, speed, progress
   *
   * @param route - The drive route being navigated
   * @param currentPosition - Current GPS position
   * @param nextWaypoint - The next waypoint/turn on the route
   * @param viewport - Viewport configuration (dimensions and zoom)
   * @param info - Navigation information (speed, distances, progress, next maneuver)
   * @param options - Optional rendering options
   * @returns Result containing the rendered bitmap or an error
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
        // Diagnostic logging for route rendering
        const firstPt = route.geometry[0];
        const centerPt = route.geometry[Math.floor(route.geometry.length / 2)];
        logger.info(
          `renderDriveMapScreen: route geometry has ${route.geometry.length} points, first=[${firstPt[0].toFixed(5)}, ${firstPt[1].toFixed(5)}], center=[${centerPt[0].toFixed(5)}, ${centerPt[1].toFixed(5)}]`,
        );
        logger.info(
          `renderDriveMapScreen: viewport center=[${mapViewport.centerPoint.latitude.toFixed(5)}, ${mapViewport.centerPoint.longitude.toFixed(5)}], zoom=${mapViewport.zoomLevel}, mapWidth=${mapWidth}`,
        );

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

        // Render end/destination marker for route overview
        const endCoord = route.geometry[route.geometry.length - 1];

        let endPixel = this.projectToPixels(
          endCoord[0],
          endCoord[1],
          mapViewport,
        );

        // Apply rotation if in track-up mode
        const routeBearing = currentPosition.bearing;
        if (renderOpts.rotateWithBearing && routeBearing !== undefined) {
          endPixel = this.rotatePoint(
            endPixel,
            mapWidth / 2,
            height / 2,
            -routeBearing,
          );
        }

        // Draw end marker if within map bounds
        if (
          endPixel.x >= 0 &&
          endPixel.x < mapWidth &&
          endPixel.y >= 0 &&
          endPixel.y < height
        ) {
          TrackRenderer.renderEndMarker(bitmap, endPixel, 16);
          logger.info(
            `renderDriveMapScreen: end marker at (${endPixel.x}, ${endPixel.y})`,
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
        TrackRenderer.renderPositionMarker(bitmap, centerPoint, radius);
      }

      // Draw all waypoint markers on the route (only at zoom level 19+)
      const bearing = currentPosition.bearing;
      const showWaypoints = viewport.zoomLevel >= 19;

      if (showWaypoints && route.waypoints.length > 0) {
        logger.info(
          `Rendering ${route.waypoints.length} waypoints at zoom level ${viewport.zoomLevel}`,
        );

        for (const waypoint of route.waypoints) {
          let waypointPixel = this.projectToPixels(
            waypoint.latitude,
            waypoint.longitude,
            mapViewport,
          );

          // Apply rotation if in track-up mode
          if (renderOpts.rotateWithBearing && bearing !== undefined) {
            waypointPixel = this.rotatePoint(
              waypointPixel,
              mapWidth / 2,
              height / 2,
              -bearing,
            );
          }

          // Only render if within map area and on screen
          if (
            waypointPixel.x >= 0 &&
            waypointPixel.x < mapWidth &&
            waypointPixel.y >= 0 &&
            waypointPixel.y < height
          ) {
            // Draw waypoint marker
            TrackRenderer.renderWaypointMarker(bitmap, waypointPixel, 5, 7);

            // Draw waypoint label (use instruction which holds the name for GPX waypoints)
            const label = waypoint.instruction
              ? waypoint.instruction.substring(0, 12).toUpperCase()
              : "";
            if (label) {
              const labelX = waypointPixel.x + 12; // Offset to right of marker
              const labelY = waypointPixel.y - 4; // Slightly above center

              // Only render label if it fits in map area
              if (labelX < mapWidth - 50) {
                renderBitmapText(bitmap, label, labelX, labelY, { scale: 1 });
              }
            }
          }
        }
      }

      // Draw POIs on the map (if provided)
      // POIs are fetched by the caller when appropriate (navigation at zoom 15+, or route overview)
      if (info.nearbyPOIs && info.nearbyPOIs.length > 0) {
        logger.info(
          `Rendering ${info.nearbyPOIs.length} POIs at zoom level ${viewport.zoomLevel}`,
        );

        for (const poi of info.nearbyPOIs) {
          let poiPixel = this.projectToPixels(
            poi.latitude,
            poi.longitude,
            mapViewport,
          );

          // Apply rotation if in track-up mode
          if (renderOpts.rotateWithBearing && bearing !== undefined) {
            poiPixel = this.rotatePoint(
              poiPixel,
              mapWidth / 2,
              height / 2,
              -bearing,
            );
          }

          // Only render if within map area
          if (
            poiPixel.x >= 0 &&
            poiPixel.x < mapWidth &&
            poiPixel.y >= 0 &&
            poiPixel.y < height
          ) {
            // Draw POI marker (circle with code letter)
            const poiRadius = 12;

            // Draw filled circle background (white)
            for (let dy = -poiRadius; dy <= poiRadius; dy++) {
              for (let dx = -poiRadius; dx <= poiRadius; dx++) {
                if (dx * dx + dy * dy <= poiRadius * poiRadius) {
                  const px = Math.floor(poiPixel.x + dx);
                  const py = Math.floor(poiPixel.y + dy);
                  if (px >= 0 && px < mapWidth && py >= 0 && py < height) {
                    this.setPixel(bitmap, px, py, false); // White fill
                  }
                }
              }
            }

            // Draw circle outline (black)
            this.drawCircle(
              bitmap,
              { x: Math.floor(poiPixel.x), y: Math.floor(poiPixel.y) },
              poiRadius,
            );

            // Draw code letter centered in circle
            // At scale 1, char is ~7px wide, ~10px tall. Offset from center to top-left anchor.
            const letterX = Math.floor(poiPixel.x) - 3;
            const letterY = Math.floor(poiPixel.y) - 4;
            renderBitmapText(bitmap, poi.codeLetter, letterX, letterY, {
              scale: 1,
              bold: true,
              extraBold: true,
            });
          }
        }
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
   * Render off-road arrow screen for drive navigation.
   *
   * Displayed when the user has gone off the planned route.
   * Shows a large directional arrow pointing toward the nearest
   * point on the route with distance and cardinal direction.
   *
   * @param bearing - Bearing to the route in degrees (0 = north)
   * @param distance - Distance to the nearest point on route in meters
   * @param viewport - Viewport configuration (dimensions)
   * @returns Result containing the rendered bitmap or an error
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
   * Render arrival screen for drive navigation.
   *
   * Displayed when the user has arrived at their destination.
   * Shows a checkmark icon with "ARRIVED" text and the
   * destination name split across multiple lines.
   *
   * @param destination - Name of the destination
   * @param viewport - Viewport configuration (dimensions)
   * @returns Result containing the rendered bitmap or an error
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

    // Street name (road you're turning onto)
    if (info.streetName) {
      logger.info(
        `renderDriveInfoPanel: step 3b - street name: ${info.streetName}`,
      );
      // Truncate long street names to fit panel
      const maxChars = Math.floor((width - padding * 2) / 7); // ~7px per char at scale 1
      let streetDisplay = info.streetName.toUpperCase();
      if (streetDisplay.length > maxChars) {
        streetDisplay = streetDisplay.substring(0, maxChars - 2) + "..";
      }
      renderBitmapText(bitmap, streetDisplay, x + padding, currentY, {
        scale: labelScale,
      });
      currentY += 25;
    } else {
      logger.info("renderDriveInfoPanel: step 3b - no street name available");
    }

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

    // Determine unit and convert speeds if needed
    const useMph = info.speedUnit === "mph";
    const unitLabel = useMph ? "MPH" : "KM/H";
    const displaySpeed = useMph
      ? Math.round(info.speed * 0.621371)
      : Math.round(info.speed);
    const displaySpeedLimit =
      info.speedLimit !== undefined && info.speedLimit !== null
        ? useMph
          ? Math.round(info.speedLimit * 0.621371)
          : info.speedLimit
        : null;

    // Speed value (with speed limit if available)
    if (displaySpeedLimit !== null) {
      // Show speed with limit: "45/50"
      const speedText = `${displaySpeed}/${displaySpeedLimit}`;
      renderBitmapText(bitmap, speedText, x + padding, currentY, {
        scale: valueScale,
        bold: true,
      });
      currentY += calculateBitmapTextHeight(valueScale) + 4;

      // Show unit and LIMIT label
      renderBitmapText(bitmap, `${unitLabel} LIMIT`, x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + 16;
    } else {
      // No speed limit available - show just speed
      renderBitmapText(
        bitmap,
        `${displaySpeed} ${unitLabel}`,
        x + padding,
        currentY,
        { scale: valueScale, bold: true },
      );
      currentY += calculateBitmapTextHeight(valueScale) + 20;
    }

    // Zoom level section (if available)
    if (info.zoomLevel !== undefined) {
      logger.info("renderDriveInfoPanel: step 6b - zoom label");
      renderBitmapText(bitmap, "ZOOM", x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + 4;

      logger.info("renderDriveInfoPanel: step 6c - zoom value");
      renderBitmapText(
        bitmap,
        info.zoomLevel.toString(),
        x + padding,
        currentY,
        {
          scale: valueScale,
          bold: true,
        },
      );
      currentY += calculateBitmapTextHeight(valueScale) + 20;
    }

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
    currentY += 35;

    // Background fetch indicator (loading icon)
    if (info.isBackgroundFetching) {
      logger.info("renderDriveInfoPanel: step 13 - loading indicator");
      this.drawLoadingIndicator(
        bitmap,
        x + padding,
        currentY,
        width - padding * 2,
      );
    }

    logger.info("renderDriveInfoPanel: completed all steps");
  }

  /**
   * Draw a loading indicator for background fetch activity
   */
  private drawLoadingIndicator(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    _maxWidth: number,
  ): void {
    // Draw a small loading spinner icon (circle with gap)
    const iconRadius = 8;
    const iconCenterX = x + iconRadius + 2;
    const iconCenterY = y + iconRadius;

    // Draw circle outline with a gap (like a loading spinner)
    for (let angle = 0; angle < 360; angle += 10) {
      // Skip 60 degrees to create gap effect (static spinner look)
      if (angle >= 30 && angle < 90) continue;

      const radians = (angle * Math.PI) / 180;
      const px = Math.round(iconCenterX + iconRadius * Math.cos(radians));
      const py = Math.round(iconCenterY + iconRadius * Math.sin(radians));
      this.setPixel(bitmap, px, py, true);

      // Make line thicker
      const px2 = Math.round(
        iconCenterX + (iconRadius - 1) * Math.cos(radians),
      );
      const py2 = Math.round(
        iconCenterY + (iconRadius - 1) * Math.sin(radians),
      );
      this.setPixel(bitmap, px2, py2, true);
    }

    // Draw "SYNC" text next to the icon
    const textX = iconCenterX + iconRadius + 8;
    renderBitmapText(bitmap, "SYNC", textX, y + 2, {
      scale: 1,
      bold: false,
    });
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

  /**
   * Format a waypoint label for display on the map.
   * Keeps labels short to fit on e-paper display.
   */
  private formatWaypointLabel(waypoint: DriveWaypoint): string {
    // Use street name if available, otherwise use maneuver type
    if (waypoint.streetName) {
      // Truncate long street names
      const name = waypoint.streetName.substring(0, 12);
      return name.toUpperCase();
    }

    // Format maneuver type as short label
    switch (waypoint.maneuverType) {
      case ManeuverType.LEFT:
      case ManeuverType.SLIGHT_LEFT:
      case ManeuverType.SHARP_LEFT:
        return "L";
      case ManeuverType.RIGHT:
      case ManeuverType.SLIGHT_RIGHT:
      case ManeuverType.SHARP_RIGHT:
        return "R";
      case ManeuverType.UTURN:
        return "U";
      case ManeuverType.ARRIVE:
        return "END";
      case ManeuverType.DEPART:
        return "START";
      default:
        return "";
    }
  }
}
