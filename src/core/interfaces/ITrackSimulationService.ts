import { Result, GPSCoordinate, GPXTrack } from "@core/types";

/**
 * Simulation speed presets in km/h
 */
export enum SimulationSpeed {
  WALK = 10, // 10 km/h walking speed
  BICYCLE = 30, // 30 km/h cycling speed
  DRIVE = 100, // 100 km/h driving speed
}

/**
 * Simulation state
 */
export enum SimulationState {
  STOPPED = "stopped",
  RUNNING = "running",
  PAUSED = "paused",
}

/**
 * Simulation status information
 */
export type SimulationStatus = {
  /** Current simulation state */
  state: SimulationState;

  /** Current speed in km/h */
  speed: number;

  /** Speed preset name */
  speedPreset: "walk" | "bicycle" | "drive" | "custom";

  /** Current position index in the track */
  currentPointIndex: number;

  /** Total points in the track */
  totalPoints: number;

  /** Progress percentage (0-100) */
  progress: number;

  /** Current simulated position */
  currentPosition?: GPSCoordinate;

  /** Active track name */
  trackName?: string;

  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;

  /** Distance remaining in meters */
  distanceRemaining?: number;
};

/**
 * Track Simulation Service Interface
 *
 * Simulates GPS movement along a GPX track for testing and demonstration.
 * Emits GPS position updates that can be consumed by the rendering orchestrator.
 */
export interface ITrackSimulationService {
  /**
   * Initialize the simulation service
   * @returns Result indicating success or failure
   */
  initialize(): Promise<Result<void>>;

  /**
   * Start simulating movement along a track
   * @param track The GPX track to simulate
   * @param speed Speed in km/h (default: WALK)
   * @returns Result indicating success or failure
   */
  startSimulation(track: GPXTrack, speed?: number): Promise<Result<void>>;

  /**
   * Start simulating movement along the currently loaded track
   * @param speed Speed in km/h (default: WALK)
   * @returns Result indicating success or failure
   */
  startSimulationFromActive(speed?: number): Promise<Result<void>>;

  /**
   * Stop the current simulation
   * @returns Result indicating success or failure
   */
  stopSimulation(): Promise<Result<void>>;

  /**
   * Pause the current simulation
   * @returns Result indicating success or failure
   */
  pauseSimulation(): Promise<Result<void>>;

  /**
   * Resume a paused simulation
   * @returns Result indicating success or failure
   */
  resumeSimulation(): Promise<Result<void>>;

  /**
   * Set the simulation speed
   * @param speed Speed in km/h
   * @returns Result indicating success or failure
   */
  setSpeed(speed: number): Promise<Result<void>>;

  /**
   * Set the simulation speed using a preset
   * @param preset Speed preset (walk, bicycle, drive)
   * @returns Result indicating success or failure
   */
  setSpeedPreset(preset: "walk" | "bicycle" | "drive"): Promise<Result<void>>;

  /**
   * Get the current simulation status
   * @returns Current simulation status
   */
  getStatus(): SimulationStatus;

  /**
   * Check if a simulation is currently running
   * @returns true if simulation is running or paused
   */
  isSimulating(): boolean;

  /**
   * Register a callback for simulated GPS position updates
   * @param callback Function to call when position updates
   * @returns Unsubscribe function
   */
  onPositionUpdate(callback: (position: GPSCoordinate) => void): () => void;

  /**
   * Register a callback for simulation state changes
   * @param callback Function to call when simulation state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: (status: SimulationStatus) => void): () => void;

  /**
   * Register a callback for when simulation completes
   * @param callback Function to call when simulation completes
   * @returns Unsubscribe function
   */
  onSimulationComplete(callback: () => void): () => void;

  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
