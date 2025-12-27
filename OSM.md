# OpenStreetMap Feature Roadmap

Potential OSM-based features for Papertrail. Each feature includes implementation notes for future development.

---

general implementation notes:

- always keep test coverage up
- Keep in mind we have no internet during driving. use data folder/ to prefetch and cache all data
- All features should be optional and configurable in the display menu

## Features

### OSM-1: Reverse Geocoding

**Status:** Implemented
**Priority:** High
**Complexity:** Low

Display human-readable location names instead of just coordinates.

**Functionality:**

- Show current street/area name on e-paper display (e.g., "Main Street, London")
- Update location name periodically during navigation
- Show when entering/leaving towns or regions
- Log location names in track history

**Implementation:**

- Created `ReverseGeocodingService` using Nominatim API
- Location names are prefetched along the route when navigation starts (while internet available)
- Cached in `data/locations/` directory for offline use during driving
- Location name passed to `DriveNavigationInfo` for display
- Configurable via `showLocationName` in user display preferences
- Rate limiting (1.1s between requests) to respect Nominatim API terms
- Parses address components to show concise display name (street + city)

---

### OSM-2: Speed Limit Display

**Status:** Implemented
**Priority:** High
**Complexity:** Medium

Show speed limits from OSM road data.

**Functionality:**

- Display current road's speed limit on e-paper
- Visual alert when exceeding limit
- Show speed limit in drive info panel
- Handle roads without speed limit data gracefully

**Implementation:**

- Created `SpeedLimitService` using Overpass API to query `maxspeed` tags
- Speed limits are prefetched along the route when navigation starts (while internet available)
- Cached in `data/speed-limits/` for offline use during driving
- Speed limit displayed in drive info panel next to current speed (format: "45/50" for speed/limit)
- Configurable via `showSpeedLimit` in user display preferences
- Handles various maxspeed formats: numeric (30, 50), with units (30 mph, 50 km/h), special values (walk, none)

---

### OSM-3: Points of Interest (POI)

**Status:** Implemented
**Priority:** Medium
**Complexity:** Medium

Display nearby amenities during navigation.

**Functionality:**

- Show distance to nearest fuel station
- Alert when approaching configured POI types
- Configurable categories: fuel, parking, food, rest areas
- Display POI name and distance on demand
- in track mode show arrow and distance plus code letter for each poi if it is close enought but not visible on the screen yet.

**Implementation:**

- Created `POIService` using Overpass API to query POI amenities
- POIs are prefetched along the route corridor (2km radius) when navigation starts
- Cached in `data/poi/` directory for offline use during driving
- Nearby POIs passed to `DriveNavigationInfo` for display
- Configurable per-category toggles via `enabledPOICategories` in user preferences
- Web UI shows POI prefetch progress during route loading
- Rate limiting (1.1s between requests) to respect Overpass API terms

**POI categories supported:**

- `amenity=fuel` - (F)uel stations
- `amenity=parking` - (P)arking areas
- `amenity=restaurant` / `amenity=cafe` / `amenity=fast_food` - (E)Food
- `amenity=toilets` - (R)estrooms
- `tourism=viewpoint` - (V)iewpoints

---

### OSM-4: Offline Routing

**Status:** Not started
**Priority:** Medium
**Complexity:** High

Run OSRM locally for navigation without internet.

**Functionality:**

- Calculate routes without internet connection
- Pre-download routing graph for selected regions
- Same turn-by-turn quality as online routing
- Region management in web interface

**Implementation notes:**

- Run osrm-backend on Raspberry Pi 5 (has sufficient RAM)
- Download pre-processed `.osrm` files for regions
- Storage: ~100MB per small country, 1-2GB for large countries
- API compatible with current OSRM integration
- Add region download/management endpoints
- Consider osrm-routed or direct library integration

---

### OSM-5: Alternative Routing Profiles

**Status:** Implemented ✓
**Priority:** Medium
**Complexity:** Low

Support different transport modes beyond car.

**Functionality:**

