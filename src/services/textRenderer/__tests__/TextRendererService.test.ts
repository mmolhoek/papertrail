import { TextRendererService } from "@services/textRenderer/TextRendererService";
import { TextTemplate, TemplateVariables } from "@core/interfaces";

describe("TextRendererService", () => {
  let service: TextRendererService;

  beforeEach(() => {
    service = new TextRendererService();
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
});
