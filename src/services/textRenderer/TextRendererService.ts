import QRCode from "qrcode";
import {
  ITextRendererService,
  TextTemplate,
  TemplateVariables,
  QRCodeConfig,
} from "@core/interfaces";
import { Result, Bitmap1Bit, success, failure } from "@core/types";
import { getLogger } from "@utils/logger";

const logger = getLogger("TextRendererService");

// Lazy-load wasm-imagemagick to avoid Worker issues in Node.js tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmImagemagick: any = null;

async function getWasmImagemagick() {
  if (!wasmImagemagick) {
    wasmImagemagick = await import("wasm-imagemagick");
  }
  return wasmImagemagick;
}

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

      // Generate SVG from template (async for QR code generation)
      const svgString = await this.generateSVG(
        template,
        variables,
        width,
        height,
      );

      // Convert SVG to 1-bit bitmap
      const bitmap = await this.svgToBitmap(svgString, width, height);

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
   * Generate QR code as SVG path data
   */
  private async generateQRCodeSVG(
    config: QRCodeConfig,
    width: number,
    height: number,
    layout: TextTemplate["layout"],
  ): Promise<{ svg: string; yOffset: number }> {
    const qrSvg = await QRCode.toString(config.content, {
      type: "svg",
      margin: 1,
      color: {
        dark: layout.textColor === "white" ? "#FFFFFF" : "#000000",
        light: layout.textColor === "white" ? "#000000" : "#FFFFFF",
      },
    });

    // Extract the viewBox from the original SVG to get the coordinate system
    const viewBoxMatch = qrSvg.match(/viewBox="([^"]*)"/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 100 100";

    // Extract just the path/rect content from the QR SVG (skip the outer svg tags)
    const innerContent = qrSvg
      .replace(/<\?xml[^>]*\?>/g, "")
      .replace(/<svg[^>]*>/g, "")
      .replace(/<\/svg>/g, "");

    // Calculate position based on config.position
    const xPosition = (width - config.size) / 2; // Always center horizontally
    let yPosition: number;

    switch (config.position) {
      case "top":
        yPosition = layout.padding.top;
        break;
      case "center":
        yPosition = (height - config.size) / 2;
        break;
      case "bottom":
        yPosition = height - config.size - layout.padding.bottom;
        break;
    }

    // Embed as a nested SVG with proper viewBox to scale correctly
    const positionedSvg = `<svg x="${xPosition}" y="${yPosition}" width="${config.size}" height="${config.size}" viewBox="${viewBox}">${innerContent}</svg>`;

    return {
      svg: positionedSvg,
      yOffset: config.position === "top" ? config.size + 20 : 0,
    };
  }

  /**
   * Generate SVG string from template
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

    // Add QR code if configured
    let qrYOffset = 0;
    if (qrCode) {
      const qrResult = await this.generateQRCodeSVG(
        qrCode,
        width,
        height,
        layout,
      );
      svgContent += qrResult.svg;
      qrYOffset = qrResult.yOffset;
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

    const { call, buildInputFile } = await getWasmImagemagick();

    // Create input file from SVG
    const inputFile = await buildInputFile(Buffer.from(svgString), "input.svg");

    // Convert SVG to grayscale, threshold, and output as raw gray
    const result = await call(
      [inputFile],
      [
        "input.svg",
        "-resize",
        `${width}x${height}!`,
        "-colorspace",
        "Gray",
        "-threshold",
        "50%",
        "-depth",
        "8",
        "gray:output.raw",
      ],
    );

    if (!result.outputFiles || result.outputFiles.length === 0) {
      throw new Error("ImageMagick produced no output");
    }

    const rawBuffer = new Uint8Array(result.outputFiles[0].buffer);

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
        if (pixelIndex < rawBuffer.length && rawBuffer[pixelIndex] === 0) {
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
}
