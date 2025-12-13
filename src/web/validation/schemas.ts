/**
 * API Request Validation Schemas
 *
 * Zod schemas for validating API request parameters.
 * These schemas provide runtime type checking and detailed error messages.
 */

import { z } from "zod";
import { ManeuverType } from "@core/types";

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Latitude validation (-90 to 90 degrees)
 */
export const latitudeSchema = z
  .number({ message: "Latitude must be a number" })
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

/**
 * Longitude validation (-180 to 180 degrees)
 */
export const longitudeSchema = z
  .number({ message: "Longitude must be a number" })
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

/**
 * Coordinate point schema
 */
export const coordinateSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

/**
 * Coordinate tuple [lat, lon]
 */
export const coordinateTupleSchema = z.tuple([latitudeSchema, longitudeSchema]);

// ============================================================================
// GPS Controller Schemas
// ============================================================================

/**
 * Set mock GPS position request
 */
export const setMockPositionSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

// ============================================================================
// Config Controller Schemas
// ============================================================================

/**
 * Set zoom level request
 * Either zoom (absolute) or delta (relative change)
 */
export const setZoomSchema = z
  .object({
    zoom: z.number().min(1).max(20).optional(),
    delta: z.number().min(-19).max(19).optional(),
  })
  .refine((data) => data.zoom !== undefined || data.delta !== undefined, {
    message: "Either zoom or delta parameter is required",
  });

/**
 * Set auto-center request
 */
export const setAutoCenterSchema = z.object({
  enabled: z.boolean({ message: "enabled must be a boolean" }),
});

/**
 * Set rotate-with-bearing request
 */
export const setRotateWithBearingSchema = z.object({
  enabled: z.boolean({ message: "enabled must be a boolean" }),
});

/**
 * Set active screen type request
 */
export const setActiveScreenSchema = z.object({
  screenType: z.enum(["track", "turn_by_turn"], {
    message: "screenType must be 'track' or 'turn_by_turn'",
  }),
});

/**
 * Add recent destination request
 */
export const addRecentDestinationSchema = z.object({
  name: z
    .string({ message: "name must be a string" })
    .min(1, "name cannot be empty")
    .max(200, "name cannot exceed 200 characters"),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

/**
 * Remove recent destination request
 */
export const removeRecentDestinationSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

/**
 * Resolve Google Maps link request
 */
export const resolveGoogleMapsLinkSchema = z.object({
  url: z
    .string({ message: "url must be a string" })
    .url("url must be a valid URL")
    .refine(
      (url) =>
        url.includes("google.com/maps") ||
        url.includes("maps.google.com") ||
        url.includes("maps.app.goo.gl") ||
        url.includes("goo.gl/maps"),
      {
        message: "URL must be a Google Maps link",
      },
    ),
});

// ============================================================================
// WiFi Controller Schemas
// ============================================================================

/**
 * Set hotspot configuration request
 */
export const setHotspotConfigSchema = z.object({
  ssid: z
    .string({ message: "SSID must be a string" })
    .min(1, "SSID cannot be empty")
    .max(32, "SSID cannot exceed 32 characters")
    .transform((val) => val.trim()),
  password: z
    .string({ message: "Password must be a string" })
    .min(8, "Password must be at least 8 characters (WPA2 requirement)")
    .max(63, "Password cannot exceed 63 characters"),
});

// ============================================================================
// Simulation Controller Schemas
// ============================================================================

/**
 * Speed preset values
 */
export const speedPresetSchema = z.enum(["walk", "bicycle", "drive"]);

/**
 * Speed value (either preset string or number in km/h)
 */
export const speedValueSchema = z.union([
  speedPresetSchema,
  z
    .number()
    .min(0.1, "Speed must be positive")
    .max(500, "Speed cannot exceed 500 km/h"),
]);

/**
 * Start simulation request
 */
export const startSimulationSchema = z.object({
  trackPath: z
    .string({ message: "trackPath must be a string" })
    .min(1, "trackPath cannot be empty"),
  speed: speedValueSchema.optional().default("walk"),
});

/**
 * Set simulation speed request
 */
export const setSimulationSpeedSchema = z.object({
  speed: speedValueSchema,
});

// ============================================================================
// Drive Controller Schemas
// ============================================================================

/**
 * Maneuver type enum values
 */
const maneuverTypeValues = Object.values(ManeuverType) as [string, ...string[]];

/**
 * Drive waypoint schema
 */
export const driveWaypointSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  instruction: z.string().min(1, "Instruction cannot be empty"),
  maneuverType: z.enum(maneuverTypeValues, {
    message: "Invalid maneuver type",
  }),
  distance: z.number().min(0, "Distance must be non-negative"),
  streetName: z.string().optional(),
  bearingAfter: z.number().min(0).max(360).optional(),
  index: z.number().int().min(0, "Index must be a non-negative integer"),
});

