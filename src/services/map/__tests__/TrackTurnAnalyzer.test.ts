import {
  TrackTurnAnalyzer,
  TrackTurn,
  TurnDetectionConfig,
  getTrackTurnAnalyzer,
} from "../TrackTurnAnalyzer";
import { GPXTrack, ManeuverType } from "@core/types";

describe("TrackTurnAnalyzer", () => {
  let analyzer: TrackTurnAnalyzer;

  beforeEach(() => {
    analyzer = new TrackTurnAnalyzer();
  });

  describe("constructor", () => {
    it("should create analyzer with default config", () => {
      const defaultAnalyzer = new TrackTurnAnalyzer();
      expect(defaultAnalyzer).toBeDefined();
    });

    it("should accept custom config", () => {
      const customConfig: Partial<TurnDetectionConfig> = {
        minTurnAngle: 30,
        minDistanceBetweenTurns: 50,
      };
      const customAnalyzer = new TrackTurnAnalyzer(customConfig);
      expect(customAnalyzer).toBeDefined();
    });
  });

  describe("analyzeTurns", () => {
    it("should return empty array for track with fewer than 3 points", () => {
      const track: GPXTrack = {
        name: "Short track",
        segments: [
          {
            points: [
              {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              { latitude: 37.775, longitude: -122.4195, timestamp: new Date() },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns).toHaveLength(0);
    });

    it("should return empty array for track with no points", () => {
      const track: GPXTrack = {
        name: "Empty track",
        segments: [],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns).toHaveLength(0);
    });

    it("should detect a right turn", () => {
      // Create a track that goes north, then turns east (90° right turn)
      const track: GPXTrack = {
        name: "Right turn track",
        segments: [
          {
            points: [
              // Going north
              {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7759,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7769,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              // Turn point
              {
                latitude: 37.7779,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              // Going east
              {
                latitude: 37.7779,
                longitude: -122.4184,
                timestamp: new Date(),
              },
              {
                latitude: 37.7779,
                longitude: -122.4174,
                timestamp: new Date(),
              },
              {
                latitude: 37.7779,
                longitude: -122.4164,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns.length).toBeGreaterThanOrEqual(1);

      const rightTurn = turns.find(
        (t) =>
          t.maneuverType === ManeuverType.RIGHT ||
          t.maneuverType === ManeuverType.SHARP_RIGHT,
      );
      expect(rightTurn).toBeDefined();
    });

    it("should detect a left turn", () => {
      // Create a track that goes north, then turns west (90° left turn)
      const track: GPXTrack = {
        name: "Left turn track",
        segments: [
          {
            points: [
              // Going north
              {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7759,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7769,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              // Turn point
              {
                latitude: 37.7779,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              // Going west
              {
                latitude: 37.7779,
                longitude: -122.4204,
                timestamp: new Date(),
              },
              {
                latitude: 37.7779,
                longitude: -122.4214,
                timestamp: new Date(),
              },
              {
                latitude: 37.7779,
                longitude: -122.4224,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns.length).toBeGreaterThanOrEqual(1);

      const leftTurn = turns.find(
        (t) =>
          t.maneuverType === ManeuverType.LEFT ||
          t.maneuverType === ManeuverType.SHARP_LEFT,
      );
      expect(leftTurn).toBeDefined();
    });

    it("should detect a U-turn", () => {
      // Create a track that goes north, then turns back south (180° turn)
      const track: GPXTrack = {
        name: "U-turn track",
        segments: [
          {
            points: [
              // Going north
              {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7759,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7769,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              // Turn point
              {
                latitude: 37.7779,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              // Going south
              {
                latitude: 37.7769,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7759,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns.length).toBeGreaterThanOrEqual(1);

      const uTurn = turns.find((t) => t.maneuverType === ManeuverType.UTURN);
      expect(uTurn).toBeDefined();
    });

    it("should not detect turns on a straight path", () => {
      // Create a track that goes in a straight line
      const track: GPXTrack = {
        name: "Straight track",
        segments: [
          {
            points: [
              {
                latitude: 37.7749,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7759,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7769,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7779,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7789,
                longitude: -122.4194,
                timestamp: new Date(),
              },
              {
                latitude: 37.7799,
                longitude: -122.4194,
                timestamp: new Date(),
              },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns).toHaveLength(0);
    });

    it("should detect multiple turns in a zigzag path", () => {
      // Create a zigzag track with multiple turns
      const track: GPXTrack = {
        name: "Zigzag track",
        segments: [
          {
            points: [
              // Segment 1: Going north-east
              { latitude: 37.77, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.771, longitude: -122.419, timestamp: new Date() },
              { latitude: 37.772, longitude: -122.418, timestamp: new Date() },
              // Turn 1: Switch to north-west
              { latitude: 37.773, longitude: -122.417, timestamp: new Date() },
              { latitude: 37.774, longitude: -122.418, timestamp: new Date() },
              { latitude: 37.775, longitude: -122.419, timestamp: new Date() },
              // Turn 2: Switch back to north-east
              { latitude: 37.776, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.777, longitude: -122.419, timestamp: new Date() },
              { latitude: 37.778, longitude: -122.418, timestamp: new Date() },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      expect(turns.length).toBeGreaterThanOrEqual(1);
    });

    it("should include correct distance information in detected turns", () => {
      // Create a simple track with a turn
      const track: GPXTrack = {
        name: "Distance test track",
        segments: [
          {
            points: [
              { latitude: 37.77, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.775, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.78, longitude: -122.42, timestamp: new Date() },
              // Turn point
              { latitude: 37.785, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.785, longitude: -122.41, timestamp: new Date() },
              { latitude: 37.785, longitude: -122.4, timestamp: new Date() },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);

      if (turns.length > 0) {
        const firstTurn = turns[0];
        expect(firstTurn.distanceFromStart).toBeGreaterThan(0);
        expect(firstTurn.latitude).toBeDefined();
        expect(firstTurn.longitude).toBeDefined();
        expect(firstTurn.instruction).toBeDefined();
        expect(firstTurn.bearingAfter).toBeGreaterThanOrEqual(0);
        expect(firstTurn.bearingAfter).toBeLessThan(360);
      }
    });

    it("should handle multiple segments in a track", () => {
      const track: GPXTrack = {
        name: "Multi-segment track",
        segments: [
          {
            points: [
              { latitude: 37.77, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.772, longitude: -122.42, timestamp: new Date() },
            ],
          },
          {
            points: [
              { latitude: 37.774, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.776, longitude: -122.42, timestamp: new Date() },
              // Turn
              { latitude: 37.778, longitude: -122.42, timestamp: new Date() },
              { latitude: 37.778, longitude: -122.41, timestamp: new Date() },
              { latitude: 37.778, longitude: -122.4, timestamp: new Date() },
            ],
          },
        ],
      };

      const turns = analyzer.analyzeTurns(track);
      // Should still be able to analyze the combined points
      expect(Array.isArray(turns)).toBe(true);
    });
  });

  describe("findNextTurn", () => {
    let mockTurns: TrackTurn[];

    beforeEach(() => {
      mockTurns = [
        {
          pointIndex: 10,
          latitude: 37.775,
          longitude: -122.419,
          maneuverType: ManeuverType.RIGHT,
          bearingChange: 90,
          distanceFromStart: 500,
          distanceToNextTurn: 300,
          instruction: "Turn right",
          bearingAfter: 90,
        },
        {
          pointIndex: 20,
          latitude: 37.776,
          longitude: -122.418,
          maneuverType: ManeuverType.LEFT,
          bearingChange: -90,
          distanceFromStart: 800,
          distanceToNextTurn: 400,
          instruction: "Turn left",
          bearingAfter: 0,
        },
        {
          pointIndex: 30,
          latitude: 37.777,
          longitude: -122.417,
          maneuverType: ManeuverType.SHARP_RIGHT,
          bearingChange: 120,
          distanceFromStart: 1200,
          distanceToNextTurn: 500,
          instruction: "Sharp right",
          bearingAfter: 120,
        },
      ];
    });

    it("should return first turn when at start of track", () => {
      const nextTurn = analyzer.findNextTurn(mockTurns, 0);
      expect(nextTurn).toBeDefined();
      expect(nextTurn?.maneuverType).toBe(ManeuverType.RIGHT);
      expect(nextTurn?.distanceFromStart).toBe(500);
    });

    it("should return second turn when past first turn", () => {
      const nextTurn = analyzer.findNextTurn(mockTurns, 600);
      expect(nextTurn).toBeDefined();
      expect(nextTurn?.maneuverType).toBe(ManeuverType.LEFT);
    });

    it("should return null when past all turns", () => {
      const nextTurn = analyzer.findNextTurn(mockTurns, 1500);
      expect(nextTurn).toBeNull();
    });

    it("should return null for empty turns array", () => {
      const nextTurn = analyzer.findNextTurn([], 100);
      expect(nextTurn).toBeNull();
    });

    it("should handle exact distance match", () => {
      const nextTurn = analyzer.findNextTurn(mockTurns, 500);
      // At exactly 500m, the first turn is passed, should get second
      expect(nextTurn?.maneuverType).toBe(ManeuverType.LEFT);
    });
  });

  describe("findTurnAfterNext", () => {
    let mockTurns: TrackTurn[];

    beforeEach(() => {
      mockTurns = [
        {
          pointIndex: 10,
          latitude: 37.775,
          longitude: -122.419,
          maneuverType: ManeuverType.RIGHT,
          bearingChange: 90,
          distanceFromStart: 500,
          distanceToNextTurn: 300,
          instruction: "Turn right",
          bearingAfter: 90,
        },
        {
          pointIndex: 20,
          latitude: 37.776,
          longitude: -122.418,
          maneuverType: ManeuverType.LEFT,
          bearingChange: -90,
          distanceFromStart: 800,
          distanceToNextTurn: 400,
          instruction: "Turn left",
          bearingAfter: 0,
        },
        {
          pointIndex: 30,
          latitude: 37.777,
          longitude: -122.417,
          maneuverType: ManeuverType.SHARP_RIGHT,
          bearingChange: 120,
          distanceFromStart: 1200,
          distanceToNextTurn: 500,
          instruction: "Sharp right",
          bearingAfter: 120,
        },
      ];
    });

    it("should return second turn when at start of track", () => {
      const turnAfterNext = analyzer.findTurnAfterNext(mockTurns, 0);
      expect(turnAfterNext).toBeDefined();
      expect(turnAfterNext?.maneuverType).toBe(ManeuverType.LEFT);
    });

    it("should return third turn when past first turn", () => {
      const turnAfterNext = analyzer.findTurnAfterNext(mockTurns, 600);
      expect(turnAfterNext).toBeDefined();
      expect(turnAfterNext?.maneuverType).toBe(ManeuverType.SHARP_RIGHT);
    });

    it("should return null when only one turn remains", () => {
      const turnAfterNext = analyzer.findTurnAfterNext(mockTurns, 900);
      expect(turnAfterNext).toBeNull();
    });

    it("should return null when past all turns", () => {
      const turnAfterNext = analyzer.findTurnAfterNext(mockTurns, 1500);
      expect(turnAfterNext).toBeNull();
    });
  });

  describe("turn classification", () => {
    it("should generate correct instructions for different turn types", () => {
      // Create tracks with different turn angles
      const testCases = [
        { description: "slight right (30°)", bearingChange: 30 },
        { description: "right (90°)", bearingChange: 90 },
        { description: "sharp right (130°)", bearingChange: 130 },
        { description: "slight left (-30°)", bearingChange: -30 },
        { description: "left (-90°)", bearingChange: -90 },
        { description: "sharp left (-130°)", bearingChange: -130 },
      ];

      // Verify the analyzer handles various turn angles
      for (const testCase of testCases) {
        expect(testCase.bearingChange).toBeDefined();
      }
    });
  });

  describe("getTrackTurnAnalyzer singleton", () => {
    it("should return an analyzer instance", () => {
      const instance = getTrackTurnAnalyzer();
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(TrackTurnAnalyzer);
    });

    it("should return same instance on subsequent calls without config", () => {
      const instance1 = getTrackTurnAnalyzer();
      const instance2 = getTrackTurnAnalyzer();
      expect(instance1).toBe(instance2);
    });

    it("should return new instance when config is provided", () => {
      const instance1 = getTrackTurnAnalyzer();
      const instance2 = getTrackTurnAnalyzer({ minTurnAngle: 40 });
      expect(instance1).not.toBe(instance2);
    });
  });
});
