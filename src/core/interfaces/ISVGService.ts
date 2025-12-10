import {
  Result,
  GPXTrack,
  GPSCoordinate,
  ViewportConfig,
  Bitmap1Bit,
  RenderOptions,
  ManeuverType,
  DriveRoute,
  DriveWaypoint,
} from "@core/types";

/**
 * Follow Track screen info for the split layout display
 */
export interface FollowTrackInfo {
  /** Current speed in km/h */
  speed: number;
  /** Number of satellites in use */
  satellites: number;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Current bearing/heading in degrees (used for compass rotation) */
  bearing?: number;
  /** Distance remaining in meters */
  distanceRemaining?: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
}

/**
 * Drive navigation screen info for turn-by-turn display
 */
export interface DriveNavigationInfo {
  /** Current speed in km/h */
  speed: number;
  /** Number of satellites in use */
  satellites: number;
  /** Next turn maneuver type */
  nextManeuver: ManeuverType;
  /** Distance to next turn in meters */
  distanceToTurn: number;
  /** Turn instruction text */
  instruction: string;
  /** Street name after the turn */
  streetName?: string;
  /** Total distance remaining in meters */
  distanceRemaining: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Estimated time remaining in seconds */
  timeRemaining?: number;
}

/**
 * SVG Service Interface
 *
 * Responsible for rendering GPX tracks to 1-bit bitmaps for e-paper display.
 * Stateless - all rendering parameters passed in.
 */
export interface ISVGService {
  /**
   * Render a viewport with a GPX track centered on a coordinate
   * @param track The GPX track to render
   * @param viewport Viewport configuration including center point and zoom
   * @param options Optional rendering options (uses defaults if not provided)
   * @returns Result containing 1-bit bitmap or error
   */
  renderViewport(
    track: GPXTrack,
    viewport: ViewportConfig,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Render multiple tracks in the same viewport
   * @param tracks Array of GPX tracks to render
   * @param viewport Viewport configuration
   * @param options Optional rendering options
   * @returns Result containing 1-bit bitmap or error
   */
  renderMultipleTracks(
    tracks: GPXTrack[],
    viewport: ViewportConfig,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Create a blank bitmap of specified dimensions
   * @param width Width in pixels
   * @param height Height in pixels
   * @param fill Fill color (true = black, false = white)
   * @returns 1-bit bitmap
   */
  createBlankBitmap(width: number, height: number, fill?: boolean): Bitmap1Bit;

  /**
   * Add text to a bitmap
   * @param bitmap The bitmap to modify
   * @param text Text to add
   * @param x X position
   * @param y Y position
   * @param fontSize Font size in pixels
   * @returns Result containing modified bitmap or error
   */
  addText(
    bitmap: Bitmap1Bit,
    text: string,
    x: number,
    y: number,
    fontSize?: number,
  ): Result<Bitmap1Bit>;

  /**
   * Add a compass rose to indicate direction
   * Uses SVG-based text rendering for labels
   * @param bitmap The bitmap to modify
   * @param x X position for center
   * @param y Y position for center
   * @param radius Radius of the compass
   * @param heading Current heading in degrees
   * @returns Promise of Result containing modified bitmap or error
   */
  addCompass(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    radius: number,
    heading: number,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Add a scale bar to the bitmap
   * Uses SVG-based text rendering for distance labels
   * @param bitmap The bitmap to modify
   * @param x X position
   * @param y Y position
   * @param width Width of the scale bar
   * @param metersPerPixel Meters per pixel at current zoom
   * @returns Promise of Result containing modified bitmap or error
   */
  addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    metersPerPixel: number,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Overlay information panel on the bitmap
   * @param bitmap The bitmap to modify
   * @param info Information to display (speed, distance, etc.)
   * @param position Position of the panel ('top-left', 'top-right', 'bottom-left', 'bottom-right')
   * @returns Result containing modified bitmap or error
   */
  addInfoPanel(
    bitmap: Bitmap1Bit,
    info: {
      speed?: string;
      distance?: string;
      elevation?: string;
      time?: string;
    },
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  ): Result<Bitmap1Bit>;

  /**
   * Get the default render options
   * @returns Default RenderOptions
   */
  getDefaultRenderOptions(): RenderOptions;

  /**
   * Render the "Follow Track" screen with 80/20 split layout
   * Left area (80%): Track map centered on current position
   * Right area (20%): Speed and satellite information
   * @param track The GPX track being followed
   * @param currentPosition Current GPS position
   * @param viewport Viewport configuration for the map area
   * @param info Information to display in the info panel (speed, satellites, etc.)
   * @param options Optional rendering options
   * @returns Result containing 1-bit bitmap or error
   */
  renderFollowTrackScreen(
    track: GPXTrack,
    currentPosition: GPSCoordinate,
    viewport: ViewportConfig,
    info: FollowTrackInfo,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Turn information for rendering
   */
  /**
   * Render full-screen turn display for drive navigation
   * Shows large turn arrow, distance countdown, and instruction text
   * If nextTurn is provided, displays both turns side-by-side with "THEN" between
   * @param maneuverType Type of turn/maneuver
   * @param distance Distance to turn in meters
   * @param instruction Turn instruction text
   * @param streetName Optional street name
   * @param viewport Viewport configuration for dimensions
   * @param nextTurn Optional next turn info to show after the current turn
   * @returns Result containing 1-bit bitmap or error
   */
  renderTurnScreen(
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
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Render drive navigation map screen with turn overlay
   * Shows map with route, current position, and turn info overlay
   * @param route The drive route
   * @param currentPosition Current GPS position
   * @param nextWaypoint The next upcoming turn/waypoint
   * @param viewport Viewport configuration
   * @param info Navigation info for the overlay
   * @param options Optional rendering options
   * @returns Result containing 1-bit bitmap or error
   */
  renderDriveMapScreen(
    route: DriveRoute,
    currentPosition: GPSCoordinate,
    nextWaypoint: DriveWaypoint,
    viewport: ViewportConfig,
    info: DriveNavigationInfo,
    options?: Partial<RenderOptions>,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Render off-road arrow screen for drive navigation
   * Shows arrow pointing to route start with distance
   * @param bearing Bearing to route start in degrees
   * @param distance Distance to route start in meters
   * @param viewport Viewport configuration for dimensions
   * @returns Result containing 1-bit bitmap or error
   */
  renderOffRoadScreen(
    bearing: number,
    distance: number,
    viewport: ViewportConfig,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Render arrival screen for drive navigation
   * Shows destination reached message
   * @param destination Destination name/address
   * @param viewport Viewport configuration for dimensions
   * @returns Result containing 1-bit bitmap or error
   */
  renderArrivalScreen(
    destination: string,
    viewport: ViewportConfig,
  ): Promise<Result<Bitmap1Bit>>;
}
