import { GPSCoordinate, GPSStatus, GPSFixQuality } from "@core/types";
import { getLogger } from "@utils/logger";
import { toGPSFixQuality } from "@utils/typeGuards";

const logger = getLogger("NMEAParser");

/**
 * Result of parsing a GGA sentence
 */
export type GGAData = {
  /** UTC time of the fix */
  time: string;
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Fix quality (0-8) */
  fixQuality: GPSFixQuality;
  /** Number of satellites in use */
  satellitesInUse: number;
  /** Horizontal dilution of precision */
  hdop: number;
  /** Altitude above mean sea level in meters */
  altitude: number;
  /** Geoidal separation in meters */
  geoidalSeparation: number;
};

/**
 * Result of parsing a GSA sentence
 */
export type GSAData = {
  /** Mode: A=Automatic, M=Manual */
  mode: "A" | "M";
  /** Fix type: 1=no fix, 2=2D, 3=3D */
  fixType: 1 | 2 | 3;
  /** IDs of satellites used in position fix */
  satelliteIds: number[];
  /** Position dilution of precision */
  pdop: number;
  /** Horizontal dilution of precision */
  hdop: number;
  /** Vertical dilution of precision */
  vdop: number;
};

/**
 * Result of parsing an RMC sentence
 */
export type RMCData = {
  /** UTC time of the fix */
  time: string;
  /** Status: A=Active, V=Void */
  status: "A" | "V";
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Speed over ground in knots */
  speedKnots: number;
  /** Speed over ground in meters per second */
  speedMps: number;
  /** Track angle in degrees (true north) */
  bearing: number;
  /** Date in DDMMYY format */
  date: string;
  /** Magnetic variation in degrees */
  magneticVariation: number;
};

/**
 * Combined GPS data from all sentence types
 */
export type ParsedGPSData = {
  /** Position data from latest valid sentence */
  position: GPSCoordinate | null;
  /** Status data from latest valid sentence */
  status: Partial<GPSStatus>;
  /** Whether new position data was parsed */
  hasNewPosition: boolean;
  /** Whether new status data was parsed */
  hasNewStatus: boolean;
};

/**
 * NMEA sentence parser for GPS data
 *
 * Parses standard NMEA 0183 sentences:
 * - GGA: Global Positioning System Fix Data
 * - GSA: GNSS DOP and Active Satellites
 * - RMC: Recommended Minimum Specific GNSS Data
 */
export class NMEAParser {
  private lastGGA: GGAData | null = null;
  private lastGSA: GSAData | null = null;
  private lastRMC: RMCData | null = null;

  /**
   * Parse an NMEA sentence and return extracted GPS data
   */
  parse(sentence: string): ParsedGPSData {
    const result: ParsedGPSData = {
      position: null,
      status: {},
      hasNewPosition: false,
      hasNewStatus: false,
    };

    if (!sentence.startsWith("$")) {
      return result;
    }

    // Validate checksum if present
    if (!this.validateChecksum(sentence)) {
      logger.warn(
        `Invalid checksum for sentence: ${sentence.substring(0, 20)}`,
      );
      return result;
    }

    // Remove checksum for parsing
    const cleanSentence = sentence.split("*")[0];

    // Parse based on sentence type
    if (this.isGGASentence(cleanSentence)) {
      const gga = this.parseGGA(cleanSentence);
      if (gga) {
        this.lastGGA = gga;
        result.hasNewPosition = true;
        result.hasNewStatus = true;
        result.position = this.buildPosition();
        result.status = this.buildStatus();
      }
    } else if (this.isGSASentence(cleanSentence)) {
      const gsa = this.parseGSA(cleanSentence);
      if (gsa) {
        this.lastGSA = gsa;
        result.hasNewStatus = true;
        result.status = this.buildStatus();
      }
    } else if (this.isRMCSentence(cleanSentence)) {
      const rmc = this.parseRMC(cleanSentence);
      if (rmc) {
        this.lastRMC = rmc;
        result.hasNewPosition = true;
        result.position = this.buildPosition();
      }
    }

    return result;
  }

  /**
   * Get the last parsed GGA data
   */
  getLastGGA(): GGAData | null {
    return this.lastGGA;
  }

  /**
   * Get the last parsed GSA data
   */
  getLastGSA(): GSAData | null {
    return this.lastGSA;
  }

  /**
   * Get the last parsed RMC data
   */
  getLastRMC(): RMCData | null {
    return this.lastRMC;
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.lastGGA = null;
    this.lastGSA = null;
    this.lastRMC = null;
  }

