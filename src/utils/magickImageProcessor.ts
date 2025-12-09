/**
 * ImageMagick-based Image Processor
 *
 * Image processing using native ImageMagick CLI.
 * This module provides functions for loading images, resizing, and
 * converting to 1-bit bitmap format for e-paper displays.
 */

import { getLogger } from "@utils/logger";
import * as imagemagick from "@utils/imagemagick";

const logger = getLogger("MagickImageProcessor");

/**
 * Load an image file and convert it to 1-bit packed bitmap format
 * suitable for e-paper display
 */
export async function loadImageToBuffer(
  imagePath: string,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  const startTime = Date.now();
  logger.info(
    `Loading image: ${imagePath}, target size: ${targetWidth}x${targetHeight}`,
  );

  const packed = await imagemagick.imageToPackedBitmap(
    imagePath,
    targetWidth,
    targetHeight,
  );

  logger.info(`Image loaded and processed in ${Date.now() - startTime}ms`);
  return packed;
}

/**
 * Load an image from buffer (e.g., BMP data) and convert to 1-bit packed format
 */
export async function processImageBuffer(
  imageData: Buffer | Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  channels: number = 4,
): Promise<Buffer> {
  const startTime = Date.now();
  logger.debug(
    `Processing image buffer: ${sourceWidth}x${sourceHeight} -> ${targetWidth}x${targetHeight}`,
  );

  // For RGBA data, use the rgbaToPackedBitmap function
  if (channels === 4) {
    const packed = await imagemagick.rgbaToPackedBitmap(
      imageData,
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
    );
    logger.debug(`Image buffer processed in ${Date.now() - startTime}ms`);
    return packed;
  }

  // For other channel counts, we need to handle differently
  // For now, assume grayscale (1 channel) or RGB (3 channels)
  logger.warn(
    `Unsupported channel count ${channels}, treating as grayscale after threshold`,
  );
  const grayscale = Buffer.from(imageData);
  return imagemagick.grayscaleToPackedBitmap(
    grayscale,
    targetWidth,
    targetHeight,
  );
}

/**
 * Resize an image and convert to raw grayscale buffer
 * Returns raw 8-bit grayscale pixels (not packed)
 */
export async function resizeToGrayscale(
  imagePath: string,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  const startTime = Date.now();

  const grayscale = await imagemagick.imageToGrayscale(
    imagePath,
    targetWidth,
    targetHeight,
  );

  logger.debug(`Image resized to grayscale in ${Date.now() - startTime}ms`);
  return grayscale;
}

/**
 * Convert BMP data to 1-bit packed bitmap
 */
export async function bmpToPackedBitmap(
  bmpData: Buffer,
  bmpWidth: number,
  bmpHeight: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  // BMP data from bmp-js is RGBA format
  return processImageBuffer(
    bmpData,
    bmpWidth,
    bmpHeight,
    targetWidth,
    targetHeight,
    4,
  );
}
