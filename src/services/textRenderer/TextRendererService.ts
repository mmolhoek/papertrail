import QRCode from "qrcode";
import {
  ITextRendererService,
  TextTemplate,
  TemplateVariables,
  QRCodeConfig,
} from "@core/interfaces";
import { Result, Bitmap1Bit, success, failure } from "@core/types";
import { getLogger } from "@utils/logger";
import * as imagemagick from "@utils/imagemagick";

const logger = getLogger("TextRendererService");

/**
 * Text Renderer Service Implementation
 *
 * Renders text templates to 1-bit bitmaps for e-paper display.
 * Uses SVG generation and ImageMagick for bitmap conversion.
 */
export class TextRendererService implements ITextRendererService {
  async initialize(): Promise<Result<void>> {
    logger.info("TextRendererService initialized");
    return success(undefined);
  }

  async dispose(): Promise<void> {
    logger.info("TextRendererService disposed");
  }

  async renderTemplate(
    template: TextTemplate,
    variables: TemplateVariables,
    width: number,
    height: number,
  ): Promise<Result<Bitmap1Bit>> {
    try {
      logger.info(`Rendering text template: ${template.title || "Untitled"}`);

      // Generate SVG from template (without QR code - we'll composite it separately)
      const svgString = await this.generateSVG(
        template,
        variables,
        width,
        height,
      );

      // Convert SVG to 1-bit bitmap
      let bitmap = await this.svgToBitmap(svgString, width, height);

      // If there's a QR code, composite it onto the bitmap separately
      // This avoids anti-aliasing issues when embedded PNG goes through SVG rendering
      if (template.qrCode) {
        bitmap = await this.compositeQRCode(
          bitmap,
          template.qrCode,
          template.layout,
        );
      }

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
  private substituteVariables(
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
  private wrapText(text: string, maxWidth: number, fontSize: number): string[] {
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
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Composite QR code onto bitmap
   * Renders QR code as PNG and overlays it on the bitmap to avoid anti-aliasing
   */
  private async compositeQRCode(
    bitmap: Bitmap1Bit,
    config: QRCodeConfig,
    layout: TextTemplate["layout"],
  ): Promise<Bitmap1Bit> {
    logger.debug(
      `Compositing QR code for content: ${config.content.substring(0, 50)}...`,
    );

    // Generate QR code as PNG buffer at native size (1 pixel per module)
    const qrBuffer = await QRCode.toBuffer(config.content, {
      type: "png",
      margin: 1,
      scale: 1,
      color: {
        dark: layout.textColor === "white" ? "#FFFFFF" : "#000000",
        light: layout.textColor === "white" ? "#000000" : "#FFFFFF",
      },
    });

    // Scale the QR code to target size using nearest-neighbor (no anti-aliasing)
    const scaledPng = await imagemagick.resizePngNoAntialias(
      qrBuffer,
      config.size,
      config.size,
    );

    // Convert the scaled PNG to packed bitmap
    const qrBitmap = await imagemagick.pngToPackedBitmap(
      scaledPng,
      config.size,
      config.size,
    );

    // Calculate position based on config.position
    const xPosition = Math.floor((bitmap.width - config.size) / 2);
    let yPosition: number;

    switch (config.position) {
      case "top":
        yPosition = layout.padding.top;
        break;
      case "center":
        yPosition = Math.floor((bitmap.height - config.size) / 2);
        break;
      case "bottom":
        yPosition = bitmap.height - config.size - layout.padding.bottom;
        break;
    }

    // Composite the QR code onto the bitmap
    this.compositeBitmaps(bitmap, qrBitmap, config.size, xPosition, yPosition);

    logger.debug(
      `QR code composited: ${config.size}x${config.size} at position (${xPosition}, ${yPosition})`,
    );

    return bitmap;
  }

  /**
   * Composite a source bitmap onto a target bitmap at specified position
   */
  private compositeBitmaps(
    target: Bitmap1Bit,
    source: Buffer,
    sourceSize: number,
    targetX: number,
    targetY: number,
  ): void {
    const targetBytesPerRow = Math.ceil(target.width / 8);
    const sourceBytesPerRow = Math.ceil(sourceSize / 8);

    for (let sy = 0; sy < sourceSize; sy++) {
      const ty = targetY + sy;
      if (ty < 0 || ty >= target.height) continue;

      for (let sx = 0; sx < sourceSize; sx++) {
        const tx = targetX + sx;
        if (tx < 0 || tx >= target.width) continue;

        // Read source pixel
        const sourceByteIndex = sy * sourceBytesPerRow + Math.floor(sx / 8);
        const sourceBitIndex = 7 - (sx % 8);
        const sourcePixel = (source[sourceByteIndex] >> sourceBitIndex) & 1;

        // Write to target
        const targetByteIndex = ty * targetBytesPerRow + Math.floor(tx / 8);
        const targetBitIndex = 7 - (tx % 8);

        if (sourcePixel === 0) {
          // Black pixel
          target.data[targetByteIndex] &= ~(1 << targetBitIndex);
        } else {
          // White pixel
          target.data[targetByteIndex] |= 1 << targetBitIndex;
        }
      }
    }
  }

  /**
   * Generate SVG string from template
   * Note: QR code is composited separately to avoid anti-aliasing
   */
  private async generateSVG(
    template: TextTemplate,
    variables: TemplateVariables,
    width: number,
    height: number,
  ): Promise<string> {
    const { layout, textBlocks, qrCode } = template;
    const bgColor = layout.backgroundColor === "white" ? "white" : "black";
    const textColor = layout.textColor === "white" ? "white" : "black";

    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svgContent += `<rect width="100%" height="100%" fill="${bgColor}"/>`;

    // Calculate Y offset for text if QR code is at the top
    // (QR code is composited separately but we need to leave space)
    let qrYOffset = 0;
    if (qrCode && qrCode.position === "top") {
      qrYOffset = qrCode.size + 20;
    }

    let yPosition = layout.padding.top + qrYOffset;
    const contentWidth = width - layout.padding.left - layout.padding.right;

    for (const block of textBlocks) {
      const content = this.substituteVariables(block.content, variables);
      const lines = this.wrapText(content, contentWidth, block.fontSize);
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
        svgContent += this.escapeXml(lines[i]);
        svgContent += `</text>`;
        yPosition += dy;
      }

      yPosition += block.marginBottom;
    }

    svgContent += `</svg>`;
    return svgContent;
  }

  /**
   * Convert SVG string to 1-bit bitmap using ImageMagick
   */
  private async svgToBitmap(
    svgString: string,
    width: number,
    height: number,
  ): Promise<Bitmap1Bit> {
    logger.debug("Converting SVG to 1-bit bitmap using ImageMagick");

    const packed = await imagemagick.svgToPackedBitmap(
      svgString,
      width,
      height,
    );

    logger.debug(`Bitmap created: ${width}x${height}, ${packed.length} bytes`);

    return {
      width,
      height,
      data: new Uint8Array(packed),
      metadata: {
        createdAt: new Date(),
        description: "Rendered text template",
      },
    };
  }
}
