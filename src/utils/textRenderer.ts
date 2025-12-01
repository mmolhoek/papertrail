import sharp from "sharp";
import { Result, Bitmap1Bit, success, failure } from "../core/types";
import { getLogger } from "./logger";

const logger = getLogger("TextRenderer");

/**
 * Template structure for rendering text screens
 */
export interface TextTemplate {
  version: string;
  title?: string;
  layout: {
    backgroundColor: "white" | "black";
    textColor: "white" | "black";
    padding: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
  textBlocks: TextBlock[];
}

/**
 * Individual text block with formatting
 */
export interface TextBlock {
  content: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  alignment: "left" | "center" | "right";
  marginBottom: number;
}

/**
 * Variables for template substitution
 */
export interface TemplateVariables {
  [key: string]: string;
}

/**
 * Render a text template to a 1-bit bitmap
 */
export async function renderTextTemplate(
  template: TextTemplate,
  variables: TemplateVariables,
  width: number,
  height: number,
): Promise<Result<Bitmap1Bit>> {
  try {
    logger.info(`Rendering text template: ${template.title || "Untitled"}`);

    // Generate SVG from template
    const svgString = generateSVG(template, variables, width, height);

    // Convert SVG to 1-bit bitmap
    const bitmap = await svgToBitmap(svgString, width, height);

    logger.info("Text template rendered successfully");
    return success(bitmap);
  } catch (error) {
    logger.error("Failed to render text template:", error);
    if (error instanceof Error) {
      return failure(error);
    }
    return failure(new Error("Unknown error during text rendering"));
  }
}

/**
 * Substitute variables in text content
 */
function substituteVariables(
  text: string,
  variables: TemplateVariables,
): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Wrap text to fit within a maximum width
 * Returns array of lines
 */
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  // Approximate: each character is ~0.5 * fontSize pixels wide
  const charWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / charWidth);

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine + (currentLine ? " " : "") + word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

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
 * Generate SVG string from template
 */
function generateSVG(
  template: TextTemplate,
  variables: TemplateVariables,
  width: number,
  height: number,
): string {
  const { layout, textBlocks } = template;
  const bgColor = layout.backgroundColor === "white" ? "white" : "black";
  const textColor = layout.textColor === "white" ? "white" : "black";

  let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svgContent += `<rect width="100%" height="100%" fill="${bgColor}"/>`;

  let yPosition = layout.padding.top;
  const contentWidth = width - layout.padding.left - layout.padding.right;

  for (const block of textBlocks) {
    const content = substituteVariables(block.content, variables);
    const lines = wrapText(content, contentWidth, block.fontSize);
    const lineHeight = block.fontSize * 1.3;

    let anchor = "start";
    let xPosition = layout.padding.left;
    if (block.alignment === "center") {
      anchor = "middle";
      xPosition = width / 2;
    } else if (block.alignment === "right") {
      anchor = "end";
      xPosition = width - layout.padding.right;
    }

    for (let i = 0; i < lines.length; i++) {
      const dy = i === 0 ? block.fontSize : lineHeight;
      svgContent += `<text x="${xPosition}" y="${yPosition}" font-family="Arial, sans-serif" font-size="${block.fontSize}" font-weight="${block.fontWeight}" text-anchor="${anchor}" fill="${textColor}">`;
      svgContent += escapeXml(lines[i]);
      svgContent += `</text>`;
      yPosition += dy;
    }

    yPosition += block.marginBottom;
  }

  svgContent += `</svg>`;
  return svgContent;
}

/**
 * Convert SVG string to 1-bit bitmap using sharp
 */
async function svgToBitmap(
  svgString: string,
  width: number,
  height: number,
): Promise<Bitmap1Bit> {
  logger.debug("Converting SVG to 1-bit bitmap");

  // Convert SVG to raw buffer (greyscale, thresholded to black/white)
  const buffer = await sharp(Buffer.from(svgString))
    .resize(width, height)
    .greyscale()
    .threshold(128) // Convert to pure black/white
    .raw()
    .toBuffer();

  // Pack into 1-bit format (8 pixels per byte, MSB first)
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  const packed = new Uint8Array(totalBytes);
  packed.fill(0xff); // Start with all white

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const byteIndex = Math.floor((y * width + x) / 8);
      const bitIndex = 7 - (x % 8);

      // If pixel is black (value 0 in greyscale)
      if (buffer[pixelIndex] === 0) {
        packed[byteIndex] &= ~(1 << bitIndex);
      }
    }
  }

  logger.debug(`Bitmap created: ${width}x${height}, ${totalBytes} bytes`);

  return {
    width,
    height,
    data: packed,
    metadata: {
      createdAt: new Date(),
      description: "Rendered text template",
    },
  };
}
