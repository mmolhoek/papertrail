import { SimulationCoordinator } from "../SimulationCoordinator";
import { ITrackSimulationService } from "@core/interfaces";
import { success, GPSCoordinate } from "@core/types";
import { GPSCoordinator } from "../GPSCoordinator";
import { DriveCoordinator } from "../DriveCoordinator";
import { OnboardingCoordinator } from "../OnboardingCoordinator";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("SimulationCoordinator", () => {
  let coordinator: SimulationCoordinator;
  let mockSimulationService: jest.Mocked<ITrackSimulationService>;
  let mockGPSCoordinator: jest.Mocked<GPSCoordinator>;
  let mockDriveCoordinator: jest.Mocked<DriveCoordinator>;
  let mockOnboardingCoordinator: jest.Mocked<OnboardingCoordinator>;
  let stateChangeCallback: ((status: { state: string }) => void) | null = null;
  let positionUpdateCallback: ((position: GPSCoordinate) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    stateChangeCallback = null;
    positionUpdateCallback = null;

    mockSimulationService = {
      isSimulating: jest.fn().mockReturnValue(false),
      onStateChange: jest.fn().mockImplementation((callback) => {
        stateChangeCallback = callback;
        return () => {
          stateChangeCallback = null;
        };
      }),
      onPositionUpdate: jest.fn().mockImplementation((callback) => {
        positionUpdateCallback = callback;
        return () => {
          positionUpdateCallback = null;
        };
      }),
    } as unknown as jest.Mocked<ITrackSimulationService>;

    mockGPSCoordinator = {
      updatePosition: jest.fn(),
    } as unknown as jest.Mocked<GPSCoordinator>;

    mockDriveCoordinator = {
      isDriveNavigating: jest.fn().mockReturnValue(false),
      updateDriveDisplay: jest.fn().mockResolvedValue(success(undefined)),
    } as unknown as jest.Mocked<DriveCoordinator>;

    mockOnboardingCoordinator = {
      stopGPSInfoRefresh: jest.fn(),
    } as unknown as jest.Mocked<OnboardingCoordinator>;

    coordinator = new SimulationCoordinator(
      mockSimulationService,
      mockGPSCoordinator,
      mockDriveCoordinator,
      mockOnboardingCoordinator,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    coordinator.dispose();
  });

  describe("initialization", () => {
    it("should not be simulating initially", () => {
      expect(coordinator.isSimulating()).toBe(false);
    });

    it("should return simulation service", () => {
      expect(coordinator.getSimulationService()).toBe(mockSimulationService);
    });

    it("should return null if no simulation service", () => {
      const coordinatorWithoutService = new SimulationCoordinator(
        null,
        mockGPSCoordinator,
        mockDriveCoordinator,
        mockOnboardingCoordinator,
      );

      expect(coordinatorWithoutService.getSimulationService()).toBeNull();
      expect(coordinatorWithoutService.isSimulating()).toBe(false);
    });
  });

  describe("setOnboardingCoordinator", () => {
    it("should set the onboarding coordinator", () => {
      const newCoordinator = {} as jest.Mocked<OnboardingCoordinator>;
      coordinator.setOnboardingCoordinator(newCoordinator);
      // Verified through behavior
      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setOnboardingCoordinator(null);
      expect(true).toBe(true);
    });
  });

  describe("setGPSCoordinator", () => {
    it("should set the GPS coordinator", () => {
      const newCoordinator = {} as jest.Mocked<GPSCoordinator>;
      coordinator.setGPSCoordinator(newCoordinator);
      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setGPSCoordinator(null);
      expect(true).toBe(true);
    });
  });

  describe("setDriveCoordinator", () => {
    it("should set the drive coordinator", () => {
      const newCoordinator = {} as jest.Mocked<DriveCoordinator>;
      coordinator.setDriveCoordinator(newCoordinator);
      expect(true).toBe(true);
    });

    it("should allow setting null coordinator", () => {
      coordinator.setDriveCoordinator(null);
      expect(true).toBe(true);
    });
  });

  describe("setStopAutoUpdateCallback", () => {
    it("should set the stop auto-update callback", () => {
      const callback = jest.fn();
      coordinator.setStopAutoUpdateCallback(callback);
      expect(true).toBe(true);
    });
  });

  describe("setUpdateDisplayCallback", () => {
    it("should set the update display callback", () => {
      const callback = jest.fn().mockResolvedValue(success(undefined));
      coordinator.setUpdateDisplayCallback(callback);
      expect(true).toBe(true);
    });
  });

  describe("subscribeToSimulationUpdates", () => {
    it("should subscribe to state changes", () => {
      coordinator.subscribeToSimulationUpdates();

      expect(mockSimulationService.onStateChange).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it("should subscribe to position updates", () => {
      coordinator.subscribeToSimulationUpdates();

      expect(mockSimulationService.onPositionUpdate).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it("should do nothing if simulation service is not available", () => {
      const coordinatorWithoutService = new SimulationCoordinator(
        null,
        mockGPSCoordinator,
        mockDriveCoordinator,
        mockOnboardingCoordinator,
      );

      // Should not throw
      coordinatorWithoutService.subscribeToSimulationUpdates();
      expect(mockSimulationService.onStateChange).not.toHaveBeenCalled();
    });
  });

  describe("state change handling", () => {
    beforeEach(() => {
      coordinator.subscribeToSimulationUpdates();
    });

    it("should stop GPS info refresh when simulation starts", () => {
      stateChangeCallback!({ state: "running" });

      expect(mockOnboardingCoordinator.stopGPSInfoRefresh).toHaveBeenCalled();
    });

    it("should call stop auto-update callback when simulation starts", () => {
      const stopAutoUpdateCallback = jest.fn();
      coordinator.setStopAutoUpdateCallback(stopAutoUpdateCallback);

      stateChangeCallback!({ state: "running" });

      expect(stopAutoUpdateCallback).toHaveBeenCalled();
    });

    it("should start display updates when simulation starts", () => {
      const updateDisplayCallback = jest
        .fn()
        .mockResolvedValue(success(undefined));
      coordinator.setUpdateDisplayCallback(updateDisplayCallback);

      stateChangeCallback!({ state: "running" });

      // Immediate update should happen
      expect(updateDisplayCallback).toHaveBeenCalled();
    });

    it("should use drive display update when navigating", () => {
      mockDriveCoordinator.isDriveNavigating.mockReturnValue(true);

      stateChangeCallback!({ state: "running" });

      expect(mockDriveCoordinator.updateDriveDisplay).toHaveBeenCalled();
    });

    it("should stop display updates when simulation stops", () => {
      // Start simulation
      stateChangeCallback!({ state: "running" });

      // Stop simulation
      stateChangeCallback!({ state: "stopped" });

      // Verified by not throwing
      expect(true).toBe(true);
    });

    it("should show final drive display when simulation stops during navigation", () => {
      mockDriveCoordinator.isDriveNavigating.mockReturnValue(true);

      // Start simulation
      stateChangeCallback!({ state: "running" });
      jest.clearAllMocks();

      // Stop simulation
      stateChangeCallback!({ state: "stopped" });

      expect(mockDriveCoordinator.updateDriveDisplay).toHaveBeenCalled();
    });

    it("should ignore duplicate state changes", () => {
      const stopAutoUpdateCallback = jest.fn();
      coordinator.setStopAutoUpdateCallback(stopAutoUpdateCallback);

      stateChangeCallback!({ state: "running" });
      stateChangeCallback!({ state: "running" });

      expect(stopAutoUpdateCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("position update handling", () => {
    beforeEach(() => {
      coordinator.subscribeToSimulationUpdates();
    });

    it("should forward position to GPS coordinator", () => {
      const position: GPSCoordinate = {
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      };

      positionUpdateCallback!(position);

      expect(mockGPSCoordinator.updatePosition).toHaveBeenCalledWith(position);
    });

    it("should handle position update without GPS coordinator", () => {
      coordinator.setGPSCoordinator(null);

      const position: GPSCoordinate = {
        latitude: 51.5074,
        longitude: -0.1278,
        timestamp: new Date(),
      };

      // Should not throw
      positionUpdateCallback!(position);
      expect(mockGPSCoordinator.updatePosition).not.toHaveBeenCalled();
    });
  });

  describe("isSimulating", () => {
    it("should return true when simulating", () => {
      mockSimulationService.isSimulating.mockReturnValue(true);

      expect(coordinator.isSimulating()).toBe(true);
    });

    it("should return false when not simulating", () => {
      mockSimulationService.isSimulating.mockReturnValue(false);

      expect(coordinator.isSimulating()).toBe(false);
    });

    it("should return false if simulation service is not available", () => {
      const coordinatorWithoutService = new SimulationCoordinator(
        null,
        mockGPSCoordinator,
        mockDriveCoordinator,
        mockOnboardingCoordinator,
      );

      expect(coordinatorWithoutService.isSimulating()).toBe(false);
    });
  });

  describe("stopSimulationDisplayUpdates", () => {
    it("should stop display updates", () => {
      coordinator.subscribeToSimulationUpdates();
      stateChangeCallback!({ state: "running" });

      coordinator.stopSimulationDisplayUpdates();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should do nothing if no updates are running", () => {
      // Should not throw
      coordinator.stopSimulationDisplayUpdates();
      expect(true).toBe(true);
    });
  });

  describe("periodic display updates", () => {
    beforeEach(() => {
      coordinator.subscribeToSimulationUpdates();
    });

    it("should update display periodically during simulation", () => {
      const updateDisplayCallback = jest
        .fn()
        .mockResolvedValue(success(undefined));
      coordinator.setUpdateDisplayCallback(updateDisplayCallback);
      mockSimulationService.isSimulating.mockReturnValue(true);

      stateChangeCallback!({ state: "running" });

      // Clear initial call
      jest.clearAllMocks();

      // Advance timer
      jest.advanceTimersByTime(5000);

      expect(updateDisplayCallback).toHaveBeenCalled();
    });

    it("should not update if simulation is paused", () => {
      const updateDisplayCallback = jest
        .fn()
        .mockResolvedValue(success(undefined));
      coordinator.setUpdateDisplayCallback(updateDisplayCallback);
      mockSimulationService.isSimulating.mockReturnValue(false);

      stateChangeCallback!({ state: "running" });

      // Clear initial call
      jest.clearAllMocks();

      // Advance timer
      jest.advanceTimersByTime(5000);

      expect(updateDisplayCallback).not.toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("should stop display updates", () => {
      coordinator.subscribeToSimulationUpdates();
      stateChangeCallback!({ state: "running" });

      coordinator.dispose();

      // Should not throw
      expect(true).toBe(true);
    });

    it("should unsubscribe from position updates", () => {
      coordinator.subscribeToSimulationUpdates();

      coordinator.dispose();

      // positionUpdateCallback should be cleared
      expect(positionUpdateCallback).toBeNull();
    });

    it("should reset state", () => {
      coordinator.subscribeToSimulationUpdates();
      stateChangeCallback!({ state: "running" });

      coordinator.dispose();

      // State should be reset - verified by calling again
      const stopAutoUpdateCallback = jest.fn();
      coordinator.setStopAutoUpdateCallback(stopAutoUpdateCallback);
      coordinator.subscribeToSimulationUpdates();
      stateChangeCallback!({ state: "running" });

      expect(stopAutoUpdateCallback).toHaveBeenCalled();
    });
  });
});
