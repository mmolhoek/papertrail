# E-Paper Rendering Pipeline

This document explains the complete process of rendering content to the e-paper display, from data gathering through SVG layer composition to final 1-bit bitmap output.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Screen Types and Layouts](#screen-types-and-layouts)
3. [Layer Composition Order](#layer-composition-order)
4. [Data Gathering](#data-gathering)
5. [Bitmap Rendering System](#bitmap-rendering-system)
6. [Complete Render Flow](#complete-render-flow)
7. [Performance Characteristics](#performance-characteristics)

---

## Architecture Overview

The rendering pipeline transforms GPS data, track information, and navigation state into a 1-bit bitmap displayed on an 800x480 e-paper screen.

```
GPS/Track Data Sources
         │
         ▼
┌─────────────────────────────────────┐
│     RenderingOrchestrator           │
│  (central coordinator)              │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Sub-coordinators                   │
│  ├─ GPSCoordinator                  │
│  ├─ TrackDisplayCoordinator         │
│  ├─ DriveCoordinator                │
│  ├─ SimulationCoordinator           │
│  └─ OnboardingCoordinator           │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│         SVGService                  │
│  (layer composition + rendering)    │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│        Bitmap1Bit                   │
│  (800x480, 48KB packed pixels)      │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│        EPaperService                │
│  (hardware display driver)          │
└─────────────────────────────────────┘
```

### Key Files

| Component             | File                                                   |
| --------------------- | ------------------------------------------------------ |
| Main renderer         | `src/services/svg/SVGService.ts`                       |
| Central coordinator   | `src/services/orchestrator/RenderingOrchestrator.ts`   |
| Track rendering logic | `src/services/orchestrator/TrackDisplayCoordinator.ts` |
| Navigation rendering  | `src/services/orchestrator/DriveCoordinator.ts`        |
| Hardware interface    | `src/services/epaper/EPaperService.ts`                 |

---

## Screen Types and Layouts

### 1. Follow Track Screen (70/30 Split)

Primary view for GPS tracking. Map on left (70%), info panel on right (30%).

```
┌──────────────────────────────┬────────────┐
│  Compass                     │   SPEED    │
│    ↑N                        │   42 KM/H  │
│                              │            │
│         Map Area             │   SATS     │
│       (track line,           │     8      │
│        position marker)      │            │
│                              │   ZOOM     │
│                              │    15      │
│                              │            │
│                   Scale Bar  │   DONE     │
│                   ├──200m──┤ │   67%      │
└──────────────────────────────┴────────────┘
```

### 2. Drive Navigation Map Screen (70/30 Split)

Rich map with roads, water, POIs plus navigation info.

```
┌──────────────────────────────┬────────────┐
│  Compass     POI markers     │ NEXT TURN  │
│    ↑N          ●H ●F         │    ↱       │
│                              │   250m     │
│     Roads, Water, Landuse    │  Main St   │
│     Route geometry           │────────────│
│     Current position ●       │ SPEED  45  │
│     Waypoint markers         │ ZOOM   16  │
│                              │────────────│
│                              │ PROGRESS   │
│                   Scale Bar  │ ████░░ 67% │
│                   ├──500m──┤ │ 12.4km     │
└──────────────────────────────┴────────────┘
```

### 3. Turn Screen (Full Width)

Displayed when approaching a turn (distance threshold configurable).

```
┌──────────────────────────────────────────────┐
│                                              │
│                    ↰                         │
│              (large arrow)                   │
│                                              │
│                  250 m                       │
│                                              │
│              TURN LEFT onto                  │
│                Main Street                   │
│                                              │
│         ████████████░░░░░░░░  67%           │
└──────────────────────────────────────────────┘
```

### 4. Dual Turn Screen

Shows current turn and next turn side-by-side.

```
┌─────────────────────┬────────────────────────┐
│                     │                        │
│         ↰           │          ↱             │
│       250m          │  THEN   500m           │
│                     │                        │
├─────────────────────┴────────────────────────┤
│           TURN LEFT onto Main Street         │
│         ████████████░░░░░░░░  67%            │
└──────────────────────────────────────────────┘
```

### 5. Off-Road Screen

Displayed when user deviates from calculated route.

```
┌──────────────────────────────────────────────┐
│                                              │
│                    ➡                         │
│              (direction arrow)               │
│                                              │
│                  340 m                       │
│                 TO ROUTE                     │
│                                              │
│         Head NORTHEAST to rejoin route       │
│                                              │
└──────────────────────────────────────────────┘
```

### 6. Arrival Screen

Displayed when destination is reached.

```
┌──────────────────────────────────────────────┐
│                                              │
│                    ✓                         │
│              (checkmark)                     │
│                                              │
│                 ARRIVED                      │
│                                              │
│              123 Main Street                 │
│              Springfield                     │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Layer Composition Order

Layers are rendered back-to-front. Later layers appear on top of earlier ones.

### Follow Track Screen Layers

```
Layer 1: Background (white canvas)
    ↓
Layer 2: Track line (GPX waypoints connected)
    ↓
Layer 3: Current position marker (circle)
    ↓
Layer 4: Compass rose (top-left, 50px radius)
    ↓
Layer 5: Scale bar (bottom-right, max 200px)
    ↓
Layer 6: Vertical divider (2px line)
    ↓
Layer 7: Info panel text (SPEED, SATS, ZOOM, DONE, ETA)
```

### Drive Navigation Map Screen Layers

```
Layer 1:  Background (white canvas)
    ↓
Layer 2:  Landuse (forests, parks, residential - dithered patterns)
    ↓
Layer 3:  Water (lakes filled, rivers/streams as lines)
    ↓
Layer 4:  Roads (sorted minor→major, varying widths)
    ↓
Layer 5:  Street labels (major roads only)
    ↓
Layer 6:  Route geometry (calculated navigation route, 3px width)
    ↓
Layer 7:  End marker (destination circle, 16px radius)
    ↓
Layer 8:  Waypoints (at zoom 19+, small circles with labels)
    ↓
Layer 9:  POI markers (at zoom 15+, circles with letter codes)
    ↓
Layer 10: Current position marker (8px radius circle)
    ↓
Layer 11: Compass rose (top-left)
    ↓
Layer 12: Scale bar (bottom-right)
    ↓
Layer 13: Vertical divider
    ↓
Layer 14: Info panel (maneuver arrow, distance, speed, progress)
```

### Road Rendering Priority

Roads are sorted by type before rendering (minor first, major last):

| Priority   | Road Type            | Line Width |
| ---------- | -------------------- | ---------- |
| 1 (bottom) | footway, path        | 1px        |
| 2          | residential, service | 2px        |
| 3          | tertiary             | 2px        |
| 4          | secondary            | 3px        |
| 5          | primary              | 4px        |
| 6          | trunk                | 4px        |
| 7 (top)    | motorway             | 6px        |

### Water Feature Rendering

| Feature Type | Style                | Width       |
| ------------ | -------------------- | ----------- |
| lake, pond   | Area fill (dithered) | 1px outline |
| river        | Line                 | 4px         |
| canal        | Line                 | 3px         |
| stream       | Line                 | 2px         |

---

## Data Gathering

The rendering pipeline gathers data from multiple services to populate info panels and map features.

### GPS Data (Continuous)

**Source:** `GPSService` → `GPSCoordinator`

| Data                 | Description                            |
| -------------------- | -------------------------------------- |
| `latitude/longitude` | Current position                       |
| `bearing`            | Heading direction (degrees)            |
| `speed`              | Current speed (m/s, converted to km/h) |
| `satellitesInUse`    | Number of GPS satellites               |
| `hdop/vdop`          | Position precision                     |
| `altitude`           | Elevation (meters)                     |

### Speed Limits (Prefetched)

**Source:** `SpeedLimitService`

- Prefetched at route start via `prefetchRouteSpeedLimits()`
- Cached in `DriveCoordinator.cachedSpeedLimit`
- Queried by position during navigation updates
- Only fetched if `showSpeedLimit` config enabled

### Location Names (Prefetched)

**Source:** `ReverseGeocodingService`

- Prefetched at route start via `prefetchRouteLocations()`
- Cached in `DriveCoordinator.cachedLocationName`
- Provides street/area names for current position
- Only fetched if `showLocationName` config enabled

### Road Surface (Prefetched)

**Source:** `RoadSurfaceService`

- Prefetched at route start via `prefetchRouteSurfaces()`
- Cached in `DriveCoordinator.cachedRoadSurface`
- Values: asphalt, concrete, gravel, dirt, cobblestone, unknown
- Only fetched if `showRoadSurface` config enabled

### Nearby POIs (Fetched at Zoom 15+)

**Source:** `POIService`

- Prefetched at route start for all categories
- Filtered by enabled categories from `ConfigService`
- 20km radius during navigation
- Categories: Coffee, Restaurant, Hotel, Hospital, Fuel, Parking, etc.
- Displayed as letter-coded circles on map

### Map Features (Prefetched for Routes)

**Source:** `VectorMapService` (OpenStreetMap/Overpass API)

| Feature | Prefetch Method          | Corridor   |
| ------- | ------------------------ | ---------- |
| Roads   | `prefetchRouteRoads()`   | 5km buffer |
| Water   | `prefetchRouteWater()`   | 5km buffer |
| Landuse | `prefetchRouteLanduse()` | 5km buffer |

Features are cached and progressively updated during prefetch.

### Track Progress

**Source:** `TrackDisplayCoordinator`

Calculated as: `(distance traveled / total track distance) × 100%`

Uses Haversine formula to compute GPS-to-track distance.

### Navigation State

**Source:** `DriveNavigationService`

| Data                   | Description                             |
| ---------------------- | --------------------------------------- |
| `currentWaypointIndex` | Progress through route                  |
| `distanceToTurn`       | Meters to next maneuver                 |
| `nextManeuver`         | Turn type (left, right, straight, etc.) |
| `streetName`           | Name of next street                     |
| `distanceRemaining`    | Total km to destination                 |
| `progress`             | Route completion percentage             |
| `navigationState`      | on_route, off_route, arrived            |

---

## Bitmap Rendering System

The pipeline renders directly to a 1-bit bitmap rather than using SVG-to-image conversion.

### Bitmap Format

```typescript
interface Bitmap1Bit {
  width: number; // 800 pixels
  height: number; // 480 pixels
  data: Uint8Array; // Packed 1-bit pixels
}

// Pixel packing:
// - 8 pixels per byte
// - 0xFF = 8 white pixels
// - 0x00 = 8 black pixels
// - Bit 7 = leftmost pixel

// Memory layout:
// - Bytes per row = ceil(800 / 8) = 100 bytes
// - Total bytes = 100 × 480 = 48,000 bytes
```

### Drawing Primitives

All primitives are in `src/services/svg/BitmapUtils.ts`:

| Function               | Algorithm             | Use Case           |
| ---------------------- | --------------------- | ------------------ |
| `setPixel()`           | Bit manipulation      | Individual pixels  |
| `drawLine()`           | Bresenham's algorithm | Track lines, roads |
| `drawCircle()`         | Midpoint circle       | Position markers   |
| `drawFilledCircle()`   | Scan-line fill        | POI markers        |
| `fillTriangle()`       | Scan-line fill        | Arrows, compass    |
| `drawHorizontalLine()` | Byte-optimized fill   | Dividers, bars     |
| `drawVerticalLine()`   | Pixel-by-pixel        | Panel dividers     |

### Text Rendering

**Source:** `src/utils/bitmapFont.ts`

No external image processing (Sharp not used). Text is rendered using pre-computed 1-bit glyph data.

```typescript
renderBitmapText(bitmap, text, x, y, {
  scale: 1 - 7, // 1x to 7x sizing
  bold: boolean, // Extra line thickness
  extraBold: boolean, // Even thicker
});

// Scale sizes (approximate):
// Scale 1: 7×10 pixels per character
// Scale 3: 21×30 pixels
// Scale 5: 35×50 pixels
// Scale 7: 49×70 pixels
```

### Specialized Renderers

| Renderer              | File                     | Purpose                         |
| --------------------- | ------------------------ | ------------------------------- |
| `TrackRenderer`       | `TrackRenderer.ts`       | GPX tracks, route geometry      |
| `UIRenderer`          | `UIRenderer.ts`          | Compass, scale bar, info panels |
| `ManeuverRenderer`    | `ManeuverRenderer.ts`    | Turn arrows, directional arrows |
| `RoadRenderer`        | `RoadRenderer.ts`        | Street network from OSM         |
| `WaterRenderer`       | `WaterRenderer.ts`       | Lakes, rivers, streams          |
| `LanduseRenderer`     | `LanduseRenderer.ts`     | Forests, parks, residential     |
| `StreetLabelRenderer` | `StreetLabelRenderer.ts` | Road name labels                |

---

## Complete Render Flow

### Step-by-Step Process

```
1. TRIGGER
   ├─ Timer-based auto-refresh (configurable interval)
   ├─ GPS position update
   ├─ Navigation state change
   └─ Manual user request

2. DISPLAY UPDATE INITIATED (TrackDisplayCoordinator.updateDisplay())
   ├─ Check queue (wait if display busy)
   ├─ Load active GPX track from disk
   └─ Validate track has points

3. DETERMINE CURRENT POSITION
   ├─ Priority 1: Simulation position (if simulating)
   ├─ Priority 2: Live GPS position (if tracking)
   └─ Priority 3: Track start point (fallback)

4. CREATE VIEWPORT
   ├─ Width: 800px (or configured)
   ├─ Height: 480px (or configured)
   ├─ Zoom level: from ConfigService
   ├─ Center point: current position
   ├─ Bearing: current heading
   └─ Apply centerOverride if panning

5. SELECT SCREEN TYPE
   ├─ If navigating + turn threshold: renderTurnScreen()
   ├─ If navigating: renderDriveMapScreen()
   ├─ If off-route: renderOffRoadScreen()
   ├─ If arrived: renderArrivalScreen()
   ├─ If simulating: renderSimulationScreen()
   └─ Default: renderFollowTrackScreen()

6. GATHER DATA FOR INFO PANEL
   ├─ Speed from GPS
   ├─ Satellites from GPS
   ├─ Bearing from GPS
   ├─ Zoom from config
   ├─ Progress calculated from track
   └─ If navigating:
      ├─ Speed limit (cached)
      ├─ Location name (cached)
      ├─ Road surface (cached)
      ├─ Nearby POIs (cached)
      └─ Map features (cached)

7. SVG SERVICE RENDERING
   ├─ Create blank bitmap (white, 800×480)
   ├─ Render each layer back-to-front
   │  ├─ Background (already white)
   │  ├─ Map features (landuse → water → roads → labels)
   │  ├─ Route/track geometry
   │  ├─ Markers (position, waypoints, POIs)
   │  ├─ UI elements (compass, scale bar)
   │  ├─ Divider line
   │  └─ Info panel (text, arrows, progress bar)
   └─ Return Bitmap1Bit

8. DISPLAY TO HARDWARE (EPaperService.displayBitmap())
   ├─ Check display ready (initialized, not sleeping, not busy)
   ├─ Convert bitmap to driver format
   ├─ Apply rotation if configured
   ├─ Send to hardware driver
   ├─ Issue refresh command (FULL or PARTIAL)
   ├─ Wait for hardware completion (poll busy pin)
   └─ Return success/failure

9. CALLBACKS
   ├─ displayUpdateCallback(success)
   ├─ errorCallback(error) if failed
   └─ Update lastUpdate timestamp
```

### Data Flow Diagram

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  GPSService │   │ MapService  │   │ConfigService│
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────────────────────────────────────────┐
│            GPSCoordinator / DriveCoordinator     │
│  • Subscribe to GPS updates                      │
│  • Load track/route data                         │
│  • Manage cached POIs, speed limits, etc.        │
└──────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│           TrackDisplayCoordinator                │
│  • Determine screen type                         │
│  • Calculate viewport                            │
│  • Gather info panel data                        │
│  • Coordinate render call                        │
└──────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│                   SVGService                     │
│  • Create blank bitmap                           │
│  • Compose layers via specialized renderers      │
│  • Return Bitmap1Bit                             │
└──────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────┐
│                  EPaperService                   │
│  • Apply rotation                                │
│  • Send to hardware driver                       │
│  • Wait for refresh completion                   │
└──────────────────────────────────────────────────┘
                         │
                         ▼
                   ┌───────────┐
                   │  E-Paper  │
                   │  Display  │
                   │ (800×480) │
                   └───────────┘
```

---

## Performance Characteristics

### Typical Render Times

| Operation                    | Time              |
| ---------------------------- | ----------------- |
| Blank bitmap creation        | < 1ms             |
| Small track (100 points)     | 5-10ms            |
| Large track (10,000+ points) | 50-150ms          |
| Map features (roads/water)   | 20-100ms          |
| Text rendering (info panel)  | 10-20ms           |
| Full SVG rendering           | 100-300ms         |
| Hardware refresh (FULL)      | 3-5 seconds       |
| Hardware refresh (PARTIAL)   | 0.5-1 second      |
| **Complete cycle (FULL)**    | **3-5.5 seconds** |
| **Complete cycle (PARTIAL)** | **1-1.5 seconds** |

### Memory Efficiency

- **Packed 1-bit format:** 6× smaller than 8-bit grayscale
- **Coordinate pooling:** Reusable arrays avoid allocation churn
- **Pre-computed bytesPerRow:** Optimizes inner loops
- **In-place transformations:** Rotation without extra buffers

### Rendering Optimizations

- **Bresenham's algorithm:** Integer-only line drawing
- **Midpoint circle:** 8-way symmetry for fast circles
- **Byte-level fills:** 8 pixels at once for horizontal spans
- **Scan-line fill:** Efficient polygon filling
- **Feature sorting:** Minor→major ensures correct z-order

### Display Hardware

- **Refresh modes:** FULL (no ghosting, slower) vs PARTIAL (faster, may ghost)
- **Busy checking:** Prevents concurrent updates
- **Rotation:** Hardware-accelerated when supported
- **Sleep/wake:** Power management for battery life

---

## Configuration Options

Key settings affecting rendering (from `ConfigService`):

| Setting                 | Default | Description                           |
| ----------------------- | ------- | ------------------------------------- |
| `displayWidth`          | 800     | Display width in pixels               |
| `displayHeight`         | 480     | Display height in pixels              |
| `zoomLevel`             | auto    | Map zoom level                        |
| `rotateWithBearing`     | false   | Track-up vs north-up mode             |
| `showSpeedLimit`        | true    | Display speed limit in info panel     |
| `showLocationName`      | true    | Display current location name         |
| `showRoadSurface`       | false   | Display road surface type             |
| `showPOIs`              | true    | Show POI markers on map               |
| `displayUpdateInterval` | 5000    | Auto-refresh interval (ms)            |
| `turnScreenThreshold`   | 200     | Distance (m) to switch to turn screen |
