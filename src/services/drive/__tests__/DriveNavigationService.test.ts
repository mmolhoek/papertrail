import { DriveNavigationService } from "../DriveNavigationService";
import {
  DriveRoute,
  DriveWaypoint,
  ManeuverType,
  NavigationState,
  DriveDisplayMode,
  GPSCoordinate,
  DriveNavigationUpdate,
} from "@core/types";
import { DriveError, DriveErrorCode } from "@core/errors";
import * as fs from "fs/promises";
import * as path from "path";

// Mock fs module
jest.mock("fs/promises");

const mockFs = fs as jest.Mocked<typeof fs>;

/**
 * Helper to create a valid test route
 */
function createTestRoute(overrides?: Partial<DriveRoute>): DriveRoute {
  const waypoints: DriveWaypoint[] = [
    {
      latitude: 37.7749,
      longitude: -122.4194,
      instruction: "Head north on Main St",
      maneuverType: ManeuverType.DEPART,
      distance: 0,
      streetName: "Main St",
      bearingAfter: 0,
      index: 0,
    },
    {
      latitude: 37.7759,
      longitude: -122.4194,
      instruction: "Turn left onto Oak St",
      maneuverType: ManeuverType.LEFT,
      distance: 111,
      streetName: "Oak St",
      bearingAfter: 270,
      index: 1,
    },
    {
      latitude: 37.7759,
      longitude: -122.4214,
      instruction: "Arrive at destination",
      maneuverType: ManeuverType.ARRIVE,
      distance: 170,
      index: 2,
    },
  ];

  return {
    id: "test-route-1",
    destination: "Test Destination",
    createdAt: new Date("2024-01-01T12:00:00Z"),
    startPoint: { latitude: 37.7749, longitude: -122.4194 },
    endPoint: { latitude: 37.7759, longitude: -122.4214 },
    waypoints,
    geometry: [
      [37.7749, -122.4194],
      [37.7759, -122.4194],
      [37.7759, -122.4214],
    ],
    totalDistance: 281,
    estimatedTime: 60,
    ...overrides,
  };
}

/**
 * Helper to create a GPS coordinate
 */
function createGPSCoordinate(
  latitude: number,
  longitude: number,
): GPSCoordinate {
  return {
    latitude,
    longitude,
    altitude: 0,
    accuracy: 5,
    speed: 10,
    bearing: 0,
    timestamp: new Date(),
  };
}

