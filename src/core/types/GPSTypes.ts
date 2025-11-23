/**
 * GPS coordinate with latitude, longitude, and optional metadata
 */
export type GPSCoordinate = {
  /** Latitude in decimal degrees (-90 to 90) */
  latitude: number;
  
  /** Longitude in decimal degrees (-180 to 180) */
  longitude: number;
  
  /** Altitude in meters above sea level */
  altitude?: number;
  
  /** Timestamp when the coordinate was recorded */
  timestamp: Date;
  
  /** GPS accuracy/precision in meters (horizontal dilution) */
  accuracy?: number;
  
  /** Speed in meters per second */
  speed?: number;
  
  /** Bearing/heading in degrees (0-360, where 0 is North) */
  bearing?: number;
};

/**
 * GPS fix quality indicators
 */
export enum GPSFixQuality {
  NO_FIX = 0,
  GPS_FIX = 1,
  DGPS_FIX = 2,
  PPS_FIX = 3,
  RTK_FIX = 4,
  FLOAT_RTK = 5,
  ESTIMATED = 6,
  MANUAL = 7,
  SIMULATION = 8,
}

/**
 * GPS satellite information
 */
export type GPSSatellite = {
  /** Satellite PRN number */
  id: number;
  
  /** Elevation angle in degrees */
  elevation: number;
  
  /** Azimuth in degrees */
  azimuth: number;
  
  /** Signal-to-noise ratio */
  snr: number;
};

/**
 * Detailed GPS status information
 */
export type GPSStatus = {
  /** Current fix quality */
  fixQuality: GPSFixQuality;
  
  /** Number of satellites in use */
  satellitesInUse: number;
  
  /** Horizontal dilution of precision */
  hdop: number;
  
  /** Vertical dilution of precision */
  vdop?: number;
  
  /** Position dilution of precision */
  pdop?: number;
  
  /** List of visible satellites */
  satellites?: GPSSatellite[];
  
  /** Whether GPS is actively tracking */
  isTracking: boolean;
};

/**
 * GPS configuration options
 */
export type GPSConfig = {
  /** Serial device path (e.g., /dev/ttyAMA0) */
  devicePath: string;
  
  /** Baud rate for serial communication */
  baudRate: number;
  
  /** Update interval in milliseconds */
  updateInterval: number;
  
  /** Minimum accuracy required in meters */
  minAccuracy?: number;
};