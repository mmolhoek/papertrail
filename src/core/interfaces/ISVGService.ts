import { Result, GPXTrack, ViewportConfig, Bitmap1Bit, RenderOptions } from '@core/types';

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
    options?: Partial<RenderOptions>
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
    options?: Partial<RenderOptions>
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
    fontSize?: number
  ): Result<Bitmap1Bit>;
  
  /**
   * Add a compass rose to indicate direction
   * @param bitmap The bitmap to modify
   * @param x X position for center
   * @param y Y position for center
   * @param radius Radius of the compass
   * @param heading Current heading in degrees
   * @returns Result containing modified bitmap or error
   */
  addCompass(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    radius: number,
    heading: number
  ): Result<Bitmap1Bit>;
  
  /**
   * Add a scale bar to the bitmap
   * @param bitmap The bitmap to modify
   * @param x X position
   * @param y Y position
   * @param width Width of the scale bar
   * @param metersPerPixel Meters per pixel at current zoom
   * @returns Result containing modified bitmap or error
   */
  addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    width: number,
    metersPerPixel: number
  ): Result<Bitmap1Bit>;
  
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
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  ): Result<Bitmap1Bit>;
  
  /**
   * Get the default render options
   * @returns Default RenderOptions
   */
  getDefaultRenderOptions(): RenderOptions;
}