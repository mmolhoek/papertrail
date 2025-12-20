# Papertrail Developer Guide

This document explains how the Papertrail application works and provides everything a developer needs to understand and work on the codebase.

## What is Papertrail?

Papertrail is a GPS tracker with an e-paper display for Raspberry Pi 5. It:
- Tracks GPS position and displays GPX tracks on an 800x480 e-paper screen
- Provides turn-by-turn navigation with offline route calculation
- Offers a mobile web interface via WebSocket for real-time control
- Manages WiFi connections including mobile hotspot pairing

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
  - [Request Flow](#request-flow)
  - [Key Design Patterns](#key-design-patterns)
- [Directory Structure](#directory-structure)
- [Services Reference](#services-reference)
  - [RenderingOrchestrator](#renderingorchestrator)
  - [GPSService](#gpsservice)
  - [MapService](#mapservice)
  - [SVGService](#svgservice)
  - [EPaperService](#epaperservice)
  - [ConfigService](#configservice)
  - [WiFiService](#wifiservice)
  - [DriveNavigationService](#drivenavigationservice)
  - [TrackSimulationService](#tracksimulationservice)
  - [POIService](#poiservice)
  - [SpeedLimitService](#speedlimitservice)
  - [ElevationService](#elevationservice)
  - [ReverseGeocodingService](#reversegeocodingservice)
  - [VectorMapService](#vectormapservice)
  - [TextRendererService](#textrendererservice)
- [Web Layer](#web-layer)
  - [IntegratedWebService](#integratedwebservice)
  - [Controllers](#controllers)
  - [WebSocket Events](#websocket-events)
- [Error Handling](#error-handling)
- [Testing](#testing)
  - [Test Setup Pattern](#test-setup-pattern)
  - [Run Tests](#run-tests)
- [Adding a New Service](#adding-a-new-service)
- [Environment Variables](#environment-variables)
- [Development Notes](#development-notes)

---

## Quick Start

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm start            # Run the application
npm run dev          # Development mode with auto-reload
npm test             # Run tests
```

---

## Architecture Overview

### Request Flow

```
Mobile Browser → IntegratedWebService (Express + Socket.IO, port 3000)
                        ↓
              WebController → Sub-controllers
                        ↓
              RenderingOrchestrator (central coordinator)
                        ↓
     ┌──────────┬──────────┬───────────┬──────────┐
     ↓          ↓          ↓           ↓          ↓
GPSService  MapService  SVGService  EPaper  ConfigService
```

### Key Design Patterns

#### 1. Result Type Pattern
All service methods return `Result<T>` instead of throwing exceptions:

```typescript
import { Result, success, failure } from "@core/types";

async function doSomething(): Promise<Result<string>> {
  const result = await service.someMethod();
  if (!result.success) {
    return failure(result.error);
  }
  return success(result.data);
}
```

#### 2. Dependency Injection
Services are managed by `ServiceContainer` singleton:

```typescript
import { ServiceContainer } from "@di/ServiceContainer";

// Get a service
const gpsService = ServiceContainer.getGPSService();

// In tests, inject mocks
ServiceContainer.reset();
ServiceContainer.setGPSService(mockGPSService);
```

#### 3. Path Aliases
Always use path aliases instead of relative paths:

```typescript
import { IGPSService } from "@core/interfaces";
import { GPSService } from "@services/gps/GPSService";
import { getLogger } from "@utils/logger";
```

Available aliases: `@core/*`, `@services/*`, `@di/*`, `@web/*`, `@utils/*`, `@errors/*`

---

## Directory Structure

```
src/
├── index.ts                    # Application entry point
├── core/
│   ├── interfaces/             # Service interfaces (I*Service.ts)
│   ├── types/                  # Type definitions
│   ├── errors/                 # Custom error classes
│   └── constants/              # Constants and defaults
├── di/
│   └── ServiceContainer.ts     # Dependency injection singleton
├── services/
│   ├── orchestrator/           # Central coordinator + sub-coordinators
│   ├── gps/                    # GPS hardware interface
│   ├── map/                    # GPX file parsing
│   ├── svg/                    # Bitmap rendering
│   ├── epaper/                 # E-paper display driver
│   ├── config/                 # Configuration persistence
│   ├── wifi/                   # Network management
│   ├── drive/                  # Turn-by-turn navigation
│   ├── simulation/             # Track simulation
│   ├── speedLimit/             # Speed limit data (OSM)
│   ├── poi/                    # Points of interest (OSM)
│   ├── elevation/              # Elevation data
│   ├── reverseGeocoding/       # Location names (Nominatim)
│   ├── vectorMap/              # Road geometries (OSM)
│   └── textRenderer/           # Text-to-bitmap rendering
├── web/
│   ├── IntegratedWebService.ts # HTTP + WebSocket server
│   ├── controllers/            # API route handlers
│   ├── validation/             # Request validation schemas
│   └── public/                 # Static web files
└── utils/
    └── logger.ts               # Logging utility
```

---

## Services Reference

### RenderingOrchestrator
**Location:** `src/services/orchestrator/RenderingOrchestrator.ts`

The central coordinator that ties everything together. It initializes all services, manages GPS subscriptions, and orchestrates the rendering pipeline.

**Key Methods:**
- `initialize()` - Initialize all dependent services
- `updateDisplay(mode?)` - Render and display current state
- `setActiveGPX(filePath)` - Load and display a track
- `startDriveNavigation(route)` - Begin turn-by-turn navigation
- `startAutoUpdate()` / `stopAutoUpdate()` - Auto-refresh loop

**Sub-Coordinators:**
| Coordinator | Purpose |
|-------------|---------|
| GPSCoordinator | GPS position and status management |
| DriveCoordinator | Turn-by-turn navigation display |
| SimulationCoordinator | Track simulation updates |
| TrackDisplayCoordinator | Track rendering logic |
| OnboardingCoordinator | WiFi setup flow |

---

### GPSService
**Location:** `src/services/gps/GPSService.ts`
**Interface:** `IGPSService`

Reads GPS data from a UART serial connection (or mock data for development).

**Key Methods:**
- `getCurrentPosition()` - Get current GPS coordinate
- `getStatus()` - Get fix quality, satellite count, accuracy
- `startTracking()` / `stopTracking()` - Begin/end continuous reading
- `onPositionUpdate(callback)` - Subscribe to position updates
- `onStatusChange(callback)` - Subscribe to status changes

**Configuration (env vars):**
| Variable | Default | Description |
|----------|---------|-------------|
| `GPS_DEVICE_PATH` | `/dev/ttyAMA0` | Serial device path |
| `GPS_BAUD_RATE` | `9600` | Serial baud rate |
| `GPS_UPDATE_INTERVAL` | `1000` | Read frequency (ms) |
| `GPS_DEBOUNCE_MS` | `500` | Update throttling |
| `GPS_DISTANCE_THRESHOLD_METERS` | `2` | Movement threshold |
| `USE_MOCK_GPS` | `false` | Use mock GPS |

---

### MapService
**Location:** `src/services/map/MapService.ts`
**Interface:** `IMapService`

Parses GPX files and manages track data.

**Key Methods:**
- `loadGPXFile(filePath)` - Parse a GPX file
- `getTrack(filePath, trackIndex)` - Get a specific track
- `listAvailableGPXFiles()` - List GPX files in directory
- `getGPXFileInfo(filePaths)` - Get metadata (distance, elevation, points)
- `calculateBounds(track)` - Get min/max coordinates
- `calculateDistance(track)` - Total distance in meters
- `simplifyTrack(track, tolerance)` - Douglas-Peucker simplification

**Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `GPX_DIRECTORY` | `data/gpx-files` | GPX files location |
| `GPX_MAX_FILE_SIZE` | `50MB` | Maximum file size |
| `GPX_ENABLE_CACHE` | `true` | Enable caching |

---

### SVGService
**Location:** `src/services/svg/SVGService.ts`
**Interface:** `ISVGService`

Renders GPX tracks and UI elements to 1-bit bitmaps for the e-paper display.

**Key Methods:**
- `renderViewport(track, viewport, options)` - Render a centered track view
- `renderFollowTrackScreen(track, position, viewport, info, options)` - 80/20 split layout (map + info panel)
- `renderTurnScreen(maneuver, distance, instruction, streetName, viewport, nextTurn)` - Full-screen turn display
- `renderDriveMapScreen(route, position, waypoint, viewport, info, options, roads)` - Navigation map with overlay
- `renderOffRoadScreen(bearing, distance, viewport)` - Arrow pointing to route start
- `renderArrivalScreen(destination, viewport)` - Destination reached screen
- `addCompass(bitmap, x, y, radius, heading)` - Add compass rose
- `addScaleBar(bitmap, x, y, width, metersPerPixel)` - Add scale indicator

---

### EPaperService
**Location:** `src/services/epaper/EPaperService.ts`
**Interface:** `IEpaperService`

Controls the e-paper display hardware.

**Key Methods:**
- `displayBitmap(bitmap, mode)` - Show a 1-bit bitmap
- `displayLogo(mode)` - Show splash screen
- `clear()` - Clear to white
- `fullRefresh()` - Remove ghosting artifacts
- `sleep()` / `wake()` - Power management
- `getDimensions()` - Get width/height in pixels

**Update Modes:**
- `FULL` - Complete refresh (slower, removes artifacts)
- `PARTIAL` - Partial update (faster, may cause ghosting)
- `AUTO` - Intelligent selection

**Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `EPAPER_WIDTH` | `800` | Display width |
| `EPAPER_HEIGHT` | `480` | Display height |
| `EPAPER_DRIVER` | `waveshare_7in5_bw` | Display driver |
| `EPAPER_ROTATION` | `0` | Rotation (0/90/180/270) |
| `USE_MOCK_EPAPER` | `false` | Use mock display |

---

### ConfigService
**Location:** `src/services/config/ConfigService.ts`
**Interface:** `IConfigService`

Manages application configuration and user state persistence.

**Key Methods:**
- `initialize()` - Load config from disk
- `getConfig()` / `getUserState()` - Get current state
- `save()` / `reload()` - Persist/reload from disk
- `resetToDefaults()` - Reset user preferences

**Persisted State:**
- Display settings (zoom level)
- Preferences (auto-center, rotate-with-bearing, auto-refresh)
- Drive navigation settings (speed unit, show roads, POI categories)
- Routing profile (car/bike/foot)
- Recent files and destinations
- WiFi configuration

---

### WiFiService
**Location:** `src/services/wifi/WiFiService.ts`
**Interface:** `IWiFiService`

Network management via `nmcli` with mobile hotspot connection handling.

**Key Methods:**
- `scanNetworks()` - List available networks
- `getCurrentConnection()` - Get connected SSID info
- `connect(ssid, password)` - Connect to a network
- `disconnect()` - Disconnect from current network
- `saveNetwork(config)` - Store credentials for auto-connect
- `getState()` - Get WiFi state (IDLE, CONNECTING, CONNECTED, etc.)
- `getMode()` - Operating mode: "stopped" (web clients connected) or "driving" (no clients)

**WiFi State Machine:**
```
IDLE → CONNECTING → CONNECTED → DISCONNECTING → IDLE
```

---

### DriveNavigationService
**Location:** `src/services/drive/DriveNavigationService.ts`
**Interface:** `IDriveNavigationService`

Turn-by-turn navigation with offline route support.

**Key Methods:**
- `startNavigation(route)` - Begin navigation
- `stopNavigation()` - End navigation
- `getNavigationStatus()` - Get full status with distances, times, progress
- `updatePosition(position)` - Update GPS position
- `saveRoute(route)` / `loadRoute(id)` - Offline route storage
- `onNavigationUpdate(callback)` - Subscribe to navigation events

**Navigation States:**
| State | Description |
|-------|-------------|
| `IDLE` | No active navigation |
| `NAVIGATING` | Following route normally |
| `OFF_ROAD` | User is >500m from route start |
| `ARRIVED` | Within 50m of destination |
| `CANCELLED` | Navigation stopped by user |

**Display Modes:**
| Mode | When Used |
|------|-----------|
| `TURN_SCREEN` | Within 500m of next turn (large arrow) |
| `MAP_WITH_OVERLAY` | Far from turn (map with info overlay) |
| `OFF_ROAD_ARROW` | Off route (arrow to route start) |
| `ARRIVED` | At destination |

---

### TrackSimulationService
**Location:** `src/services/simulation/TrackSimulationService.ts`
**Interface:** `ITrackSimulationService`

Simulates GPS movement along a track for testing and demos.

**Key Methods:**
- `startSimulation(track, speed)` - Begin at speed (km/h)
- `stopSimulation()` - Stop simulation
- `pauseSimulation()` / `resumeSimulation()` - Pause/resume
- `setSpeed(speed)` - Set speed in km/h
- `setSpeedPreset(preset)` - "walk" (10), "bicycle" (30), "drive" (100)
- `getStatus()` - Get progress, remaining time, etc.
- `onPositionUpdate(callback)` - Subscribe to simulated positions

---

### POIService
**Location:** `src/services/poi/POIService.ts`
**Interface:** `IPOIService`

Points of Interest from OpenStreetMap with offline caching.

**Key Methods:**
- `getNearbyPOIs(position, categories, maxDistance, maxResults)` - Get nearby POIs
- `getNearestPOI(position, category, maxDistance)` - Find closest of type
- `prefetchRoutePOIs(route, categories, onProgress)` - Cache POIs along route
- `hasRouteCache(routeId)` - Check cache status

**POI Categories:**
| Category | Code | Description |
|----------|------|-------------|
| `fuel` | F | Fuel stations |
| `parking` | P | Parking areas |
| `food` | E | Restaurants |
| `restroom` | R | Restrooms |
| `viewpoint` | V | Scenic viewpoints |

---

### SpeedLimitService
**Location:** `src/services/speedLimit/SpeedLimitService.ts`
**Interface:** `ISpeedLimitService`

Speed limit data from OpenStreetMap with offline caching.

**Key Methods:**
- `getSpeedLimit(position)` - Get speed limit at position
- `prefetchRouteSpeedLimits(route, onProgress)` - Cache along route
- `hasRouteCache(routeId)` - Check cache status

---

### ElevationService
**Location:** `src/services/elevation/ElevationService.ts`
**Interface:** `IElevationService`

Elevation data with offline caching.

**Key Methods:**
- `getElevation(position)` - Get elevation at coordinates
- `prefetchRouteElevations(route, onProgress)` - Cache along route
- `getRouteMetrics(routeId)` - Get climb, descent, min, max
- `getRemainingClimb(routeId, position)` - Climb from current to end

---

### ReverseGeocodingService
**Location:** `src/services/reverseGeocoding/ReverseGeocodingService.ts`
**Interface:** `IReverseGeocodingService`

Converts coordinates to location names via Nominatim.

**Key Methods:**
- `getLocationName(position)` - Get location name
- `prefetchRouteLocations(route, onProgress)` - Cache along route

---

### VectorMapService
**Location:** `src/services/vectorMap/VectorMapService.ts`
**Interface:** `IVectorMapService`

Road geometries from OpenStreetMap for offline map rendering.

**Key Methods:**
- `getRoadsInBounds(minLat, maxLat, minLon, maxLon)` - Get roads in area
- `prefetchRouteRoads(route, corridorRadius, onProgress)` - Cache along route
- `getAllCachedRoads()` - Get all cached roads

**Highway Types (with rendering widths):**
| Type | Width |
|------|-------|
| Motorway | 5px |
| Trunk | 4px |
| Primary | 3px |
| Secondary | 2px |
| Tertiary | 2px |
| Residential | 1px |

---

### TextRendererService
**Location:** `src/services/textRenderer/TextRendererService.ts`
**Interface:** `ITextRendererService`

Renders text templates to bitmaps for the e-paper display.

**Key Methods:**
- `renderTemplate(template, variables, width, height)` - Render a template

Supports text blocks with various fonts/sizes and optional QR codes.

---

## Web Layer

### IntegratedWebService
**Location:** `src/web/IntegratedWebService.ts`

Combines HTTP API (Express) and WebSocket (Socket.IO) for real-time updates.

### Controllers
Located in `src/web/controllers/`:

| Controller | Purpose |
|------------|---------|
| `WebController` | Display control, GPS management |
| `TrackController` | GPX file management |
| `DriveController` | Navigation and routes |
| `SimulationController` | Track simulation |
| `ConfigController` | Settings |
| `GPSController` | GPS information |
| `WiFiController` | Network management |

### WebSocket Events

**Server → Client:**
- `gps:update` - New GPS position
- `gps:status` - GPS status change
- `display:updated` - Display rendered
- `drive:update` - Navigation update
- `drive:prefetch:*` - Prefetch progress
- `wifi:state` - WiFi state change
- `simulation:position` - Simulated position
- `simulation:state` - Simulation state change

---

## Error Handling

All custom errors extend `BaseError` (`src/core/errors/BaseError.ts`):

```typescript
class GPSError extends BaseError {
  static deviceNotFound(path: string): GPSError {
    return new GPSError(GPSErrorCode.DEVICE_NOT_FOUND, `Device not found: ${path}`);
  }
}
```

Error classes: `GPSError`, `MapError`, `DisplayError`, `OrchestratorError`, `WebError`, `WiFiError`, `ConfigError`, `DriveError`, `ElevationError`, `ReverseGeocodingError`, `SpeedLimitError`, `VectorMapError`, `POIError`

---

## Testing

Tests use Jest and are colocated with source files in `__tests__/` directories.

### Test Setup Pattern

```typescript
import { ServiceContainer } from "@di/ServiceContainer";

describe("MyService", () => {
  beforeEach(() => {
    ServiceContainer.reset();
    ServiceContainer.setGPSService(mockGPSService);
    // ... inject other mocks
  });

  it("should do something", async () => {
    const service = new MyService();
    const result = await service.doSomething();
    expect(result.success).toBe(true);
  });
});
```

### Run Tests

```bash
npm test                           # Run all tests
npm test -- path/to/file.test.ts   # Run single file
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report
```

---

## Adding a New Service

1. **Create the interface** in `src/core/interfaces/I{Name}Service.ts`:

```typescript
export interface IMyService {
  initialize(): Promise<Result<void>>;
  dispose(): Promise<void>;
  doSomething(): Promise<Result<string>>;
}
```

2. **Create the implementation** in `src/services/{name}/{Name}Service.ts`:

```typescript
export class MyService implements IMyService {
  async initialize(): Promise<Result<void>> {
    return success(undefined);
  }

  async dispose(): Promise<void> {
    // Cleanup
  }

  async doSomething(): Promise<Result<string>> {
    return success("done");
  }
}
```

3. **Register in ServiceContainer** (`src/di/ServiceContainer.ts`):

```typescript
private static myService: IMyService | null = null;

static getMyService(): IMyService {
  if (!this.myService) {
    this.myService = new MyService();
  }
  return this.myService;
}

static setMyService(service: IMyService): void {
  this.myService = service;
}
```

4. **Create tests** in `src/services/{name}/__tests__/{Name}Service.test.ts`

5. **Export the interface** from `src/core/interfaces/index.ts`

---

## Environment Variables

### GPS
| Variable | Default | Description |
|----------|---------|-------------|
| `GPS_DEVICE_PATH` | `/dev/ttyAMA0` | Serial device |
| `GPS_BAUD_RATE` | `9600` | Baud rate |
| `GPS_UPDATE_INTERVAL` | `1000` | Update interval (ms) |
| `USE_MOCK_GPS` | `false` | Use mock GPS |

### E-Paper
| Variable | Default | Description |
|----------|---------|-------------|
| `EPAPER_WIDTH` | `800` | Display width |
| `EPAPER_HEIGHT` | `480` | Display height |
| `EPAPER_DRIVER` | `waveshare_7in5_bw` | Display driver |
| `EPAPER_ROTATION` | `0` | Rotation |
| `USE_MOCK_EPAPER` | `false` | Use mock display |

### Web Server
| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3000` | HTTP port |
| `WEB_HOST` | `0.0.0.0` | Bind address |
| `WEB_AUTH_ENABLED` | `false` | Enable auth |
| `WEB_CORS` | `true` | Enable CORS |

### WiFi
| Variable | Default | Description |
|----------|---------|-------------|
| `WIFI_ENABLED` | `true` | Enable WiFi |
| `WIFI_PRIMARY_SSID` | `Papertrail-Setup` | AP SSID |
| `WIFI_SCAN_INTERVAL_MS` | `5000` | Scan interval |

---

## Development Notes

- **Entry point:** `src/index.ts`
- **Logging:** Use `getLogger(name)` from `@utils/logger`
- **Static web files:** `src/web/public/`
- **GPX files:** `data/gpx-files/`
- **Config persistence:** `data/config.json`
- **Pre-commit hooks:** Husky runs lint-staged on staged files

Run `npm run format` after making changes. Write tests for new code.
