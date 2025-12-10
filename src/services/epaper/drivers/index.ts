/**
 * E-Paper Display Drivers
 *
 * Each driver implements display-specific command sequences and timing.
 * To add a new display:
 * 1. Create a new driver class extending BaseDisplayDriver
 * 2. Export it from this file
 * 3. Register it in ServiceContainer
 */

export { BaseDisplayDriver } from "./BaseDisplayDriver";
export { Waveshare7in5BWDriver } from "./Waveshare7in5BWDriver";
export { MockDisplayDriver } from "./MockDisplayDriver";

// Re-export interfaces for convenience
export type {
  IDisplayDriver,
  DisplayCapabilities,
  ColorDepth,
} from "@core/interfaces/IDisplayDriver";
