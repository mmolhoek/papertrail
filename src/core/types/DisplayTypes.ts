import { GPSCoordinate } from "./GPSTypes";

/**
 * Color depth supported by e-paper displays
 */
export type ColorDepth =
  | "1bit" // Black and white only
  | "4bit-grayscale" // 16 shades of gray
  | "3color-bwr" // Black, White, Red
  | "3color-bwy"; // Black, White, Yellow

/**
 * Generic display bitmap that supports different color depths
 */
export type DisplayBitmap = {
  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;

  /** Color depth of this bitmap */
  colorDepth: ColorDepth;

  /** Primary channel data (black/white or grayscale) */
  data: Uint8Array;

  /** Secondary channel data for 3-color displays (red or yellow) */
  colorData?: Uint8Array;

  /** Optional metadata about the bitmap */
  metadata?: {
    /** Creation timestamp */
    createdAt: Date;
    /** Description of what's displayed */
    description?: string;
  };
};

/**
 * 1-bit bitmap for e-paper display
 * @deprecated Use DisplayBitmap with colorDepth: '1bit' instead
 */
export type Bitmap1Bit = {
  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;

  /** Raw bitmap data (1 bit per pixel, packed into bytes) */
  data: Uint8Array;

  /** Optional metadata about the bitmap */
  metadata?: {
    /** Creation timestamp */
    createdAt: Date;

    /** Description of what's displayed */
    description?: string;
  };
};

/**
 * Viewport configuration for rendering
 */
export type ViewportConfig = {
  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;

  /** Center point of the viewport */
  centerPoint: GPSCoordinate;

  /** Zoom level (1-20, where higher = more zoomed in) */
  zoomLevel: number;

  /** Optional rotation in degrees */
  rotation?: number;
};

/**
 * 2D point in pixel coordinates
 */
export type Point2D = {
  /** X coordinate in pixels */
  x: number;

  /** Y coordinate in pixels */
  y: number;
};

/**
 * Rectangle in pixel coordinates
 */
export type Rectangle = {
  /** X coordinate of top-left corner */
  x: number;

  /** Y coordinate of top-left corner */
  y: number;

  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;
};

/**
 * Rendering options for track visualization
 */
export type RenderOptions = {
  /** Line width for track in pixels */
  lineWidth: number;

  /** Point/dot radius in pixels */
  pointRadius: number;

  /** Whether to draw points at track coordinates */
  showPoints: boolean;

  /** Whether to draw the connecting line */
  showLine: boolean;

  /** Whether to highlight the current position */
  highlightCurrentPosition: boolean;

  /** Radius for current position marker */
  currentPositionRadius?: number;

  /** Whether to show direction indicators */
  showDirection: boolean;

  /** Spacing between direction arrows in meters */
  directionArrowSpacing?: number;

  /** Whether to apply anti-aliasing (may be slower) */
  antiAlias: boolean;

  /** Whether to rotate map so bearing/track direction points up */
  rotateWithBearing?: boolean;
};

/**
 * E-paper display configuration
 */
export type EpaperConfig = {
  /** Display width in pixels */
  width: number;

  /** Display height in pixels */
  height: number;

  /** SPI device path (legacy, use spi config instead) */
  spiDevice: string;

  /** GPIO pins for control */
  pins: {
    /** Reset pin */
    reset: number;

    /** Data/Command pin */
    dc: number;

    /** Busy pin */
    busy: number;

    /** Chip select pin (optional, may be handled by SPI) */
    cs?: number;

    /** Power control pin (optional) */
    power?: number;
  };

  /** SPI configuration */
  spi?: {
    /** SPI bus number (default: 0) */
    bus: number;

    /** SPI device number (default: 0) */
    device: number;

    /** SPI clock speed in Hz (default: 256000) */
    speed: number;
  };

  /** Display refresh mode */
  refreshMode: "full" | "partial";

  /** Whether display is rotated */
  rotation: 0 | 90 | 180 | 270;

  /** Display driver name (e.g., 'waveshare_7in5_bw') */
  driver?: string;

  /** Optional model name (for display purposes) */
  model?: string;
};

/**
 * E-paper display status
 */
export type EpaperStatus = {
  /** Whether display is initialized */
  initialized: boolean;

  /** Whether display is busy */
  busy: boolean;

  /** Whether display is in sleep mode */
  sleeping: boolean;

  /** Display model/name */
  model?: string;

  /** Display width in pixels */
  width?: number;

  /** Display height in pixels */
  height?: number;

  /** Last update timestamp */
  lastUpdate?: Date;

  /** Number of full refreshes performed */
  fullRefreshCount: number;

  /** Number of partial refreshes performed */
  partialRefreshCount: number;
};

/**
 * Display update mode
 */
export enum DisplayUpdateMode {
  /** Full refresh (slower, clears ghosting) */
  FULL = "full",

  /** Partial refresh (faster, may cause ghosting) */
  PARTIAL = "partial",

  /** Auto-select based on content changes */
  AUTO = "auto",
}

/**
 * Screen type for display rendering
 * Determines which screen layout is used for both track and drive interfaces
 */
export enum ScreenType {
  /** Track screen with 70/30 split (map + info panel) - default */
  TRACK = "track",

  /** Turn-by-turn screen with large turn arrows and distance countdown */
  TURN_BY_TURN = "turn_by_turn",
}
