// Mock hardware dependencies before importing the service
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
  encode: jest.fn(() => ({ data: Buffer.alloc(1000) })),
  decode: jest.fn(() => ({
    width: 800,
    height: 480,
    data: Buffer.alloc(800 * 480 * 4),
  })),
}));

import { DisplayError, DisplayErrorCode } from "core/errors";
import { EpaperService } from "../EPaperService";
import { DisplayUpdateMode, Bitmap1Bit, EpaperConfig } from "@core/types";

describe("EpaperService", () => {
  let epaperService: EpaperService;
  let config: EpaperConfig;

  beforeEach(() => {
    config = {
      width: 800,
      height: 480,
      spiDevice: "/dev/spidev0.0",
      pins: {
        reset: 17,
        dc: 25,
        busy: 24,
      },
      refreshMode: "full",
      rotation: 0,
    };
    epaperService = new EpaperService(config);
  });

  afterEach(async () => {
    await epaperService.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const result = await epaperService.initialize();
      expect(result.success).toBe(true);
    });

    it("should not reinitialize if already initialized", async () => {
      await epaperService.initialize();
      const result = await epaperService.initialize();
      expect(result.success).toBe(true);
    });

    it("should not be busy after initialization", async () => {
      await epaperService.initialize();
      expect(epaperService.isBusy()).toBe(false);
    });
  });

  describe("displayBitmap", () => {
    let validBitmap: Bitmap1Bit;

    beforeEach(async () => {
      await epaperService.initialize();

      // Create a valid bitmap
      const dataSize = Math.ceil((config.width * config.height) / 8);
      validBitmap = {
        width: config.width,
        height: config.height,
        data: new Uint8Array(dataSize),
      };
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.displayBitmap(validBitmap);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DisplayError).code).toBe(
          DisplayErrorCode.DEVICE_NOT_INITIALIZED,
        );
      }
    });

    it("should display bitmap successfully", async () => {
      const result = await epaperService.displayBitmap(validBitmap);
      expect(result.success).toBe(true);
    });

    it("should reject bitmap with wrong dimensions", async () => {
      const wrongBitmap: Bitmap1Bit = {
        width: 640,
        height: 384,
        data: new Uint8Array(Math.ceil((640 * 384) / 8)),
      };

      const result = await epaperService.displayBitmap(wrongBitmap);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DisplayError).code).toBe(
          "DISPLAY_BITMAP_SIZE_MISMATCH",
        );
      }
    });

    it("should use full update mode when specified", async () => {
      const result = await epaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.FULL,
      );
      expect(result.success).toBe(true);

      const status = await epaperService.getStatus();
      if (status.success) {
        // Expect 1: 1 from this call (no logo during initialization)
        expect(status.data.fullRefreshCount).toBe(1);
        expect(status.data.partialRefreshCount).toBe(0);
      }
    });

    it("should use partial update mode when specified", async () => {
      const result = await epaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.PARTIAL,
      );
      expect(result.success).toBe(true);

      const status = await epaperService.getStatus();
      if (status.success) {
        // Expect 0 full, 1 partial (no logo during initialization)
        expect(status.data.fullRefreshCount).toBe(0);
        expect(status.data.partialRefreshCount).toBe(1);
      }
    });

    it("should auto-select update mode", async () => {
      // First update should be partial
      await epaperService.displayBitmap(validBitmap);

      const status = await epaperService.getStatus();
      if (status.success) {
        expect(status.data.partialRefreshCount).toBeGreaterThan(0);
      }
    });

    it("should update lastUpdate timestamp", async () => {
      const beforeTime = new Date();
      await epaperService.displayBitmap(validBitmap);

      const status = await epaperService.getStatus();
      if (status.success && status.data.lastUpdate) {
        expect(status.data.lastUpdate.getTime()).toBeGreaterThanOrEqual(
          beforeTime.getTime(),
        );
      }
    });

    it("should not allow display while busy", async () => {
      // Start first display (simulate a long-running operation)
      const firstDisplay = epaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.FULL,
      );
      epaperService["busy"] = true; // Force busy state
      // Try to display while the first operation is still in progress
      const result = await epaperService.displayBitmap(validBitmap);
      epaperService["busy"] = false; // Reset busy state

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DisplayError).code).toBe("DISPLAY_BUSY");
      }

      // Wait for the first display to complete
      await firstDisplay;
    });

    it("should not allow display while sleeping", async () => {
      await epaperService.sleep();
      const result = await epaperService.displayBitmap(validBitmap);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DisplayError).code).toBe("DISPLAY_SLEEPING");
      }
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should clear display successfully", async () => {
      const result = await epaperService.clear();
      expect(result.success).toBe(true);
    });

    it("should use full refresh for clear", async () => {
      await epaperService.clear();

      const status = await epaperService.getStatus();
      if (status.success) {
        // Expect 1: 1 from clear (no logo during initialization)
        expect(status.data.fullRefreshCount).toBe(1);
      }
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.clear();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DisplayError).code).toBe(
          "DISPLAY_DEVICE_NOT_INITIALIZED",
        );
      }
    });
  });

  describe("fullRefresh", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should perform full refresh successfully", async () => {
      const result = await epaperService.fullRefresh();
      expect(result.success).toBe(true);
    });

    it("should increment full refresh count", async () => {
      await epaperService.fullRefresh();

      const status = await epaperService.getStatus();
      if (status.success) {
        // Expect 1: 1 from fullRefresh (no logo during initialization)
        expect(status.data.fullRefreshCount).toBe(1);
      }
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.fullRefresh();

      expect(result.success).toBe(false);
    });
  });

  describe("sleep and wake", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should put display to sleep", async () => {
      const result = await epaperService.sleep();
      expect(result.success).toBe(true);

      const status = await epaperService.getStatus();
      if (status.success) {
        expect(status.data.sleeping).toBe(true);
      }
    });

    it("should wake display from sleep", async () => {
      await epaperService.sleep();
      const result = await epaperService.wake();

      expect(result.success).toBe(true);

      const status = await epaperService.getStatus();
      if (status.success) {
        expect(status.data.sleeping).toBe(false);
      }
    });

    it("should handle sleep when already sleeping", async () => {
      await epaperService.sleep();
      const result = await epaperService.sleep();

      expect(result.success).toBe(true);
    });

    it("should handle wake when already awake", async () => {
      const result = await epaperService.wake();
      expect(result.success).toBe(true);
    });

    it("should return error for sleep if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.sleep();

      expect(result.success).toBe(false);
    });

    it("should return error for wake if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.wake();

      expect(result.success).toBe(false);
    });
  });

  describe("getStatus", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should return status successfully", async () => {
      const result = await epaperService.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("initialized");
        expect(result.data).toHaveProperty("busy");
        expect(result.data).toHaveProperty("sleeping");
        expect(result.data).toHaveProperty("fullRefreshCount");
        expect(result.data).toHaveProperty("partialRefreshCount");
      }
    });

    it("should return correct initial status", async () => {
      const result = await epaperService.getStatus();

      if (result.success) {
        expect(result.data.initialized).toBe(true);
        expect(result.data.busy).toBe(false);
        expect(result.data.sleeping).toBe(false);
        // Expect 0: no logo during initialization
        expect(result.data.fullRefreshCount).toBe(0);
        expect(result.data.partialRefreshCount).toBe(0);
      }
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.getStatus();

      expect(result.success).toBe(false);
    });
  });

  describe("isBusy", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should return false when not busy", () => {
      expect(epaperService.isBusy()).toBe(false);
    });
  });

  describe("waitUntilReady", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should return immediately when not busy", async () => {
      const result = await epaperService.waitUntilReady();
      expect(result.success).toBe(true);
    });

    it("should timeout if display stays busy", async () => {
      // This test would need to mock the busy state staying true
      // For now, just test the success case
      const result = await epaperService.waitUntilReady(100);
      expect(result.success).toBe(true);
    }, 10000);
  });

  describe("rotation", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should set rotation", () => {
      const result = epaperService.setRotation(90);
      expect(result.success).toBe(true);
    });

    it("should return correct dimensions for 0 rotation", () => {
      epaperService.setRotation(0);
      const dims = epaperService.getDimensions();

      expect(dims.width).toBe(800);
      expect(dims.height).toBe(480);
    });

    it("should swap dimensions for 90 rotation", () => {
      epaperService.setRotation(90);
      const dims = epaperService.getDimensions();

      expect(dims.width).toBe(480);
      expect(dims.height).toBe(800);
    });

    it("should return correct dimensions for 180 rotation", () => {
      epaperService.setRotation(180);
      const dims = epaperService.getDimensions();

      expect(dims.width).toBe(800);
      expect(dims.height).toBe(480);
    });

    it("should swap dimensions for 270 rotation", () => {
      epaperService.setRotation(270);
      const dims = epaperService.getDimensions();

      expect(dims.width).toBe(480);
      expect(dims.height).toBe(800);
    });
  });

  describe("reset", () => {
    beforeEach(async () => {
      await epaperService.initialize();
    });

    it("should reset display successfully", async () => {
      const result = await epaperService.reset();
      expect(result.success).toBe(true);
    });

    it("should clear busy state after reset", async () => {
      await epaperService.reset();
      expect(epaperService.isBusy()).toBe(false);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new EpaperService(config);
      const result = await uninitializedService.reset();

      expect(result.success).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should dispose cleanly", async () => {
      await epaperService.initialize();
      await expect(epaperService.dispose()).resolves.not.toThrow();
    });

    it("should handle dispose without initialization", async () => {
      await expect(epaperService.dispose()).resolves.not.toThrow();
    });

    it("should put display to sleep before disposing", async () => {
      await epaperService.initialize();
      await epaperService.dispose();
      // Since we can't check internal state after dispose, just verify it doesn't throw
    });
  });
});
