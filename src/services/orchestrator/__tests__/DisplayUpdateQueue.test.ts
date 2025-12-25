import {
  DisplayUpdateQueue,
  DriveDisplayUpdateQueue,
  ActiveGPXQueue,
} from "../DisplayUpdateQueue";
import { DisplayUpdateMode } from "@core/types";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("DisplayUpdateQueue", () => {
  let queue: DisplayUpdateQueue;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ legacyFakeTimers: true });
    queue = new DisplayUpdateQueue();
    mockHandler = jest.fn().mockResolvedValue(undefined);
    queue.setUpdateHandler(mockHandler);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("should not be in progress initially", () => {
      expect(queue.isInProgress()).toBe(false);
    });

    it("should not have pending update initially", () => {
      expect(queue.hasPendingUpdate()).toBe(false);
    });

    it("should return null for pending mode initially", () => {
      expect(queue.getPendingMode()).toBeNull();
    });
  });

  describe("setUpdateHandler", () => {
    it("should set the update handler", () => {
      const newQueue = new DisplayUpdateQueue();
      const handler = jest.fn();
      newQueue.setUpdateHandler(handler);

      // Handler is set but we can't directly verify - we test via behavior
      expect(newQueue.isInProgress()).toBe(false);
    });
  });

  describe("queueUpdate", () => {
    it("should return true and mark in progress when no update is running", async () => {
      const result = await queue.queueUpdate(DisplayUpdateMode.PARTIAL);

      expect(result).toBe(true);
      expect(queue.isInProgress()).toBe(true);
    });

    it("should return false and queue when update is in progress", async () => {
      // Start first update
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);

      // Try to queue second update
      const result = await queue.queueUpdate(DisplayUpdateMode.AUTO);

      expect(result).toBe(false);
      expect(queue.hasPendingUpdate()).toBe(true);
      expect(queue.getPendingMode()).toBe(DisplayUpdateMode.AUTO);
    });

    it("should keep FULL mode when FULL is requested", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);

      // Queue FULL update
      await queue.queueUpdate(DisplayUpdateMode.FULL);

      expect(queue.getPendingMode()).toBe(DisplayUpdateMode.FULL);

      // Queue AUTO - should keep FULL
      await queue.queueUpdate(DisplayUpdateMode.AUTO);

      expect(queue.getPendingMode()).toBe(DisplayUpdateMode.FULL);
    });

    it("should default to AUTO mode when no mode specified", async () => {
      await queue.queueUpdate();

      // Start another to see pending
      await queue.queueUpdate();

      expect(queue.getPendingMode()).toBe(DisplayUpdateMode.AUTO);
    });

    it("should return false when isBusy returns true", async () => {
      const isBusy = jest.fn().mockReturnValue(true);

      const result = await queue.queueUpdate(DisplayUpdateMode.PARTIAL, isBusy);

      expect(result).toBe(false);
      expect(queue.hasPendingUpdate()).toBe(true);
      expect(queue.isInProgress()).toBe(false);
    });

    it("should return true when isBusy returns false", async () => {
      const isBusy = jest.fn().mockReturnValue(false);

      const result = await queue.queueUpdate(DisplayUpdateMode.PARTIAL, isBusy);

      expect(result).toBe(true);
      expect(queue.isInProgress()).toBe(true);
    });
  });

  describe("completeUpdate", () => {
    it("should mark update as no longer in progress", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);
      expect(queue.isInProgress()).toBe(true);

      queue.completeUpdate();

      expect(queue.isInProgress()).toBe(false);
    });

    it("should process pending update via setImmediate", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);
      await queue.queueUpdate(DisplayUpdateMode.FULL);

      queue.completeUpdate();

      // Run setImmediate callbacks
      jest.runAllImmediates();

      expect(mockHandler).toHaveBeenCalledWith(DisplayUpdateMode.FULL);
    });

    it("should clear pending mode after processing", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);
      await queue.queueUpdate(DisplayUpdateMode.FULL);

      queue.completeUpdate();

      expect(queue.hasPendingUpdate()).toBe(false);
      expect(queue.getPendingMode()).toBeNull();
    });

    it("should not call handler if no pending update", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);

      queue.completeUpdate();
      jest.runAllImmediates();

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should not call handler if handler not set", async () => {
      const newQueue = new DisplayUpdateQueue();
      await newQueue.queueUpdate(DisplayUpdateMode.PARTIAL);
      await newQueue.queueUpdate(DisplayUpdateMode.FULL);

      // Should not throw
      newQueue.completeUpdate();
      jest.runAllImmediates();
    });
  });

  describe("reset", () => {
    it("should reset in progress state", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);
      expect(queue.isInProgress()).toBe(true);

      queue.reset();

      expect(queue.isInProgress()).toBe(false);
    });

    it("should reset pending update", async () => {
      await queue.queueUpdate(DisplayUpdateMode.PARTIAL);
      await queue.queueUpdate(DisplayUpdateMode.FULL);

      queue.reset();

      expect(queue.hasPendingUpdate()).toBe(false);
      expect(queue.getPendingMode()).toBeNull();
    });
  });
});

