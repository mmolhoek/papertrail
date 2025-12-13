/**
 * Mock for @utils/imagemagick module
 * Provides stub implementations for testing without native ImageMagick
 */

import { getLogger } from "@utils/logger";

const logger = getLogger("MockImageMagick");

/**
 * Mock convert function - does nothing in tests
 */
export async function convert(_args: string[]): Promise<void> {
  logger.debug("Mock: convert called");
}

/**
 * Mock image to grayscale conversion
 * Returns a buffer of all white pixels
 */
export async function imageToGrayscale(
  _inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  logger.debug(`Mock: imageToGrayscale ${width}x${height}`);
  const buffer = Buffer.alloc(width * height);
  buffer.fill(0xff); // All white
  return buffer;
}

/**
 * Mock image to packed bitmap conversion
 * Returns a buffer of all white pixels (packed 1-bit)
 */
export async function imageToPackedBitmap(
  _inputPath: string,
  width: number,
  height: number,
): Promise<Buffer> {
  logger.debug(`Mock: imageToPackedBitmap ${width}x${height}`);
  const bytesPerRow = Math.ceil(width / 8);
  const buffer = Buffer.alloc(bytesPerRow * height);
  buffer.fill(0xff); // All white (1 bits)
  return buffer;
}

/**
 * Mock SVG to grayscale conversion
 * Returns a buffer of all white pixels
 */
export async function svgToGrayscale(
  _svgContent: string,
  width: number,
  height: number,
): Promise<Buffer> {
  logger.debug(`Mock: svgToGrayscale ${width}x${height}`);
  const buffer = Buffer.alloc(width * height);
  buffer.fill(0xff); // All white
  return buffer;
}

/**
 * Mock SVG to packed bitmap conversion
 * Returns a buffer of all white pixels (packed 1-bit)
 */
export async function svgToPackedBitmap(
  _svgContent: string,
  width: number,
  height: number,
): Promise<Buffer> {
  logger.debug(`Mock: svgToPackedBitmap ${width}x${height}`);
  const bytesPerRow = Math.ceil(width / 8);
  const buffer = Buffer.alloc(bytesPerRow * height);
  buffer.fill(0xff); // All white (1 bits)
  return buffer;
}

/**
 * Mock grayscale to packed bitmap conversion
 */
export function grayscaleToPackedBitmap(
  grayscale: Buffer,
  width: number,
  height: number,
): Buffer {
  logger.debug(`Mock: grayscaleToPackedBitmap ${width}x${height}`);
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  const packed = Buffer.alloc(totalBytes, 0xff);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const byteIndex = y * bytesPerRow + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);

      if (pixelIndex < grayscale.length && grayscale[pixelIndex] === 0) {
        packed[byteIndex] &= ~(1 << bitIndex);
      }
    }
  }

  return packed;
}

// Minimal valid 1x1 white PNG
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00,
  0x00, 0x00, 0x00, 0xfa, 0x27, 0x9d, 0x50, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0xff, 0x00, 0x05, 0xfe, 0x02,
  0xfe, 0xa6, 0x8c, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

/**
 * Mock grayscale to PNG conversion
 * Returns a minimal valid PNG
 */
export async function grayscaleToPng(
  _grayscale: Buffer,
  _width: number,
  _height: number,
): Promise<Buffer> {
  logger.debug("Mock: grayscaleToPng");
  return Buffer.from(MINIMAL_PNG);
}

/**
 * Mock packed bitmap to PNG conversion
 * Returns a minimal valid PNG
 */
export async function packedBitmapToPng(
  _packed: Buffer | Uint8Array,
  _width: number,
  _height: number,
): Promise<Buffer> {
  logger.debug("Mock: packedBitmapToPng");
  return Buffer.from(MINIMAL_PNG);
}

/**
 * Mock PNG resize with nearest-neighbor
 * Returns a minimal valid PNG
 */
export async function resizePngNoAntialias(
  _pngBuffer: Buffer,
  _targetWidth: number,
  _targetHeight: number,
): Promise<Buffer> {
  logger.debug("Mock: resizePngNoAntialias");
  return Buffer.from(MINIMAL_PNG);
}

/**
 * Mock PNG to packed bitmap conversion
 * Returns a buffer of all white pixels (packed 1-bit)
 */
export async function pngToPackedBitmap(
  _pngBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  logger.debug(`Mock: pngToPackedBitmap ${width}x${height}`);
  const bytesPerRow = Math.ceil(width / 8);
  const buffer = Buffer.alloc(bytesPerRow * height);
  buffer.fill(0xff); // All white (1 bits)
  return buffer;
}