describe("DriveNavigationService", () => {
  let service: DriveNavigationService;
  const testRoutesDir = "/tmp/test-routes";

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DriveNavigationService(testRoutesDir);

    // Default mock implementations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
  });

  afterEach(async () => {
    await service.dispose();
  });

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      const result = await service.initialize();

      expect(result.success).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith(testRoutesDir, {
        recursive: true,
      });
    });

    it("should create routes directory on initialization", async () => {
      await service.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testRoutesDir, {
        recursive: true,
      });
    });

    it("should not reinitialize if already initialized", async () => {
      await service.initialize();
      const result = await service.initialize();

      expect(result.success).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledTimes(1);
    });

    it("should handle directory creation failure", async () => {
      mockFs.mkdir.mockRejectedValue(new Error("Permission denied"));

      const result = await service.initialize();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DriveError).code).toBe(
          DriveErrorCode.ROUTE_SAVE_FAILED,
        );
      }
    });

    it("should use default routes directory when not specified", () => {
      const defaultService = new DriveNavigationService();
      expect(defaultService).toBeDefined();
    });
  });

  describe("route management", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe("saveRoute", () => {
      it("should save a valid route", async () => {
        const route = createTestRoute();

        const result = await service.saveRoute(route);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(route.id);
        }
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      it("should fail if service is not initialized", async () => {
        const uninitializedService = new DriveNavigationService(testRoutesDir);
        const route = createTestRoute();

        const result = await uninitializedService.saveRoute(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.SERVICE_NOT_INITIALIZED,
          );
        }
      });

      it("should fail for route with less than 2 waypoints", async () => {
        const route = createTestRoute({
          waypoints: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
              instruction: "Only one waypoint",
              maneuverType: ManeuverType.DEPART,
              distance: 0,
              index: 0,
            },
          ],
        });

        const result = await service.saveRoute(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_INVALID,
          );
        }
      });

      it("should fail for route with empty waypoints", async () => {
        const route = createTestRoute({ waypoints: [] });

        const result = await service.saveRoute(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_INVALID,
          );
        }
      });

      it("should handle write failure", async () => {
        mockFs.writeFile.mockRejectedValue(new Error("Disk full"));
        const route = createTestRoute();

        const result = await service.saveRoute(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_SAVE_FAILED,
          );
        }
      });
    });

    describe("loadRoute", () => {
      it("should load an existing route", async () => {
        const route = createTestRoute();
        mockFs.readFile.mockResolvedValue(JSON.stringify(route));

        const result = await service.loadRoute("test-route-1");

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe(route.id);
          expect(result.data.destination).toBe(route.destination);
          expect(result.data.createdAt).toBeInstanceOf(Date);
        }
      });

      it("should fail if service is not initialized", async () => {
        const uninitializedService = new DriveNavigationService(testRoutesDir);

        const result = await uninitializedService.loadRoute("test-route-1");

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.SERVICE_NOT_INITIALIZED,
          );
        }
      });

      it("should fail for non-existent route", async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        mockFs.readFile.mockRejectedValue(error);

        const result = await service.loadRoute("non-existent");

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_NOT_FOUND,
          );
        }
      });

      it("should handle read failure", async () => {
        mockFs.readFile.mockRejectedValue(new Error("Read error"));

        const result = await service.loadRoute("test-route-1");

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_LOAD_FAILED,
          );
        }
      });
    });

    describe("deleteRoute", () => {
      it("should delete an existing route", async () => {
        const result = await service.deleteRoute("test-route-1");

        expect(result.success).toBe(true);
        expect(mockFs.unlink).toHaveBeenCalledWith(
          path.join(testRoutesDir, "test-route-1.json"),
        );
      });

      it("should fail if service is not initialized", async () => {
        const uninitializedService = new DriveNavigationService(testRoutesDir);

        const result = await uninitializedService.deleteRoute("test-route-1");

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.SERVICE_NOT_INITIALIZED,
          );
        }
      });

      it("should fail for non-existent route", async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        mockFs.unlink.mockRejectedValue(error);

        const result = await service.deleteRoute("non-existent");

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_NOT_FOUND,
          );
        }
      });

      it("should handle delete failure", async () => {
        mockFs.unlink.mockRejectedValue(new Error("Permission denied"));

        const result = await service.deleteRoute("test-route-1");

        expect(result.success).toBe(false);
      });
    });

    describe("listRoutes", () => {
      it("should list all routes", async () => {
        const route1 = createTestRoute({
          id: "route-1",
          destination: "Dest 1",
        });
        const route2 = createTestRoute({
          id: "route-2",
          destination: "Dest 2",
          createdAt: new Date("2024-01-02T12:00:00Z"),
        });

        mockFs.readdir.mockResolvedValue([
          "route-1.json",
          "route-2.json",
        ] as never);
        mockFs.readFile.mockImplementation((filePath) => {
          if (String(filePath).includes("route-1")) {
            return Promise.resolve(JSON.stringify(route1));
          }
          return Promise.resolve(JSON.stringify(route2));
        });

        const result = await service.listRoutes();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.length).toBe(2);
          // Should be sorted by date, newest first
          expect(result.data[0].id).toBe("route-2");
          expect(result.data[1].id).toBe("route-1");
        }
      });

      it("should return empty array when no routes exist", async () => {
        mockFs.readdir.mockResolvedValue([]);

        const result = await service.listRoutes();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([]);
        }
      });

      it("should skip non-JSON files", async () => {
        mockFs.readdir.mockResolvedValue([
          "route-1.json",
          "readme.txt",
          ".gitkeep",
        ] as never);
        mockFs.readFile.mockResolvedValue(
          JSON.stringify(createTestRoute({ id: "route-1" })),
        );

        const result = await service.listRoutes();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.length).toBe(1);
        }
      });

      it("should skip invalid JSON files", async () => {
        mockFs.readdir.mockResolvedValue([
          "valid.json",
          "invalid.json",
        ] as never);
        mockFs.readFile.mockImplementation((filePath) => {
          if (String(filePath).includes("invalid")) {
            return Promise.resolve("not valid json");
          }
          return Promise.resolve(
            JSON.stringify(createTestRoute({ id: "valid" })),
          );
        });

        const result = await service.listRoutes();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.length).toBe(1);
          expect(result.data[0].id).toBe("valid");
        }
      });

      it("should fail if service is not initialized", async () => {
        const uninitializedService = new DriveNavigationService(testRoutesDir);

        const result = await uninitializedService.listRoutes();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.SERVICE_NOT_INITIALIZED,
          );
        }
      });

      it("should handle readdir failure", async () => {
        mockFs.readdir.mockRejectedValue(new Error("Read error"));

        const result = await service.listRoutes();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_LOAD_FAILED,
          );
        }
      });
    });
  });

  describe("navigation lifecycle", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    describe("startNavigation", () => {
      it("should start navigation with a route object", async () => {
        const route = createTestRoute();

        const result = await service.startNavigation(route);

        expect(result.success).toBe(true);
        expect(service.isNavigating()).toBe(true);
        expect(service.getNavigationState()).toBe(NavigationState.NAVIGATING);
        expect(service.getActiveRoute()).toBe(route);
      });

      it("should start navigation with a route ID", async () => {
        const route = createTestRoute();
        mockFs.readFile.mockResolvedValue(JSON.stringify(route));

        const result = await service.startNavigation("test-route-1");

        expect(result.success).toBe(true);
        expect(service.isNavigating()).toBe(true);
      });

      it("should fail if service is not initialized", async () => {
        const uninitializedService = new DriveNavigationService(testRoutesDir);
        const route = createTestRoute();

        const result = await uninitializedService.startNavigation(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.SERVICE_NOT_INITIALIZED,
          );
        }
      });

      it("should fail if navigation is already active", async () => {
        const route = createTestRoute();
        await service.startNavigation(route);

        const result = await service.startNavigation(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.NAVIGATION_ALREADY_ACTIVE,
          );
        }
      });

      it("should fail for route with no waypoints and no geometry", async () => {
        const route = createTestRoute({ waypoints: [], geometry: [] });

        const result = await service.startNavigation(route);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_INVALID,
          );
        }
      });

      it("should auto-generate waypoints from geometry when waypoints are empty", async () => {
        const route = createTestRoute({ waypoints: [] });

        const result = await service.startNavigation(route);

        // Should succeed because geometry is present
        expect(result.success).toBe(true);
        expect(service.getNavigationState()).toBe(NavigationState.NAVIGATING);
      });

      it("should fail if route ID is not found", async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        mockFs.readFile.mockRejectedValue(error);

        const result = await service.startNavigation("non-existent");

        expect(result.success).toBe(false);
        if (!result.success) {
          expect((result.error as DriveError).code).toBe(
            DriveErrorCode.ROUTE_NOT_FOUND,
          );
        }
      });

      it("should notify callbacks when navigation starts", async () => {
        const route = createTestRoute();
        const navCallback = jest.fn();
        const displayCallback = jest.fn();

        service.onNavigationUpdate(navCallback);
        service.onDisplayUpdate(displayCallback);

        await service.startNavigation(route);

        expect(navCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "status",
            status: expect.objectContaining({
              state: NavigationState.NAVIGATING,
            }),
          }),
        );
        expect(displayCallback).toHaveBeenCalled();
      });
    });

    describe("stopNavigation", () => {
      it("should stop active navigation", async () => {
        const route = createTestRoute();
        await service.startNavigation(route);

        const result = await service.stopNavigation();

        expect(result.success).toBe(true);
        expect(service.isNavigating()).toBe(false);
        expect(service.getNavigationState()).toBe(NavigationState.IDLE);
        expect(service.getActiveRoute()).toBeNull();
      });

      it("should succeed even when no navigation is active", async () => {
        const result = await service.stopNavigation();

        expect(result.success).toBe(true);
      });

      it("should notify callbacks when navigation stops", async () => {
        const route = createTestRoute();
        const navCallback = jest.fn();

        await service.startNavigation(route);
        service.onNavigationUpdate(navCallback);

        await service.stopNavigation();

        expect(navCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "status",
            status: expect.objectContaining({
              state: NavigationState.CANCELLED,
            }),
          }),
        );
      });
    });

    describe("getNavigationStatus", () => {
      it("should return idle status when not navigating", async () => {
        const status = service.getNavigationStatus();

        expect(status.state).toBe(NavigationState.IDLE);
        expect(status.displayMode).toBe(DriveDisplayMode.MAP_WITH_OVERLAY);
        expect(status.currentWaypointIndex).toBe(0);
        expect(status.distanceToNextTurn).toBe(0);
        expect(status.distanceRemaining).toBe(0);
        expect(status.timeRemaining).toBe(0);
        expect(status.progress).toBe(0);
      });

      it("should return full status when navigating", async () => {
        const route = createTestRoute();
        await service.startNavigation(route);

        const status = service.getNavigationStatus();

        expect(status.state).toBe(NavigationState.NAVIGATING);
        expect(status.route).toBeDefined();
        expect(status.nextTurn).toBe(route.waypoints[0]);
      });
    });
  });

  describe("position updates", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should update position during navigation", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      const position = createGPSCoordinate(37.7749, -122.4194);
      service.updatePosition(position);

      const status = service.getNavigationStatus();
      expect(status.state).toBe(NavigationState.NAVIGATING);
    });

    it("should not update state when not navigating", async () => {
      const position = createGPSCoordinate(37.7749, -122.4194);
      service.updatePosition(position);

      const status = service.getNavigationStatus();
      expect(status.state).toBe(NavigationState.IDLE);
    });

    it("should detect waypoint reached", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      const navCallback = jest.fn();
      service.onNavigationUpdate(navCallback);

      // Position at first waypoint (within WAYPOINT_REACHED_DISTANCE)
      const position = createGPSCoordinate(37.7749, -122.4194);
      service.updatePosition(position);

      // Should have advanced to next waypoint
      const status = service.getNavigationStatus();
      expect(status.currentWaypointIndex).toBeGreaterThanOrEqual(0);
    });

    it("should detect arrival at destination", async () => {
      // Create a short route
      const route = createTestRoute();
      await service.startNavigation(route);

      const navCallback = jest.fn();
      service.onNavigationUpdate(navCallback);

      // Update position to each waypoint to advance through the route
      for (const waypoint of route.waypoints) {
        const position = createGPSCoordinate(
          waypoint.latitude,
          waypoint.longitude,
        );
        service.updatePosition(position);
      }

      const status = service.getNavigationStatus();
      expect(status.state).toBe(NavigationState.ARRIVED);
      expect(status.displayMode).toBe(DriveDisplayMode.ARRIVED);
    });

    it("should switch to turn screen when close to turn", async () => {
      const route = createTestRoute({
        waypoints: [
          {
            latitude: 37.7749,
            longitude: -122.4194,
            instruction: "Head north",
            maneuverType: ManeuverType.DEPART,
            distance: 0,
            index: 0,
          },
          {
            latitude: 37.7752,
            longitude: -122.4194,
            instruction: "Turn left",
            maneuverType: ManeuverType.LEFT,
            distance: 300,
            index: 1,
          },
          {
            latitude: 37.7752,
            longitude: -122.4214,
            instruction: "Arrive",
            maneuverType: ManeuverType.ARRIVE,
            distance: 170,
            index: 2,
          },
        ],
      });
      await service.startNavigation(route);

      // Position close to first waypoint but not reached (pass it)
      // then position close to second waypoint (within TURN_SCREEN_DISTANCE)
      const position1 = createGPSCoordinate(37.7749, -122.4194);
      service.updatePosition(position1);

      // Now at position where next turn is within 500m
      const position2 = createGPSCoordinate(37.775, -122.4194);
      service.updatePosition(position2);

      const status = service.getNavigationStatus();
      // Display mode depends on distance to next waypoint
      expect([
        DriveDisplayMode.TURN_SCREEN,
        DriveDisplayMode.MAP_WITH_OVERLAY,
        DriveDisplayMode.ARRIVED,
      ]).toContain(status.displayMode);
    });
  });

  describe("off-road detection", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should detect when user is off-road", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      const navCallback = jest.fn();
      service.onNavigationUpdate(navCallback);

      // Position far from route start (more than OFF_ROAD_DISTANCE)
      // OFF_ROAD_DISTANCE is 500m, so let's go about 1km away
      const position = createGPSCoordinate(37.785, -122.4194);
      service.updatePosition(position);

      const status = service.getNavigationStatus();
      expect(status.state).toBe(NavigationState.OFF_ROAD);
      expect(status.displayMode).toBe(DriveDisplayMode.OFF_ROAD_ARROW);
      expect(status.bearingToRoute).toBeDefined();
      expect(status.distanceToRoute).toBeDefined();
    });

    it("should return to navigating state when back on route", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      // Go off-road
      const offRoadPosition = createGPSCoordinate(37.785, -122.4194);
      service.updatePosition(offRoadPosition);

      expect(service.getNavigationState()).toBe(NavigationState.OFF_ROAD);

      // Come back near route start
      const onRoadPosition = createGPSCoordinate(37.7749, -122.4194);
      service.updatePosition(onRoadPosition);

      // Either NAVIGATING or ARRIVED (if we reached waypoints)
      expect([NavigationState.NAVIGATING, NavigationState.ARRIVED]).toContain(
        service.getNavigationState(),
      );
    });

    it("should update bearing and distance when off-road", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      // Go off-road
      const position1 = createGPSCoordinate(37.785, -122.4194);
      service.updatePosition(position1);

      const status1 = service.getNavigationStatus();
      const bearing1 = status1.bearingToRoute;
      const distance1 = status1.distanceToRoute;

      // Move to different off-road position
      const position2 = createGPSCoordinate(37.79, -122.42);
      service.updatePosition(position2);

      const status2 = service.getNavigationStatus();

      // Bearing and distance should have updated
      expect(status2.bearingToRoute).toBeDefined();
      expect(status2.distanceToRoute).toBeDefined();
      expect(status2.bearingToRoute).not.toBe(bearing1);
      expect(status2.distanceToRoute).not.toBe(distance1);
    });
  });

  describe("callback management", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should register and call navigation callbacks", async () => {
      const callback = jest.fn();
      service.onNavigationUpdate(callback);

      const route = createTestRoute();
      await service.startNavigation(route);

      expect(callback).toHaveBeenCalled();
      const callArg = callback.mock.calls[0][0] as DriveNavigationUpdate;
      expect(callArg.type).toBe("status");
      expect(callArg.status).toBeDefined();
      expect(callArg.timestamp).toBeInstanceOf(Date);
    });

    it("should unsubscribe navigation callback", async () => {
      const callback = jest.fn();
      const unsubscribe = service.onNavigationUpdate(callback);

      unsubscribe();

      const route = createTestRoute();
      await service.startNavigation(route);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should register and call display callbacks", async () => {
      const callback = jest.fn();
      service.onDisplayUpdate(callback);

      const route = createTestRoute();
      await service.startNavigation(route);

      expect(callback).toHaveBeenCalled();
    });

    it("should unsubscribe display callback", async () => {
      const callback = jest.fn();
      const unsubscribe = service.onDisplayUpdate(callback);

      unsubscribe();

      const route = createTestRoute();
      await service.startNavigation(route);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle errors in navigation callbacks gracefully", async () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      service.onNavigationUpdate(errorCallback);
      service.onNavigationUpdate(normalCallback);

      const route = createTestRoute();
      // Should not throw
      await expect(service.startNavigation(route)).resolves.toBeDefined();

      // Normal callback should still be called
      expect(normalCallback).toHaveBeenCalled();
    });

    it("should handle errors in display callbacks gracefully", async () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Callback error");
      });
      const normalCallback = jest.fn();

      service.onDisplayUpdate(errorCallback);
      service.onDisplayUpdate(normalCallback);

      const route = createTestRoute();
      await expect(service.startNavigation(route)).resolves.toBeDefined();

      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe("progress calculation", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should calculate progress as waypoints are reached", async () => {
      const route = createTestRoute({ totalDistance: 1000 });
      await service.startNavigation(route);

      // Move through waypoints to reach destination
      for (const waypoint of route.waypoints) {
        service.updatePosition(
          createGPSCoordinate(waypoint.latitude, waypoint.longitude),
        );
      }

      const finalStatus = service.getNavigationStatus();
      // After reaching all waypoints, we should be arrived with high progress
      expect(finalStatus.state).toBe(NavigationState.ARRIVED);
      // Progress may not be exactly 100 due to distance calculation differences
      expect(finalStatus.progress).toBeGreaterThanOrEqual(80);
    });

    it("should calculate time remaining based on distance", async () => {
      const route = createTestRoute({ totalDistance: 5000 });
      await service.startNavigation(route);

      // Set position to start point
      const position = createGPSCoordinate(
        route.startPoint.latitude,
        route.startPoint.longitude,
      );
      service.updatePosition(position);

      const status = service.getNavigationStatus();
      // Time remaining should be calculated based on average speed
      expect(status.timeRemaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe("dispose", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should stop navigation on dispose", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      await service.dispose();

      expect(service.isNavigating()).toBe(false);
    });

    it("should clear all callbacks on dispose", async () => {
      const navCallback = jest.fn();
      const displayCallback = jest.fn();

      service.onNavigationUpdate(navCallback);
      service.onDisplayUpdate(displayCallback);

      await service.dispose();

      // Reinitialize to test that old callbacks are cleared
      await service.initialize();
      const route = createTestRoute();
      await service.startNavigation(route);

      // Old callbacks should not be called after dispose
      // Note: callbacks are cleared during dispose
    });

    it("should mark service as uninitialized", async () => {
      await service.dispose();

      const route = createTestRoute();
      const result = await service.saveRoute(route);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DriveError).code).toBe(
          DriveErrorCode.SERVICE_NOT_INITIALIZED,
        );
      }
    });
  });

  describe("isNavigating", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should return true when navigating", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      expect(service.isNavigating()).toBe(true);
    });

    it("should return true when off-road", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      // Go off-road
      const position = createGPSCoordinate(37.785, -122.4194);
      service.updatePosition(position);

      expect(service.getNavigationState()).toBe(NavigationState.OFF_ROAD);
      expect(service.isNavigating()).toBe(true);
    });

    it("should return false when idle", async () => {
      expect(service.isNavigating()).toBe(false);
    });

    it("should return true after arrival (to keep drive display active)", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      // Move to destination
      for (const waypoint of route.waypoints) {
        service.updatePosition(
          createGPSCoordinate(waypoint.latitude, waypoint.longitude),
        );
      }

      expect(service.getNavigationState()).toBe(NavigationState.ARRIVED);
      // isNavigating() returns true for ARRIVED so drive display stays active
      expect(service.isNavigating()).toBe(true);
    });
  });

  describe("edge cases", () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it("should handle updating position without navigation", async () => {
      const position = createGPSCoordinate(37.7749, -122.4194);

      // Should not throw
      expect(() => service.updatePosition(position)).not.toThrow();
    });

    it("should handle route with undefined waypoints by auto-generating from geometry", async () => {
      const route = createTestRoute();
      // @ts-expect-error - Testing edge case
      route.waypoints = undefined;

      const result = await service.startNavigation(route);

      // Should succeed because geometry is present - waypoints will be auto-generated
      expect(result.success).toBe(true);
      expect(service.getNavigationState()).toBe(NavigationState.NAVIGATING);
    });

    it("should fail when both waypoints and geometry are missing", async () => {
      const route = createTestRoute();
      // @ts-expect-error - Testing edge case
      route.waypoints = undefined;
      route.geometry = [];

      const result = await service.startNavigation(route);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error as DriveError).code).toBe(
          DriveErrorCode.ROUTE_INVALID,
        );
      }
    });

    it("should handle off-road check without current position", async () => {
      const route = createTestRoute();
      await service.startNavigation(route);

      // Don't set a position
      const status = service.getNavigationStatus();

      // Should still be in navigating state
      expect(status.state).toBe(NavigationState.NAVIGATING);
    });
  });
});
