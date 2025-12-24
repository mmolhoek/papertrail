/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { SimulationController } from "../SimulationController";
import { success, failure } from "@core/types";
import { SimulationSpeed } from "@core/interfaces";

// Mock the logger
jest.mock("@utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

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
  isDriveNavigating: jest.fn().mockReturnValue(false),
  stopDriveNavigation: jest.fn().mockResolvedValue(success(undefined)),
  setActiveGPX: jest.fn().mockResolvedValue(success(undefined)),
});

// Create mock simulation service
const createMockSimulationService = () => ({
  initialize: jest.fn().mockResolvedValue(success(undefined)),
  startSimulation: jest.fn().mockResolvedValue(success(undefined)),
  stopSimulation: jest.fn().mockResolvedValue(success(undefined)),
  pauseSimulation: jest.fn().mockResolvedValue(success(undefined)),
  resumeSimulation: jest.fn().mockResolvedValue(success(undefined)),
  setSpeed: jest.fn().mockResolvedValue(success(undefined)),
  setSpeedPreset: jest.fn().mockResolvedValue(success(undefined)),
  getStatus: jest.fn().mockReturnValue({
    state: "running",
    currentPointIndex: 10,
    totalPoints: 100,
    progress: 10,
    speed: 5,
  }),
});

// Create mock map service
const createMockMapService = () => ({
  getTrack: jest.fn().mockResolvedValue(
    success({
      name: "Test Track",
      segments: [
        {
          points: [
            { latitude: 51.5074, longitude: -0.1278 },
            { latitude: 51.508, longitude: -0.125 },
          ],
        },
      ],
    }),
  ),
});

// Create mock config service
const createMockConfigService = () => ({
  getZoomLevel: jest.fn().mockReturnValue(14),
});

