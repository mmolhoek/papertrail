/**
 * Core interfaces for the Papertrail GPS tracker application
 *
 * These interfaces define the contracts for all services in the application.
 * They enable dependency injection and make the codebase fully testable.
 */

export * from "./IGPSService";
export * from "./IMapService";
export * from "./ISVGService";
export * from "./IEpaperService";
export * from "./IConfigService";
export * from "./IRenderingOrchestrator";
export * from "./IWebInterfaceService";
export * from "./IWiFiService";
export * from "./ITextRendererService";
export * from "./ITrackSimulationService";
export * from "./IDriveNavigationService";
export * from "./ISpeedLimitService";
export * from "./IPOIService";
export * from "./IReverseGeocodingService";

// Display driver abstraction interfaces
export * from "./IDisplayDriver";
export * from "./IHardwareAdapter";
