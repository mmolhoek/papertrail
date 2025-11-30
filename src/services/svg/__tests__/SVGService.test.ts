import { SVGService } from "../SVGService";
import { GPXTrack, ViewportConfig, GPSCoordinate } from "@core/types";

describe("SVGService", () => {
  let svgService: SVGService;

  beforeEach(() => {
    svgService = new SVGService();
  });

  describe("createBlankBitmap", () => {
    it("should create a blank white bitmap", () => {
      const bitmap = svgService.createBlankBitmap(800, 480, false);

      expect(bitmap.width).toBe(800);
      expect(bitmap.height).toBe(480);
      expect(bitmap.data).toBeInstanceOf(Uint8Array);
      expect(bitmap.data.length).toBeGreaterThan(0);

      // Check that it's all white (0xFF)
      expect(bitmap.data.every((byte) => byte === 0xff)).toBe(true);
    });

    it("should create a blank black bitmap", () => {
      const bitmap = svgService.createBlankBitmap(800, 480, true);

      expect(bitmap.width).toBe(800);
      expect(bitmap.height).toBe(480);

      // Check that it's all black (0x00)
      expect(bitmap.data.every((byte) => byte === 0x00)).toBe(true);
    });

    it("should calculate correct data size", () => {
      const bitmap = svgService.createBlankBitmap(800, 480);

      // 800 pixels width = 100 bytes per row
      // 480 rows = 48000 bytes total
      const expectedBytes = Math.ceil(800 / 8) * 480;
      expect(bitmap.data.length).toBe(expectedBytes);
    });

    it("should handle non-multiple-of-8 widths", () => {
      const bitmap = svgService.createBlankBitmap(803, 480);

      // 803 pixels width = 101 bytes per row (ceil(803/8))
      const expectedBytes = Math.ceil(803 / 8) * 480;
      expect(bitmap.data.length).toBe(expectedBytes);
    });
  });

  describe("getDefaultRenderOptions", () => {
    it("should return default render options", () => {
      const options = svgService.getDefaultRenderOptions();

      expect(options.lineWidth).toBe(2);
      expect(options.pointRadius).toBe(3);
      expect(options.showPoints).toBe(true);
      expect(options.showLine).toBe(true);
      expect(options.highlightCurrentPosition).toBe(true);
      expect(options.currentPositionRadius).toBe(8);
      expect(options.showDirection).toBe(false);
      expect(options.antiAlias).toBe(false);
    });
  });

  describe("renderViewport", () => {
    const createMockTrack = (): GPXTrack => ({
      name: "Test Track",
      segments: [
        {
          points: [
            { latitude: 51.9225, longitude: 4.47917, timestamp: new Date() },
            { latitude: 51.9226, longitude: 4.47927, timestamp: new Date() },
            { latitude: 51.9227, longitude: 4.47937, timestamp: new Date() },
          ],
        },
      ],
    });

    const createMockViewport = (): ViewportConfig => ({
      width: 800,
      height: 480,
      centerPoint: {
        latitude: 51.9225,
        longitude: 4.47917,
        timestamp: new Date(),
      },
      zoomLevel: 14,
    });

    it("should render a track successfully", async () => {
      const track = createMockTrack();
      const viewport = createMockViewport();

      const result = await svgService.renderViewport(track, viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(800);
        expect(result.data.height).toBe(480);
      }
    });

    it("should render empty track as blank bitmap", async () => {
      const track: GPXTrack = {
        name: "Empty Track",
        segments: [],
      };
      const viewport = createMockViewport();

      const result = await svgService.renderViewport(track, viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(800);
        expect(result.data.height).toBe(480);
      }
    });

    it("should respect custom render options", async () => {
      const track = createMockTrack();
      const viewport = createMockViewport();
      const options = {
        lineWidth: 4,
        pointRadius: 5,
        showPoints: false,
        showLine: true,
      };

      const result = await svgService.renderViewport(track, viewport, options);

      expect(result.success).toBe(true);
    });

    it("should handle track with no points in segment", async () => {
      const track: GPXTrack = {
        name: "Empty Segment Track",
        segments: [{ points: [] }],
      };
      const viewport = createMockViewport();

      const result = await svgService.renderViewport(track, viewport);

      expect(result.success).toBe(true);
    });

    it("should render with different zoom levels", async () => {
      const track = createMockTrack();
      const viewport1 = { ...createMockViewport(), zoomLevel: 10 };
      const viewport2 = { ...createMockViewport(), zoomLevel: 18 };

      const result1 = await svgService.renderViewport(track, viewport1);
      const result2 = await svgService.renderViewport(track, viewport2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it("should highlight current position when enabled", async () => {
      const track = createMockTrack();
      const viewport = createMockViewport();
      const options = { highlightCurrentPosition: true };

      const result = await svgService.renderViewport(track, viewport, options);

      expect(result.success).toBe(true);
      if (result.success) {
        // Bitmap should have some black pixels for the highlighted position
        const hasBlackPixels = Array.from(result.data.data).some(
          (byte) => byte !== 0xff,
        );
        expect(hasBlackPixels).toBe(true);
      }
    });

    it("should not highlight current position when disabled", async () => {
      const track: GPXTrack = {
        name: "Empty Track",
        segments: [],
      };
      const viewport = createMockViewport();
      const options = { highlightCurrentPosition: false };

      const result = await svgService.renderViewport(track, viewport, options);

      expect(result.success).toBe(true);
      if (result.success) {
        // Empty track with no highlight should be all white
        const allWhite = Array.from(result.data.data).every(
          (byte) => byte === 0xff,
        );
        expect(allWhite).toBe(true);
      }
    });
  });

  describe("renderMultipleTracks", () => {
    const createMockTrack = (
      name: string,
      latOffset: number = 0,
    ): GPXTrack => ({
      name,
      segments: [
        {
          points: [
            {
              latitude: 51.9225 + latOffset,
              longitude: 4.47917,
              timestamp: new Date(),
            },
            {
              latitude: 51.9226 + latOffset,
              longitude: 4.47927,
              timestamp: new Date(),
            },
          ],
        },
      ],
    });

    const createMockViewport = (): ViewportConfig => ({
      width: 800,
      height: 480,
      centerPoint: {
        latitude: 51.9225,
        longitude: 4.47917,
        timestamp: new Date(),
      },
      zoomLevel: 14,
    });

    it("should render multiple tracks", async () => {
      const tracks = [
        createMockTrack("Track 1"),
        createMockTrack("Track 2", 0.001),
        createMockTrack("Track 3", 0.002),
      ];
      const viewport = createMockViewport();

      const result = await svgService.renderMultipleTracks(tracks, viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(800);
        expect(result.data.height).toBe(480);
      }
    });

    it("should render empty tracks array", async () => {
      const viewport = createMockViewport();

      const result = await svgService.renderMultipleTracks([], viewport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.width).toBe(800);
        expect(result.data.height).toBe(480);
      }
    });

    it("should skip tracks with no points", async () => {
      const tracks = [
        createMockTrack("Track 1"),
        { name: "Empty Track", segments: [] },
        createMockTrack("Track 3", 0.002),
      ];
      const viewport = createMockViewport();

      const result = await svgService.renderMultipleTracks(tracks, viewport);

      expect(result.success).toBe(true);
    });
  });

  describe("addText", () => {
    it("should return bitmap with success", () => {
      const bitmap = svgService.createBlankBitmap(800, 480);
      const result = svgService.addText(bitmap, "Test", 10, 10, 12);

      expect(result.success).toBe(true);
    });
  });

  describe("addCompass", () => {
    it("should return bitmap with success", () => {
      const bitmap = svgService.createBlankBitmap(800, 480);
      const result = svgService.addCompass(bitmap, 100, 100, 50, 45);

      expect(result.success).toBe(true);
    });
  });

  describe("addScaleBar", () => {
    it("should return bitmap with success", () => {
      const bitmap = svgService.createBlankBitmap(800, 480);
      const result = svgService.addScaleBar(bitmap, 10, 10, 100, 10);

      expect(result.success).toBe(true);
    });
  });

  describe("addInfoPanel", () => {
    it("should return bitmap with success", () => {
      const bitmap = svgService.createBlankBitmap(800, 480);
      const info = {
        speed: "5.2 km/h",
        distance: "12.3 km",
        elevation: "234 m",
      };
      const result = svgService.addInfoPanel(bitmap, info, "top-left");

      expect(result.success).toBe(true);
    });

    it("should accept different positions", () => {
      const bitmap = svgService.createBlankBitmap(800, 480);
      const info = { speed: "5.2 km/h" };

      const positions: Array<
        "top-left" | "top-right" | "bottom-left" | "bottom-right"
      > = ["top-left", "top-right", "bottom-left", "bottom-right"];

      for (const position of positions) {
        const result = svgService.addInfoPanel(bitmap, info, position);
        expect(result.success).toBe(true);
      }
    });
  });
});
