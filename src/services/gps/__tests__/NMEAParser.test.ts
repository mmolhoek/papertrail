import { NMEAParser } from "@services/gps/NMEAParser";
import { GPSFixQuality } from "@core/types";

describe("NMEAParser", () => {
  let parser: NMEAParser;

  beforeEach(() => {
    parser = new NMEAParser();
  });

  describe("parse", () => {
    it("should return empty result for non-NMEA sentence", () => {
      const result = parser.parse("not a valid sentence");

      expect(result.hasNewPosition).toBe(false);
      expect(result.hasNewStatus).toBe(false);
      expect(result.position).toBeNull();
    });

    it("should return empty result for sentence not starting with $", () => {
      const result = parser.parse(
        "GPGGA,123456.00,1234.5678,N,12345.6789,W,1,08,0.9,100.0,M,0.0,M,,",
      );

      expect(result.hasNewPosition).toBe(false);
      expect(result.hasNewStatus).toBe(false);
    });
  });

  describe("checksum validation", () => {
    it("should accept sentences with valid checksum", () => {
      // Valid GGA sentence with correct checksum
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*4F";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(true);
    });

    it("should reject sentences with invalid checksum", () => {
      // Invalid checksum (changed *4F to *00)
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*00";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(false);
    });

    it("should accept sentences without checksum", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(true);
    });
  });

  describe("GGA sentence parsing", () => {
    it("should parse valid GPGGA sentence", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(true);
      expect(result.hasNewStatus).toBe(true);
      expect(result.position).not.toBeNull();

      const gga = parser.getLastGGA();
      expect(gga).not.toBeNull();
      expect(gga!.time).toBe("123519");
      expect(gga!.fixQuality).toBe(GPSFixQuality.GPS_FIX);
      expect(gga!.satellitesInUse).toBe(8);
      expect(gga!.hdop).toBe(0.9);
      expect(gga!.altitude).toBe(545.4);
    });

    it("should parse GNGGA sentence (multi-constellation)", () => {
      const sentence =
        "$GNGGA,123519,4807.038,N,01131.000,E,1,12,0.8,500.0,M,45.0,M,,";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(true);
      const gga = parser.getLastGGA();
      expect(gga).not.toBeNull();
      expect(gga!.satellitesInUse).toBe(12);
    });

    it("should parse latitude correctly for North", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      parser.parse(sentence);

      const gga = parser.getLastGGA();
      // 48 degrees + 7.038 minutes = 48 + 7.038/60 = 48.1173
      expect(gga!.latitude).toBeCloseTo(48.1173, 4);
    });

    it("should parse latitude correctly for South", () => {
      const sentence =
        "$GPGGA,123519,4807.038,S,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      parser.parse(sentence);

      const gga = parser.getLastGGA();
      expect(gga!.latitude).toBeCloseTo(-48.1173, 4);
    });

    it("should parse longitude correctly for East", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      parser.parse(sentence);

      const gga = parser.getLastGGA();
      // 11 degrees + 31.000 minutes = 11 + 31/60 = 11.5167
      expect(gga!.longitude).toBeCloseTo(11.5167, 4);
    });

    it("should parse longitude correctly for West", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,W,1,08,0.9,545.4,M,47.0,M,,";
      parser.parse(sentence);

      const gga = parser.getLastGGA();
      expect(gga!.longitude).toBeCloseTo(-11.5167, 4);
    });

    it("should handle different fix qualities", () => {
      const qualities = [
        { quality: 0, expected: GPSFixQuality.NO_FIX },
        { quality: 1, expected: GPSFixQuality.GPS_FIX },
        { quality: 2, expected: GPSFixQuality.DGPS_FIX },
        { quality: 4, expected: GPSFixQuality.RTK_FIX },
        { quality: 5, expected: GPSFixQuality.FLOAT_RTK },
      ];

      for (const { quality, expected } of qualities) {
        parser.reset();
        const sentence = `$GPGGA,123519,4807.038,N,01131.000,E,${quality},08,0.9,545.4,M,47.0,M,,`;
        parser.parse(sentence);

        const gga = parser.getLastGGA();
        expect(gga!.fixQuality).toBe(expected);
      }
    });

    it("should return null for incomplete GGA sentence", () => {
      const sentence = "$GPGGA,123519,4807.038,N,01131.000,E,1,08"; // Missing fields
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(false);
      expect(parser.getLastGGA()).toBeNull();
    });

    it("should return null for GGA with invalid coordinates", () => {
      const sentence = "$GPGGA,123519,,N,,E,1,08,0.9,545.4,M,47.0,M,,";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(false);
      expect(parser.getLastGGA()).toBeNull();
    });
  });

  describe("GSA sentence parsing", () => {
    it("should parse valid GPGSA sentence", () => {
      const sentence = "$GPGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.5,0.9,1.2";
      const result = parser.parse(sentence);

      expect(result.hasNewStatus).toBe(true);

      const gsa = parser.getLastGSA();
      expect(gsa).not.toBeNull();
      expect(gsa!.mode).toBe("A");
      expect(gsa!.fixType).toBe(3);
      expect(gsa!.pdop).toBe(1.5);
      expect(gsa!.hdop).toBe(0.9);
      expect(gsa!.vdop).toBe(1.2);
    });

    it("should parse satellite IDs from GSA", () => {
      const sentence =
        "$GPGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.5,0.9,1.2";
      parser.parse(sentence);

      const gsa = parser.getLastGSA();
      expect(gsa!.satelliteIds).toHaveLength(12);
      expect(gsa!.satelliteIds).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
    });

    it("should handle GSA with fewer satellites", () => {
      // GSA sentence with only 4 satellites (rest are empty)
      const sentence = "$GPGSA,A,3,01,02,03,04,,,,,,,,,1.5,0.9,1.2";
      parser.parse(sentence);

      const gsa = parser.getLastGSA();
      expect(gsa!.satelliteIds).toHaveLength(4);
    });

    it("should parse GNGSA sentence (multi-constellation)", () => {
      const sentence =
        "$GNGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.2,0.8,0.9";
      const result = parser.parse(sentence);

      expect(result.hasNewStatus).toBe(true);
      const gsa = parser.getLastGSA();
      expect(gsa).not.toBeNull();
    });

    it("should return null for incomplete GSA sentence", () => {
      const sentence = "$GPGSA,A,3,01,02,03"; // Missing fields
      const result = parser.parse(sentence);

      expect(result.hasNewStatus).toBe(false);
      expect(parser.getLastGSA()).toBeNull();
    });
  });

  describe("RMC sentence parsing", () => {
    it("should parse valid GPRMC sentence", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(true);

      const rmc = parser.getLastRMC();
      expect(rmc).not.toBeNull();
      expect(rmc!.time).toBe("123519");
      expect(rmc!.status).toBe("A");
      expect(rmc!.date).toBe("230394");
    });

    it("should parse speed in knots and convert to m/s", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      parser.parse(sentence);

      const rmc = parser.getLastRMC();
      expect(rmc!.speedKnots).toBe(22.4);
      // 22.4 knots * 0.514444 = 11.5235 m/s
      expect(rmc!.speedMps).toBeCloseTo(11.5235, 2);
    });

    it("should parse bearing (track angle)", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      parser.parse(sentence);

      const rmc = parser.getLastRMC();
      expect(rmc!.bearing).toBe(84.4);
    });

    it("should parse magnetic variation for West", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      parser.parse(sentence);

      const rmc = parser.getLastRMC();
      expect(rmc!.magneticVariation).toBe(-3.1);
    });

    it("should parse magnetic variation for East", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,E";
      parser.parse(sentence);

      const rmc = parser.getLastRMC();
      expect(rmc!.magneticVariation).toBe(3.1);
    });

    it("should return null for void (invalid) RMC", () => {
      const sentence =
        "$GPRMC,123519,V,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(false);
      expect(parser.getLastRMC()).toBeNull();
    });

    it("should parse GNRMC sentence (multi-constellation)", () => {
      const sentence =
        "$GNRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(true);
      expect(parser.getLastRMC()).not.toBeNull();
    });

    it("should return null for incomplete RMC sentence", () => {
      const sentence = "$GPRMC,123519,A,4807.038,N"; // Missing fields
      const result = parser.parse(sentence);

      expect(result.hasNewPosition).toBe(false);
      expect(parser.getLastRMC()).toBeNull();
    });
  });

  describe("position building", () => {
    it("should build position from GGA sentence", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      const result = parser.parse(sentence);

      expect(result.position).not.toBeNull();
      expect(result.position!.latitude).toBeCloseTo(48.1173, 4);
      expect(result.position!.longitude).toBeCloseTo(11.5167, 4);
      expect(result.position!.altitude).toBe(545.4);
      // Accuracy approximation: HDOP * 5 = 0.9 * 5 = 4.5
      expect(result.position!.accuracy).toBeCloseTo(4.5, 1);
    });

    it("should build position from RMC sentence with speed and bearing", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W";
      const result = parser.parse(sentence);

      expect(result.position).not.toBeNull();
      expect(result.position!.latitude).toBeCloseTo(48.1173, 4);
      expect(result.position!.longitude).toBeCloseTo(11.5167, 4);
      expect(result.position!.speed).toBeCloseTo(11.5235, 2);
      expect(result.position!.bearing).toBe(84.4);
    });

    it("should combine GGA and RMC data for complete position", () => {
      // Parse GGA first for position and altitude
      parser.parse(
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,",
      );

      // Parse RMC for speed and bearing
      const result = parser.parse(
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W",
      );

      // The position should now have altitude from GGA and speed/bearing from RMC
      expect(result.position).not.toBeNull();
      expect(result.position!.latitude).toBeCloseTo(48.1173, 4);
      expect(result.position!.longitude).toBeCloseTo(11.5167, 4);
      expect(result.position!.speed).toBeCloseTo(11.5235, 2);
      expect(result.position!.bearing).toBe(84.4);
    });
  });

  describe("status building", () => {
    it("should build status from GGA sentence", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,";
      const result = parser.parse(sentence);

      expect(result.status.fixQuality).toBe(GPSFixQuality.GPS_FIX);
      expect(result.status.satellitesInUse).toBe(8);
      expect(result.status.hdop).toBe(0.9);
    });

    it("should build status from GSA sentence with DOP values", () => {
      const sentence = "$GPGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.5,0.9,1.2";
      const result = parser.parse(sentence);

      expect(result.status.pdop).toBe(1.5);
      expect(result.status.hdop).toBe(0.9);
      expect(result.status.vdop).toBe(1.2);
    });

    it("should combine GGA and GSA status data", () => {
      // Parse GGA for fix quality and satellites
      parser.parse(
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,",
      );

      // Parse GSA for DOP values
      const result = parser.parse(
        "$GPGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.5,0.9,1.2",
      );

      expect(result.status.pdop).toBe(1.5);
      expect(result.status.hdop).toBe(0.9);
      expect(result.status.vdop).toBe(1.2);
    });
  });

  describe("reset", () => {
    it("should clear all parsed data", () => {
      parser.parse(
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,",
      );
      parser.parse("$GPGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.5,0.9,1.2");
      parser.parse(
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W",
      );

      expect(parser.getLastGGA()).not.toBeNull();
      expect(parser.getLastGSA()).not.toBeNull();
      expect(parser.getLastRMC()).not.toBeNull();

      parser.reset();

      expect(parser.getLastGGA()).toBeNull();
      expect(parser.getLastGSA()).toBeNull();
      expect(parser.getLastRMC()).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle zero speed and bearing", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,000.0,000.0,230394,003.1,W";
      parser.parse(sentence);

      const rmc = parser.getLastRMC();
      expect(rmc!.speedKnots).toBe(0);
      expect(rmc!.speedMps).toBe(0);
      expect(rmc!.bearing).toBe(0);
    });

    it("should handle high precision coordinates", () => {
      const sentence =
        "$GPGGA,123519,4807.12345,N,01131.67890,E,1,08,0.9,545.4,M,47.0,M,,";
      parser.parse(sentence);

      const gga = parser.getLastGGA();
      // 48 + 7.12345/60 = 48.118724166...
      expect(gga!.latitude).toBeCloseTo(48.118724, 5);
      // 11 + 31.67890/60 = 11.527982
      expect(gga!.longitude).toBeCloseTo(11.527982, 5);
    });

    it("should handle negative altitude (below sea level)", () => {
      const sentence =
        "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,-10.5,M,47.0,M,,";
      parser.parse(sentence);

      const gga = parser.getLastGGA();
      expect(gga!.altitude).toBe(-10.5);
    });

    it("should handle empty magnetic variation", () => {
      const sentence =
        "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,,";
      parser.parse(sentence);

      const rmc = parser.getLastRMC();
      expect(rmc!.magneticVariation).toBe(0);
    });
  });
});
