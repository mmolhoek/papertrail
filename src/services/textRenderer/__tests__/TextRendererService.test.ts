import { TextRendererService } from "@services/textRenderer/TextRendererService";
import { TextTemplate, TemplateVariables } from "@core/interfaces";
import * as imagemagick from "@utils/imagemagick";

// Mock imagemagick module
jest.mock("@utils/imagemagick", () => ({
  svgToPackedBitmap: jest.fn(),
  resizePngNoAntialias: jest.fn(),
  pngToPackedBitmap: jest.fn(),
}));

// Mock QRCode module
jest.mock("qrcode", () => ({
  toBuffer: jest.fn(),
}));

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockedImagemagick = imagemagick as jest.Mocked<typeof imagemagick>;
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const mockedQRCode = require("qrcode") as any;

describe("TextRendererService", () => {
  let service: TextRendererService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TextRendererService();

    // Default mock implementations
    mockedImagemagick.svgToPackedBitmap.mockResolvedValue(
      Buffer.alloc(Math.ceil(640 / 8) * 384, 0xff),
    );
    mockedImagemagick.resizePngNoAntialias.mockResolvedValue(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    mockedImagemagick.pngToPackedBitmap.mockResolvedValue(
      Buffer.alloc(Math.ceil(100 / 8) * 100, 0xff),
    );
    mockedQRCode.toBuffer.mockResolvedValue(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const result = await service.initialize();
      expect(result.success).toBe(true);
    });

    it("should dispose without errors", async () => {
      await service.initialize();
      await expect(service.dispose()).resolves.not.toThrow();
    });
  });

  describe("renderTemplate", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should render a simple text template", async () => {
      const template: TextTemplate = {
        version: "1.0",
        title: "Simple Test",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Hello World",
            fontSize: 24,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(640);
        expect(result.data.height).toBe(384);
        expect(result.data.data).toBeInstanceOf(Uint8Array);
        expect(result.data.metadata?.description).toBe(
          "Rendered text template",
        );
      }
    });

    it("should substitute variables in template", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Hello {{name}}!",
            fontSize: 24,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const variables: TemplateVariables = {
        name: "Alice",
      };

      const result = await service.renderTemplate(
        template,
        variables,
        640,
        384,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(640);
        expect(result.data.height).toBe(384);
      }
    });

    it("should handle multiple variables", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Welcome {{user}} to {{location}}",
            fontSize: 24,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const variables: TemplateVariables = {
        user: "Bob",
        location: "Papertrail",
      };

      const result = await service.renderTemplate(
        template,
        variables,
        640,
        384,
      );

      expect(result.success).toBe(true);
    });

    it("should handle multiple text blocks", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 20, right: 20, bottom: 20, left: 20 },
        },
        textBlocks: [
          {
            content: "Title",
            fontSize: 32,
            fontWeight: "bold",
            alignment: "center",
            marginBottom: 20,
          },
          {
            content: "Subtitle",
            fontSize: 24,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
          {
            content: "Body text",
            fontSize: 16,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 0,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle different alignments", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Left aligned",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 10,
          },
          {
            content: "Center aligned",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
          {
            content: "Right aligned",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "right",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle bold font weight", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Bold text",
            fontSize: 24,
            fontWeight: "bold",
            alignment: "left",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle black background with white text", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "black",
          textColor: "white",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "White on black",
            fontSize: 24,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle long text that needs wrapping", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content:
              "This is a very long text that should wrap across multiple lines when rendered on the display because it exceeds the maximum width.",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle empty variables gracefully", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Hello {{name}}!",
            fontSize: 24,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      // Variable not substituted, should keep {{name}} in text
    });

    it("should handle special XML characters", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Special: < > & ' \"",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should create correct bitmap dimensions", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Test",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      // Test with different dimensions
      const result1 = await service.renderTemplate(template, {}, 800, 600);
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.data.width).toBe(800);
        expect(result1.data.height).toBe(600);
      }

      const result2 = await service.renderTemplate(template, {}, 400, 300);
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data.width).toBe(400);
        expect(result2.data.height).toBe(300);
      }
    });

    it("should pack bitmap data correctly (8 pixels per byte)", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Test",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const width = 640;
      const height = 384;
      const result = await service.renderTemplate(template, {}, width, height);

      expect(result.success).toBe(true);
      if (result.success) {
        const expectedBytesPerRow = Math.ceil(width / 8);
        const expectedTotalBytes = expectedBytesPerRow * height;
        expect(result.data.data.length).toBe(expectedTotalBytes);
      }
    });
  });

  describe("QR code rendering", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should render template with QR code at top position", async () => {
      const template: TextTemplate = {
        version: "1.0",
        title: "QR Test",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 20, right: 20, bottom: 20, left: 20 },
        },
        textBlocks: [
          {
            content: "Scan the QR code above",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
        qrCode: {
          content: "https://example.com",
          size: 100,
          position: "top",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      expect(mockedQRCode.toBuffer).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          type: "png",
          margin: 1,
          scale: 1,
        }),
      );
      expect(mockedImagemagick.resizePngNoAntialias).toHaveBeenCalledWith(
        expect.any(Buffer),
        100,
        100,
      );
      expect(mockedImagemagick.pngToPackedBitmap).toHaveBeenCalled();
    });

    it("should render template with QR code at center position", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 20, right: 20, bottom: 20, left: 20 },
        },
        textBlocks: [],
        qrCode: {
          content: "https://example.com/center",
          size: 150,
          position: "center",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      expect(mockedImagemagick.resizePngNoAntialias).toHaveBeenCalledWith(
        expect.any(Buffer),
        150,
        150,
      );
    });

    it("should render template with QR code at bottom position", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 20, right: 20, bottom: 30, left: 20 },
        },
        textBlocks: [
          {
            content: "Scan the code below",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
        qrCode: {
          content: "https://example.com/bottom",
          size: 120,
          position: "bottom",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      expect(mockedImagemagick.resizePngNoAntialias).toHaveBeenCalledWith(
        expect.any(Buffer),
        120,
        120,
      );
    });

    it("should render QR code with inverted colors for white text on black", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "black",
          textColor: "white",
          padding: { top: 20, right: 20, bottom: 20, left: 20 },
        },
        textBlocks: [
          {
            content: "White on black with QR",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
        qrCode: {
          content: "https://example.com/inverted",
          size: 100,
          position: "bottom",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      expect(mockedQRCode.toBuffer).toHaveBeenCalledWith(
        "https://example.com/inverted",
        expect.objectContaining({
          color: {
            dark: "#FFFFFF",
            light: "#000000",
          },
        }),
      );
    });

    it("should handle long QR code content", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 20, right: 20, bottom: 20, left: 20 },
        },
        textBlocks: [],
        qrCode: {
          content:
            "https://example.com/very/long/path/with/many/segments?query=param&another=value&more=data",
          size: 200,
          position: "center",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return failure when SVG to bitmap conversion fails", async () => {
      mockedImagemagick.svgToPackedBitmap.mockRejectedValue(
        new Error("ImageMagick conversion failed"),
      );

      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Test",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("ImageMagick conversion failed");
      }
    });

    it("should return failure when QR code generation fails", async () => {
      mockedQRCode.toBuffer.mockRejectedValue(
        new Error("QR code generation failed"),
      );

      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [],
        qrCode: {
          content: "https://example.com",
          size: 100,
          position: "center",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("QR code generation failed");
      }
    });

    it("should return failure when QR code resize fails", async () => {
      mockedImagemagick.resizePngNoAntialias.mockRejectedValue(
        new Error("Resize failed"),
      );

      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [],
        qrCode: {
          content: "https://example.com",
          size: 100,
          position: "center",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(false);
    });

    it("should return failure when QR PNG to bitmap conversion fails", async () => {
      mockedImagemagick.pngToPackedBitmap.mockRejectedValue(
        new Error("PNG to bitmap failed"),
      );

      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [],
        qrCode: {
          content: "https://example.com",
          size: 100,
          position: "center",
        },
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(false);
    });

    it("should handle non-Error exceptions", async () => {
      mockedImagemagick.svgToPackedBitmap.mockRejectedValue("String error");

      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Test",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe(
          "Unknown error during text rendering",
        );
      }
    });
  });

  describe("text wrapping edge cases", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should handle single word that exceeds line width", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Supercalifragilisticexpialidocious",
            fontSize: 40,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 10,
          },
        ],
      };

      // Narrow width to force wrapping issue
      const result = await service.renderTemplate(template, {}, 200, 384);

      expect(result.success).toBe(true);
    });

    it("should handle empty text content", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle text with only spaces", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "     ",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle text with newlines in content", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Line one\nLine two",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle very small font size", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Tiny text",
            fontSize: 6,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 5,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle very large font size", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "HUGE",
            fontSize: 100,
            fontWeight: "bold",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });
  });

  describe("variable substitution edge cases", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should handle multiple occurrences of same variable", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Hello {{name}}, welcome {{name}}!",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const variables: TemplateVariables = {
        name: "Alice",
      };

      const result = await service.renderTemplate(
        template,
        variables,
        640,
        384,
      );

      expect(result.success).toBe(true);
    });

    it("should handle variable with special regex characters in value", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Value: {{value}}",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const variables: TemplateVariables = {
        value: "$100.00 (50% off)",
      };

      const result = await service.renderTemplate(
        template,
        variables,
        640,
        384,
      );

      expect(result.success).toBe(true);
    });

    it("should not substitute partial variable names", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "{{username}} vs {{user}}",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const variables: TemplateVariables = {
        user: "Bob",
        username: "BobTheBuilder",
      };

      const result = await service.renderTemplate(
        template,
        variables,
        640,
        384,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("XML escaping", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should escape ampersand correctly", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Tom & Jerry",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      // Verify svgToPackedBitmap was called with escaped content
      expect(mockedImagemagick.svgToPackedBitmap).toHaveBeenCalledWith(
        expect.stringContaining("&amp;"),
        640,
        384,
      );
    });

    it("should escape all XML special characters", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "<script>alert('XSS')</script> & \"quotes\"",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
      const svgCall = mockedImagemagick.svgToPackedBitmap.mock.calls[0][0];
      expect(svgCall).toContain("&lt;");
      expect(svgCall).toContain("&gt;");
      expect(svgCall).toContain("&apos;");
      expect(svgCall).toContain("&quot;");
    });
  });

  describe("layout configurations", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should handle zero padding", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        textBlocks: [
          {
            content: "No padding",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "left",
            marginBottom: 0,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle large padding values", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 100, right: 100, bottom: 100, left: 100 },
        },
        textBlocks: [
          {
            content: "Lots of padding",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle asymmetric padding", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 50, right: 10, bottom: 20, left: 30 },
        },
        textBlocks: [
          {
            content: "Asymmetric padding",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle template without title", async () => {
      const template: TextTemplate = {
        version: "1.0",
        // No title field
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "No title template",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });

    it("should handle empty text blocks array", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [],
      };

      const result = await service.renderTemplate(template, {}, 640, 384);

      expect(result.success).toBe(true);
    });
  });

  describe("bitmap dimensions", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should handle non-standard dimensions", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
        textBlocks: [
          {
            content: "Test",
            fontSize: 20,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      // Non-standard dimensions
      mockedImagemagick.svgToPackedBitmap.mockResolvedValue(
        Buffer.alloc(Math.ceil(123 / 8) * 456, 0xff),
      );

      const result = await service.renderTemplate(template, {}, 123, 456);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(123);
        expect(result.data.height).toBe(456);
      }
    });

    it("should handle very small dimensions", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 1, right: 1, bottom: 1, left: 1 },
        },
        textBlocks: [
          {
            content: "X",
            fontSize: 8,
            fontWeight: "normal",
            alignment: "center",
            marginBottom: 0,
          },
        ],
      };

      mockedImagemagick.svgToPackedBitmap.mockResolvedValue(
        Buffer.alloc(Math.ceil(16 / 8) * 16, 0xff),
      );

      const result = await service.renderTemplate(template, {}, 16, 16);

      expect(result.success).toBe(true);
    });

    it("should handle very large dimensions", async () => {
      const template: TextTemplate = {
        version: "1.0",
        layout: {
          backgroundColor: "white",
          textColor: "black",
          padding: { top: 50, right: 50, bottom: 50, left: 50 },
        },
        textBlocks: [
          {
            content: "Large display",
            fontSize: 48,
            fontWeight: "bold",
            alignment: "center",
            marginBottom: 10,
          },
        ],
      };

      mockedImagemagick.svgToPackedBitmap.mockResolvedValue(
        Buffer.alloc(Math.ceil(1920 / 8) * 1080, 0xff),
      );

      const result = await service.renderTemplate(template, {}, 1920, 1080);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(1920);
        expect(result.data.height).toBe(1080);
      }
    });
  });
});