/**
 * Drive route schema
 */
export const driveRouteSchema = z.object({
  id: z.string().optional(),
  destination: z
    .string({ message: "destination must be a string" })
    .min(1, "destination cannot be empty")
    .max(500, "destination cannot exceed 500 characters"),
  createdAt: z
    .union([z.string().datetime(), z.date()])
    .optional()
    .transform((val) => (val ? new Date(val) : new Date())),
  startPoint: coordinateSchema.optional(),
  endPoint: coordinateSchema.optional(),
  waypoints: z
    .array(driveWaypointSchema)
    .min(1, "Route must have at least one waypoint"),
  geometry: z
    .array(coordinateTupleSchema)
    .min(2, "Route geometry must have at least 2 points"),
  totalDistance: z.number().min(0).optional().default(0),
  estimatedTime: z.number().min(0).optional().default(0),
});

/**
 * Save drive route request
 */
export const saveDriveRouteSchema = driveRouteSchema;

/**
 * Start drive navigation request
 * Either routeId (to load saved route) or route object
 */
export const startDriveNavigationSchema = z
  .object({
    routeId: z.string().optional(),
    route: driveRouteSchema.optional(),
  })
  .refine((data) => data.routeId !== undefined || data.route !== undefined, {
    message: "Either routeId or route object is required",
  });

/**
 * Simulate drive route request
 */
export const simulateDriveRouteSchema = z.object({
  route: z.object({
    destination: z.string().optional(),
    geometry: z
      .array(coordinateTupleSchema)
      .min(2, "Route geometry must have at least 2 points"),
    totalDistance: z.number().optional(),
  }),
  speed: z.number().min(1).max(500).optional().default(100),
});

// ============================================================================
// Track Controller Schemas
// ============================================================================

/**
 * Set active map/track request
 */
export const setActiveMapSchema = z.object({
  path: z
    .string({ message: "path must be a string" })
    .min(1, "path cannot be empty"),
});

/**
 * Delete GPX file route parameter
 */
export const deleteGPXFileParamsSchema = z.object({
  fileName: z
    .string()
    .min(1, "fileName is required")
    .refine((name) => name.toLowerCase().endsWith(".gpx"), {
      message: "Only .gpx files can be deleted through this endpoint",
    }),
});

/**
 * Delete drive route route parameter
 */
export const deleteDriveRouteParamsSchema = z.object({
  routeId: z.string().min(1, "Route ID is required"),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type SetMockPositionInput = z.infer<typeof setMockPositionSchema>;
export type SetZoomInput = z.infer<typeof setZoomSchema>;
export type SetAutoCenterInput = z.infer<typeof setAutoCenterSchema>;
export type SetRotateWithBearingInput = z.infer<
  typeof setRotateWithBearingSchema
>;
export type SetActiveScreenInput = z.infer<typeof setActiveScreenSchema>;
export type AddRecentDestinationInput = z.infer<
  typeof addRecentDestinationSchema
>;
export type RemoveRecentDestinationInput = z.infer<
  typeof removeRecentDestinationSchema
>;
export type SetHotspotConfigInput = z.infer<typeof setHotspotConfigSchema>;
export type StartSimulationInput = z.infer<typeof startSimulationSchema>;
export type SetSimulationSpeedInput = z.infer<typeof setSimulationSpeedSchema>;
export type DriveWaypointInput = z.infer<typeof driveWaypointSchema>;
export type DriveRouteInput = z.infer<typeof driveRouteSchema>;
export type StartDriveNavigationInput = z.infer<
  typeof startDriveNavigationSchema
>;
export type SimulateDriveRouteInput = z.infer<typeof simulateDriveRouteSchema>;
export type SetActiveMapInput = z.infer<typeof setActiveMapSchema>;
export type ResolveGoogleMapsLinkInput = z.infer<
  typeof resolveGoogleMapsLinkSchema
>;
