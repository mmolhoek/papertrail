import { IEpaperService } from "@core/interfaces";
import {
  Result,
  Bitmap1Bit,
  EpaperStatus,
  EpaperConfig,
  DisplayUpdateMode,
  success,
  failure,
} from "@core/types";
import { DisplayError, DisplayErrorCode } from "@core/errors";
import { getLogger } from "@utils/logger";

const logger = getLogger("MockEpaperService");

// Check if we should use ImageMagick instead of Sharp
const USE_IMAGEMAGICK = process.env.USE_IMAGEMAGICK === "true";

// Lazy load Sharp only when needed
let sharpModule: typeof import("sharp") | null = null;
async function getSharp(): Promise<typeof import("sharp")> {
  if (!sharpModule) {
    sharpModule = (await import("sharp")).default;
  }
  return sharpModule;
}

// Lazy load wasm-imagemagick only when needed
let wasmImagemagick: any = null;
async function getWasmImagemagick(): Promise<any> {
  if (!wasmImagemagick) {
    wasmImagemagick = await import("wasm-imagemagick");
  }
  return wasmImagemagick;
}

/**
 * Mock E-Paper Service for development and testing
 * Simulates e-paper display operations without requiring actual hardware
 *
 * Provides realistic mock behavior including:
 * - Display update simulation with delays
 * - Busy state management
 * - Sleep/wake state tracking
 * - Refresh count tracking (full vs partial)
 * - Bitmap validation
 */
export class MockEpaperService implements IEpaperService {
  private initialized = false;
  private sleeping = false;
  private busy = false;
  private fullRefreshCount = 0;
  private partialRefreshCount = 0;
  private lastUpdate: Date | null = null;
  private rotation: 0 | 90 | 180 | 270;
  private lastBitmap: Bitmap1Bit | null = null;
  private lastBitmapPng: Buffer | null = null;

  constructor(private readonly config: EpaperConfig) {
    this.rotation = config.rotation;
    logger.info("Mock E-Paper Service created (for development/testing)");
    logger.info(`Mock E-Paper: Display model ${this.getDisplayModel()}`);
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return success(undefined);
    }

    logger.info(
      `Initializing Mock E-Paper Service (${this.getDisplayModel()})...`,
    );
    await this.delay(100);

    this.initialized = true;
    this.sleeping = false;
    this.busy = false;

