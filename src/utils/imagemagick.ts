/**
 * Native ImageMagick CLI Wrapper
 *
 * Provides a simple interface to execute ImageMagick commands using the
 * native CLI tool via child_process. This is more efficient than the
 * WebAssembly version and leverages the system-installed ImageMagick.
 *
 * Requires ImageMagick to be installed on the system:
 * - Linux: apt install imagemagick
 * - macOS: brew install imagemagick
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getLogger } from "@utils/logger";

const execAsync = promisify(exec);
const logger = getLogger("ImageMagick");

// Track temporary files for cleanup
const tempFiles: Set<string> = new Set();

/**
 * Generate a unique temporary file path
 */
function getTempFilePath(extension: string): string {
  const tempDir = os.tmpdir();
  const filename = `papertrail_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${extension}`;
  return path.join(tempDir, filename);
}

/**
 * Clean up a temporary file
 */
async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      tempFiles.delete(filePath);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup temp file ${filePath}: ${error}`);
  }
}

/**
 * Clean up all tracked temporary files
 */
export async function cleanupAllTempFiles(): Promise<void> {
  for (const filePath of tempFiles) {
    await cleanupTempFile(filePath);
  }
  tempFiles.clear();
}

/**
 * Check if ImageMagick is installed and available
 */
export async function isImageMagickAvailable(): Promise<boolean> {
  try {
    await execAsync("convert -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute an ImageMagick convert command
 *
 * @param args Array of command-line arguments for 'convert'
 * @returns Promise that resolves when command completes
 */
export async function convert(args: string[]): Promise<void> {
  const command = `convert ${args.map((a) => `"${a}"`).join(" ")}`;
  logger.debug(`Executing: ${command}`);

  try {
    const { stderr } = await execAsync(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large images
    });

    if (stderr && !stderr.includes("warning")) {
      logger.warn(`ImageMagick stderr: ${stderr}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`ImageMagick convert failed: ${errorMsg}`);
    throw new Error(`ImageMagick convert failed: ${errorMsg}`);
  }
}

/**
 * Convert an image file to raw grayscale pixels
 *
 * @param inputPath Path to input image
 * @param width Target width
 * @param height Target height
 * @returns Buffer containing raw 8-bit grayscale pixels
 */
export async function imageToGrayscale(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const outputPath = getTempFilePath(".gray");
  tempFiles.add(outputPath);

  try {
    await convert([
      inputPath,
      "-resize",
      `${width}x${height}!`,
      "-colorspace",
      "Gray",
      "-depth",
      "8",
      `GRAY:${outputPath}`,
    ]);

    const buffer = fs.readFileSync(outputPath);
    return buffer;
  } finally {
    await cleanupTempFile(outputPath);
  }
}

/**
 * Convert an image file to 1-bit packed bitmap
 *
 * @param inputPath Path to input image
 * @param width Target width
 * @param height Target height
 * @returns Buffer containing packed 1-bit bitmap (MSB first)
 */
export async function imageToPackedBitmap(
  inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const grayscale = await imageToGrayscale(inputPath, width, height);
  return grayscaleToPackedBitmap(grayscale, width, height);
}

/**
 * Convert SVG string to raw grayscale pixels
 *
 * @param svgContent SVG content as string
 * @param width Target width
 * @param height Target height
 * @returns Buffer containing raw 8-bit grayscale pixels
 */
export async function svgToGrayscale(
  svgContent: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const inputPath = getTempFilePath(".svg");
  const outputPath = getTempFilePath(".gray");
  tempFiles.add(inputPath);
  tempFiles.add(outputPath);

  try {
    // Write SVG to temp file
    fs.writeFileSync(inputPath, svgContent);

    // Convert SVG to grayscale bitmap
    // -background white ensures transparent areas are filled with white
    await convert([
      "-background",
      "white",
      inputPath,
      "-resize",
      `${width}x${height}!`,
      "-colorspace",
      "Gray",
      "-threshold",
      "50%",
      "-depth",
      "8",
      `GRAY:${outputPath}`,
    ]);

    const buffer = fs.readFileSync(outputPath);
    return buffer;
  } finally {
    await cleanupTempFile(inputPath);
    await cleanupTempFile(outputPath);
  }
}

/**
 * Convert SVG string to 1-bit packed bitmap
 *
 * @param svgContent SVG content as string
 * @param width Target width
 * @param height Target height
 * @returns Buffer containing packed 1-bit bitmap (MSB first)
 */
export async function svgToPackedBitmap(
  svgContent: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const grayscale = await svgToGrayscale(svgContent, width, height);
  return grayscaleToPackedBitmap(grayscale, width, height);
}

/**
 * Convert raw grayscale buffer to 1-bit packed bitmap
 *
 * @param grayscale Buffer of 8-bit grayscale pixels
 * @param width Image width
 * @param height Image height
 * @returns Buffer containing packed 1-bit bitmap (MSB first)
 */
export function grayscaleToPackedBitmap(
  grayscale: Buffer,
  width: number,
  height: number,
): Buffer {
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  const packed = Buffer.alloc(totalBytes, 0xff); // Start with all white

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const byteIndex = y * bytesPerRow + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);

      // If pixel is black (value 0 in grayscale after threshold)
      if (pixelIndex < grayscale.length && grayscale[pixelIndex] === 0) {
        packed[byteIndex] &= ~(1 << bitIndex);
      }
    }
  }

  return packed;
}