describe("SimulationController", () => {
  let controller: SimulationController;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let mockSimulationService: ReturnType<typeof createMockSimulationService>;
  let mockMapService: ReturnType<typeof createMockMapService>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOrchestrator = createMockOrchestrator();
    mockSimulationService = createMockSimulationService();
    mockMapService = createMockMapService();
    mockConfigService = createMockConfigService();

    controller = new SimulationController(
      mockOrchestrator as any,
      mockSimulationService as any,
      mockMapService as any,
      mockConfigService as any,
    );
  });

  describe("startSimulation", () => {
    it("should start simulation successfully with default speed", async () => {
      const req = mockRequest({ trackPath: "./data/gpx-files/track.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(mockMapService.getTrack).toHaveBeenCalledWith(
        "./data/gpx-files/track.gpx",
      );
      expect(mockSimulationService.initialize).toHaveBeenCalled();
      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        expect.any(Object),
        SimulationSpeed.WALK,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Simulation started",
        }),
      );
    });

    it("should start simulation with walk speed", async () => {
      const req = mockRequest({
        trackPath: "./data/track.gpx",
        speed: "walk",
      });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        expect.any(Object),
        SimulationSpeed.WALK,
      );
    });

    it("should start simulation with bicycle speed", async () => {
      const req = mockRequest({
        trackPath: "./data/track.gpx",
        speed: "bicycle",
      });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        expect.any(Object),
        SimulationSpeed.BICYCLE,
      );
    });

    it("should start simulation with drive speed", async () => {
      const req = mockRequest({
        trackPath: "./data/track.gpx",
        speed: "drive",
      });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        expect.any(Object),
        SimulationSpeed.DRIVE,
      );
    });

    it("should start simulation with custom numeric speed", async () => {
      const req = mockRequest({
        trackPath: "./data/track.gpx",
        speed: 100,
      });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(mockSimulationService.startSimulation).toHaveBeenCalledWith(
        expect.any(Object),
        100,
      );
    });

    it("should stop drive navigation before starting simulation", async () => {
      mockOrchestrator.isDriveNavigating.mockReturnValue(true);
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(mockOrchestrator.stopDriveNavigation).toHaveBeenCalled();
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new SimulationController(
        mockOrchestrator as any,
        undefined,
        mockMapService as any,
        mockConfigService as any,
      );
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controllerWithoutSimulation.startSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
        }),
      );
    });

    it("should return 400 when trackPath is missing", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_REQUEST" }),
        }),
      );
    });

    it("should return 503 when map service unavailable", async () => {
      const controllerWithoutMap = new SimulationController(
        mockOrchestrator as any,
        mockSimulationService as any,
        undefined,
        mockConfigService as any,
      );
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controllerWithoutMap.startSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 when track load fails", async () => {
      mockMapService.getTrack.mockResolvedValue(
        failure(new Error("Track not found")),
      );
      const req = mockRequest({ trackPath: "./data/nonexistent.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "TRACK_LOAD_FAILED" }),
        }),
      );
    });

    it("should return 500 when simulation initialization fails", async () => {
      mockSimulationService.initialize.mockResolvedValue(
        failure(new Error("Init failed")),
      );
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SIMULATION_INIT_FAILED" }),
        }),
      );
    });

    it("should return 500 when simulation start fails", async () => {
      mockSimulationService.startSimulation.mockResolvedValue(
        failure(new Error("Start failed")),
      );
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SIMULATION_START_FAILED" }),
        }),
      );
    });

    it("should continue if setActiveGPX fails", async () => {
      mockOrchestrator.setActiveGPX.mockResolvedValue(
        failure(new Error("Set active failed")),
      );
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      // Should still succeed
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it("should include zoom level in response", async () => {
      mockConfigService.getZoomLevel.mockReturnValue(16);
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controller.startSimulation(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoomLevel: 16 }),
        }),
      );
    });

    it("should use default zoom when config service unavailable", async () => {
      const controllerWithoutConfig = new SimulationController(
        mockOrchestrator as any,
        mockSimulationService as any,
        mockMapService as any,
        undefined,
      );
      const req = mockRequest({ trackPath: "./data/track.gpx" });
      const res = mockResponse();

      await controllerWithoutConfig.startSimulation(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoomLevel: 14 }),
        }),
      );
    });
  });

  describe("stopSimulation", () => {
    it("should stop simulation successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopSimulation(req, res);

      expect(mockSimulationService.stopSimulation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Simulation stopped",
      });
    });

    it("should stop drive navigation when active", async () => {
      mockOrchestrator.isDriveNavigating.mockReturnValue(true);
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopSimulation(req, res);

      expect(mockOrchestrator.stopDriveNavigation).toHaveBeenCalled();
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new SimulationController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutSimulation.stopSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 500 when stop fails", async () => {
      mockSimulationService.stopSimulation.mockResolvedValue(
        failure(new Error("Stop failed")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.stopSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SIMULATION_STOP_FAILED" }),
        }),
      );
    });
  });

  describe("pauseSimulation", () => {
    it("should pause simulation successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.pauseSimulation(req, res);

      expect(mockSimulationService.pauseSimulation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Simulation paused",
          data: expect.any(Object),
        }),
      );
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new SimulationController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutSimulation.pauseSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 when pause fails", async () => {
      mockSimulationService.pauseSimulation.mockResolvedValue(
        failure(new Error("Not running")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.pauseSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SIMULATION_PAUSE_FAILED" }),
        }),
      );
    });
  });

  describe("resumeSimulation", () => {
    it("should resume simulation successfully", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.resumeSimulation(req, res);

      expect(mockSimulationService.resumeSimulation).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Simulation resumed",
          data: expect.any(Object),
        }),
      );
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new SimulationController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutSimulation.resumeSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 when resume fails", async () => {
      mockSimulationService.resumeSimulation.mockResolvedValue(
        failure(new Error("Not paused")),
      );
      const req = mockRequest();
      const res = mockResponse();

      await controller.resumeSimulation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SIMULATION_RESUME_FAILED" }),
        }),
      );
    });
  });

  describe("setSimulationSpeed", () => {
    it("should set numeric speed successfully", async () => {
      const req = mockRequest({ speed: 50 });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(mockSimulationService.setSpeed).toHaveBeenCalledWith(50);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Speed updated",
        }),
      );
    });

    it("should set walk speed preset", async () => {
      const req = mockRequest({ speed: "walk" });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(mockSimulationService.setSpeedPreset).toHaveBeenCalledWith("walk");
    });

    it("should set bicycle speed preset", async () => {
      const req = mockRequest({ speed: "bicycle" });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(mockSimulationService.setSpeedPreset).toHaveBeenCalledWith(
        "bicycle",
      );
    });

    it("should set drive speed preset", async () => {
      const req = mockRequest({ speed: "drive" });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(mockSimulationService.setSpeedPreset).toHaveBeenCalledWith(
        "drive",
      );
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new SimulationController(
        mockOrchestrator as any,
      );
      const req = mockRequest({ speed: 50 });
      const res = mockResponse();

      await controllerWithoutSimulation.setSimulationSpeed(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it("should return 400 when speed is missing", async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_REQUEST" }),
        }),
      );
    });

    it("should return 400 for invalid speed preset", async () => {
      const req = mockRequest({ speed: "invalid" });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "INVALID_SPEED" }),
        }),
      );
    });

    it("should return 400 when speed update fails", async () => {
      mockSimulationService.setSpeed.mockResolvedValue(
        failure(new Error("Speed too high")),
      );
      const req = mockRequest({ speed: 1000 });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SPEED_UPDATE_FAILED" }),
        }),
      );
    });

    it("should include zoom level in response", async () => {
      mockConfigService.getZoomLevel.mockReturnValue(18);
      const req = mockRequest({ speed: 50 });
      const res = mockResponse();

      await controller.setSimulationSpeed(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoomLevel: 18 }),
        }),
      );
    });
  });

  describe("getSimulationStatus", () => {
    it("should return simulation status", async () => {
      const req = mockRequest();
      const res = mockResponse();

      await controller.getSimulationStatus(req, res);

      expect(mockSimulationService.getStatus).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          state: "running",
          progress: 10,
        }),
      });
    });

    it("should return 503 when simulation service unavailable", async () => {
      const controllerWithoutSimulation = new SimulationController(
        mockOrchestrator as any,
      );
      const req = mockRequest();
      const res = mockResponse();

      await controllerWithoutSimulation.getSimulationStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
        }),
      );
    });
  });
});