  /**
   * Validate NMEA checksum
   * Checksum is XOR of all characters between $ and *
   */
  private validateChecksum(sentence: string): boolean {
    const asteriskIndex = sentence.indexOf("*");

    // No checksum present - accept sentence
    if (asteriskIndex === -1) {
      return true;
    }

    const checksumStr = sentence.substring(asteriskIndex + 1).trim();
    if (checksumStr.length < 2) {
      return false;
    }

    const expectedChecksum = parseInt(checksumStr, 16);
    if (isNaN(expectedChecksum)) {
      return false;
    }

    // Calculate checksum (XOR of all chars between $ and *)
    let calculatedChecksum = 0;
    for (let i = 1; i < asteriskIndex; i++) {
      calculatedChecksum ^= sentence.charCodeAt(i);
    }

    return calculatedChecksum === expectedChecksum;
  }

  /**
   * Check if sentence is a GGA sentence (GPS or GNSS)
   */
  private isGGASentence(sentence: string): boolean {
    return (
      sentence.startsWith("$GPGGA") ||
      sentence.startsWith("$GNGGA") ||
      sentence.startsWith("$GLGGA") ||
      sentence.startsWith("$GAGGA")
    );
  }

  /**
   * Check if sentence is a GSA sentence (GPS or GNSS)
   */
  private isGSASentence(sentence: string): boolean {
    return (
      sentence.startsWith("$GPGSA") ||
      sentence.startsWith("$GNGSA") ||
      sentence.startsWith("$GLGSA") ||
      sentence.startsWith("$GAGSA")
    );
  }

  /**
   * Check if sentence is an RMC sentence (GPS or GNSS)
   */
  private isRMCSentence(sentence: string): boolean {
    return (
      sentence.startsWith("$GPRMC") ||
      sentence.startsWith("$GNRMC") ||
      sentence.startsWith("$GLRMC") ||
      sentence.startsWith("$GARMC")
    );
  }

  /**
   * Parse GGA sentence
   * Format: $xxGGA,time,lat,N/S,lon,E/W,quality,satellites,hdop,altitude,M,geoid,M,age,station*checksum
   */
  private parseGGA(sentence: string): GGAData | null {
    const parts = sentence.split(",");

    // Need at least 11 fields for a valid GGA sentence
    if (parts.length < 11) {
      return null;
    }

    const time = parts[1];
    const latRaw = parts[2];
    const latDir = parts[3];
    const lonRaw = parts[4];
    const lonDir = parts[5];
    const fixQuality = parseInt(parts[6]) || 0;
    const satellitesInUse = parseInt(parts[7]) || 0;
    const hdop = parseFloat(parts[8]) || 99.9;
    const altitudeRaw = parts[9];
    const geoidRaw = parts[11];

    // Parse latitude (format: DDMM.MMMMM)
    const latitude = this.parseLatitude(latRaw, latDir);
    if (latitude === null) {
      return null;
    }

    // Parse longitude (format: DDDMM.MMMMM)
    const longitude = this.parseLongitude(lonRaw, lonDir);
    if (longitude === null) {
      return null;
    }

    // Parse altitude
    const altitude = parseFloat(altitudeRaw) || 0;

    // Parse geoidal separation
    const geoidalSeparation = parseFloat(geoidRaw) || 0;

    return {
      time,
      latitude,
      longitude,
      fixQuality: toGPSFixQuality(fixQuality),
      satellitesInUse,
      hdop,
      altitude,
      geoidalSeparation,
    };
  }

  /**
   * Parse GSA sentence
   * Format: $xxGSA,mode,fixType,sat1,sat2,...,sat12,pdop,hdop,vdop*checksum
   */
  private parseGSA(sentence: string): GSAData | null {
    const parts = sentence.split(",");

    // Need at least 18 fields for a valid GSA sentence
    if (parts.length < 18) {
      return null;
    }

    const mode = parts[1] as "A" | "M";
    const fixType = parseInt(parts[2]) as 1 | 2 | 3;

    // Parse satellite IDs (indices 3-14)
    const satelliteIds: number[] = [];
    for (let i = 3; i <= 14; i++) {
      const satId = parseInt(parts[i]);
      if (!isNaN(satId) && satId > 0) {
        satelliteIds.push(satId);
      }
    }

    const pdop = parseFloat(parts[15]) || 99.9;
    const hdop = parseFloat(parts[16]) || 99.9;
    const vdop = parseFloat(parts[17].split("*")[0]) || 99.9;

    return {
      mode,
      fixType,
      satelliteIds,
      pdop,
      hdop,
      vdop,
    };
  }