    logger.info("Mock E-Paper Service initialized");
    return success(undefined);
  }
  async displayLogo(
    mode: DisplayUpdateMode = DisplayUpdateMode.FULL,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Displaying logo...");

    try {
      this.busy = true;

      // Simulate logo display delay
      const updateDelay = mode === DisplayUpdateMode.FULL ? 2000 : 500;
      await this.delay(updateDelay);

      // Update statistics
      if (mode === DisplayUpdateMode.FULL) {
        this.fullRefreshCount++;
      } else if (mode === DisplayUpdateMode.PARTIAL) {
        this.partialRefreshCount++;
      }

      this.lastUpdate = new Date();
      logger.info("Mock E-Paper: Logo displayed successfully");
      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Display logo failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  async dispose(): Promise<void> {
    logger.info("Disposing Mock E-Paper Service...");

    if (!this.sleeping && this.initialized) {
      logger.info("Mock E-Paper: Putting display to sleep before disposing");
      await this.sleep();
    }

    this.initialized = false;
    this.busy = false;
    logger.info("Mock E-Paper Service disposed");
  }

  async displayBitmap(
    bitmap: Bitmap1Bit,
    mode: DisplayUpdateMode = DisplayUpdateMode.AUTO,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    if (this.sleeping) {
      return failure(
        new DisplayError(
          "Display is sleeping. Call wake() first.",
          DisplayErrorCode.DISPLAY_SLEEPING,
          true,
        ),
      );
    }

    if (this.busy) {
      return failure(DisplayError.displayBusy());
    }

    // Validate bitmap dimensions
    if (
      bitmap.width !== this.config.width ||
      bitmap.height !== this.config.height
    ) {
      return failure(
        DisplayError.sizeMismatch(
          bitmap.width,
          bitmap.height,
          this.config.width,
          this.config.height,
        ),
      );
    }

    try {
      this.busy = true;

      // Determine update mode
      const updateMode =
        mode === DisplayUpdateMode.AUTO ? this.determineUpdateMode() : mode;

      logger.info(
        `Mock E-Paper: Displaying bitmap (${bitmap.width}x${bitmap.height}, ${bitmap.data.length} bytes, ${updateMode} mode)`,
      );

      // Simulate display update delay
      const updateDelay = updateMode === DisplayUpdateMode.FULL ? 2000 : 500;
      await this.delay(updateDelay);

      // Update statistics
      if (updateMode === DisplayUpdateMode.FULL) {
        this.fullRefreshCount++;
      } else if (updateMode === DisplayUpdateMode.PARTIAL) {
        this.partialRefreshCount++;
      }

      this.lastUpdate = new Date();
      logger.info(
        `Mock E-Paper: Bitmap displayed successfully (${updateMode} update)`,
      );

      // Store the bitmap and convert to PNG for mock display viewing
      this.lastBitmap = bitmap;
      await this.convertBitmapToPng(bitmap);

      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Display bitmap failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  async displayBitmapFromFile(
    filePath: string,
    mode: DisplayUpdateMode = DisplayUpdateMode.FULL,
  ): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info(`Mock E-Paper: Loading and displaying image from: ${filePath}`);

    try {
      // Simulate file loading delay
      await this.delay(200);

      // Create a mock bitmap
      const mockBitmap: Bitmap1Bit = {
        width: this.config.width,
        height: this.config.height,
        data: new Uint8Array(
          Math.ceil((this.config.width * this.config.height) / 8),
        ),
      };

      // Display the mock bitmap
      return await this.displayBitmap(mockBitmap, mode);
    } catch (error) {
      logger.error(
        `Mock E-Paper: Failed to load and display image from ${filePath}:`,
        error,
      );
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    }
  }

  async clear(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Clearing display...");

    try {
      this.busy = true;

      // Simulate clear operation delay
      await this.delay(2000);

      this.fullRefreshCount++;
      this.lastUpdate = new Date();

      logger.info("Mock E-Paper: Display cleared");
      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Clear failed:", error);
      if (error instanceof Error) {
        return failure(DisplayError.updateFailed(error));
      }
      return failure(DisplayError.updateFailed(new Error("Unknown error")));
    } finally {
      this.busy = false;
    }
  }

  async fullRefresh(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Performing full refresh...");

    try {
      this.busy = true;

      // Simulate full refresh delay
      await this.delay(2000);

      this.fullRefreshCount++;
      this.lastUpdate = new Date();

      logger.info("Mock E-Paper: Full refresh completed");
      return success(undefined);
    } catch (error) {
      logger.error("Mock E-Paper: Full refresh failed:", error);
      if (error instanceof Error) {
        return failure(
          new DisplayError(
            `Full refresh failed: ${error.message}`,
            DisplayErrorCode.REFRESH_FAILED,
            true,
          ),
        );
      }
      return failure(
        new DisplayError(
          "Full refresh failed: Unknown error",
          DisplayErrorCode.REFRESH_FAILED,
          true,
        ),
      );
    } finally {
      this.busy = false;
    }
  }

  async sleep(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    if (this.sleeping) {
      logger.info("Mock E-Paper: Display already sleeping");
      return success(undefined);
    }

    logger.info("Mock E-Paper: Putting display to sleep...");
    await this.delay(100);

    this.sleeping = true;
    this.busy = false;

    logger.info("Mock E-Paper: Display is now sleeping");
    return success(undefined);
  }

  async wake(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    if (!this.sleeping) {
      logger.info("Mock E-Paper: Display is not sleeping");
      return success(undefined);
    }

    logger.info("Mock E-Paper: Waking display...");
    await this.delay(100);

    this.sleeping = false;

    logger.info("Mock E-Paper: Display is now awake");
    return success(undefined);
  }

  async getStatus(): Promise<Result<EpaperStatus>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    const status: EpaperStatus = {
      initialized: this.initialized,
      busy: this.busy,
      sleeping: this.sleeping,
      model: this.getDisplayModel(),
      width: this.config.width,
      height: this.config.height,
      lastUpdate: this.lastUpdate || undefined,
      fullRefreshCount: this.fullRefreshCount,
      partialRefreshCount: this.partialRefreshCount,
    };

    logger.info("Mock E-Paper: Status retrieved", status);
    return success(status);
  }

  isBusy(): boolean {
    return this.busy;
  }

  async waitUntilReady(timeoutMs: number = 5000): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info(
      `Mock E-Paper: Waiting for display to become ready (timeout: ${timeoutMs}ms)...`,
    );

    const startTime = Date.now();

    while (this.busy && Date.now() - startTime < timeoutMs) {
      await this.delay(100);
    }

    if (this.busy) {
      logger.error("Mock E-Paper: Timeout waiting for display to become ready");
      return failure(DisplayError.timeout("waitUntilReady", timeoutMs));
    }

    logger.info("Mock E-Paper: Display is ready");
    return success(undefined);
  }

  setRotation(rotation: 0 | 90 | 180 | 270): Result<void> {
    logger.info(`Mock E-Paper: Setting rotation to ${rotation}°`);
    this.rotation = rotation;
    return success(undefined);
  }

  getDimensions(): { width: number; height: number } {
    // Account for rotation
    if (this.rotation === 90 || this.rotation === 270) {
      return {
        width: this.config.height,
        height: this.config.width,
      };
    }
    return {
      width: this.config.width,
      height: this.config.height,
    };
  }

  async reset(): Promise<Result<void>> {
    if (!this.initialized) {
      return failure(DisplayError.notInitialized());
    }

    logger.info("Mock E-Paper: Resetting display...");
    await this.delay(100);

    this.busy = false;
    this.sleeping = false;

    logger.info("Mock E-Paper: Display reset completed");
    return success(undefined);
  }

  /**
   * Get the last displayed image as a PNG buffer
   * This is only available in MockEpaperService for development/testing
   * @returns PNG buffer or null if no image has been displayed
   */
  getMockDisplayImage(): Buffer | null {
    return this.lastBitmapPng;
  }

  /**
   * Check if a mock display image is available
   */
  hasMockDisplayImage(): boolean {
    return this.lastBitmapPng !== null;
  }

  /**
   * Convert 1-bit bitmap to PNG for viewing in web UI
   * The bitmap is packed 1 bit per pixel (MSB first)
   */
  private async convertBitmapToPng(bitmap: Bitmap1Bit): Promise<void> {
    try {
      logger.info(
        `Mock E-Paper: Converting ${bitmap.width}x${bitmap.height} bitmap to PNG (using ${USE_IMAGEMAGICK ? "ImageMagick" : "Sharp"})...`,
      );

      // Create a grayscale buffer from the 1-bit bitmap
      // Each byte in the bitmap contains 8 pixels (MSB first)
      const grayBuffer = Buffer.alloc(bitmap.width * bitmap.height);

      for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
          const pixelIndex = y * bitmap.width + x;
          const byteIndex = Math.floor(pixelIndex / 8);
          const bitOffset = 7 - (pixelIndex % 8); // MSB first

          const bit = (bitmap.data[byteIndex] >> bitOffset) & 1;
          // 1 = white (255), 0 = black (0) for e-paper
          grayBuffer[pixelIndex] = bit ? 255 : 0;
        }
      }

      if (USE_IMAGEMAGICK) {
        // Convert to PNG using ImageMagick (WebAssembly)
        this.lastBitmapPng = await this.convertWithImageMagick(
          grayBuffer,
          bitmap.width,
          bitmap.height,
        );
      } else {
        // Convert to PNG using Sharp
        const sharp = await getSharp();
        this.lastBitmapPng = await sharp(grayBuffer, {
          raw: {
            width: bitmap.width,
            height: bitmap.height,
            channels: 1,
          },
        })
          .png()
          .toBuffer();
      }

      logger.info(
        `Mock E-Paper: PNG created (${this.lastBitmapPng?.length || 0} bytes)`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        `Mock E-Paper: Failed to convert bitmap to PNG: ${errorMsg}`,
      );
      this.lastBitmapPng = null;
    }
  }

  /**
   * Convert grayscale buffer to PNG using ImageMagick WebAssembly
   */
  private async convertWithImageMagick(
    grayBuffer: Buffer,
    width: number,
    height: number,
  ): Promise<Buffer | null> {
    try {
      const { call, buildInputFile } = await getWasmImagemagick();

      // Create input file from raw grayscale data
      const inputFile = await buildInputFile(grayBuffer, "input.gray");

      // Convert grayscale to PNG
      const result = await call(
        [inputFile],
        [
          "-size",
          `${width}x${height}`,
          "-depth",
          "8",
          "gray:input.gray",
          "output.png",
        ],
      );

      if (result.outputFiles && result.outputFiles.length > 0) {
        return Buffer.from(result.outputFiles[0].buffer);
      }

      logger.error("Mock E-Paper: ImageMagick produced no output");
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Mock E-Paper: ImageMagick conversion failed: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Get the display model name
   */
  private getDisplayModel(): string {
    if (this.config.model) {
      return this.config.model;
    }
    return `${this.config.width}×${this.config.height}`;
  }

  /**
   * Determine whether to use full or partial update
   * Full refresh every 10 updates to prevent ghosting
   */
  private determineUpdateMode(): DisplayUpdateMode {
    const totalUpdates = this.fullRefreshCount + this.partialRefreshCount;

    // Do a full refresh every 10 updates
    if (totalUpdates > 0 && totalUpdates % 10 === 0) {
      return DisplayUpdateMode.FULL;
    }
    return DisplayUpdateMode.PARTIAL;
  }

  /**
   * Simulate async delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
