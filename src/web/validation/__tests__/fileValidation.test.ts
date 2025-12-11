/**
 * Tests for File Validation Utilities
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Readable } from "stream";
import { validateFileType, validateUploadedFile } from "../fileValidation";

// Mock logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("File Validation", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "filevalidation-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("validateFileType", () => {
    describe("GPX files", () => {
      it("should accept valid GPX file with XML declaration", async () => {
        const filePath = path.join(tempDir, "valid.gpx");
        await fs.writeFile(
          filePath,
          '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1"><trk></trk></gpx>',
        );

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(true);
        expect(result.detectedType).toBe("gpx");
      });

      it("should accept GPX file starting with <gpx tag directly", async () => {
        const filePath = path.join(tempDir, "direct-gpx.gpx");
        await fs.writeFile(filePath, '<gpx version="1.1"><trk></trk></gpx>');

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(true);
      });

      it("should accept GPX file with UTF-8 BOM", async () => {
        const filePath = path.join(tempDir, "bom.gpx");
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const content = '<?xml version="1.0"?>\n<gpx><trk></trk></gpx>';
        await fs.writeFile(
          filePath,
          Buffer.concat([bom, Buffer.from(content)]),
        );

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(true);
      });

      it("should reject file without gpx tag", async () => {
        const filePath = path.join(tempDir, "no-gpx-tag.gpx");
        await fs.writeFile(
          filePath,
          '<?xml version="1.0"?>\n<kml><Document></Document></kml>',
        );

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("gpx");
      });

      it("should reject non-XML file with GPX extension", async () => {
        const filePath = path.join(tempDir, "not-xml.gpx");
        await fs.writeFile(filePath, "This is just plain text, not XML");

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("XML/GPX");
      });

      it("should reject GPX file containing script tags", async () => {
        const filePath = path.join(tempDir, "script-injection.gpx");
        await fs.writeFile(
          filePath,
          '<?xml version="1.0"?>\n<gpx><script>alert("xss")</script></gpx>',
        );

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("suspicious");
      });

      it("should reject GPX file containing HTML tags", async () => {
        const filePath = path.join(tempDir, "html-injection.gpx");
        await fs.writeFile(
          filePath,
          '<?xml version="1.0"?>\n<gpx><html><body>test</body></html></gpx>',
        );

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("suspicious");
      });

      it("should reject empty file", async () => {
        const filePath = path.join(tempDir, "empty.gpx");
        await fs.writeFile(filePath, "");

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("empty");
      });

      it("should reject binary file (PNG) with GPX extension", async () => {
        const filePath = path.join(tempDir, "actually-png.gpx");
        // PNG header magic bytes
        await fs.writeFile(
          filePath,
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );

        const result = await validateFileType(filePath, ".gpx");

        expect(result.valid).toBe(false);
        expect(result.detectedType).toBe("png");
      });
    });

    describe("Unknown extensions", () => {
      it("should allow unknown file extensions by default", async () => {
        const filePath = path.join(tempDir, "unknown.xyz");
        await fs.writeFile(filePath, "Some content");

        const result = await validateFileType(filePath, ".xyz");

        expect(result.valid).toBe(true);
      });
    });

    describe("Error handling", () => {
      it("should handle non-existent file", async () => {
        const result = await validateFileType("/nonexistent/file.gpx", ".gpx");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("Failed to read");
      });
    });
  });

  describe("validateUploadedFile", () => {
    const createMockFile = (
      originalname: string,
      filePath: string,
      size: number,
    ): Express.Multer.File => ({
      fieldname: "file",
      originalname,
      encoding: "7bit",
      mimetype: "application/octet-stream",
      destination: tempDir,
      filename: path.basename(filePath),
      path: filePath,
      size,
      stream: new Readable(),
      buffer: Buffer.alloc(0),
    });

    it("should accept valid GPX file", async () => {
      const filePath = path.join(tempDir, "upload-valid.gpx");
      await fs.writeFile(
        filePath,
        '<?xml version="1.0"?>\n<gpx><trk></trk></gpx>',
      );
      const mockFile = createMockFile("track.gpx", filePath, 100);

      const result = await validateUploadedFile(
        mockFile,
        [".gpx"],
        10 * 1024 * 1024,
      );

      expect(result.valid).toBe(true);
    });

    it("should reject file exceeding size limit", async () => {
      const filePath = path.join(tempDir, "large.gpx");
      await fs.writeFile(filePath, "x".repeat(100));
      const mockFile = createMockFile("large.gpx", filePath, 100);

      const result = await validateUploadedFile(mockFile, [".gpx"], 50);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("size");
    });

    it("should reject file with disallowed extension", async () => {
      const filePath = path.join(tempDir, "wrong.txt");
      await fs.writeFile(filePath, "Some text");
      const mockFile = createMockFile("file.txt", filePath, 10);

      const result = await validateUploadedFile(
        mockFile,
        [".gpx"],
        10 * 1024 * 1024,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should accept file with case-insensitive extension check", async () => {
      const filePath = path.join(tempDir, "uppercase.GPX");
      await fs.writeFile(
        filePath,
        '<?xml version="1.0"?>\n<gpx><trk></trk></gpx>',
      );
      const mockFile = createMockFile("TRACK.GPX", filePath, 100);

      const result = await validateUploadedFile(
        mockFile,
        [".gpx"],
        10 * 1024 * 1024,
      );

      expect(result.valid).toBe(true);
    });

    it("should reject file without extension when required", async () => {
      const filePath = path.join(tempDir, "noext");
      await fs.writeFile(filePath, "content");
      const mockFile = createMockFile("noext", filePath, 10);

      const result = await validateUploadedFile(
        mockFile,
        [".gpx"],
        10 * 1024 * 1024,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should validate content even when extension matches", async () => {
      const filePath = path.join(tempDir, "fake.gpx");
      // Write a PNG file with .gpx extension
      await fs.writeFile(
        filePath,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const mockFile = createMockFile("fake.gpx", filePath, 100);

      const result = await validateUploadedFile(
        mockFile,
        [".gpx"],
        10 * 1024 * 1024,
      );

      expect(result.valid).toBe(false);
      expect(result.detectedType).toBe("png");
    });
  });
});