/**
 * Convert raw grayscale buffer to PNG
 *
 * @param grayscale Buffer of 8-bit grayscale pixels
 * @param width Image width
 * @param height Image height
 * @returns Buffer containing PNG data
 */
export async function grayscaleToPng(
  grayscale: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const inputPath = getTempFilePath(".gray");
  const outputPath = getTempFilePath(".png");
  tempFiles.add(inputPath);
  tempFiles.add(outputPath);

  try {
    // Write grayscale data to temp file
    fs.writeFileSync(inputPath, grayscale);

    await convert([
      "-size",
      `${width}x${height}`,
      "-depth",
      "8",
      `GRAY:${inputPath}`,
      outputPath,
    ]);

    const buffer = fs.readFileSync(outputPath);
    return buffer;
  } finally {
    await cleanupTempFile(inputPath);
    await cleanupTempFile(outputPath);
  }
}

/**
 * Convert 1-bit packed bitmap to PNG
 *
 * @param packed Buffer of packed 1-bit pixels (MSB first)
 * @param width Image width
 * @param height Image height
 * @returns Buffer containing PNG data
 */
export async function packedBitmapToPng(
  packed: Buffer | Uint8Array,
  width: number,
  height: number,
): Promise<Buffer> {
  // First convert packed 1-bit to 8-bit grayscale
  const grayscale = Buffer.alloc(width * height);
  const bytesPerRow = Math.ceil(width / 8);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const byteIndex = y * bytesPerRow + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);

      const bit = (packed[byteIndex] >> bitIndex) & 1;
      // 1 = white (255), 0 = black (0)
      grayscale[pixelIndex] = bit ? 255 : 0;
    }
  }

  return grayscaleToPng(grayscale, width, height);
}

/**
 * Convert raw RGBA buffer to 1-bit packed bitmap
 *
 * @param rgba Buffer of RGBA pixels
 * @param sourceWidth Source image width
 * @param sourceHeight Source image height
 * @param targetWidth Target width
 * @param targetHeight Target height
 * @returns Buffer containing packed 1-bit bitmap (MSB first)
 */
export async function rgbaToPackedBitmap(
  rgba: Buffer | Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  const inputPath = getTempFilePath(".rgba");
  const outputPath = getTempFilePath(".gray");
  tempFiles.add(inputPath);
  tempFiles.add(outputPath);

  try {
    // Write RGBA data to temp file
    fs.writeFileSync(inputPath, Buffer.from(rgba));

    await convert([
      "-size",
      `${sourceWidth}x${sourceHeight}`,
      "-depth",
      "8",
      `RGBA:${inputPath}`,
      "-resize",
      `${targetWidth}x${targetHeight}`,
      "-colorspace",
      "Gray",
      "-threshold",
      "50%",
      "-depth",
      "8",
      `GRAY:${outputPath}`,
    ]);

    const grayscale = fs.readFileSync(outputPath);
    return grayscaleToPackedBitmap(grayscale, targetWidth, targetHeight);
  } finally {
    await cleanupTempFile(inputPath);
    await cleanupTempFile(outputPath);
  }
}

/**
 * Resize a PNG image using nearest-neighbor interpolation (no anti-aliasing)
 * This is essential for crisp QR codes and pixel art
 *
 * @param pngBuffer Input PNG data
 * @param targetWidth Target width
 * @param targetHeight Target height
 * @returns Buffer containing resized PNG data
 */
export async function resizePngNoAntialias(
  pngBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  const inputPath = getTempFilePath(".png");
  const outputPath = getTempFilePath(".png");
  tempFiles.add(inputPath);
  tempFiles.add(outputPath);

  try {
    // Write input PNG to temp file
    fs.writeFileSync(inputPath, pngBuffer);

    // Resize using point filter (nearest-neighbor) to avoid anti-aliasing
    // Use ! to force exact dimensions (ignore aspect ratio)
    await convert([
      inputPath,
      "-filter",
      "point",
      "-resize",
      `${targetWidth}x${targetHeight}!`,
      outputPath,
    ]);

    const buffer = fs.readFileSync(outputPath);
    logger.debug(
      `Resized PNG with nearest-neighbor: ${targetWidth}x${targetHeight}`,
    );
    return buffer;
  } finally {
    await cleanupTempFile(inputPath);
    await cleanupTempFile(outputPath);
  }
}

/**
 * Convert a PNG image to 1-bit packed bitmap
 *
 * @param pngBuffer Input PNG data
 * @param width Image width
 * @param height Image height
 * @returns Buffer containing packed 1-bit bitmap (MSB first)
 */
export async function pngToPackedBitmap(
  pngBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const inputPath = getTempFilePath(".png");
  const outputPath = getTempFilePath(".gray");
  tempFiles.add(inputPath);
  tempFiles.add(outputPath);

  try {
    // Write input PNG to temp file
    fs.writeFileSync(inputPath, pngBuffer);

    // Convert to grayscale with threshold
    await convert([
      inputPath,
      "-colorspace",
      "Gray",
      "-threshold",
      "50%",
      "-depth",
      "8",
      `GRAY:${outputPath}`,
    ]);

    const grayscale = fs.readFileSync(outputPath);
    return grayscaleToPackedBitmap(grayscale, width, height);
  } finally {
    await cleanupTempFile(inputPath);
    await cleanupTempFile(outputPath);
  }
}
