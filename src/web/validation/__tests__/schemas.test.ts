/**
 * Tests for API Request Validation Schemas
 */

import {
  latitudeSchema,
  longitudeSchema,
  coordinateSchema,
  setMockPositionSchema,
  setZoomSchema,
  setAutoCenterSchema,
  setRotateWithBearingSchema,
  setActiveScreenSchema,
  addRecentDestinationSchema,
  removeRecentDestinationSchema,
  setHotspotConfigSchema,
  speedPresetSchema,
  speedValueSchema,
  startSimulationSchema,
  setSimulationSpeedSchema,
  driveWaypointSchema,
  driveRouteSchema,
  startDriveNavigationSchema,
  simulateDriveRouteSchema,
  setActiveMapSchema,
  deleteGPXFileParamsSchema,
  deleteDriveRouteParamsSchema,
} from "../schemas";
import { ManeuverType } from "@core/types";

describe("Validation Schemas", () => {
  // ==========================================================================
  // Common Schemas
  // ==========================================================================
  describe("latitudeSchema", () => {
    it("should accept valid latitude values", () => {
      expect(latitudeSchema.safeParse(0).success).toBe(true);
      expect(latitudeSchema.safeParse(45.5).success).toBe(true);
      expect(latitudeSchema.safeParse(-45.5).success).toBe(true);
      expect(latitudeSchema.safeParse(90).success).toBe(true);
      expect(latitudeSchema.safeParse(-90).success).toBe(true);
    });

    it("should reject invalid latitude values", () => {
      expect(latitudeSchema.safeParse(91).success).toBe(false);
      expect(latitudeSchema.safeParse(-91).success).toBe(false);
      expect(latitudeSchema.safeParse("45").success).toBe(false);
      expect(latitudeSchema.safeParse(null).success).toBe(false);
    });
  });

  describe("longitudeSchema", () => {
    it("should accept valid longitude values", () => {
      expect(longitudeSchema.safeParse(0).success).toBe(true);
      expect(longitudeSchema.safeParse(180).success).toBe(true);
      expect(longitudeSchema.safeParse(-180).success).toBe(true);
      expect(longitudeSchema.safeParse(45.5).success).toBe(true);
    });

    it("should reject invalid longitude values", () => {
      expect(longitudeSchema.safeParse(181).success).toBe(false);
      expect(longitudeSchema.safeParse(-181).success).toBe(false);
      expect(longitudeSchema.safeParse("180").success).toBe(false);
    });
  });

  describe("coordinateSchema", () => {
    it("should accept valid coordinates", () => {
      const result = coordinateSchema.safeParse({
        latitude: 45.5,
        longitude: -122.6,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid coordinates", () => {
      expect(
        coordinateSchema.safeParse({ latitude: 91, longitude: 0 }).success,
      ).toBe(false);
      expect(
        coordinateSchema.safeParse({ latitude: 0, longitude: 181 }).success,
      ).toBe(false);
      expect(coordinateSchema.safeParse({ latitude: 0 }).success).toBe(false);
    });
  });

  // ==========================================================================
  // GPS Controller Schemas
  // ==========================================================================
  describe("setMockPositionSchema", () => {
    it("should accept valid mock position", () => {
      const result = setMockPositionSchema.safeParse({
        latitude: 45.5,
        longitude: -122.6,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid mock position", () => {
      expect(
        setMockPositionSchema.safeParse({ latitude: "45", longitude: -122 })
          .success,
      ).toBe(false);
      expect(setMockPositionSchema.safeParse({}).success).toBe(false);
    });
  });

  // ==========================================================================
  // Config Controller Schemas
  // ==========================================================================
  describe("setZoomSchema", () => {
    it("should accept zoom value", () => {
      const result = setZoomSchema.safeParse({ zoom: 15 });
      expect(result.success).toBe(true);
    });

    it("should accept delta value", () => {
      const result = setZoomSchema.safeParse({ delta: 2 });
      expect(result.success).toBe(true);
    });

    it("should accept both zoom and delta", () => {
      const result = setZoomSchema.safeParse({ zoom: 15, delta: 2 });
      expect(result.success).toBe(true);
    });

    it("should reject when neither zoom nor delta provided", () => {
      const result = setZoomSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject invalid zoom values", () => {
      expect(setZoomSchema.safeParse({ zoom: 0 }).success).toBe(false);
      expect(setZoomSchema.safeParse({ zoom: 21 }).success).toBe(false);
    });

    it("should reject invalid delta values", () => {
      expect(setZoomSchema.safeParse({ delta: -20 }).success).toBe(false);
      expect(setZoomSchema.safeParse({ delta: 20 }).success).toBe(false);
    });
  });

  describe("setAutoCenterSchema", () => {
    it("should accept boolean enabled", () => {
      expect(setAutoCenterSchema.safeParse({ enabled: true }).success).toBe(
        true,
      );
      expect(setAutoCenterSchema.safeParse({ enabled: false }).success).toBe(
        true,
      );
    });

    it("should reject non-boolean enabled", () => {
      expect(setAutoCenterSchema.safeParse({ enabled: "true" }).success).toBe(
        false,
      );
      expect(setAutoCenterSchema.safeParse({ enabled: 1 }).success).toBe(false);
      expect(setAutoCenterSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("setRotateWithBearingSchema", () => {
    it("should accept boolean enabled", () => {
      expect(
        setRotateWithBearingSchema.safeParse({ enabled: true }).success,
      ).toBe(true);
      expect(
        setRotateWithBearingSchema.safeParse({ enabled: false }).success,
      ).toBe(true);
    });

    it("should reject non-boolean enabled", () => {
      expect(
        setRotateWithBearingSchema.safeParse({ enabled: "true" }).success,
      ).toBe(false);
    });
  });

  describe("setActiveScreenSchema", () => {
    it("should accept valid screen types", () => {
      expect(
        setActiveScreenSchema.safeParse({ screenType: "track" }).success,
      ).toBe(true);
      expect(
        setActiveScreenSchema.safeParse({ screenType: "turn_by_turn" }).success,
      ).toBe(true);
    });

    it("should reject invalid screen types", () => {
      expect(
        setActiveScreenSchema.safeParse({ screenType: "invalid" }).success,
      ).toBe(false);
      expect(
        setActiveScreenSchema.safeParse({ screenType: "TRACK" }).success,
      ).toBe(false);
    });
  });

  describe("addRecentDestinationSchema", () => {
    it("should accept valid destination", () => {
      const result = addRecentDestinationSchema.safeParse({
        name: "Home",
        latitude: 45.5,
        longitude: -122.6,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty name", () => {
      expect(
        addRecentDestinationSchema.safeParse({
          name: "",
          latitude: 45.5,
          longitude: -122.6,
        }).success,
      ).toBe(false);
    });

    it("should reject name exceeding max length", () => {
      expect(
        addRecentDestinationSchema.safeParse({
          name: "a".repeat(201),
          latitude: 45.5,
          longitude: -122.6,
        }).success,
      ).toBe(false);
    });
  });

  describe("removeRecentDestinationSchema", () => {
    it("should accept valid coordinates", () => {
      const result = removeRecentDestinationSchema.safeParse({
        latitude: 45.5,
        longitude: -122.6,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid coordinates", () => {
      expect(
        removeRecentDestinationSchema.safeParse({ latitude: 95 }).success,
      ).toBe(false);
    });
  });

  // ==========================================================================
  // WiFi Controller Schemas
  // ==========================================================================
  describe("setHotspotConfigSchema", () => {
    it("should accept valid hotspot config", () => {
      const result = setHotspotConfigSchema.safeParse({
        ssid: "MyNetwork",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("should trim SSID whitespace", () => {
      const result = setHotspotConfigSchema.safeParse({
        ssid: "  MyNetwork  ",
        password: "password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ssid).toBe("MyNetwork");
      }
    });

    it("should reject empty SSID", () => {
      expect(
        setHotspotConfigSchema.safeParse({
          ssid: "",
          password: "password123",
        }).success,
      ).toBe(false);
    });

    it("should reject SSID exceeding 32 characters", () => {
      expect(
        setHotspotConfigSchema.safeParse({
          ssid: "a".repeat(33),
          password: "password123",
        }).success,
      ).toBe(false);
    });

    it("should reject password shorter than 8 characters", () => {
      expect(
        setHotspotConfigSchema.safeParse({
          ssid: "MyNetwork",
          password: "short",
        }).success,
      ).toBe(false);
    });

    it("should reject password exceeding 63 characters", () => {
      expect(
        setHotspotConfigSchema.safeParse({
          ssid: "MyNetwork",
          password: "a".repeat(64),
        }).success,
      ).toBe(false);
    });
  });

  // ==========================================================================
  // Simulation Controller Schemas
  // ==========================================================================
  describe("speedPresetSchema", () => {
    it("should accept valid speed presets", () => {
      expect(speedPresetSchema.safeParse("walk").success).toBe(true);
      expect(speedPresetSchema.safeParse("bicycle").success).toBe(true);
      expect(speedPresetSchema.safeParse("drive").success).toBe(true);
    });

    it("should reject invalid speed presets", () => {
      expect(speedPresetSchema.safeParse("run").success).toBe(false);
      expect(speedPresetSchema.safeParse("WALK").success).toBe(false);
    });
  });

  describe("speedValueSchema", () => {
    it("should accept speed presets", () => {
      expect(speedValueSchema.safeParse("walk").success).toBe(true);
      expect(speedValueSchema.safeParse("bicycle").success).toBe(true);
    });

    it("should accept numeric speeds", () => {
      expect(speedValueSchema.safeParse(50).success).toBe(true);
      expect(speedValueSchema.safeParse(0.5).success).toBe(true);
    });

    it("should reject speeds out of range", () => {
      expect(speedValueSchema.safeParse(0).success).toBe(false);
      expect(speedValueSchema.safeParse(501).success).toBe(false);
    });
  });

  describe("startSimulationSchema", () => {
    it("should accept valid simulation start request", () => {
      const result = startSimulationSchema.safeParse({
        trackPath: "/path/to/track.gpx",
        speed: "walk",
      });
      expect(result.success).toBe(true);
    });

    it("should apply default speed", () => {
      const result = startSimulationSchema.safeParse({
        trackPath: "/path/to/track.gpx",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.speed).toBe("walk");
      }
    });

    it("should reject empty trackPath", () => {
      expect(startSimulationSchema.safeParse({ trackPath: "" }).success).toBe(
        false,
      );
    });
  });

  describe("setSimulationSpeedSchema", () => {
    it("should accept valid speed", () => {
      expect(
        setSimulationSpeedSchema.safeParse({ speed: "walk" }).success,
      ).toBe(true);
      expect(setSimulationSpeedSchema.safeParse({ speed: 50 }).success).toBe(
        true,
      );
    });

    it("should reject missing speed", () => {
      expect(setSimulationSpeedSchema.safeParse({}).success).toBe(false);
    });
  });

  // ==========================================================================
  // Drive Controller Schemas
  // ==========================================================================
  describe("driveWaypointSchema", () => {
    const validWaypoint = {
      latitude: 45.5,
      longitude: -122.6,
      instruction: "Turn left onto Main St",
      maneuverType: ManeuverType.LEFT,
      distance: 100,
      index: 0,
    };

    it("should accept valid waypoint", () => {
      const result = driveWaypointSchema.safeParse(validWaypoint);
      expect(result.success).toBe(true);
    });

    it("should accept waypoint with optional fields", () => {
      const result = driveWaypointSchema.safeParse({
        ...validWaypoint,
        streetName: "Main St",
        bearingAfter: 90,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty instruction", () => {
      expect(
        driveWaypointSchema.safeParse({ ...validWaypoint, instruction: "" })
          .success,
      ).toBe(false);
    });

    it("should reject invalid maneuver type", () => {
      expect(
        driveWaypointSchema.safeParse({
          ...validWaypoint,
          maneuverType: "invalid",
        }).success,
      ).toBe(false);
    });

    it("should reject negative distance", () => {
      expect(
        driveWaypointSchema.safeParse({ ...validWaypoint, distance: -1 })
          .success,
      ).toBe(false);
    });

    it("should reject bearing out of range", () => {
      expect(
        driveWaypointSchema.safeParse({ ...validWaypoint, bearingAfter: 361 })
          .success,
      ).toBe(false);
    });
  });

  describe("driveRouteSchema", () => {
    const validRoute = {
      destination: "123 Main St",
      waypoints: [
        {
          latitude: 45.5,
          longitude: -122.6,
          instruction: "Start",
          maneuverType: ManeuverType.DEPART,
          distance: 0,
          index: 0,
        },
      ],
      geometry: [
        [45.5, -122.6],
        [45.6, -122.7],
      ] as [number, number][],
    };

    it("should accept valid route", () => {
      const result = driveRouteSchema.safeParse(validRoute);
      expect(result.success).toBe(true);
    });

    it("should apply default values", () => {
      const result = driveRouteSchema.safeParse(validRoute);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalDistance).toBe(0);
        expect(result.data.estimatedTime).toBe(0);
        expect(result.data.createdAt).toBeInstanceOf(Date);
      }
    });

    it("should reject empty destination", () => {
      expect(
        driveRouteSchema.safeParse({ ...validRoute, destination: "" }).success,
      ).toBe(false);
    });

    it("should reject empty waypoints", () => {
      expect(
        driveRouteSchema.safeParse({ ...validRoute, waypoints: [] }).success,
      ).toBe(false);
    });

    it("should reject geometry with less than 2 points", () => {
      expect(
        driveRouteSchema.safeParse({
          ...validRoute,
          geometry: [[45.5, -122.6]],
        }).success,
      ).toBe(false);
    });
  });

  describe("startDriveNavigationSchema", () => {
    it("should accept routeId", () => {
      const result = startDriveNavigationSchema.safeParse({
        routeId: "route_123",
      });
      expect(result.success).toBe(true);
    });

    it("should accept route object", () => {
      const result = startDriveNavigationSchema.safeParse({
        route: {
          destination: "123 Main St",
          waypoints: [
            {
              latitude: 45.5,
              longitude: -122.6,
              instruction: "Start",
              maneuverType: ManeuverType.DEPART,
              distance: 0,
              index: 0,
            },
          ],
          geometry: [
            [45.5, -122.6],
            [45.6, -122.7],
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("should reject when neither routeId nor route provided", () => {
      const result = startDriveNavigationSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("simulateDriveRouteSchema", () => {
    it("should accept valid simulation request", () => {
      const result = simulateDriveRouteSchema.safeParse({
        route: {
          geometry: [
            [45.5, -122.6],
            [45.6, -122.7],
          ],
        },
        speed: 100,
      });
      expect(result.success).toBe(true);
    });

    it("should apply default speed", () => {
      const result = simulateDriveRouteSchema.safeParse({
        route: {
          geometry: [
            [45.5, -122.6],
            [45.6, -122.7],
          ],
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.speed).toBe(100);
      }
    });

    it("should reject geometry with less than 2 points", () => {
      expect(
        simulateDriveRouteSchema.safeParse({
          route: { geometry: [[45.5, -122.6]] },
        }).success,
      ).toBe(false);
    });
  });

  // ==========================================================================
  // Track Controller Schemas
  // ==========================================================================
  describe("setActiveMapSchema", () => {
    it("should accept valid path", () => {
      const result = setActiveMapSchema.safeParse({
        path: "/path/to/track.gpx",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty path", () => {
      expect(setActiveMapSchema.safeParse({ path: "" }).success).toBe(false);
    });
  });

  describe("deleteGPXFileParamsSchema", () => {
    it("should accept valid GPX filename", () => {
      const result = deleteGPXFileParamsSchema.safeParse({
        fileName: "track.gpx",
      });
      expect(result.success).toBe(true);
    });

    it("should accept GPX filename with uppercase extension", () => {
      const result = deleteGPXFileParamsSchema.safeParse({
        fileName: "track.GPX",
      });
      expect(result.success).toBe(true);
    });

    it("should reject non-GPX filename", () => {
      expect(
        deleteGPXFileParamsSchema.safeParse({ fileName: "track.txt" }).success,
      ).toBe(false);
      expect(
        deleteGPXFileParamsSchema.safeParse({ fileName: "track" }).success,
      ).toBe(false);
    });

    it("should reject empty filename", () => {
      expect(
        deleteGPXFileParamsSchema.safeParse({ fileName: "" }).success,
      ).toBe(false);
    });
  });

  describe("deleteDriveRouteParamsSchema", () => {
    it("should accept valid route ID", () => {
      const result = deleteDriveRouteParamsSchema.safeParse({
        routeId: "route_123",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty route ID", () => {
      expect(
        deleteDriveRouteParamsSchema.safeParse({ routeId: "" }).success,
      ).toBe(false);
    });
  });
});
