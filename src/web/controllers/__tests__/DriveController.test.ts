/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { DriveController } from "../DriveController";
import { success, failure, DriveRoute, ManeuverType } from "@core/types";
import { DriveError } from "@core/errors";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock fetch for OSRM proxy tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock express request and response
const mockRequest = (body = {}, params = {}, query = {}) =>
  ({
    body,
    params,
    query,
  }) as Request;

const mockResponse = () => {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Create mock orchestrator
const createMockOrchestrator = () => ({
  startDriveNavigation: jest.fn().mockResolvedValue(success(undefined)),
  stopDriveNavigation: jest.fn().mockResolvedValue(success(undefined)),
  showFullRoute: jest.fn().mockResolvedValue(success(undefined)),
  clearActiveGPX: jest.fn().mockResolvedValue(success(undefined)),
  updateDisplay: jest.fn().mockResolvedValue(success(undefined)),
});

// Create mock drive navigation service
const createMockDriveNavigationService = () => ({
  saveRoute: jest.fn().mockResolvedValue(success("route_123")),
  getActiveRoute: jest.fn().mockReturnValue(null),
  listRoutes: jest.fn().mockResolvedValue(success([])),
  deleteRoute: jest.fn().mockResolvedValue(success(undefined)),
  loadRoute: jest.fn().mockResolvedValue(success(mockRoute)),
  getNavigationState: jest.fn().mockReturnValue("idle"),
  getNavigationStatus: jest.fn().mockReturnValue(null),
  isNavigating: jest.fn().mockReturnValue(false),
  setSimulationMode: jest.fn(),
});

// Create mock simulation service
const createMockSimulationService = () => ({
  getStatus: jest.fn().mockReturnValue({ state: "stopped" }),
  stopSimulation: jest.fn().mockResolvedValue(success(undefined)),
  startSimulation: jest.fn().mockResolvedValue(success(undefined)),
});

// Create mock config service
const createMockConfigService = () => ({
  getRoutingProfile: jest.fn().mockReturnValue("car"),
});

// Sample route for testing
const mockRoute: DriveRoute = {
  id: "test-route-1",
  destination: "Test Destination",
  createdAt: new Date(),
  startPoint: { latitude: 51.5074, longitude: -0.1278 },
  endPoint: { latitude: 51.51, longitude: -0.12 },
  waypoints: [
    {
      latitude: 51.508,
      longitude: -0.125,
      instruction: "Continue straight",
      maneuverType: ManeuverType.STRAIGHT,
      distance: 500,
      index: 0,
    },
  ],
  geometry: [
    [51.5074, -0.1278],
    [51.508, -0.125],
    [51.51, -0.12],
  ],
  totalDistance: 1000,
  estimatedTime: 120,
};

describe("DriveController", () => {
  let controller: DriveController;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let mockDriveService: ReturnType<typeof createMockDriveNavigationService>;
  let mockSimulationService: ReturnType<typeof createMockSimulationService>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOrchestrator = createMockOrchestrator();
    mockDriveService = createMockDriveNavigationService();
    mockSimulationService = createMockSimulationService();
    mockConfigService = createMockConfigService();

    controller = new DriveController(
      mockOrchestrator as any,
      mockDriveService as any,
      mockSimulationService as any,
      mockConfigService as any,
    );
  });

  describe("saveDriveRoute", () => {
    it("should save a valid route successfully", async () => {
      const req = mockRequest({
        destination: "Test Destination",
        waypoints: [{ latitude: 51.508, longitude: -0.125 }],
        geometry: [
          [51.5074, -0.1278],
          [51.51, -0.12],
        ],
      });
      const res = mockResponse();

      await controller.saveDriveRoute(req, res);

      expect(mockDriveService.saveRoute).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { routeId: "route_123" },
        }),
      );
    });

    it("should return 503 when drive service is unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ destination: "Test" });
      const res = mockResponse();

      await controllerWithoutService.saveDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
        }),
      );
    });

    it("should return 400 for invalid route data", async () => {
      const req = mockRequest({ destination: "Test" }); // Missing waypoints and geometry
      const res = mockResponse();

      await controller.saveDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: "INVALID_REQUEST" }),
        }),
      );
    });

    it("should return 400 for empty waypoints", async () => {
      const req = mockRequest({
        destination: "Test",
        waypoints: [],
        geometry: [[51.5, -0.1]],
      });
      const res = mockResponse();

      await controller.saveDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle save failure", async () => {
      mockDriveService.saveRoute.mockResolvedValue(
        failure(DriveError.saveFailed("test-route")),
      );
      const req = mockRequest({
        destination: "Test",
        waypoints: [{ latitude: 51.5, longitude: -0.1 }],
        geometry: [[51.5, -0.1]],
      });
      const res = mockResponse();

      await controller.saveDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: "ROUTE_SAVE_FAILED" }),
        }),
      );
    });
  });

  describe("getActiveDriveRoute", () => {
    it("should return null when no active route", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveDriveRoute(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          route: null,
          hasActiveRoute: false,
        },
      });
    });

    it("should return active route when present", async () => {
      mockDriveService.getActiveRoute.mockReturnValue(mockRoute);
      const req = mockRequest();
      const res = mockResponse();

      await controller.getActiveDriveRoute(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          route: mockRoute,
          hasActiveRoute: true,
        },
      });
    });

    it("should return 503 when service unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutService.getActiveDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("listDriveRoutes", () => {
    it("should list routes successfully", async () => {
      mockDriveService.listRoutes.mockResolvedValue(success([mockRoute]));
      const req = mockRequest();
      const res = mockResponse();

      await controller.listDriveRoutes(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          routes: [mockRoute],
        },
      });
    });

    it("should handle list failure", async () => {
      mockDriveService.listRoutes.mockResolvedValue(
        failure(DriveError.loadFailed("list")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.listDriveRoutes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 503 when service unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutService.listDriveRoutes(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("deleteDriveRoute", () => {
    it("should delete route successfully", async () => {
      const req = mockRequest({}, { routeId: "route_123" });
      const res = mockResponse();

      await controller.deleteDriveRoute(req, res);

      expect(mockDriveService.deleteRoute).toHaveBeenCalledWith("route_123");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should return 400 when routeId missing", async () => {
      const req = mockRequest({}, {});
      const res = mockResponse();

      await controller.deleteDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when route not found", async () => {
      mockDriveService.deleteRoute.mockResolvedValue(
        failure(DriveError.routeNotFound("nonexistent")),
      );
      const req = mockRequest({}, { routeId: "nonexistent" });
      const res = mockResponse();

      await controller.deleteDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should return 503 when service unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest({}, { routeId: "route_123" });
      const res = mockResponse();

      await controllerWithoutService.deleteDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("startDriveNavigation", () => {
    it("should start navigation with routeId", async () => {
      const req = mockRequest({ routeId: "route_123" });
      const res = mockResponse();

      await controller.startDriveNavigation(req, res);

      expect(mockDriveService.loadRoute).toHaveBeenCalledWith("route_123");
      expect(mockOrchestrator.startDriveNavigation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should start navigation with inline route", async () => {
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.startDriveNavigation(req, res);

      expect(mockOrchestrator.startDriveNavigation).toHaveBeenCalledWith(
        mockRoute,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should stop simulation before starting navigation", async () => {
      mockSimulationService.getStatus.mockReturnValue({ state: "running" });
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.startDriveNavigation(req, res);

      expect(mockSimulationService.stopSimulation).toHaveBeenCalled();
    });

    it("should return 400 when no route or routeId provided", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.startDriveNavigation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 when routeId not found", async () => {
      mockDriveService.loadRoute.mockResolvedValue(
        failure(DriveError.routeNotFound("nonexistent")),
      );
      const req = mockRequest({ routeId: "nonexistent" });
      const res = mockResponse();

      await controller.startDriveNavigation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should handle navigation start failure", async () => {
      mockOrchestrator.startDriveNavigation.mockResolvedValue(
        failure(DriveError.navigationAlreadyActive()),
      );
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.startDriveNavigation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 503 when service unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ routeId: "route_123" });
      const res = mockResponse();

      await controllerWithoutService.startDriveNavigation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("stopDriveNavigation", () => {
    it("should stop navigation successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopDriveNavigation(req, res);

      expect(mockOrchestrator.stopDriveNavigation).toHaveBeenCalled();
      expect(mockDriveService.setSimulationMode).toHaveBeenCalledWith(false);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should stop simulation when active", async () => {
      mockSimulationService.getStatus.mockReturnValue({ state: "running" });
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopDriveNavigation(req, res);

      expect(mockSimulationService.stopSimulation).toHaveBeenCalled();
    });

    it("should handle stop failure", async () => {
      mockOrchestrator.stopDriveNavigation.mockResolvedValue(
        failure(DriveError.navigationNotStarted()),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopDriveNavigation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 503 when service unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutService.stopDriveNavigation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("simulateDriveRoute", () => {
    it("should start simulation successfully", async () => {
      const req = mockRequest({ route: mockRoute, speed: 100 });
      const res = mockResponse();

      await controller.simulateDriveRoute(req, res);

      expect(mockOrchestrator.clearActiveGPX).toHaveBeenCalled();
      expect(mockDriveService.setSimulationMode).toHaveBeenCalledWith(true);
      expect(mockOrchestrator.startDriveNavigation).toHaveBeenCalled();
      expect(mockSimulationService.startSimulation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should use default speed of 100 km/h", async () => {
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.simulateDriveRoute(req, res);

      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        expect.any(Object),
        100,
      );
    });

    it("should return 400 for invalid route", async () => {
      const req = mockRequest({ route: { geometry: [[51.5, -0.1]] } }); // Only 1 point
      const res = mockResponse();

      await controller.simulateDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 400 when route missing", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.simulateDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle simulation start failure", async () => {
      mockSimulationService.startSimulation.mockResolvedValue(
        failure(new Error("Simulation failed")),
      );
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.simulateDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new DriveController(
        mockOrchestrator as any,
        mockDriveService as any,
        undefined,
        mockConfigService as any,
      );
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controllerWithoutSimulation.simulateDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should handle unexpected errors", async () => {
      mockSimulationService.startSimulation.mockRejectedValue(
        new Error("Unexpected error"),
      );
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.simulateDriveRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SIMULATION_ERROR" }),
        }),
      );
    });
  });

  describe("getDriveNavigationStatus", () => {
    it("should return navigation status", async () => {
      mockDriveService.getNavigationState.mockReturnValue("navigating");
      mockDriveService.getNavigationStatus.mockReturnValue({
        distanceRemaining: 1000,
      });
      mockDriveService.isNavigating.mockReturnValue(true);
      mockDriveService.getActiveRoute.mockReturnValue(mockRoute);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getDriveNavigationStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          state: "navigating",
          status: { distanceRemaining: 1000 },
          isNavigating: true,
          activeRoute: mockRoute,
        },
      });
    });

    it("should return 503 when service unavailable", async () => {
      const controllerWithoutService = new DriveController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutService.getDriveNavigationStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("showFullRoute", () => {
    it("should show full route successfully", async () => {
      const req = mockRequest({ route: mockRoute });
      const res = mockResponse();

      await controller.showFullRoute(req, res);

      expect(mockOrchestrator.showFullRoute).toHaveBeenCalledWith(mockRoute);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should show route without body", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.showFullRoute(req, res);

      expect(mockOrchestrator.showFullRoute).toHaveBeenCalledWith(undefined);
    });

    it("should handle show route failure", async () => {
      mockOrchestrator.showFullRoute.mockResolvedValue(
        failure(new Error("No route to show")),
      );
      const req = mockRequest({});
      const res = mockResponse();

      await controller.showFullRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("calculateRoute", () => {
    it("should proxy OSRM request successfully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [{ distance: 1000 }],
        }),
      });

      const req = mockRequest(
        {},
        {},
        {
          startLon: "-0.1278",
          startLat: "51.5074",
          endLon: "-0.12",
          endLat: "51.51",
        },
      );
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("routing.openstreetmap.de/routed-car"),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        }),
      );
    });

    it("should use bike profile when configured", async () => {
      mockConfigService.getRoutingProfile.mockReturnValue("bike");
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ code: "Ok", routes: [] }),
      });

      const req = mockRequest(
        {},
        {},
        {
          startLon: "-0.1278",
          startLat: "51.5074",
          endLon: "-0.12",
          endLat: "51.51",
        },
      );
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("routed-bike"),
      );
    });

    it("should use foot profile when configured", async () => {
      mockConfigService.getRoutingProfile.mockReturnValue("foot");
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ code: "Ok", routes: [] }),
      });

      const req = mockRequest(
        {},
        {},
        {
          startLon: "-0.1278",
          startLat: "51.5074",
          endLon: "-0.12",
          endLat: "51.51",
        },
      );
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("routed-foot"),
      );
    });

    it("should return 400 for missing parameters", async () => {
      const req = mockRequest({}, {}, { startLon: "-0.1278" }); // Missing other params
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_REQUEST" }),
        }),
      );
    });

    it("should handle OSRM HTTP errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const req = mockRequest(
        {},
        {},
        {
          startLon: "-0.1278",
          startLat: "51.5074",
          endLon: "-0.12",
          endLat: "51.51",
        },
      );
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "OSRM_ERROR" }),
        }),
      );
    });

    it("should handle OSRM routing errors", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "NoRoute",
          message: "No route found",
        }),
      });

      const req = mockRequest(
        {},
        {},
        {
          startLon: "-0.1278",
          startLat: "51.5074",
          endLon: "-0.12",
          endLat: "51.51",
        },
      );
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "OSRM_ROUTING_ERROR" }),
        }),
      );
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const req = mockRequest(
        {},
        {},
        {
          startLon: "-0.1278",
          startLat: "51.5074",
          endLon: "-0.12",
          endLat: "51.51",
        },
      );
      const res = mockResponse();

      await controller.calculateRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "PROXY_ERROR" }),
        }),
      );
    });
  });
});
