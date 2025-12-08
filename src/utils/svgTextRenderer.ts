import sharp from "sharp";
import { Bitmap1Bit } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("SvgTextRenderer");

// Mutex to serialize Sharp operations (prevents resource exhaustion)
let sharpOperationInProgress = false;
let sharpOperationQueue: Array<() => void> = [];

async function waitForSharpAvailable(): Promise<void> {
  if (!sharpOperationInProgress) {
    sharpOperationInProgress = true;
    return;
  }

  const queueLength = sharpOperationQueue.length;
  if (queueLength > 0) {
    logger.warn(`Sharp queue length: ${queueLength + 1}, waiting...`);
  }

  return new Promise((resolve) => {
    sharpOperationQueue.push(() => {
      sharpOperationInProgress = true;
      resolve();
    });
  });
}

function releaseSharp(): void {
  if (sharpOperationQueue.length > 0) {
    const next = sharpOperationQueue.shift();
    if (next) next();
  } else {
    sharpOperationInProgress = false;
  }
}

/**
 * Text rendering options for SVG-based text
 */
export interface TextRenderOptions {
  /** Font size in pixels */
  fontSize: number;
  /** Font weight */
  fontWeight?: "normal" | "bold";
  /** Font family */
  fontFamily?: string;
  /** Text color (for SVG, will be converted to black/white) */
  color?: "black" | "white";
  /** Text alignment */
  alignment?: "left" | "center" | "right";
  /** Background color (transparent will use white and only copy black pixels) */
  backgroundColor?: "transparent" | "white" | "black";
}

/**
 * Default text render options
 */
const defaultOptions: Required<TextRenderOptions> = {
  fontSize: 14,
  fontWeight: "normal",
  fontFamily: "Arial, sans-serif",
  color: "black",
  alignment: "left",
  backgroundColor: "transparent",
};

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Calculate approximate text width based on font size
 * Uses a conservative character width ratio to prevent clipping
 */
export function calculateTextWidth(
  text: string,
  fontSize: number,
  fontWeight: "normal" | "bold" = "normal",
): number {
  if (text.length === 0) return 0;

  // Base character width ratio (bold text needs more width)
  const baseRatio = fontWeight === "bold" ? 0.75 : 0.65;

  // Count wide characters that need extra space
  // %, W, M, @, etc. are typically 1.5x wider than average
  const wideChars = "%@WMmw";
  let wideCharCount = 0;
  for (const char of text) {
    if (wideChars.includes(char)) {
      wideCharCount++;
    }
  }

  // Calculate width: base width + extra for wide characters
  const baseWidth = text.length * fontSize * baseRatio;
  const extraWidthForWideChars = wideCharCount * fontSize * 0.3;

  // Add padding to account for font rendering variations
  const padding = 6;

  return Math.max(10, Math.ceil(baseWidth + extraWidthForWideChars) + padding);
}

/**
 * Calculate text height based on font size
 */
export function calculateTextHeight(fontSize: number): number {
  // Text height is approximately 1.2 * fontSize (includes line height)
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

  // Position text vertically centered
  const yPosition = height / 2 + options.fontSize * 0.35;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bgColor}"/>
    <text x="${xPosition}" y="${yPosition}"
          font-family="${options.fontFamily}"
          font-size="${options.fontSize}"
          font-weight="${options.fontWeight}"
          text-anchor="${anchor}"
          fill="${textColor}">${escapeXml(text)}</text>
  </svg>`;
}

/**
 * Convert SVG string to 1-bit bitmap with timeout and mutex protection
 */
async function svgToBitmap(
  svgString: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  // Wait for Sharp to be available (serializes operations)
  await waitForSharpAvailable();

  try {
    // Add timeout to prevent indefinite hangs
    const timeoutMs = 5000;
    const sharpPromise = sharp(Buffer.from(svgString))
      .resize(width, height)
      .greyscale()
      .threshold(128)
      .raw()
      .toBuffer();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Sharp operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const buffer = await Promise.race([sharpPromise, timeoutPromise]);

    // Pack into 1-bit format (8 pixels per byte, MSB first)
    const bytesPerRow = Math.ceil(width / 8);
    const totalBytes = bytesPerRow * height;
    const packed = new Uint8Array(totalBytes);
    packed.fill(0xff); // Start with all white

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);

        // If pixel is black (value 0 in greyscale)
        if (buffer[pixelIndex] === 0) {
          packed[byteIndex] &= ~(1 << bitIndex);
        }
      }
    }

    return packed;
  } finally {
    releaseSharp();
  }
}

/**
 * Render text to a standalone 1-bit bitmap
 */
export async function renderTextToBitmap(
  text: string,
  width: number,
  height: number,
  options?: Partial<TextRenderOptions>,
): Promise<Bitmap1Bit> {
  const opts = { ...defaultOptions, ...options };
  const svgString = generateTextSvg(text, width, height, opts);
  const data = await svgToBitmap(svgString, width, height);

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
 * Composite a source bitmap onto a target bitmap at specified position
 * Only copies black pixels (transparent compositing)
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
 * This is the main method for adding text to bitmaps
 */
export async function renderTextOnBitmap(
  bitmap: Bitmap1Bit,
  text: string,
  x: number,
  y: number,
  options?: Partial<TextRenderOptions>,
): Promise<void> {
  // Skip rendering empty text
  if (!text || text.length === 0) {
    logger.debug("Skipping empty text rendering");
    return;
  }

  const opts = { ...defaultOptions, ...options };

  // Calculate text dimensions with minimum values
  const textWidth = Math.max(
    10,
    calculateTextWidth(text, opts.fontSize, opts.fontWeight),
  );
  const textHeight = Math.max(10, calculateTextHeight(opts.fontSize));

  // Adjust position based on alignment
  let adjustedX = x;
  if (opts.alignment === "center") {
    adjustedX = x - textWidth / 2;
  } else if (opts.alignment === "right") {
    adjustedX = x - textWidth;
  }

  logger.debug(
    `Rendering text "${text}" at (${adjustedX}, ${y}), size ${textWidth}x${textHeight}`,
  );

  // Render text to temporary bitmap
  const textBitmap = await renderTextToBitmap(text, textWidth, textHeight, {
    ...opts,
    alignment: "left", // Always left-align within the bitmap since we adjusted position
  });

  // Composite onto target bitmap
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
 * Render a number with larger font for display
 */
export async function renderLargeNumberOnBitmap(
  bitmap: Bitmap1Bit,
  value: number,
  x: number,
  y: number,
  fontSize: number = 36,
  alignment: "left" | "center" | "right" = "left",
): Promise<void> {
  const text = Math.round(value).toString();
  await renderTextOnBitmap(bitmap, text, x, y, {
    fontSize,
    fontWeight: "bold",
    alignment,
  });
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

  // Render label
  await renderTextOnBitmap(bitmap, label, x, currentY, {
    fontSize: labelSize,
    fontWeight: "normal",
    alignment,
  });
  currentY += calculateTextHeight(labelSize) + lineSpacing;

  // Render value
  const valueText =
    typeof value === "number" ? Math.round(value).toString() : value;
  await renderTextOnBitmap(bitmap, valueText, x, currentY, {
    fontSize: valueSize,
    fontWeight: "bold",
    alignment,
  });
  currentY += calculateTextHeight(valueSize) + lineSpacing;

  // Render unit
  await renderTextOnBitmap(bitmap, unit, x, currentY, {
    fontSize: unitSize,
    fontWeight: "normal",
    alignment,
  });
  currentY += calculateTextHeight(unitSize);

  return { height: currentY - y };
}
