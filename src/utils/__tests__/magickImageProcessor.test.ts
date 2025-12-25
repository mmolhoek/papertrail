// Mock imagemagick module
const mockImageToPackedBitmap = jest.fn();

jest.mock("@utils/imagemagick", () => ({
  imageToPackedBitmap: mockImageToPackedBitmap,
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

import { loadImageToBuffer } from "../magickImageProcessor";

describe("magickImageProcessor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("loadImageToBuffer", () => {
    it("should load image and return packed bitmap buffer", async () => {
      const expectedBuffer = Buffer.from([0xff, 0x00, 0xaa, 0x55]);
      mockImageToPackedBitmap.mockResolvedValue(expectedBuffer);

      const result = await loadImageToBuffer("test.png", 800, 480);

      expect(result).toEqual(expectedBuffer);
    });

    it("should call imageToPackedBitmap with correct arguments", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.from([0xff]));

      await loadImageToBuffer("/path/to/image.png", 640, 320);

      expect(mockImageToPackedBitmap).toHaveBeenCalledWith(
        "/path/to/image.png",
        640,
        320,
      );
    });

    it("should handle different image paths", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.from([0xff]));

      await loadImageToBuffer("/home/user/photos/landscape.jpg", 1920, 1080);

      expect(mockImageToPackedBitmap).toHaveBeenCalledWith(
        "/home/user/photos/landscape.jpg",
        1920,
        1080,
      );
    });

    it("should propagate errors from imagemagick", async () => {
      mockImageToPackedBitmap.mockRejectedValue(
        new Error("ImageMagick convert failed"),
      );

      await expect(loadImageToBuffer("bad.png", 100, 100)).rejects.toThrow(
        "ImageMagick convert failed",
      );
    });

    it("should handle small dimensions", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.from([0xff]));

      await loadImageToBuffer("icon.png", 16, 16);

      expect(mockImageToPackedBitmap).toHaveBeenCalledWith("icon.png", 16, 16);
    });

    it("should handle large dimensions", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.from([0xff]));

      await loadImageToBuffer("poster.png", 4096, 2160);

      expect(mockImageToPackedBitmap).toHaveBeenCalledWith(
        "poster.png",
        4096,
        2160,
      );
    });

    it("should handle relative paths", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.from([0xff]));

      await loadImageToBuffer("./images/test.png", 100, 100);

      expect(mockImageToPackedBitmap).toHaveBeenCalledWith(
        "./images/test.png",
        100,
        100,
      );
    });

    it("should return correct buffer size for dimensions", async () => {
      // For 800x480 at 1-bit: ceil(800/8) * 480 = 100 * 480 = 48000 bytes
      const bytesPerRow = Math.ceil(800 / 8);
      const totalBytes = bytesPerRow * 480;
      const buffer = Buffer.alloc(totalBytes, 0xff);
      mockImageToPackedBitmap.mockResolvedValue(buffer);

      const result = await loadImageToBuffer("test.png", 800, 480);

      expect(result.length).toBe(48000);
    });

    it("should handle file not found error", async () => {
      mockImageToPackedBitmap.mockRejectedValue(new Error("File not found"));

      await expect(
        loadImageToBuffer("nonexistent.png", 100, 100),
      ).rejects.toThrow("File not found");
    });

    it("should handle unsupported format error", async () => {
      mockImageToPackedBitmap.mockRejectedValue(
        new Error("Unsupported image format"),
      );

      await expect(loadImageToBuffer("file.xyz", 100, 100)).rejects.toThrow(
        "Unsupported image format",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle zero dimensions gracefully", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.alloc(0));

      const result = await loadImageToBuffer("test.png", 0, 0);

      expect(result.length).toBe(0);
    });

    it("should handle width not divisible by 8", async () => {
      // 100 pixels wide = ceil(100/8) = 13 bytes per row
      const bytesPerRow = Math.ceil(100 / 8);
      const buffer = Buffer.alloc(bytesPerRow * 50);
      mockImageToPackedBitmap.mockResolvedValue(buffer);

      const result = await loadImageToBuffer("test.png", 100, 50);

      expect(result.length).toBe(650); // 13 * 50
    });

    it("should handle different image formats by path extension", async () => {
      mockImageToPackedBitmap.mockResolvedValue(Buffer.from([0xff]));

      // Test various formats
      await loadImageToBuffer("image.jpg", 100, 100);
      await loadImageToBuffer("image.png", 100, 100);
      await loadImageToBuffer("image.gif", 100, 100);
      await loadImageToBuffer("image.bmp", 100, 100);

      expect(mockImageToPackedBitmap).toHaveBeenCalledTimes(4);
    });
  });
});
