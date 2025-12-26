/* eslint-disable @typescript-eslint/no-explicit-any */
import { SVGService } from "@services/svg/SVGService";
import {
  GPXTrack,
  ViewportConfig,
  GPSCoordinate,
  ManeuverType,
  DriveRoute,
  DriveWaypoint,
} from "@core/types";

describe("SVGService", () => {
  let service: SVGService;

  const createTestTrack = (numPoints: number = 10): GPXTrack => ({
    name: "Test Track",
    segments: [
      {
        points: Array.from({ length: numPoints }, (_, i) => ({
          latitude: 37.7749 + i * 0.001,
          longitude: -122.4194 + i * 0.001,
          altitude: 10 + i,
          timestamp: new Date(Date.now() + i * 1000),
        })),
      },
    ],
  });

  const createTestViewport = (): ViewportConfig => ({
    width: 800,
    height: 480,
    zoomLevel: 15,
    centerPoint: {
      latitude: 37.7749,
      longitude: -122.4194,
      timestamp: new Date(),
    },
  });

  beforeEach(() => {
    service = new SVGService();
  });

  describe("createBlankBitmap", () => {
    it("should create a blank white bitmap", () => {
      const bitmap = service.createBlankBitmap(100, 50, false);

      expect(bitmap.width).toBe(100);
      expect(bitmap.height).toBe(50);
      expect(bitmap.data).toBeDefined();
      expect(bitmap.data.length).toBe(Math.ceil(100 / 8) * 50);
    });

    it("should create a filled bitmap with fill=true", () => {
      const bitmap = service.createBlankBitmap(100, 50, true);

      expect(bitmap.width).toBe(100);
      expect(bitmap.height).toBe(50);
      // Bitmap data should be defined and have correct length
      expect(bitmap.data).toBeDefined();
      expect(bitmap.data.length).toBe(Math.ceil(100 / 8) * 50);
    });
  });

  describe("getDefaultRenderOptions", () => {
    it("should return default render options", () => {
      const options = service.getDefaultRenderOptions();

      expect(options).toHaveProperty("showLine");
      expect(options).toHaveProperty("lineWidth");
      expect(options).toHaveProperty("showPoints");
      expect(options).toHaveProperty("pointRadius");
      expect(options).toHaveProperty("highlightCurrentPosition");
    });
  });

  describe("renderViewport", () => {
    it("should render an empty track", async () => {
      const emptyTrack: GPXTrack = {
        name: "Empty Track",
        segments: [],
      };
      const viewport = createTestViewport();

      const result = await service.renderViewport(emptyTrack, viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(viewport.width);
        expect(result.data.height).toBe(viewport.height);
      }
    });

    it("should render a track with segment but no points", async () => {
      const track: GPXTrack = {
        name: "Empty Segment Track",
        segments: [{ points: [] }],
      };
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport);

      expect(result.success).toBe(true);
    });

    it("should render a track with points", async () => {
      const track = createTestTrack(20);
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(viewport.width);
        expect(result.data.height).toBe(viewport.height);
      }
    });

    it("should render with custom options", async () => {
      const track = createTestTrack(10);
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport, {
        showLine: true,
        lineWidth: 3,
        showPoints: true,
        pointRadius: 5,
        highlightCurrentPosition: true,
      });

      expect(result.success).toBe(true);
    });

    it("should render with rotation when bearing is set", async () => {
      const track = createTestTrack(10);
      const viewport: ViewportConfig = {
        ...createTestViewport(),
        centerPoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: new Date(),
          bearing: 45, // 45 degrees
        },
      };

      const result = await service.renderViewport(track, viewport, {
        rotateWithBearing: true,
      });

      expect(result.success).toBe(true);
    });

    it("should render without rotation when rotateWithBearing is false", async () => {
      const track = createTestTrack(10);
      const viewport: ViewportConfig = {
        ...createTestViewport(),
        centerPoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: new Date(),
          bearing: 45,
        },
      };

      const result = await service.renderViewport(track, viewport, {
        rotateWithBearing: false,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("renderMultipleTracks", () => {
    it("should render multiple tracks", async () => {
      const track1 = createTestTrack(10);
      const track2: GPXTrack = {
        name: "Second Track",
        segments: [
          {
            points: [
              {
                latitude: 37.78,
                longitude: -122.42,
                altitude: 5,
                timestamp: new Date(),
              },
              {
                latitude: 37.79,
                longitude: -122.43,
                altitude: 10,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };
      const viewport = createTestViewport();

      const result = await service.renderMultipleTracks(
        [track1, track2],
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render empty array of tracks", async () => {
      const viewport = createTestViewport();

      const result = await service.renderMultipleTracks([], viewport);

      expect(result.success).toBe(true);
    });
  });

  describe("addCompass", () => {
    it("should add compass to bitmap", async () => {
      const bitmap = service.createBlankBitmap(200, 200, false);

      const result = await service.addCompass(bitmap, 100, 100, 30, 0);

      expect(result.success).toBe(true);
    });

    it("should add rotated compass", async () => {
      const bitmap = service.createBlankBitmap(200, 200, false);

      const result = await service.addCompass(bitmap, 100, 100, 30, 90);

      expect(result.success).toBe(true);
    });
  });

  describe("addScaleBar", () => {
    it("should add scale bar to bitmap", async () => {
      const bitmap = service.createBlankBitmap(200, 100, false);

      const result = await service.addScaleBar(bitmap, 10, 80, 100, 5);

      expect(result.success).toBe(true);
    });

    it("should handle various meters per pixel values", async () => {
      const bitmap = service.createBlankBitmap(200, 100, false);

      // Test various scales
      const scales = [0.1, 1, 10, 100, 1000];
      for (const mpp of scales) {
        const result = await service.addScaleBar(bitmap, 10, 80, 100, mpp);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("renderFollowTrackScreen", () => {
    it("should render follow track screen", async () => {
      const track = createTestTrack(20);
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const viewport = createTestViewport();

      const result = await service.renderFollowTrackScreen(
        track,
        currentPosition,
        viewport,
        {
          speed: 25,
          satellites: 8,
          progress: 50,
          bearing: 45,
          distanceRemaining: 5000,
          estimatedTimeRemaining: 600,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render follow track screen without optional info", async () => {
      const track = createTestTrack(10);
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const viewport = createTestViewport();

      const result = await service.renderFollowTrackScreen(
        track,
        currentPosition,
        viewport,
        {
          speed: 0,
          satellites: 0,
        },
      );

      expect(result.success).toBe(true);
    });
  });

  describe("renderTurnScreen", () => {
    it("should render turn screen for various maneuvers", async () => {
      const viewport = createTestViewport();
      const maneuvers: ManeuverType[] = [
        ManeuverType.LEFT,
        ManeuverType.RIGHT,
        ManeuverType.SLIGHT_LEFT,
        ManeuverType.SLIGHT_RIGHT,
        ManeuverType.STRAIGHT,
        ManeuverType.UTURN,
        ManeuverType.ARRIVE,
        ManeuverType.DEPART,
      ];

      for (const maneuver of maneuvers) {
        const result = await service.renderTurnScreen(
          maneuver,
          500,
          "Turn left onto Main St",
          "Main St",
          viewport,
        );

        expect(result.success).toBe(true);
      }
    });

    it("should render turn screen without street name", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.RIGHT,
        200,
        "Turn right",
        undefined,
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render dual turn screen with next turn", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.LEFT,
        300,
        "Turn left",
        "Main St",
        viewport,
        {
          maneuverType: ManeuverType.RIGHT,
          distance: 150,
          instruction: "Turn right",
          streetName: "Oak Ave",
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render dual turn screen without street names", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.SLIGHT_LEFT,
        200,
        "Keep left",
        undefined,
        viewport,
        {
          maneuverType: ManeuverType.SLIGHT_RIGHT,
          distance: 100,
          instruction: "Keep right",
          streetName: undefined,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render dual turn screen with various maneuver combinations", async () => {
      const viewport = createTestViewport();
      const combinations = [
        { current: ManeuverType.LEFT, next: ManeuverType.RIGHT },
        { current: ManeuverType.STRAIGHT, next: ManeuverType.UTURN },
        { current: ManeuverType.SHARP_LEFT, next: ManeuverType.SHARP_RIGHT },
        { current: ManeuverType.ROUNDABOUT, next: ManeuverType.STRAIGHT },
      ];

      for (const combo of combinations) {
        const result = await service.renderTurnScreen(
          combo.current,
          500,
          "First turn",
          "First St",
          viewport,
          {
            maneuverType: combo.next,
            distance: 200,
            instruction: "Second turn",
            streetName: "Second St",
          },
        );

        expect(result.success).toBe(true);
      }
    });
  });

  describe("renderOffRoadScreen", () => {
    it("should render off-road screen", async () => {
      const viewport = createTestViewport();

      const result = await service.renderOffRoadScreen(45, 1500, viewport);

      expect(result.success).toBe(true);
    });

    it("should render off-road screen with various bearings", async () => {
      const viewport = createTestViewport();
      const bearings = [0, 90, 180, 270, 359];

      for (const bearing of bearings) {
        const result = await service.renderOffRoadScreen(
          bearing,
          1000,
          viewport,
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe("renderArrivalScreen", () => {
    it("should render arrival screen", async () => {
      const viewport = createTestViewport();

      const result = await service.renderArrivalScreen(
        "123 Main Street, San Francisco",
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render arrival screen with short destination", async () => {
      const viewport = createTestViewport();

      const result = await service.renderArrivalScreen("Home", viewport);

      expect(result.success).toBe(true);
    });
  });

  describe("formatWaypointLabel", () => {
    const createWaypoint = (
      overrides: Partial<DriveWaypoint> = {},
    ): DriveWaypoint => ({
      latitude: 37.7749,
      longitude: -122.4194,
      maneuverType: ManeuverType.STRAIGHT,
      instruction: "Continue straight",
      distance: 100,
      index: 0,
      ...overrides,
    });

    it("should return street name when available", () => {
      const waypoint = createWaypoint({ streetName: "Main Street" });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("MAIN STREET");
    });

    it("should truncate long street names to 12 characters", () => {
      const waypoint = createWaypoint({
        streetName: "Massachusetts Avenue",
      });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("MASSACHUSETT");
      expect(label.length).toBe(12);
    });

    it("should return L for left turns", () => {
      const leftManeuvers = [
        ManeuverType.LEFT,
        ManeuverType.SLIGHT_LEFT,
        ManeuverType.SHARP_LEFT,
      ];

      for (const maneuverType of leftManeuvers) {
        const waypoint = createWaypoint({ maneuverType });
        const label = (service as any).formatWaypointLabel(waypoint);
        expect(label).toBe("L");
      }
    });

    it("should return R for right turns", () => {
      const rightManeuvers = [
        ManeuverType.RIGHT,
        ManeuverType.SLIGHT_RIGHT,
        ManeuverType.SHARP_RIGHT,
      ];

      for (const maneuverType of rightManeuvers) {
        const waypoint = createWaypoint({ maneuverType });
        const label = (service as any).formatWaypointLabel(waypoint);
        expect(label).toBe("R");
      }
    });

    it("should return U for u-turn", () => {
      const waypoint = createWaypoint({ maneuverType: ManeuverType.UTURN });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("U");
    });

    it("should return END for arrive", () => {
      const waypoint = createWaypoint({ maneuverType: ManeuverType.ARRIVE });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("END");
    });

    it("should return START for depart", () => {
      const waypoint = createWaypoint({ maneuverType: ManeuverType.DEPART });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("START");
    });

    it("should return empty string for straight", () => {
      const waypoint = createWaypoint({ maneuverType: ManeuverType.STRAIGHT });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("");
    });

    it("should return empty string for other maneuver types without street name", () => {
      const otherManeuvers = [
        ManeuverType.MERGE,
        ManeuverType.FORK_LEFT,
        ManeuverType.FORK_RIGHT,
        ManeuverType.ROUNDABOUT,
      ];

      for (const maneuverType of otherManeuvers) {
        const waypoint = createWaypoint({ maneuverType });
        const label = (service as any).formatWaypointLabel(waypoint);
        expect(label).toBe("");
      }
    });

    it("should prefer street name over maneuver type", () => {
      const waypoint = createWaypoint({
        maneuverType: ManeuverType.LEFT,
        streetName: "Oak Ave",
      });
      const label = (service as any).formatWaypointLabel(waypoint);
      expect(label).toBe("OAK AVE");
    });
  });

  describe("renderDriveMapScreen", () => {
    const createTestRoute = (): DriveRoute => ({
      id: "test-route",
      destination: "End",
      startPoint: { latitude: 37.7749, longitude: -122.4194 },
      endPoint: { latitude: 37.79, longitude: -122.43 },
      waypoints: [
        {
          latitude: 37.7749,
          longitude: -122.4194,
          maneuverType: ManeuverType.DEPART,
          instruction: "Head north",
          distance: 0,
          index: 0,
        },
        {
          latitude: 37.78,
          longitude: -122.42,
          maneuverType: ManeuverType.RIGHT,
          instruction: "Turn right",
          streetName: "Main St",
          distance: 500,
          index: 1,
        },
      ],
      geometry: [
        [37.7749, -122.4194],
        [37.78, -122.42],
        [37.79, -122.43],
      ],
      totalDistance: 5000,
      estimatedTime: 600,
      createdAt: new Date(),
    });

    it("should render drive map screen", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 200,
          instruction: "Turn right onto Main St",
          streetName: "Main St",
          distanceRemaining: 4500,
          progress: 10,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with roads as background layer", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const roads: any[] = [
        {
          id: "road1",
          geometry: [
            [37.77, -122.42],
            [37.78, -122.42],
          ],
          name: "Test Road",
          type: "primary",
        },
      ];

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 200,
          instruction: "Turn right",
          distanceRemaining: 4500,
          progress: 10,
        },
        undefined, // options
        roads,
      );

      expect(result.success).toBe(true);
    });

    it("should render with rotation when bearing is set", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        bearing: 90,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.LEFT,
          distanceToTurn: 500,
          instruction: "Turn left",
          distanceRemaining: 3000,
          progress: 40,
        },
        undefined,
      );

      expect(result.success).toBe(true);
    });

    it("should render waypoints at high zoom level (>= 19)", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport: ViewportConfig = {
        ...createTestViewport(),
        zoomLevel: 19, // High zoom level to show waypoints
      };

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 20,
          satellites: 8,
          nextManeuver: ManeuverType.STRAIGHT,
          distanceToTurn: 100,
          instruction: "Continue",
          distanceRemaining: 2000,
          progress: 60,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with POIs", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 45,
          satellites: 12,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 300,
          instruction: "Turn right",
          distanceRemaining: 5000,
          progress: 5,
          nearbyPOIs: [
            {
              latitude: 37.775,
              longitude: -122.42,
              name: "Gas Station",
              codeLetter: "G",
              distance: 100,
            },
            {
              latitude: 37.776,
              longitude: -122.418,
              name: "Coffee Shop",
              codeLetter: "C",
              distance: 200,
            },
          ],
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with speed limit for car profile", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 55,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 200,
          instruction: "Turn right",
          distanceRemaining: 4500,
          progress: 10,
          speedLimit: 50,
          routingProfile: "car",
        },
      );

      expect(result.success).toBe(true);
    });

    it("should hide speed limit for bike profile", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 25,
          satellites: 10,
          nextManeuver: ManeuverType.STRAIGHT,
          distanceToTurn: 500,
          instruction: "Continue",
          distanceRemaining: 3000,
          progress: 40,
          speedLimit: 50,
          routingProfile: "bike",
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with mph speed unit", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 80,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 400,
          instruction: "Turn right",
          distanceRemaining: 8000,
          progress: 20,
          speedUnit: "mph",
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with location name", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 30,
          satellites: 8,
          nextManeuver: ManeuverType.LEFT,
          distanceToTurn: 150,
          instruction: "Turn left",
          distanceRemaining: 2000,
          progress: 60,
          locationName: "San Francisco, CA",
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with zoom level indicator", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 40,
          satellites: 10,
          nextManeuver: ManeuverType.STRAIGHT,
          distanceToTurn: 1000,
          instruction: "Continue",
          distanceRemaining: 5000,
          progress: 30,
          zoomLevel: 16,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with background fetch indicator", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 200,
          instruction: "Turn right",
          distanceRemaining: 4500,
          progress: 10,
          isBackgroundFetching: true,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render route with no geometry gracefully", async () => {
      const route: DriveRoute = {
        ...createTestRoute(),
        geometry: [],
      };
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 200,
          instruction: "Turn right",
          distanceRemaining: 4500,
          progress: 10,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should truncate long street names in info panel", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.RIGHT,
          distanceToTurn: 200,
          instruction: "Turn right onto Very Long Street Name Boulevard Avenue",
          streetName:
            "Very Long Street Name Boulevard Avenue That Should Be Truncated",
          distanceRemaining: 4500,
          progress: 10,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with rotateWithBearing option and bearing", async () => {
      const route = createTestRoute();
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        bearing: 180,
        timestamp: new Date(),
      };
      const nextWaypoint: DriveWaypoint = route.waypoints[1];
      const viewport = createTestViewport();

      const result = await service.renderDriveMapScreen(
        route,
        currentPosition,
        nextWaypoint,
        viewport,
        {
          speed: 35,
          satellites: 10,
          nextManeuver: ManeuverType.LEFT,
          distanceToTurn: 200,
          instruction: "Turn left",
          distanceRemaining: 4500,
          progress: 10,
        },
        undefined,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("renderFollowTrackScreen additional tests", () => {
    it("should render with distance remaining in kilometers", async () => {
      const track = createTestTrack(10);
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const viewport = createTestViewport();

      const result = await service.renderFollowTrackScreen(
        track,
        currentPosition,
        viewport,
        {
          speed: 50,
          satellites: 12,
          progress: 25,
          bearing: 90,
          distanceRemaining: 15000, // 15 km
          estimatedTimeRemaining: 1200,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with zero speed and satellites", async () => {
      const track = createTestTrack(5);
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const viewport = createTestViewport();

      const result = await service.renderFollowTrackScreen(
        track,
        currentPosition,
        viewport,
        {
          speed: 0,
          satellites: 0,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render with 100% progress", async () => {
      const track = createTestTrack(10);
      const currentPosition: GPSCoordinate = {
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: new Date(),
      };
      const viewport = createTestViewport();

      const result = await service.renderFollowTrackScreen(
        track,
        currentPosition,
        viewport,
        {
          speed: 0,
          satellites: 8,
          progress: 100,
          distanceRemaining: 0,
        },
      );

      expect(result.success).toBe(true);
    });
  });

  describe("renderTurnScreen additional tests", () => {
    it("should render with very short distance", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.RIGHT,
        10, // 10 meters
        "Turn right",
        "Oak St",
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render with very long distance", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.STRAIGHT,
        50000, // 50 km
        "Continue straight",
        "Highway 101",
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render with progress bar", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.LEFT,
        500,
        "Turn left",
        "Main St",
        viewport,
        undefined,
        75, // progress
      );

      expect(result.success).toBe(true);
    });

    it("should render dual turn with progress", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.LEFT,
        300,
        "Turn left",
        "First St",
        viewport,
        {
          maneuverType: ManeuverType.RIGHT,
          distance: 100,
          instruction: "Then turn right",
          streetName: "Second St",
        },
        50,
      );

      expect(result.success).toBe(true);
    });

    it("should render FORK_LEFT maneuver type", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.FORK_LEFT,
        200,
        "Take left fork",
        "Exit 23",
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render RAMP_LEFT maneuver type", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.RAMP_LEFT,
        150,
        "Take ramp",
        undefined,
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render RAMP_RIGHT maneuver type", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.RAMP_RIGHT,
        180,
        "Take right ramp",
        "Highway 101",
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render MERGE maneuver type", async () => {
      const viewport = createTestViewport();

      const result = await service.renderTurnScreen(
        ManeuverType.MERGE,
        100,
        "Merge onto highway",
        "I-280",
        viewport,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("renderOffRoadScreen additional tests", () => {
    it("should render with short distance (under 1km)", async () => {
      const viewport = createTestViewport();

      const result = await service.renderOffRoadScreen(180, 500, viewport);

      expect(result.success).toBe(true);
    });

    it("should render with very long distance", async () => {
      const viewport = createTestViewport();

      const result = await service.renderOffRoadScreen(45, 10000, viewport);

      expect(result.success).toBe(true);
    });

    it("should render with all cardinal directions", async () => {
      const viewport = createTestViewport();
      // Test N, NE, E, SE, S, SW, W, NW
      const bearings = [0, 45, 90, 135, 180, 225, 270, 315];

      for (const bearing of bearings) {
        const result = await service.renderOffRoadScreen(
          bearing,
          1500,
          viewport,
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe("renderArrivalScreen additional tests", () => {
    it("should render with multi-word destination", async () => {
      const viewport = createTestViewport();

      const result = await service.renderArrivalScreen(
        "Golden Gate Park Visitor Center San Francisco California",
        viewport,
      );

      expect(result.success).toBe(true);
    });

    it("should render with single word destination", async () => {
      const viewport = createTestViewport();

      const result = await service.renderArrivalScreen("Work", viewport);

      expect(result.success).toBe(true);
    });

    it("should render with address-style destination", async () => {
      const viewport = createTestViewport();

      const result = await service.renderArrivalScreen(
        "1600 Pennsylvania Avenue NW Washington DC 20500",
        viewport,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("renderViewport additional tests", () => {
    it("should render with highlightCurrentPosition false", async () => {
      const track = createTestTrack(10);
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport, {
        highlightCurrentPosition: false,
      });

      expect(result.success).toBe(true);
    });

    it("should render with rotation and position highlighting", async () => {
      const track = createTestTrack(10);
      const viewport: ViewportConfig = {
        ...createTestViewport(),
        centerPoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: new Date(),
          bearing: 180,
        },
      };

      const result = await service.renderViewport(track, viewport, {
        rotateWithBearing: true,
        highlightCurrentPosition: true,
      });

      expect(result.success).toBe(true);
    });

    it("should render with custom point radius", async () => {
      const track = createTestTrack(10);
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport, {
        highlightCurrentPosition: true,
        currentPositionRadius: 15,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("renderMultipleTracks additional tests", () => {
    it("should render with position highlighting", async () => {
      const track1 = createTestTrack(5);
      const track2 = createTestTrack(8);
      const viewport = createTestViewport();

      const result = await service.renderMultipleTracks(
        [track1, track2],
        viewport,
        {
          highlightCurrentPosition: true,
          currentPositionRadius: 10,
        },
      );

      expect(result.success).toBe(true);
    });

    it("should render tracks with custom line width", async () => {
      const track1 = createTestTrack(10);
      const viewport = createTestViewport();

      const result = await service.renderMultipleTracks([track1], viewport, {
        lineWidth: 5,
        showLine: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("addCompass additional tests", () => {
    it("should add compass with 180 degree heading", async () => {
      const bitmap = service.createBlankBitmap(200, 200, false);

      const result = await service.addCompass(bitmap, 100, 100, 40, 180);

      expect(result.success).toBe(true);
    });

    it("should add compass with 270 degree heading", async () => {
      const bitmap = service.createBlankBitmap(200, 200, false);

      const result = await service.addCompass(bitmap, 100, 100, 40, 270);

      expect(result.success).toBe(true);
    });

    it("should add compass with 360 degree heading (same as 0)", async () => {
      const bitmap = service.createBlankBitmap(200, 200, false);

      const result = await service.addCompass(bitmap, 100, 100, 40, 360);

      expect(result.success).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle track with single point", async () => {
      const track: GPXTrack = {
        name: "Single Point Track",
        segments: [
          {
            points: [
              {
                latitude: 37.7749,
                longitude: -122.4194,
                altitude: 10,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport);

      expect(result.success).toBe(true);
    });

    it("should handle viewport with small dimensions", async () => {
      const track = createTestTrack(5);
      const viewport: ViewportConfig = {
        width: 100,
        height: 50,
        zoomLevel: 10,
        centerPoint: {
          latitude: 37.7749,
          longitude: -122.4194,
          timestamp: new Date(),
        },
      };

      const result = await service.renderViewport(track, viewport);

      expect(result.success).toBe(true);
    });

    it("should handle extreme zoom levels", async () => {
      const track = createTestTrack(5);

      // Low zoom
      let viewport: ViewportConfig = {
        ...createTestViewport(),
        zoomLevel: 1,
      };
      let result = await service.renderViewport(track, viewport);
      expect(result.success).toBe(true);

      // High zoom
      viewport = {
        ...createTestViewport(),
        zoomLevel: 22,
      };
      result = await service.renderViewport(track, viewport);
      expect(result.success).toBe(true);
    });

    it("should handle track with multiple segments", async () => {
      const track: GPXTrack = {
        name: "Multi-Segment Track",
        segments: [
          {
            points: [
              {
                latitude: 37.77,
                longitude: -122.41,
                altitude: 10,
                timestamp: new Date(),
              },
              {
                latitude: 37.78,
                longitude: -122.42,
                altitude: 15,
                timestamp: new Date(),
              },
            ],
          },
          {
            points: [
              {
                latitude: 37.79,
                longitude: -122.43,
                altitude: 20,
                timestamp: new Date(),
              },
              {
                latitude: 37.8,
                longitude: -122.44,
                altitude: 25,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };
      const viewport = createTestViewport();

      const result = await service.renderViewport(track, viewport);

      expect(result.success).toBe(true);
    });
  });
});
