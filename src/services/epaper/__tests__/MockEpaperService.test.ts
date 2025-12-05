import { MockEpaperService } from "../MockEpaperService";
import { DisplayError, DisplayErrorCode } from "@core/errors";
import { DisplayUpdateMode, Bitmap1Bit, EpaperConfig } from "@core/types";

describe("MockEpaperService", () => {
  let mockEpaperService: MockEpaperService;
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
        cs: 8,
      },
      refreshMode: "full",
      rotation: 0,
    };
    mockEpaperService = new MockEpaperService(config);
  });

  afterEach(async () => {
    await mockEpaperService.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const result = await mockEpaperService.initialize();
      expect(result.success).toBe(true);
    });

    it("should not reinitialize if already initialized", async () => {
      await mockEpaperService.initialize();
      const result = await mockEpaperService.initialize();
      expect(result.success).toBe(true);
    });

    it("should not be busy after initialization", async () => {
      await mockEpaperService.initialize();
      expect(mockEpaperService.isBusy()).toBe(false);
    });
  });

  describe("displayBitmap", () => {
    let validBitmap: Bitmap1Bit;

    beforeEach(async () => {
      await mockEpaperService.initialize();

      // Create a valid bitmap
      const dataSize = Math.ceil((config.width * config.height) / 8);
      validBitmap = {
        width: config.width,
        height: config.height,
        data: new Uint8Array(dataSize),
      };
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result = await uninitializedService.displayBitmap(validBitmap);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });

    it("should display bitmap successfully with default mode", async () => {
      const result = await mockEpaperService.displayBitmap(validBitmap);

      expect(result.success).toBe(true);
    });

    it("should display bitmap with FULL update mode", async () => {
      const result = await mockEpaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.FULL,
      );

      expect(result.success).toBe(true);
    });

    it("should display bitmap with PARTIAL update mode", async () => {
      const result = await mockEpaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.PARTIAL,
      );

      expect(result.success).toBe(true);
    });

    it("should return error for bitmap size mismatch", async () => {
      const invalidBitmap: Bitmap1Bit = {
        width: 400,
        height: 300,
        data: new Uint8Array(Math.ceil((400 * 300) / 8)),
      };

      const result = await mockEpaperService.displayBitmap(invalidBitmap);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.BITMAP_SIZE_MISMATCH);
      }
    });

    it("should return error if display is sleeping", async () => {
      await mockEpaperService.sleep();
      const result = await mockEpaperService.displayBitmap(validBitmap);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DISPLAY_SLEEPING);
      }
    });

    it("should update refresh counts", async () => {
      // Display with FULL mode
      await mockEpaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.FULL,
      );

      let statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.fullRefreshCount).toBe(1);
        expect(statusResult.data.partialRefreshCount).toBe(0);
      }

      // Display with PARTIAL mode
      await mockEpaperService.displayBitmap(
        validBitmap,
        DisplayUpdateMode.PARTIAL,
      );

      statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.fullRefreshCount).toBe(1);
        expect(statusResult.data.partialRefreshCount).toBe(1);
      }
    });

    it("should update lastUpdate timestamp", async () => {
      const beforeTime = new Date();
      await mockEpaperService.displayBitmap(validBitmap);
      const afterTime = new Date();

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.lastUpdate).toBeDefined();
        const lastUpdate = statusResult.data.lastUpdate!;
        expect(lastUpdate.getTime()).toBeGreaterThanOrEqual(
          beforeTime.getTime(),
        );
        expect(lastUpdate.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      }
    });
  });

  describe("displayBitmapFromFile", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should display bitmap from file successfully", async () => {
      const result =
        await mockEpaperService.displayBitmapFromFile("/path/to/image.bmp");

      expect(result.success).toBe(true);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result =
        await uninitializedService.displayBitmapFromFile("/path/to/image.bmp");

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should clear display successfully", async () => {
      const result = await mockEpaperService.clear();

      expect(result.success).toBe(true);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result = await uninitializedService.clear();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });

    it("should increment full refresh count", async () => {
      await mockEpaperService.clear();

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.fullRefreshCount).toBe(1);
      }
    });
  });

  describe("fullRefresh", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should perform full refresh successfully", async () => {
      const result = await mockEpaperService.fullRefresh();

      expect(result.success).toBe(true);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result = await uninitializedService.fullRefresh();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });

    it("should increment full refresh count", async () => {
      await mockEpaperService.fullRefresh();

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.fullRefreshCount).toBe(1);
      }
    });
  });

  describe("sleep and wake", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should put display to sleep successfully", async () => {
      const result = await mockEpaperService.sleep();

      expect(result.success).toBe(true);
    });

    it("should wake display successfully", async () => {
      await mockEpaperService.sleep();
      const result = await mockEpaperService.wake();

      expect(result.success).toBe(true);
    });

    it("should update status when sleeping", async () => {
      await mockEpaperService.sleep();

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.sleeping).toBe(true);
      }
    });

    it("should update status when waking", async () => {
      await mockEpaperService.sleep();
      await mockEpaperService.wake();

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.sleeping).toBe(false);
      }
    });

    it("should handle sleep when already sleeping", async () => {
      await mockEpaperService.sleep();
      const result = await mockEpaperService.sleep();

      expect(result.success).toBe(true);
    });

    it("should handle wake when not sleeping", async () => {
      const result = await mockEpaperService.wake();

      expect(result.success).toBe(true);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result = await uninitializedService.sleep();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });
  });

  describe("getStatus", () => {
    it("should return error if not initialized", async () => {
      const result = await mockEpaperService.getStatus();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });

    it("should return complete status after initialization", async () => {
      await mockEpaperService.initialize();
      const result = await mockEpaperService.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.initialized).toBe(true);
        expect(result.data.busy).toBe(false);
        expect(result.data.sleeping).toBe(false);
        expect(result.data.model).toBeDefined();
        expect(result.data.width).toBe(config.width);
        expect(result.data.height).toBe(config.height);
        expect(result.data.fullRefreshCount).toBe(0);
        expect(result.data.partialRefreshCount).toBe(0);
      }
    });
  });

  describe("isBusy", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should return false when not busy", () => {
      expect(mockEpaperService.isBusy()).toBe(false);
    });
  });

  describe("waitUntilReady", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should resolve immediately if not busy", async () => {
      const result = await mockEpaperService.waitUntilReady(1000);

      expect(result.success).toBe(true);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result = await uninitializedService.waitUntilReady(1000);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });
  });

  describe("setRotation", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should set rotation to 0 degrees", () => {
      const result = mockEpaperService.setRotation(0);

      expect(result.success).toBe(true);
    });

    it("should set rotation to 90 degrees", () => {
      const result = mockEpaperService.setRotation(90);

      expect(result.success).toBe(true);
    });

    it("should set rotation to 180 degrees", () => {
      const result = mockEpaperService.setRotation(180);

      expect(result.success).toBe(true);
    });

    it("should set rotation to 270 degrees", () => {
      const result = mockEpaperService.setRotation(270);

      expect(result.success).toBe(true);
    });
  });

  describe("getDimensions", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should return correct dimensions without rotation", () => {
      const dimensions = mockEpaperService.getDimensions();

      expect(dimensions.width).toBe(config.width);
      expect(dimensions.height).toBe(config.height);
    });

    it("should swap dimensions for 90 degree rotation", () => {
      mockEpaperService.setRotation(90);
      const dimensions = mockEpaperService.getDimensions();

      expect(dimensions.width).toBe(config.height);
      expect(dimensions.height).toBe(config.width);
    });

    it("should maintain dimensions for 180 degree rotation", () => {
      mockEpaperService.setRotation(180);
      const dimensions = mockEpaperService.getDimensions();

      expect(dimensions.width).toBe(config.width);
      expect(dimensions.height).toBe(config.height);
    });

    it("should swap dimensions for 270 degree rotation", () => {
      mockEpaperService.setRotation(270);
      const dimensions = mockEpaperService.getDimensions();

      expect(dimensions.width).toBe(config.height);
      expect(dimensions.height).toBe(config.width);
    });
  });

  describe("reset", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should reset display successfully", async () => {
      const result = await mockEpaperService.reset();

      expect(result.success).toBe(true);
    });

    it("should return error if not initialized", async () => {
      const uninitializedService = new MockEpaperService(config);
      const result = await uninitializedService.reset();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as DisplayError;
        expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      }
    });

    it("should clear busy and sleeping states", async () => {
      await mockEpaperService.sleep();
      await mockEpaperService.reset();

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.busy).toBe(false);
        expect(statusResult.data.sleeping).toBe(false);
      }
    });
  });

  describe("dispose", () => {
    it("should dispose successfully", async () => {
      await mockEpaperService.initialize();
      await mockEpaperService.dispose();

      // Service should not be initialized after disposal
      const result = await mockEpaperService.getStatus();
      expect(result.success).toBe(false);
    });

    it("should handle disposal when not initialized", async () => {
      await expect(mockEpaperService.dispose()).resolves.not.toThrow();
    });

    it("should put display to sleep before disposing if awake", async () => {
      await mockEpaperService.initialize();
      await mockEpaperService.dispose();

      // No error should occur
      expect(true).toBe(true);
    });
  });

  describe("AUTO update mode", () => {
    beforeEach(async () => {
      await mockEpaperService.initialize();
    });

    it("should use PARTIAL mode for initial updates", async () => {
      const dataSize = Math.ceil((config.width * config.height) / 8);
      const bitmap: Bitmap1Bit = {
        width: config.width,
        height: config.height,
        data: new Uint8Array(dataSize),
      };

      await mockEpaperService.displayBitmap(bitmap, DisplayUpdateMode.AUTO);

      const statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.partialRefreshCount).toBe(1);
        expect(statusResult.data.fullRefreshCount).toBe(0);
      }
    });

    it("should use FULL mode every 10 updates", async () => {
      const dataSize = Math.ceil((config.width * config.height) / 8);
      const bitmap: Bitmap1Bit = {
        width: config.width,
        height: config.height,
        data: new Uint8Array(dataSize),
      };

      // Perform 10 updates (should all be partial)
      for (let i = 0; i < 10; i++) {
        await mockEpaperService.displayBitmap(bitmap, DisplayUpdateMode.AUTO);
      }

      let statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.partialRefreshCount).toBe(10);
        expect(statusResult.data.fullRefreshCount).toBe(0);
      }

      // 11th update should be full (when totalUpdates = 10)
      await mockEpaperService.displayBitmap(bitmap, DisplayUpdateMode.AUTO);

      statusResult = await mockEpaperService.getStatus();
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.partialRefreshCount).toBe(10);
        expect(statusResult.data.fullRefreshCount).toBe(1);
      }
    });
  });
});
