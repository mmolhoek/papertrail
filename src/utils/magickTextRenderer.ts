import { Bitmap1Bit } from "@core/types";
import { getLogger } from "@utils/logger";
import * as imagemagick from "@utils/imagemagick";

const logger = getLogger("MagickTextRenderer");

/**
 * Text rendering options for ImageMagick-based text
 */
export interface TextRenderOptions {
  /** Font size in pixels */
  fontSize: number;
  /** Font weight */
  fontWeight?: "normal" | "bold";
  /** Font family */
  fontFamily?: string;
  /** Text color (for rendering, will be converted to black/white) */
  color?: "black" | "white";
  /** Text alignment */
  alignment?: "left" | "center" | "right";
  /** Background color */
  backgroundColor?: "transparent" | "white" | "black";
}

/**
 * Default text render options
 */
const defaultOptions: Required<TextRenderOptions> = {
  fontSize: 14,
  fontWeight: "normal",
  fontFamily: "Arial",
  color: "black",
  alignment: "left",
  backgroundColor: "transparent",
};

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
 * Generate SVG string for text rendering
 */
function generateTextSvg(
  text: string,
  width: number,
  height: number,
  options: Required<TextRenderOptions>,
): string {
  const bgColor = options.backgroundColor === "black" ? "black" : "white";
  const textColor = options.color;

  let xPosition: number;
  let anchor: string;

  switch (options.alignment) {
    case "center":
      xPosition = width / 2;
      anchor = "middle";
      break;
    case "right":
      xPosition = width - 2;
      anchor = "end";
      break;
    default:
      xPosition = 2;
      anchor = "start";
  }

  const yPosition = height / 2 + options.fontSize * 0.35;

  // Escape XML special characters
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bgColor}"/>
    <text x="${xPosition}" y="${yPosition}"
          font-family="${options.fontFamily}"
          font-size="${options.fontSize}"
          font-weight="${options.fontWeight}"
          text-anchor="${anchor}"
          fill="${textColor}">${escapedText}</text>
  </svg>`;
}

/**
 * Convert SVG to 1-bit bitmap using native ImageMagick
 */
async function svgToBitmapMagick(
  svgString: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const startTime = Date.now();

  const packed = await imagemagick.svgToPackedBitmap(svgString, width, height);

  logger.debug(`ImageMagick SVG render took ${Date.now() - startTime}ms`);
  return new Uint8Array(packed);
}

/**
 * Render text to a standalone 1-bit bitmap using ImageMagick
 */
export async function renderTextToBitmap(
  text: string,
  width: number,
  height: number,
  options?: Partial<TextRenderOptions>,
): Promise<Bitmap1Bit> {
  const opts = { ...defaultOptions, ...options };
  const svgString = generateTextSvg(text, width, height, opts);
  const data = await svgToBitmapMagick(svgString, width, height);

  return {
    width,
    height,
    data,
    metadata: {
      createdAt: new Date(),
      description: `Text: ${text}`,
    },
  };
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
  const targetBytesPerRow = Math.ceil(target.width / 8);
  const sourceBytesPerRow = Math.ceil(source.width / 8);

  for (let sy = 0; sy < source.height; sy++) {
    const ty = targetY + sy;
    if (ty < 0 || ty >= target.height) continue;

    for (let sx = 0; sx < source.width; sx++) {
      const tx = targetX + sx;
      if (tx < 0 || tx >= target.width) continue;

      // Check if source pixel is black
      const sourceByteIndex = sy * sourceBytesPerRow + Math.floor(sx / 8);
      const sourceBitIndex = 7 - (sx % 8);
      const sourcePixelIsBlack =
        (source.data[sourceByteIndex] & (1 << sourceBitIndex)) === 0;

      if (sourcePixelIsBlack) {
        // Set target pixel to black
        const targetByteIndex = ty * targetBytesPerRow + Math.floor(tx / 8);
        const targetBitIndex = 7 - (tx % 8);
        target.data[targetByteIndex] &= ~(1 << targetBitIndex);
      }
    }
  }
}

/**
 * Render text directly onto an existing bitmap at specified position
 */
export async function renderTextOnBitmap(
  bitmap: Bitmap1Bit,
  text: string,
  x: number,
  y: number,
  options?: Partial<TextRenderOptions>,
): Promise<void> {
  if (!text || text.length === 0) {
    logger.debug("Skipping empty text rendering");
    return;
  }

  const opts = { ...defaultOptions, ...options };

  const textWidth = Math.max(
    10,
    calculateTextWidth(text, opts.fontSize, opts.fontWeight),
  );
  const textHeight = Math.max(10, calculateTextHeight(opts.fontSize));

  let adjustedX = x;
  if (opts.alignment === "center") {
    adjustedX = x - textWidth / 2;
  } else if (opts.alignment === "right") {
    adjustedX = x - textWidth;
  }

  logger.debug(
    `Rendering text "${text}" at (${adjustedX}, ${y}), size ${textWidth}x${textHeight} using ImageMagick`,
  );

  const textBitmap = await renderTextToBitmap(text, textWidth, textHeight, {
    ...opts,
    alignment: "left",
  });

  compositeBlackPixels(
    bitmap,
    textBitmap,
    Math.round(adjustedX),
    Math.round(y),
  );
}

/**
 * Render multiple lines of text onto a bitmap
 */
export async function renderMultilineTextOnBitmap(
  bitmap: Bitmap1Bit,
  lines: string[],
  x: number,
  y: number,
  options?: Partial<TextRenderOptions>,
): Promise<void> {
  const opts = { ...defaultOptions, ...options };
  const lineHeight = calculateTextHeight(opts.fontSize);

  for (let i = 0; i < lines.length; i++) {
    await renderTextOnBitmap(bitmap, lines[i], x, y + i * lineHeight, opts);
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
  const labelSize = options?.labelSize ?? 12;
  const valueSize = options?.valueSize ?? 28;
  const unitSize = options?.unitSize ?? 12;
  const alignment = options?.alignment ?? "left";

  let currentY = y;
  const lineSpacing = 4;

  await renderTextOnBitmap(bitmap, label, x, currentY, {
    fontSize: labelSize,
    fontWeight: "normal",
    alignment,
  });
  currentY += calculateTextHeight(labelSize) + lineSpacing;

  const valueText =
    typeof value === "number" ? Math.round(value).toString() : value;
  await renderTextOnBitmap(bitmap, valueText, x, currentY, {
    fontSize: valueSize,
    fontWeight: "bold",
    alignment,
  });
  currentY += calculateTextHeight(valueSize) + lineSpacing;

  await renderTextOnBitmap(bitmap, unit, x, currentY, {
    fontSize: unitSize,
    fontWeight: "normal",
    alignment,
  });
  currentY += calculateTextHeight(unitSize);

  return { height: currentY - y };
}

/**
 * A text item for batched rendering
 */
export interface BatchedTextItem {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight?: "normal" | "bold";
}

/**
 * Generate SVG string containing multiple text elements
 */
function generateBatchedTextSvg(
  items: BatchedTextItem[],
  width: number,
  height: number,
  fontFamily: string = "Arial",
): string {
  const textElements = items
    .map((item) => {
      const weight = item.fontWeight || "normal";
      const yPos = item.y + item.fontSize * 0.85;
      const escapedText = item.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      return `<text x="${item.x}" y="${yPos}"
            font-family="${fontFamily}"
            font-size="${item.fontSize}"
            font-weight="${weight}"
            fill="black">${escapedText}</text>`;
    })
    .join("\n    ");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    ${textElements}
  </svg>`;
}

/**
 * Render multiple text items in a single ImageMagick operation
 */
export async function renderBatchedTextOnBitmap(
  bitmap: Bitmap1Bit,
  items: BatchedTextItem[],
  targetX: number,
  targetY: number,
  width: number,
  height: number,
): Promise<void> {
  if (items.length === 0) {
    logger.debug("Skipping empty batched text rendering");
    return;
  }

  logger.debug(
    `Rendering batched text: ${items.length} items in single ImageMagick call`,
  );

  const svgString = generateBatchedTextSvg(items, width, height);
  const data = await svgToBitmapMagick(svgString, width, height);

  const textBitmap: Bitmap1Bit = {
    width,
    height,
    data,
    metadata: {
      createdAt: new Date(),
      description: `Batched text: ${items.length} items`,
    },
  };

  compositeBlackPixels(
    bitmap,
    textBitmap,
    Math.round(targetX),
    Math.round(targetY),
  );
}
