// Mock hardware dependencies before importing the EPD class
jest.mock("lgpio", () => ({
  gpiochipOpen: jest.fn(() => 0),
  gpiochipClose: jest.fn(),
  spiOpen: jest.fn(() => 0),
  spiClose: jest.fn(),
  spiWrite: jest.fn(),
  gpioClaimOutput: jest.fn(),
  gpioClaimInput: jest.fn(),
  gpioWrite: jest.fn(),
  gpioRead: jest.fn(() => false),
}));

jest.mock("sharp", () => {
  const mockSharp = jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.alloc(1000)),
    greyscale: jest.fn().mockReturnThis(),
    threshold: jest.fn().mockReturnThis(),
    toColourspace: jest.fn().mockReturnThis(),
  }));
  return mockSharp;
});

jest.mock("bmp-js", () => ({
  encode: jest.fn((data) => ({ data: Buffer.alloc(1000) })),
  decode: jest.fn((data) => ({
    width: 800,
    height: 480,
    data: Buffer.alloc(800 * 480 * 4),
  })),
}));

import { EPD, EPDConfig } from "../EPD";

describe("EPD", () => {
  let epd: EPD;
  let config: EPDConfig;

  beforeEach(() => {
    config = {
      width: 800,
      height: 480,
      rstGPIO: 17,
      dcGPIO: 25,
      busyGPIO: 24,
      powerGPIO: 18,
    };
    epd = new EPD(config);
  });

  afterEach(() => {
    epd.cleanup();
  });

  describe("constructor", () => {
    it("should create EPD instance with default config", () => {
      const defaultEpd = new EPD();
      expect(defaultEpd.width).toBe(800);
      expect(defaultEpd.height).toBe(480);
      defaultEpd.cleanup();
    });

    it("should create EPD instance with custom dimensions", () => {
      const customEpd = new EPD({ width: 640, height: 384 });
      expect(customEpd.width).toBe(640);
      expect(customEpd.height).toBe(384);
      customEpd.cleanup();
    });

    it("should allocate buffer with correct size", () => {
      const buffer = epd.getBuffer();
      const expectedSize = (config.width! / 8) * config.height!;
      expect(buffer.length).toBe(expectedSize);
    });
  });

  describe("dimensions", () => {
    it("should return correct width", () => {
      expect(epd.width).toBe(800);
    });

    it("should return correct height", () => {
      expect(epd.height).toBe(480);
    });
  });

  describe("initialization", () => {
    it("should initialize without errors", async () => {
      await expect(epd.init()).resolves.not.toThrow();
    });
  });

  describe("display operations", () => {
    beforeEach(async () => {
      await epd.init();
    });

    it("should clear display", async () => {
      await expect(epd.clear()).resolves.not.toThrow();
    });

    it("should display with default buffer", async () => {
      await expect(epd.display()).resolves.not.toThrow();
    });

    it("should display with custom buffer", async () => {
      const customBuffer = Buffer.alloc((800 / 8) * 480, 0xff);
      await expect(epd.display(customBuffer)).resolves.not.toThrow();
    });

    it("should enter sleep mode", async () => {
      await expect(epd.sleep()).resolves.not.toThrow();
    });
  });

  describe("drawing operations", () => {
    it("should set pixel", () => {
      expect(() => epd.setPixel(10, 10, 0)).not.toThrow();
    });

    it("should draw horizontal line", () => {
      expect(() => epd.drawHLine(10, 10, 100, 0)).not.toThrow();
    });

    it("should draw vertical line", () => {
      expect(() => epd.drawVLine(10, 10, 100, 0)).not.toThrow();
    });

    it("should draw rectangle", () => {
      expect(() => epd.drawRect(10, 10, 100, 50, 0)).not.toThrow();
    });

    it("should fill rectangle", () => {
      expect(() => epd.fillRect(10, 10, 100, 50, 0)).not.toThrow();
    });

    it("should ignore pixels outside bounds", () => {
      expect(() => epd.setPixel(-1, 10, 0)).not.toThrow();
      expect(() => epd.setPixel(10, -1, 0)).not.toThrow();
      expect(() => epd.setPixel(1000, 10, 0)).not.toThrow();
      expect(() => epd.setPixel(10, 1000, 0)).not.toThrow();
    });
  });

  describe("buffer operations", () => {
    it("should get buffer", () => {
      const buffer = epd.getBuffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe((800 / 8) * 480);
    });

    it("should modify buffer when setting pixels", () => {
      const bufferBefore = Buffer.from(epd.getBuffer());
      epd.setPixel(0, 0, 0);
      const bufferAfter = epd.getBuffer();

      // Buffer should be modified
      expect(bufferAfter[0]).not.toBe(bufferBefore[0]);
    });
  });

  describe("window and cursor operations", () => {
    it("should set window", () => {
      expect(() => epd.setWindow(0, 0, 799, 479)).not.toThrow();
    });

    it("should set cursor", () => {
      expect(() => epd.setCursor(100, 100)).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should cleanup without errors", () => {
      expect(() => epd.cleanup()).not.toThrow();
    });

    it("should handle multiple cleanup calls", () => {
      epd.cleanup();
      expect(() => epd.cleanup()).not.toThrow();
    });
  });
});
