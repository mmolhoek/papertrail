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
