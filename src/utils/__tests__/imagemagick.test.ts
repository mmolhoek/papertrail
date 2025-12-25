// Mock child_process exec - must be declared before imports
const mockExecAsync = jest.fn();

jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("util", () => {
  const actual = jest.requireActual("util");
  return {
    ...actual,
    promisify: () => mockExecAsync,
  };
});

// Mock fs
const mockFs = {
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
};

jest.mock("fs", () => mockFs);

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import * as imagemagick from "../imagemagick";

describe("imagemagick", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
  });

  describe("convert", () => {
    it("should execute ImageMagick convert command", async () => {
      await imagemagick.convert([
        "-resize",
        "100x100",
        "input.png",
        "output.png",
      ]);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("convert"),
        expect.any(Object),
      );
    });

    it("should quote arguments", async () => {
      await imagemagick.convert(["input.png", "output.png"]);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('"input.png"'),
        expect.any(Object),
      );
    });

    it("should throw on command failure", async () => {
      mockExecAsync.mockRejectedValue(new Error("Command failed"));

      await expect(imagemagick.convert(["bad", "command"])).rejects.toThrow(
        "ImageMagick convert failed",
      );
    });

    it("should not throw on stderr warnings", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "",
        stderr: "warning: some warning",
      });

      await expect(
        imagemagick.convert(["input.png", "output.png"]),
      ).resolves.not.toThrow();
    });
  });

  describe("imageToGrayscale", () => {
    it("should convert image to grayscale", async () => {
      const grayscaleData = Buffer.from([128, 128, 128, 128]);
      mockFs.readFileSync.mockReturnValue(grayscaleData);

      const result = await imagemagick.imageToGrayscale("input.png", 2, 2);

      expect(result).toEqual(grayscaleData);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("-colorspace"),
        expect.any(Object),
      );
    });

    it("should resize to target dimensions", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.imageToGrayscale("input.png", 100, 50);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("100x50!"),
        expect.any(Object),
      );
    });

    it("should clean up temp files", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.imageToGrayscale("input.png", 10, 10);

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe("imageToPackedBitmap", () => {
    it("should convert image to packed 1-bit bitmap", async () => {
      // 8 black pixels in grayscale
      const grayscaleData = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
      mockFs.readFileSync.mockReturnValue(grayscaleData);

      const result = await imagemagick.imageToPackedBitmap("input.png", 8, 1);

      // 8 black pixels should be 0x00 (all bits cleared)
      expect(result[0]).toBe(0x00);
    });

    it("should handle white pixels", async () => {
      // 8 white pixels in grayscale (after threshold)
      const grayscaleData = Buffer.from([
        255, 255, 255, 255, 255, 255, 255, 255,
      ]);
      mockFs.readFileSync.mockReturnValue(grayscaleData);

      const result = await imagemagick.imageToPackedBitmap("input.png", 8, 1);

      // 8 white pixels should be 0xFF (all bits set)
      expect(result[0]).toBe(0xff);
    });
  });

  describe("svgToGrayscale", () => {
    it("should write SVG to temp file and convert", async () => {
      const svgContent = "<svg></svg>";
      mockFs.readFileSync.mockReturnValue(Buffer.from([128]));

      await imagemagick.svgToGrayscale(svgContent, 100, 100);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(".svg"),
        svgContent,
      );
    });

    it("should apply threshold for 1-bit conversion", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.svgToGrayscale("<svg></svg>", 10, 10);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("-threshold"),
        expect.any(Object),
      );
    });

    it("should set white background", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.svgToGrayscale("<svg></svg>", 10, 10);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("-background"),
        expect.any(Object),
      );
    });

    it("should clean up both input and output temp files", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.svgToGrayscale("<svg></svg>", 10, 10);

      // Should unlink at least 2 files (svg input and gray output)
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  describe("svgToPackedBitmap", () => {
    it("should convert SVG to packed bitmap", async () => {
      const grayscaleData = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
      mockFs.readFileSync.mockReturnValue(grayscaleData);

      const result = await imagemagick.svgToPackedBitmap("<svg></svg>", 8, 1);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(1); // 8 pixels = 1 byte
    });
  });

  describe("grayscaleToPackedBitmap", () => {
    it("should convert 8 black pixels to 0x00", () => {
      const grayscale = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);

      const result = imagemagick.grayscaleToPackedBitmap(grayscale, 8, 1);

      expect(result[0]).toBe(0x00);
    });

    it("should convert 8 white pixels to 0xFF", () => {
      const grayscale = Buffer.from([255, 255, 255, 255, 255, 255, 255, 255]);

      const result = imagemagick.grayscaleToPackedBitmap(grayscale, 8, 1);

      expect(result[0]).toBe(0xff);
    });

    it("should handle alternating pixels", () => {
      // Black, white, black, white, black, white, black, white
      const grayscale = Buffer.from([0, 255, 0, 255, 0, 255, 0, 255]);

      const result = imagemagick.grayscaleToPackedBitmap(grayscale, 8, 1);

      // Binary: 01010101 = 0x55
      expect(result[0]).toBe(0x55);
    });

    it("should handle multiple rows", () => {
      // 2 rows of 8 pixels each
      const grayscale = Buffer.from([
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0, // Row 1: all black
        255,
        255,
        255,
        255,
        255,
        255,
        255,
        255, // Row 2: all white
      ]);

      const result = imagemagick.grayscaleToPackedBitmap(grayscale, 8, 2);

      expect(result[0]).toBe(0x00); // Row 1
      expect(result[1]).toBe(0xff); // Row 2
    });

    it("should handle width not divisible by 8", () => {
      // 10 pixels = 2 bytes per row (with padding)
      const grayscale = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      const result = imagemagick.grayscaleToPackedBitmap(grayscale, 10, 1);

      expect(result.length).toBe(2); // ceil(10/8) = 2 bytes
      expect(result[0]).toBe(0x00); // First 8 pixels black
      expect(result[1]).toBe(0x3f); // Last 2 pixels black, rest white (padding)
    });

    it("should start with all white and set black pixels", () => {
      const grayscale = Buffer.from([255]); // One white pixel

      const result = imagemagick.grayscaleToPackedBitmap(grayscale, 1, 1);

      // Should be 0xFF (white) with MSB set
      expect(result[0]).toBe(0xff);
    });
  });

  describe("grayscaleToPng", () => {
    it("should convert grayscale to PNG", async () => {
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      mockFs.readFileSync.mockReturnValue(pngData);

      const result = await imagemagick.grayscaleToPng(
        Buffer.from([128, 128, 128, 128]),
        2,
        2,
      );

      expect(result).toEqual(pngData);
    });

    it("should write grayscale data to temp file", async () => {
      const grayscale = Buffer.from([128, 128]);
      mockFs.readFileSync.mockReturnValue(Buffer.from([0x89]));

      await imagemagick.grayscaleToPng(grayscale, 2, 1);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(".gray"),
        grayscale,
      );
    });
  });

  describe("packedBitmapToPng", () => {
    it("should convert packed bitmap to PNG", async () => {
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      mockFs.readFileSync.mockReturnValue(pngData);

      const packed = Buffer.from([0xff]); // 8 white pixels
      const result = await imagemagick.packedBitmapToPng(packed, 8, 1);

      expect(result).toEqual(pngData);
    });

    it("should convert packed bits to grayscale correctly", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0x89]));

      const packed = Buffer.from([0xaa]); // 10101010 = alternating black/white

      await imagemagick.packedBitmapToPng(packed, 8, 1);

      // Should write grayscale data with alternating 0 and 255
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it("should handle Uint8Array input", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0x89]));

      const packed = new Uint8Array([0xff]);
      const result = await imagemagick.packedBitmapToPng(packed, 8, 1);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe("resizePngNoAntialias", () => {
    it("should use point filter for nearest-neighbor interpolation", async () => {
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      mockFs.readFileSync.mockReturnValue(pngData);

      await imagemagick.resizePngNoAntialias(pngData, 100, 100);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("-filter"),
        expect.any(Object),
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("point"),
        expect.any(Object),
      );
    });

    it("should resize to exact dimensions", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0x89]));

      await imagemagick.resizePngNoAntialias(Buffer.from([0x89]), 200, 150);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("200x150!"),
        expect.any(Object),
      );
    });
  });

  describe("pngToPackedBitmap", () => {
    it("should convert PNG to packed bitmap", async () => {
      // Return grayscale data (8 black pixels)
      mockFs.readFileSync.mockReturnValue(
        Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]),
      );

      const result = await imagemagick.pngToPackedBitmap(
        Buffer.from([0x89]),
        8,
        1,
      );

      expect(result[0]).toBe(0x00); // All black
    });

    it("should apply threshold during conversion", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.pngToPackedBitmap(Buffer.from([0x89]), 8, 1);

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("-threshold"),
        expect.any(Object),
      );
    });
  });

  describe("temp file cleanup", () => {
    it("should cleanup temp files on success", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));

      await imagemagick.imageToGrayscale("input.png", 10, 10);

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it("should cleanup temp files on error", async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error("Read failed");
      });

      await expect(
        imagemagick.imageToGrayscale("input.png", 10, 10),
      ).rejects.toThrow();

      // Cleanup should still be attempted
      expect(mockFs.existsSync).toHaveBeenCalled();
    });

    it("should not throw if cleanup fails", async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from([0]));
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error("Cleanup failed");
      });

      // Should not throw despite cleanup failure
      await expect(
        imagemagick.imageToGrayscale("input.png", 10, 10),
      ).resolves.not.toThrow();
    });
  });
});
