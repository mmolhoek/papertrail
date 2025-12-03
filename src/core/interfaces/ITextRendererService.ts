import { Result, Bitmap1Bit } from "@core/types";

/**
 * Template structure for rendering text screens
 */
/**
 * QR code configuration for embedding in templates
 */
export interface QRCodeConfig {
  /** The content to encode in the QR code (e.g., URL) */
  content: string;
  /** Size of the QR code in pixels */
  size: number;
  /** Vertical position of the QR code */
  position: "top" | "center" | "bottom";
}

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
  /** Optional QR code to display */
  qrCode?: QRCodeConfig;
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
 * Text Renderer Service Interface
 *
 * Responsible for rendering text templates to 1-bit bitmaps for e-paper display.
 * Supports variable substitution, text wrapping, and SVG-based rendering.
 */
export interface ITextRendererService {
  /**
   * Initialize the text renderer service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Render a text template to a 1-bit bitmap
   * @param template The text template to render
   * @param variables Variables for template substitution
   * @param width Width of the output bitmap in pixels
   * @param height Height of the output bitmap in pixels
   * @returns Result containing the rendered bitmap or an error
   */
  renderTemplate(
    template: TextTemplate,
    variables: TemplateVariables,
    width: number,
    height: number,
  ): Promise<Result<Bitmap1Bit>>;

  /**
   * Cleanup resources
   */
  dispose(): Promise<void>;
}
