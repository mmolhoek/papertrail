/**
 * Unified Text Renderer
 *
 * This module provides a unified interface for text rendering that can switch
 * between Sharp (default) and ImageMagick (wasm-imagemagick) implementations.
 *
 * Set USE_IMAGEMAGICK=true environment variable to use ImageMagick instead of Sharp.
 * This is useful when Sharp causes Node.js to hang or in environments where
 * Sharp's native bindings don't work well.
 */

import { Bitmap1Bit } from "@core/types";
import { getLogger } from "@utils/logger";

// Re-export types that are common to both implementations
export type { BatchedTextItem } from "@utils/magickTextRenderer";
export type { TextRenderOptions } from "@utils/magickTextRenderer";

const logger = getLogger("UnifiedTextRenderer");

// Check environment variable once at module load time
const USE_IMAGEMAGICK = process.env.USE_IMAGEMAGICK === "true";

if (USE_IMAGEMAGICK) {
  logger.info("Using ImageMagick (wasm-imagemagick) for text rendering");
} else {
  logger.info("Using Sharp for text rendering");
}

// Dynamically import the appropriate implementation
// This avoids loading both modules when only one is needed
let magickModule: typeof import("@utils/magickTextRenderer") | null = null;
let sharpModule: typeof import("@utils/svgTextRenderer") | null = null;

async function getMagickModule() {
  if (!magickModule) {
    magickModule = await import("@utils/magickTextRenderer");
  }
  return magickModule;
}

async function getSharpModule() {
  if (!sharpModule) {
    sharpModule = await import("@utils/svgTextRenderer");
  }
  return sharpModule;
}

/**
 * Calculate approximate text width based on font size
 */
export function calculateTextWidth(
  text: string,
  fontSize: number,
  fontWeight: "normal" | "bold" = "normal",
): number {
  if (text.length === 0) return 0;

  const baseRatio = fontWeight === "bold" ? 0.75 : 0.65;
  const wideChars = "%@WMmw";
  let wideCharCount = 0;
  for (const char of text) {
    if (wideChars.includes(char)) {
      wideCharCount++;
    }
  }

  const baseWidth = text.length * fontSize * baseRatio;
  const extraWidthForWideChars = wideCharCount * fontSize * 0.3;
  const padding = 6;

  return Math.max(10, Math.ceil(baseWidth + extraWidthForWideChars) + padding);
}

/**
 * Calculate text height based on font size
 */
export function calculateTextHeight(fontSize: number): number {
  return Math.ceil(fontSize * 1.2);
}

/**
 * Render text directly onto an existing bitmap at specified position
 */
export async function renderTextOnBitmap(
  bitmap: Bitmap1Bit,
  text: string,
  x: number,
  y: number,
  options?: {
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    fontFamily?: string;
    color?: "black" | "white";
    alignment?: "left" | "center" | "right";
    backgroundColor?: "transparent" | "white" | "black";
  },
): Promise<void> {
  if (USE_IMAGEMAGICK) {
    const module = await getMagickModule();
    return module.renderTextOnBitmap(bitmap, text, x, y, options);
  } else {
    const module = await getSharpModule();
    return module.renderTextOnBitmap(bitmap, text, x, y, options);
  }
}

/**
 * Render a label with value (e.g., "SPEED", "42", "KM/H")
 */
export async function renderLabeledValueOnBitmap(
  bitmap: Bitmap1Bit,
  label: string,
  value: string | number,
  unit: string,
  x: number,
  y: number,
  options?: {
    labelSize?: number;
    valueSize?: number;
    unitSize?: number;
    alignment?: "left" | "center" | "right";
  },
): Promise<{ height: number }> {
  if (USE_IMAGEMAGICK) {
    const module = await getMagickModule();
    return module.renderLabeledValueOnBitmap(
      bitmap,
      label,
      value,
      unit,
      x,
      y,
      options,
    );
  } else {
    const module = await getSharpModule();
    return module.renderLabeledValueOnBitmap(
      bitmap,
      label,
      value,
      unit,
      x,
      y,
      options,
    );
  }
}

/**
 * Render multiple text items in a single operation
 */
export async function renderBatchedTextOnBitmap(
  bitmap: Bitmap1Bit,
  items: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontWeight?: "normal" | "bold";
  }>,
  targetX: number,
  targetY: number,
  width: number,
  height: number,
): Promise<void> {
  if (USE_IMAGEMAGICK) {
    const module = await getMagickModule();
    return module.renderBatchedTextOnBitmap(
      bitmap,
      items,
      targetX,
      targetY,
      width,
      height,
    );
  } else {
    const module = await getSharpModule();
    return module.renderBatchedTextOnBitmap(
      bitmap,
      items,
      targetX,
      targetY,
      width,
      height,
    );
  }
}

/**
 * Render multiple lines of text onto a bitmap
 */
export async function renderMultilineTextOnBitmap(
  bitmap: Bitmap1Bit,
  lines: string[],
  x: number,
  y: number,
  options?: {
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    fontFamily?: string;
    color?: "black" | "white";
    alignment?: "left" | "center" | "right";
    backgroundColor?: "transparent" | "white" | "black";
  },
): Promise<void> {
  if (USE_IMAGEMAGICK) {
    const module = await getMagickModule();
    return module.renderMultilineTextOnBitmap(bitmap, lines, x, y, options);
  } else {
    const module = await getSharpModule();
    return module.renderMultilineTextOnBitmap(bitmap, lines, x, y, options);
  }
}

/**
 * Render text to a standalone 1-bit bitmap
 */
export async function renderTextToBitmap(
  text: string,
  width: number,
  height: number,
  options?: {
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    fontFamily?: string;
    color?: "black" | "white";
    alignment?: "left" | "center" | "right";
    backgroundColor?: "transparent" | "white" | "black";
  },
): Promise<Bitmap1Bit> {
  if (USE_IMAGEMAGICK) {
    const module = await getMagickModule();
    return module.renderTextToBitmap(text, width, height, options);
  } else {
    const module = await getSharpModule();
    return module.renderTextToBitmap(text, width, height, options);
  }
}

/**
 * Composite black pixels from source bitmap onto target bitmap
 */
export function compositeBlackPixels(
  target: Bitmap1Bit,
  source: Bitmap1Bit,
  targetX: number,
  targetY: number,
): void {
  // This is pure JavaScript, same for both implementations
  const targetBytesPerRow = Math.ceil(target.width / 8);
  const sourceBytesPerRow = Math.ceil(source.width / 8);

  for (let sy = 0; sy < source.height; sy++) {
    const ty = targetY + sy;
    if (ty < 0 || ty >= target.height) continue;

    for (let sx = 0; sx < source.width; sx++) {
      const tx = targetX + sx;
      if (tx < 0 || tx >= target.width) continue;

      const sourceByteIndex = sy * sourceBytesPerRow + Math.floor(sx / 8);
      const sourceBitIndex = 7 - (sx % 8);
      const sourcePixelIsBlack =
        (source.data[sourceByteIndex] & (1 << sourceBitIndex)) === 0;

      if (sourcePixelIsBlack) {
        const targetByteIndex = ty * targetBytesPerRow + Math.floor(tx / 8);
        const targetBitIndex = 7 - (tx % 8);
        target.data[targetByteIndex] &= ~(1 << targetBitIndex);
      }
    }
  }
}

/**
 * Check which renderer is currently being used
 */
export function getRendererType(): "sharp" | "imagemagick" {
  return USE_IMAGEMAGICK ? "imagemagick" : "sharp";
}
