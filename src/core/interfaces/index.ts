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
export * from "./IElevationService";
export * from "./IVectorMapService";
export * from "./IMapSnapService";
export * from "./IRoadSurfaceService";
export * from "./IOfflineRoutingService";

// Display abstraction interfaces
export * from "./IDisplayService";
export * from "./IDisplayDriver";
export * from "./IDisplayAdapter";
export * from "./IEpaperDriver";
export * from "./IHardwareAdapter";
