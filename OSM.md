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
- Route endpoint changes to `/route/v1/{profile}/{coordinates}` based on selection
- Profile selector dropdown added to web UI Display Controls panel
- Persists to user config, so profile choice is remembered across sessions
- API endpoint: `POST /api/config/routing-profile` with `{ profile: "car"|"bike"|"foot" }`

---

### OSM-6: Road Surface Information
**Status:** Not started
**Priority:** Low
**Complexity:** Medium

Show road surface type from OSM tags.

**Functionality:**
- Display current surface (paved, gravel, dirt)
- Warn about upcoming surface changes
- Useful for cycling and adventure routes
- Show surface in route preview

**Implementation notes:**
- OSM tags: `surface=asphalt|gravel|dirt|unpaved|paved`
- Query via Overpass for route corridor
- Match route geometry to OSM ways
- Display icon or text for surface type
- Pre-analyze at route calculation time

---

### OSM-7: Elevation Profiles
**Status:** Not started
**Priority:** Low
**Complexity:** Medium

Show elevation data for routes.

**Functionality:**
- Display total climb/descent for route
- Show gradient of upcoming section
- Elevation profile visualization in web interface
- Warn about steep sections

**Implementation notes:**
- Use Open-Elevation API or SRTM data
- Endpoint: `https://api.open-elevation.com/api/v1/lookup`
- Batch query route points for elevation
- Calculate gradients between points
- Add elevation graph to route preview
- E-paper: show climb remaining in info panel

---

### OSM-8: Offline Vector Maps
**Status:** Not started
**Priority:** Low
**Complexity:** High

Render actual map backgrounds on e-paper display.

**Functionality:**
- Display roads, water, forests on e-paper
- High-contrast style optimized for 1-bit display
- Show street names at intersections
- Offline map tiles for regions

**Implementation notes:**
- Download vector tiles (Protomaps PMTiles format)
- Render with custom 1-bit style (roads black, water pattern, etc.)
- Significant complexity: tile rendering, text placement
- Storage: ~50-500MB per region
- Alternative: pre-render raster tiles at fixed zoom levels
- May require native rendering library for performance

---

### OSM-9: Map Matching
**Status:** Not started
**Priority:** Low
**Complexity:** Medium

Snap GPS traces to actual roads.

**Functionality:**
- Clean recorded tracks by snapping to roads
- Correct GPS drift and inaccuracies
- More accurate distance calculations
- Post-process GPX files

**Implementation notes:**
- OSRM provides map matching: `/match/v1/{profile}/{coordinates}`
- Process recorded tracks after completion
- Store both raw and matched tracks
- Option to export matched GPX
- Useful for track mode recordings

---

## Implementation Order Recommendation

1. **OSM-2: Speed Limits** - Safety feature, medium complexity
2. **OSM-3: POI** - Practical utility during drives
3. **OSM-1: Reverse Geocoding** - Low complexity, high user value
4. **OSM-5: Routing Profiles** - Simple OSRM parameter change
5. **OSM-4: Offline Routing** - Reliability for remote areas
6. **OSM-7: Elevation** - Useful for cycling/hiking
7. **OSM-9: Map Matching** - Nice to have
8. **OSM-8: Vector Maps** - High complexity, significant undertaking

---

## API References

- **Nominatim** (Geocoding): https://nominatim.org/release-docs/latest/api/Reverse/
- **Overpass** (POI/Tags): https://overpass-api.de/
- **OSRM** (Routing): https://project-osrm.org/docs/v5.24.0/api/
- **Open-Elevation**: https://open-elevation.com/
- **Protomaps** (Vector tiles): https://protomaps.com/