- Bicycle routing (prefer bike paths, avoid highways)
- Walking/hiking routing
- Option to avoid tolls, ferries, motorways
- Profile selection in web interface

**Implementation:**

- Added `routingProfile` to user display preferences (`car`, `bike`, `foot`)
- DriveController uses profile from ConfigService when calling OSRM API
- Uses `routing.openstreetmap.de` which hosts separate OSRM instances per profile:
  - `car` → `routing.openstreetmap.de/routed-car`
  - `bike` → `routing.openstreetmap.de/routed-bike`
  - `foot` → `routing.openstreetmap.de/routed-foot`
- Note: `router.project-osrm.org` only supports driving (ignores profile parameter)
- Profile selector added to web UI Display Controls panel
- Drive panel shows current profile indicator ("ROUTE TYPE: CAR/BIKE/WALK")
- Routes are cached with profile in ID (e.g., `gps_to_paris_bike.json`)
- Persists to user config, so profile choice is remembered across sessions
- API endpoint: `POST /api/config/routing-profile` with `{ profile: "car"|"bike"|"foot" }`

---

### OSM-6: Road Surface Information

**Status:** Implemented
**Priority:** Low
**Complexity:** Medium

Show road surface type from OSM tags.

**Functionality:**

- Display current surface (paved, gravel, dirt)
- Warn about upcoming surface changes
- Useful for cycling and adventure routes
- Show surface in route preview

**Implementation:**

- Created `RoadSurfaceService` using Overpass API to query `surface` tags
- Road surfaces are prefetched along the route when navigation starts (while internet available)
- Cached in `data/road-surfaces/` directory for offline use during driving
- Road surface passed to `DriveNavigationInfo` for display
- Configurable via `showRoadSurface` in user display preferences
- Rate limiting (1.1s between requests) to respect Overpass API terms
- Surface classification:
  - `paved`: asphalt, concrete, paving_stones, sett, cobblestone, paved, metal, wood
  - `gravel`: gravel, fine_gravel, compacted, pebblestone
  - `dirt`: dirt, earth, ground, mud, clay
  - `unpaved`: unpaved, grass, sand, grass_paver, stepping_stones
  - `unknown`: roads without surface tags
- Distance-based lookup: finds nearest road segment to current position
- API endpoint: `POST /api/config/show-road-surface` with `{ enabled: boolean }`
- WebSocket event: `roadsurface:prefetch` for prefetch progress updates

---

### OSM-7: Elevation Profiles

**Status:** Implemented
**Priority:** Low
**Complexity:** Medium

Show elevation data for routes.

**Functionality:**

- Display total climb/descent for route
- Show gradient of upcoming section
- Elevation profile visualization in web interface
- Warn about steep sections

**Implementation:**

- Created `ElevationService` using Open-Elevation API (`https://api.open-elevation.com/api/v1/lookup`)
- Elevations are prefetched along the route when navigation starts (while internet available)
- Uses batch queries (up to 100 points per request) for efficient API usage
- Cached in `data/elevation/` directory for offline use during driving
- Route metrics calculated: total climb, total descent, min/max elevation, start/end elevation
- Remaining climb calculation from current position to destination
- Configurable via `showElevation` in user display preferences
- Web UI shows elevation prefetch progress during route loading
- Rate limiting (500ms between requests) to respect API terms
- Filters small elevation changes (<2m) to reduce GPS noise in metrics

---

### OSM-8: Offline Vector Maps

**Status:** Implemented
**Priority:** Low
**Complexity:** High

Render actual map backgrounds on e-paper display.

**Functionality:**

- Display roads, water, forests on e-paper
- High-contrast style optimized for 1-bit display
- Show street names at intersections
- Offline map tiles for regions

**Implementation (Roads - Complete):**

- Created `VectorMapService` using Overpass API to query road geometries
- Roads are prefetched along route corridor (5km radius) when navigation starts
- Cached in `data/roads/` directory for offline use during driving
- Created `RoadRenderer` for rendering roads with varying line widths by type
- Supports 12 highway types: motorway, trunk, primary, secondary, tertiary, residential, etc.
- Major roads rendered on top of minor roads (render priority system)
- Configurable via `showRoads` in user display preferences
- Rate limiting (1.1s between requests) to respect Overpass API terms
- Road names are fetched and cached (but not yet rendered on map)

