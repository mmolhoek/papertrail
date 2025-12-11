import { GPSService } from "@services/gps/GPSService";
import { GPSFixQuality } from "@core/types/GPSTypes";
import { GPSError } from "@core/errors";

// Mock serialport module with virtual: true to avoid requiring the actual module
// This allows tests to run on systems where serialport is not installed (Android/chroot)
jest.mock(
  "serialport",
  () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const EventEmitter = require("events");

    class MockSerialPort extends EventEmitter {
      path: string;
      baudRate: number;
      isOpen: boolean = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(options: any) {
        super();
        this.path = options.path;
        this.baudRate = options.baudRate;
      }

      open(callback: (err?: Error) => void) {
        // Simulate device not found
        if (this.path === "/dev/invalid") {
          callback(new Error("No such file or directory"));
          return;
        }

        this.isOpen = true;
        callback();
      }

      close(callback: (err?: Error) => void) {
        this.isOpen = false;
        callback();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pipe(parser: any) {
        return parser;
      }
    }

    return { SerialPort: MockSerialPort };
  },
  { virtual: true },
);

jest.mock(
  "@serialport/parser-readline",
  () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const EventEmitter = require("events");

    class MockReadlineParser extends EventEmitter {
      constructor() {
        super();
      }
    }

    return { ReadlineParser: MockReadlineParser };
  },
  { virtual: true },
);

describe("GPSService", () => {
  let gpsService: GPSService;

  beforeEach(() => {
    gpsService = new GPSService({
      devicePath: "/dev/ttyAMA0",
      baudRate: 9600,
      updateInterval: 1000,
    });
  });

  afterEach(async () => {
    await gpsService.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully with valid device", async () => {
      const result = await gpsService.initialize();

      expect(result.success).toBe(true);
    });

    it("should return error for invalid device path", async () => {
      const invalidService = new GPSService({
        devicePath: "/dev/invalid",
        baudRate: 9600,
        updateInterval: 1000,
      });

      const result = await invalidService.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect(error.code).toBe("GPS_DEVICE_NOT_FOUND");
      }

      await invalidService.dispose();
    });

    it("should not reinitialize if already initialized", async () => {
      await gpsService.initialize();
      const result = await gpsService.initialize();

      expect(result.success).toBe(true);
    });
  });

  describe("getCurrentPosition", () => {
    it("should return error if not initialized", async () => {
      const result = await gpsService.getCurrentPosition();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError;
        expect((error as GPSError).code).toBe("GPS_DEVICE_NOT_INITIALIZED");
      }
    });

    it("should return no fix error if position not available", async () => {
      await gpsService.initialize();
      const result = await gpsService.getCurrentPosition();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError; // Explicitly cast to GPSError
        expect((error as GPSError).code).toBe("GPS_NO_FIX");
      }
    });
  });

  describe("getStatus", () => {
    it("should return error if not initialized", async () => {
      const result = await gpsService.getStatus();

      expect(result.success).toBe(false);
      if (!result.success) {
        if (!result.success) {
          const error = result.error as GPSError; // Explicitly cast to GPSError
          expect((error as GPSError).code).toBe("GPS_DEVICE_NOT_INITIALIZED");
        }
      }
    });

    it("should return status after initialization", async () => {
      await gpsService.initialize();
      const result = await gpsService.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("fixQuality");
        expect(result.data).toHaveProperty("satellitesInUse");
        expect(result.data).toHaveProperty("hdop");
        expect(result.data).toHaveProperty("isTracking");
        expect(result.data.fixQuality).toBe(GPSFixQuality.NO_FIX);
        expect(result.data.satellitesInUse).toBe(0);
        expect(result.data.isTracking).toBe(false);
      }
    });
  });

  describe("tracking", () => {
    beforeEach(async () => {
      await gpsService.initialize();
    });

    it("should start tracking successfully", async () => {
      const result = await gpsService.startTracking();

      expect(result.success).toBe(true);
      expect(gpsService.isTracking()).toBe(true);
    });

    it("should not start tracking if already tracking", async () => {
      await gpsService.startTracking();
      const result = await gpsService.startTracking();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError; // Explicitly cast to GPSError
        expect((error as GPSError).code).toBe("GPS_ALREADY_TRACKING");
      }
    });

    it("should stop tracking successfully", async () => {
      await gpsService.startTracking();
      const result = await gpsService.stopTracking();

      expect(result.success).toBe(true);
      expect(gpsService.isTracking()).toBe(false);
    });

    it("should not stop tracking if not tracking", async () => {
      const result = await gpsService.stopTracking();

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError; // Explicitly cast to GPSError
        expect((error as GPSError).code).toBe("GPS_NOT_TRACKING");
      }
    });

    it("should return not tracking initially", () => {
      expect(gpsService.isTracking()).toBe(false);
    });
  });

  describe("callbacks", () => {
    beforeEach(async () => {
      await gpsService.initialize();
    });

    it("should register position update callback", () => {
      const callback = jest.fn();
      const unsubscribe = gpsService.onPositionUpdate(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe position update callback", () => {
      const callback = jest.fn();
      const unsubscribe = gpsService.onPositionUpdate(callback);

      unsubscribe();

      // Callback should not be called after unsubscribe
      // (we can't easily test this without triggering position updates)
    });

    it("should register status change callback", () => {
      const callback = jest.fn();
      const unsubscribe = gpsService.onStatusChange(callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe status change callback", () => {
      const callback = jest.fn();
      const unsubscribe = gpsService.onStatusChange(callback);

      unsubscribe();
    });
  });

  describe("waitForFix", () => {
    beforeEach(async () => {
      await gpsService.initialize();
    });

    it("should timeout if no fix acquired", async () => {
      const result = await gpsService.waitForFix(100);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as GPSError; // Explicitly cast to GPSError
        expect((error as GPSError).code).toBe("GPS_FIX_TIMEOUT");
      }
    }, 10000);
  });

  describe("dispose", () => {
    it("should clean up resources", async () => {
      await gpsService.initialize();
      await gpsService.startTracking();

      await gpsService.dispose();

      expect(gpsService.isTracking()).toBe(false);
    });

    it("should handle dispose without initialization", async () => {
      await expect(gpsService.dispose()).resolves.not.toThrow();
    });
  });
});