describe("DriveDisplayUpdateQueue", () => {
  let queue: DriveDisplayUpdateQueue;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ legacyFakeTimers: true });
    queue = new DriveDisplayUpdateQueue();
    mockHandler = jest.fn().mockResolvedValue(undefined);
    queue.setUpdateHandler(mockHandler);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("should not be in progress initially", () => {
      expect(queue.isInProgress()).toBe(false);
    });

    it("should not have pending update initially", () => {
      expect(queue.hasPendingUpdate()).toBe(false);
    });
  });

  describe("queueUpdate", () => {
    it("should return true when no update is running", () => {
      const result = queue.queueUpdate();

      expect(result).toBe(true);
      expect(queue.isInProgress()).toBe(true);
    });

    it("should return false and queue when update is in progress", () => {
      queue.queueUpdate();

      const result = queue.queueUpdate();

      expect(result).toBe(false);
      expect(queue.hasPendingUpdate()).toBe(true);
    });

    it("should return false when isBusy returns true", () => {
      const isBusy = jest.fn().mockReturnValue(true);

      const result = queue.queueUpdate(isBusy);

      expect(result).toBe(false);
      expect(queue.hasPendingUpdate()).toBe(true);
    });
  });

  describe("completeUpdate", () => {
    it("should mark update as no longer in progress", () => {
      queue.queueUpdate();
      expect(queue.isInProgress()).toBe(true);

      queue.completeUpdate();

      expect(queue.isInProgress()).toBe(false);
    });

    it("should process pending update via setImmediate", () => {
      queue.queueUpdate();
      queue.queueUpdate();

      queue.completeUpdate();
      jest.runAllImmediates();

      expect(mockHandler).toHaveBeenCalled();
    });

    it("should handle errors in pending update handler", () => {
      mockHandler.mockRejectedValue(new Error("Handler error"));

      queue.queueUpdate();
      queue.queueUpdate();

      queue.completeUpdate();
      jest.runAllImmediates();

      // Should not throw, error is caught
      expect(mockHandler).toHaveBeenCalled();
    });

    it("should clear pending flag after processing", () => {
      queue.queueUpdate();
      queue.queueUpdate();

      queue.completeUpdate();

      expect(queue.hasPendingUpdate()).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      queue.queueUpdate();
      queue.queueUpdate();

      queue.reset();

      expect(queue.isInProgress()).toBe(false);
      expect(queue.hasPendingUpdate()).toBe(false);
    });
  });
});

describe("ActiveGPXQueue", () => {
  let queue: ActiveGPXQueue;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ legacyFakeTimers: true });
    queue = new ActiveGPXQueue();
    mockHandler = jest.fn().mockResolvedValue(undefined);
    queue.setOperationHandler(mockHandler);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("should not be in progress initially", () => {
      expect(queue.isOperationInProgress()).toBe(false);
    });

    it("should return null for pending path initially", () => {
      expect(queue.getPendingPath()).toBeNull();
    });
  });

  describe("queueOperation", () => {
    it("should return true when no operation is running", () => {
      const result = queue.queueOperation("/path/to/track.gpx");

      expect(result).toBe(true);
      expect(queue.isOperationInProgress()).toBe(true);
    });

    it("should return false and queue when operation is in progress", () => {
      queue.queueOperation("/path/first.gpx");

      const result = queue.queueOperation("/path/second.gpx");

      expect(result).toBe(false);
      expect(queue.getPendingPath()).toBe("/path/second.gpx");
    });

    it("should replace pending path with latest request", () => {
      queue.queueOperation("/path/first.gpx");
      queue.queueOperation("/path/second.gpx");
      queue.queueOperation("/path/third.gpx");

      expect(queue.getPendingPath()).toBe("/path/third.gpx");
    });
  });

  describe("completeOperation", () => {
    it("should mark operation as no longer in progress", () => {
      queue.queueOperation("/path/track.gpx");
      expect(queue.isOperationInProgress()).toBe(true);

      queue.completeOperation();

      expect(queue.isOperationInProgress()).toBe(false);
    });

    it("should process pending path via setImmediate", () => {
      queue.queueOperation("/path/first.gpx");
      queue.queueOperation("/path/second.gpx");

      queue.completeOperation();
      jest.runAllImmediates();

      expect(mockHandler).toHaveBeenCalledWith("/path/second.gpx");
    });

    it("should clear pending path after processing", () => {
      queue.queueOperation("/path/first.gpx");
      queue.queueOperation("/path/second.gpx");

      queue.completeOperation();

      expect(queue.getPendingPath()).toBeNull();
    });

    it("should not call handler if no pending path", () => {
      queue.queueOperation("/path/track.gpx");

      queue.completeOperation();
      jest.runAllImmediates();

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      queue.queueOperation("/path/first.gpx");
      queue.queueOperation("/path/second.gpx");

      queue.reset();

      expect(queue.isOperationInProgress()).toBe(false);
      expect(queue.getPendingPath()).toBeNull();
    });
  });
});
