import { SVGService } from "../SVGService";
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

  describe("addText", () => {
    it("should add text to bitmap", () => {
      const bitmap = service.createBlankBitmap(200, 100, false);

      const result = service.addText(bitmap, "Test", 10, 10);

      expect(result.success).toBe(true);
    });

    it("should add text with custom font size", () => {
      const bitmap = service.createBlankBitmap(200, 100, false);

      const result = service.addText(bitmap, "Test", 10, 10, 16);

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

  describe("addInfoPanel", () => {
    it("should add info panel to bitmap", () => {
      const bitmap = service.createBlankBitmap(800, 480, false);

      const result = service.addInfoPanel(
        bitmap,
        {
          speed: "25 km/h",
          distance: "5.2 km",
          elevation: "150 m",
          time: "10:30",
        },
        "top-right",
      );

      expect(result.success).toBe(true);
    });

    it("should add info panel at different positions", () => {
      const positions = [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ] as const;

      for (const position of positions) {
        const bitmap = service.createBlankBitmap(800, 480, false);
        const result = service.addInfoPanel(
          bitmap,
          { speed: "25 km/h" },
          position,
        );
        expect(result.success).toBe(true);
      }
    });

    it("should add info panel with partial info", () => {
      const bitmap = service.createBlankBitmap(800, 480, false);

      const result = service.addInfoPanel(bitmap, { speed: "25 km/h" });

      expect(result.success).toBe(true);
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

  describe("renderDriveMapScreen", () => {
    it("should render drive map screen", async () => {
      const route: DriveRoute = {
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
          instruction: "Turn right onto Main St",
          streetName: "Main St",
          distanceRemaining: 4500,
          progress: 10,
        },
      );

      expect(result.success).toBe(true);
    });
  });
});