**Implementation (Water - Complete):**

- Extended `VectorMapService` to query water from Overpass API
- Query `waterway=river|stream|canal`, `natural=water`, `water=lake|pond|reservoir`
- Created `WaterRenderer` with distinct rendering styles:
  - Linear features (rivers, streams, canals): rendered as lines with varying widths
  - Area features (lakes, ponds, reservoirs): filled polygons with 50% dither pattern
- Cached in `data/water/` for offline use
- Prefetched along route corridor when navigation starts
- Configurable via `showWater` in user display preferences

**Implementation (Landuse - Complete):**

- Extended `VectorMapService` to query landuse from Overpass API
- Query `landuse=forest|meadow|grass|farmland`, `natural=wood`, `leisure=park`
- Created `LanduseRenderer` with distinct dither patterns for each type:
  - Forest/Wood: dense dot pattern
  - Park: medium dot pattern with offset rows
  - Meadow/Grass: sparse horizontal dash pattern
  - Farmland: sparse diagonal line pattern
- Cached in `data/landuse/` for offline use
- Prefetched along route corridor when navigation starts
- Configurable via `showLanduse` in user display preferences

**Rendering Layer Order:**

1. Landuse (bottom layer)
2. Water
3. Roads
4. Route (top)

**Implementation (Street Labels - Complete):**

- Created `StreetLabelRenderer` for rendering road names on the map
- Labels only major roads (tertiary and above) to avoid clutter
- Finds longest visible segment of each road for label placement
- Collision detection prevents overlapping labels
- White background clearing behind text for readability on 1-bit display
- Truncates long names with ".." suffix

---

### OSM-9: Map Matching (Map Snap)

**Status:** Implemented
**Priority:** Low
**Complexity:** Medium

Snap GPS traces to actual roads using OSRM's map matching API.

**Functionality:**

- Clean recorded tracks by snapping to roads
- Correct GPS drift and inaccuracies
- More accurate distance calculations
- Post-process GPX files

**Implementation:**

- Created `MapSnapService` using OSRM map matching API (`/match/v1/{profile}/{coordinates}`)
- Uses `routing.openstreetmap.de/routed-{profile}` which supports car, bike, and foot profiles
- Batches points into chunks of 100 with 2-point overlap for continuity
- Rate limiting (1.1s between requests) to respect API terms
- Returns snapped coordinates with confidence scores and road names
- Calculates distance from original GPS point to matched road
- Handles unmatched points gracefully (off-road, GPS gaps)
- UI: "SNAP" button in GPX Track panel triggers snap on active track
- API endpoint: `POST /api/map/snap` with `{ profile: "car"|"bike"|"foot" }`
- Uses current routing profile from display preferences if not specified

---

## Implementation Order Recommendation

1. ~~**OSM-2: Speed Limits**~~ ✓ Implemented
2. ~~**OSM-3: POI**~~ ✓ Implemented
3. ~~**OSM-1: Reverse Geocoding**~~ ✓ Implemented
4. ~~**OSM-5: Routing Profiles**~~ ✓ Implemented
5. ~~**OSM-7: Elevation**~~ ✓ Implemented
6. ~~**OSM-9: Map Matching**~~ ✓ Implemented
7. ~~**OSM-8: Vector Maps**~~ ✓ Implemented
8. ~~**OSM-6: Road Surface**~~ ✓ Implemented

**Remaining:**
- **OSM-4: Offline Routing** - Run OSRM locally

---

## API References

- **Nominatim** (Geocoding): https://nominatim.org/release-docs/latest/api/Reverse/
- **Overpass** (POI/Tags): https://overpass-api.de/
- **OSRM** (Routing): https://project-osrm.org/docs/v5.24.0/api/
- **Open-Elevation**: https://open-elevation.com/
- **Protomaps** (Vector tiles): https://protomaps.com/
