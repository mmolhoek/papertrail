import { DisplayError, DisplayErrorCode } from "@errors/DisplayError";

describe("DisplayError", () => {
  describe("constructor", () => {
    it("should create error with message and default code", () => {
      const error = new DisplayError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(DisplayErrorCode.UNKNOWN);
      expect(error.recoverable).toBe(false);
    });

    it("should create error with all parameters", () => {
      const error = new DisplayError(
        "Test error",
        DisplayErrorCode.DISPLAY_BUSY,
        true,
        { operation: "refresh" },
      );
      expect(error.message).toBe("Test error");
      expect(error.code).toBe(DisplayErrorCode.DISPLAY_BUSY);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("static factory methods", () => {
    it("deviceNotFound should create error with device path", () => {
      const error = DisplayError.deviceNotFound("/dev/spidev0.0");

      expect(error.message).toContain("/dev/spidev0.0");
      expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_FOUND);
      expect(error.recoverable).toBe(false);
    });

    it("initFailed should create error with reason", () => {
      const error = DisplayError.initFailed("GPIO initialization failed");

      expect(error.message).toContain("GPIO initialization failed");
      expect(error.code).toBe(DisplayErrorCode.DEVICE_INIT_FAILED);
      expect(error.recoverable).toBe(false);
    });

    it("initFailed should create error with reason and original error", () => {
      const original = new Error("Permission denied");
      const error = DisplayError.initFailed("GPIO error", original);

      expect(error.message).toContain("GPIO error");
      expect(error.code).toBe(DisplayErrorCode.DEVICE_INIT_FAILED);
      expect(error.recoverable).toBe(false);
    });

    it("notInitialized should create error for not initialized state", () => {
      const error = DisplayError.notInitialized();

      expect(error.message).toContain("not initialized");
      expect(error.code).toBe(DisplayErrorCode.DEVICE_NOT_INITIALIZED);
      expect(error.recoverable).toBe(false);
    });

    it("displayBusy should create error for busy state", () => {
      const error = DisplayError.displayBusy();

      expect(error.message).toContain("busy");
      expect(error.code).toBe(DisplayErrorCode.DISPLAY_BUSY);
      expect(error.recoverable).toBe(true);
    });

    it("timeout should create error with operation and timeout", () => {
      const error = DisplayError.timeout("refresh", 5000);

      expect(error.message).toContain("refresh");
      expect(error.message).toContain("5000");
      expect(error.code).toBe(DisplayErrorCode.DISPLAY_TIMEOUT);
      expect(error.recoverable).toBe(true);
    });

    it("invalidBitmap should create error with reason", () => {
      const error = DisplayError.invalidBitmap("data is null");

      expect(error.message).toContain("data is null");
      expect(error.code).toBe(DisplayErrorCode.INVALID_BITMAP);
      expect(error.recoverable).toBe(false);
    });

    it("sizeMismatch should create error with dimensions", () => {
      const error = DisplayError.sizeMismatch(640, 480, 800, 600);

      expect(error.message).toContain("640");
      expect(error.message).toContain("480");
      expect(error.message).toContain("800");
      expect(error.message).toContain("600");
      expect(error.code).toBe(DisplayErrorCode.BITMAP_SIZE_MISMATCH);
      expect(error.recoverable).toBe(false);
    });

    it("renderFailed should create error with reason", () => {
      const error = DisplayError.renderFailed("memory overflow");

      expect(error.message).toContain("memory overflow");
      expect(error.code).toBe(DisplayErrorCode.RENDER_FAILED);
      expect(error.recoverable).toBe(false);
    });

    it("renderFailed should create error with reason and original error", () => {
      const original = new Error("Out of memory");
      const error = DisplayError.renderFailed("allocation failed", original);

      expect(error.message).toContain("allocation failed");
      expect(error.code).toBe(DisplayErrorCode.RENDER_FAILED);
    });

    it("projectionError should create error with coordinates and reason", () => {
      const error = DisplayError.projectionError(91.0, -180.5, "out of bounds");

      expect(error.message).toContain("91");
      expect(error.message).toContain("-180.5");
      expect(error.message).toContain("out of bounds");
      expect(error.code).toBe(DisplayErrorCode.PROJECTION_ERROR);
      expect(error.recoverable).toBe(false);
    });

    it("spiError should create error with original error", () => {
      const original = new Error("Bus not available");
      const error = DisplayError.spiError(original);

      expect(error.message).toContain("Bus not available");
      expect(error.code).toBe(DisplayErrorCode.SPI_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it("gpioError should create error with pin, operation, and error", () => {
      const original = new Error("Pin busy");
      const error = DisplayError.gpioError(17, "write", original);

      expect(error.message).toContain("17");
      expect(error.message).toContain("write");
      expect(error.message).toContain("Pin busy");
      expect(error.code).toBe(DisplayErrorCode.GPIO_ERROR);
      expect(error.recoverable).toBe(true);
    });

    it("updateFailed should create error with original error", () => {
      const original = new Error("Transfer failed");
      const error = DisplayError.updateFailed(original);

      expect(error.message).toContain("Transfer failed");
      expect(error.code).toBe(DisplayErrorCode.UPDATE_FAILED);
      expect(error.recoverable).toBe(true);
    });
  });

  describe("getUserMessage", () => {
    it("should return user message for DEVICE_NOT_FOUND", () => {
      const error = DisplayError.deviceNotFound("/dev/spi");
      expect(error.getUserMessage()).toBe(
        "E-paper display not found. Please check hardware connections.",
      );
    });

    it("should return user message for DEVICE_INIT_FAILED", () => {
      const error = DisplayError.initFailed("test");
      expect(error.getUserMessage()).toBe(
        "Failed to initialize display. Please restart the device.",
      );
    });

    it("should return user message for DISPLAY_BUSY", () => {
      const error = DisplayError.displayBusy();
      expect(error.getUserMessage()).toBe("Display is busy. Please wait.");
    });

    it("should return user message for DISPLAY_TIMEOUT", () => {
      const error = DisplayError.timeout("refresh", 5000);
      expect(error.getUserMessage()).toBe(
        "Display operation timed out. Please try again.",
      );
    });

    it("should return user message for BITMAP_SIZE_MISMATCH", () => {
      const error = DisplayError.sizeMismatch(100, 100, 200, 200);
      expect(error.getUserMessage()).toBe(
        "Image size does not match display. Please check configuration.",
      );
    });

    it("should return user message for RENDER_FAILED", () => {
      const error = DisplayError.renderFailed("test");
      expect(error.getUserMessage()).toBe(
        "Failed to render map. Please try again.",
      );
    });

    it("should return default user message for UNKNOWN", () => {
      const error = new DisplayError("Test", DisplayErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe(
        "Display error occurred. Please try again.",
      );
    });
  });
});