  /**
   * Parse RMC sentence
   * Format: $xxRMC,time,status,lat,N/S,lon,E/W,speed,bearing,date,magVar,E/W,mode*checksum
   */
  private parseRMC(sentence: string): RMCData | null {
    const parts = sentence.split(",");

    // Need at least 10 fields for a valid RMC sentence
    if (parts.length < 10) {
      return null;
    }

    const time = parts[1];
    const status = parts[2] as "A" | "V";

    // If status is void, the data is not reliable
    if (status !== "A") {
      return null;
    }

    const latRaw = parts[3];
    const latDir = parts[4];
    const lonRaw = parts[5];
    const lonDir = parts[6];
    const speedKnotsRaw = parts[7];
    const bearingRaw = parts[8];
    const date = parts[9];
    const magVarRaw = parts[10];
    const magVarDir = parts[11];

    // Parse latitude
    const latitude = this.parseLatitude(latRaw, latDir);
    if (latitude === null) {
      return null;
    }

    // Parse longitude
    const longitude = this.parseLongitude(lonRaw, lonDir);
    if (longitude === null) {
      return null;
    }

    // Parse speed (knots to m/s: 1 knot = 0.514444 m/s)
    const speedKnots = parseFloat(speedKnotsRaw) || 0;
    const speedMps = speedKnots * 0.514444;

    // Parse bearing (track angle)
    const bearing = parseFloat(bearingRaw) || 0;

    // Parse magnetic variation
    let magneticVariation = parseFloat(magVarRaw) || 0;
    if (magVarDir === "W") {
      magneticVariation = -magneticVariation;
    }

    return {
      time,
      status,
      latitude,
      longitude,
      speedKnots,
      speedMps,
      bearing,
      date,
      magneticVariation,
    };
  }

  /**
   * Parse latitude from NMEA format (DDMM.MMMMM) to decimal degrees
   */
  private parseLatitude(raw: string, direction: string): number | null {
    if (!raw || raw.length < 4) {
      return null;
    }

    // Format: DDMM.MMMMM
    const degrees = parseInt(raw.substring(0, 2));
    const minutes = parseFloat(raw.substring(2));

    if (isNaN(degrees) || isNaN(minutes)) {
      return null;
    }

    let latitude = degrees + minutes / 60;

    if (direction === "S") {
      latitude = -latitude;
    }

    return latitude;
  }

  /**
   * Parse longitude from NMEA format (DDDMM.MMMMM) to decimal degrees
   */
  private parseLongitude(raw: string, direction: string): number | null {
    if (!raw || raw.length < 5) {
      return null;
    }

    // Format: DDDMM.MMMMM
    const degrees = parseInt(raw.substring(0, 3));
    const minutes = parseFloat(raw.substring(3));

    if (isNaN(degrees) || isNaN(minutes)) {
      return null;
    }

    let longitude = degrees + minutes / 60;

    if (direction === "W") {
      longitude = -longitude;
    }

    return longitude;
  }

  /**
   * Build a GPSCoordinate from the latest parsed data
   */
  private buildPosition(): GPSCoordinate | null {
    // Prefer GGA for position as it includes altitude
    if (this.lastGGA) {
      const position: GPSCoordinate = {
        latitude: this.lastGGA.latitude,
        longitude: this.lastGGA.longitude,
        altitude: this.lastGGA.altitude,
        timestamp: new Date(),
        accuracy: this.lastGGA.hdop * 5, // Rough approximation: HDOP * 5 meters
      };

      // Add speed and bearing from RMC if available
      if (this.lastRMC) {
        position.speed = this.lastRMC.speedMps;
        position.bearing = this.lastRMC.bearing;
      }

      return position;
    }

    // Fall back to RMC if no GGA
    if (this.lastRMC) {
      return {
        latitude: this.lastRMC.latitude,
        longitude: this.lastRMC.longitude,
        timestamp: new Date(),
        speed: this.lastRMC.speedMps,
        bearing: this.lastRMC.bearing,
      };
    }

    return null;
  }

  /**
   * Build GPS status from the latest parsed data
   */
  private buildStatus(): Partial<GPSStatus> {
    const status: Partial<GPSStatus> = {};

    if (this.lastGGA) {
      status.fixQuality = this.lastGGA.fixQuality;
      status.satellitesInUse = this.lastGGA.satellitesInUse;
      status.hdop = this.lastGGA.hdop;
    }

    if (this.lastGSA) {
      status.pdop = this.lastGSA.pdop;
      status.hdop = this.lastGSA.hdop;
      status.vdop = this.lastGSA.vdop;
    }

    return status;
  }
}
