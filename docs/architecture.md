# Papertrail Architecture Documentation

This document provides detailed architectural diagrams and documentation for the Papertrail GPS tracking system.

## Table of Contents

1. [Service Component Diagram](#service-component-diagram)
2. [GPS Update Flow](#gps-update-flow)
3. [Track Selection Flow](#track-selection-flow)
4. [WiFi/Onboarding State Machine](#wifionboarding-state-machine)
5. [Drive Navigation Flow](#drive-navigation-flow)
6. [Display Abstraction Layer](#display-abstraction-layer)

---

## Service Component Diagram

The following diagram shows the major services and their dependencies:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Entry Point                                     │
│                            ┌──────────┐                                      │
│                            │ index.ts │                                      │
│                            └────┬─────┘                                      │
│                                 │                                            │
│                                 ▼                                            │
│                      ┌──────────────────────┐                               │
│                      │   ServiceContainer   │ ←── Dependency Injection       │
│                      │      (Singleton)     │                               │
│                      └──────────┬───────────┘                               │
│                                 │ creates                                   │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
    ┌─────────────────────────────┼─────────────────────────────────────┐
    │                             ▼                                      │
    │               ┌─────────────────────────┐                          │
    │               │ RenderingOrchestrator   │ ←── Central Coordinator  │
    │               │      (1,156 lines)      │                          │
    │               └───────────┬─────────────┘                          │
    │                           │                                        │
    │           ┌───────────────┼───────────────────────┐               │
    │           │               │                       │               │
    │           ▼               ▼                       ▼               │
    │  ┌─────────────────┐ ┌───────────────┐ ┌──────────────────┐       │
    │  │ GPSCoordinator  │ │ DriveCoord.   │ │ SimulationCoord. │       │
    │  │   (327 lines)   │ │  (515 lines)  │ │   (215 lines)    │       │
    │  └────────┬────────┘ └───────────────┘ └──────────────────┘       │
    │           │                                                        │
    │           │         ┌───────────────┐ ┌────────────────────┐      │
    │           │         │ TrackDisplay  │ │  OnboardingCoord.  │      │
    │           │         │  Coordinator  │ │    (965 lines)     │      │
    │           │         │  (685 lines)  │ └────────────────────┘      │
    │           │         └───────────────┘                              │
    └───────────┼────────────────────────────────────────────────────────┘
                │
┌───────────────┼──────────────────────────────────────────────────────────┐
│               │              Core Services Layer                          │
│               ▼                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │     GPSService     │  │     MapService     │  │    SVGService      │  │
│  │   (Hardware/Mock)  │  │   (GPX Parsing)    │  │  (1,246 lines)     │  │
│  └─────────┬──────────┘  └────────────────────┘  └─────────┬──────────┘  │
│            │                                                │             │
│            │              ┌────────────────────┐            │             │
│            │              │   ConfigService    │            │             │
│            │              │ (JSON persistence) │            │             │
│            │              └────────────────────┘            │             │
│            │                                                │             │
│            ▼                                                ▼             │
│  ┌────────────────────┐                        ┌────────────────────┐    │
│  │   Serial Port      │                        │   E-Paper Service  │    │
│  │  /dev/ttyAMA0      │                        │ (Display Hardware) │    │
│  └────────────────────┘                        └────────────────────┘    │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │    WiFiService     │  │ DriveNavigation    │  │  TrackSimulation   │  │
│  │  (241 lines)       │  │    Service         │  │     Service        │  │
│  └─────────┬──────────┘  │  (677 lines)       │  │  (track playback)  │  │
│            │             └────────────────────┘  └────────────────────┘  │
│            ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                        WiFi Sub-Services                             │ │
│  │  ┌─────────────┐ ┌─────────────────┐ ┌──────────────┐ ┌───────────┐ │ │
│  │  │ NetworkScan │ │ConnectionManager│ │HotspotManager│ │StateMach. │ │ │
│  │  │ (137 lines) │ │   (523 lines)   │ │ (550 lines)  │ │(492 lines)│ │ │
│  │  └─────────────┘ └─────────────────┘ └──────────────┘ └───────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                             Web Layer                                     │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    IntegratedWebService (809 lines)                  │ │
│  │  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │ │
│  │  │   Express HTTP Server   │  │     Socket.IO WebSocket Server   │  │ │
│  │  │      (Port 3000)        │  │       (Real-time events)         │  │ │
│  │  └───────────┬─────────────┘  └─────────────────────────────────┬┘  │ │
│  └──────────────┼──────────────────────────────────────────────────┼───┘ │
│                 │                                                   │     │
│                 ▼                                                   │     │
│  ┌──────────────────────────────────────────────────────────────┐  │     │
│  │                  WebController (459 lines)                    │  │     │
│  │ ┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌───────────┐ │  │     │
│  │ │ GPSCtrl    │ │ TrackCtrl  │ │ DriveCtrl    │ │ ConfigCtrl│ │  │     │
│  │ │(156 lines) │ │(409 lines) │ │ (511 lines)  │ │(462 lines)│ │  │     │
│  │ └────────────┘ └────────────┘ └──────────────┘ └───────────┘ │  │     │
│  │ ┌────────────┐ ┌──────────────┐                               │  │     │
│  │ │ WiFiCtrl   │ │ SimulationCtrl│                              │  │     │
│  │ │(128 lines) │ │  (351 lines)  │                              │  │     │
│  │ └────────────┘ └──────────────┘                               │  │     │
│  └───────────────────────────────────────────────────────────────┘  │     │
│                                                                      │     │
│  ┌───────────────────────────────────────────────────────────────┐  │     │
│  │                    Input Validation Layer                      │  │     │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │  │     │
│  │  │ Zod Schemas │  │  Middleware  │  │  File Validation      │ │  │     │
│  │  │(309 lines)  │  │ (191 lines)  │  │ (Magic bytes check)   │ │  │     │
│  │  └─────────────┘  └──────────────┘  └───────────────────────┘ │  │     │
│  └───────────────────────────────────────────────────────────────┘  │     │
└─────────────────────────────────────────────────────────────────────┼─────┘
                                                                       │
                              ┌────────────────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────────┐
               │      Mobile Browser          │
               │   (index.html + app.js)      │
               │  ┌────────────────────────┐  │
               │  │   PapertrailClient     │  │
               │  │ - WebSocket events     │  │
               │  │ - REST API calls       │  │
               │  │ - UI updates           │  │
               │  └────────────────────────┘  │
               └──────────────────────────────┘
```

### Service Responsibilities

| Service | Responsibility |
|---------|----------------|
| **ServiceContainer** | Dependency injection, creates/configures all services |
| **RenderingOrchestrator** | Coordinates all services, manages lifecycle |
| **GPSCoordinator** | Manages GPS subscriptions and callbacks |
| **DriveCoordinator** | Turn-by-turn navigation display |
| **SimulationCoordinator** | Track simulation playback |
| **TrackDisplayCoordinator** | Track rendering and display updates |
| **OnboardingCoordinator** | WiFi setup and onboarding screens |
| **GPSService** | Hardware interface for GPS receiver |
| **MapService** | GPX file parsing and track management |
| **SVGService** | Renders maps and tracks to bitmap |
| **EPaperService** | E-paper display hardware interface |
| **ConfigService** | Persists configuration to JSON file |
| **WiFiService** | Network management via nmcli |
| **DriveNavigationService** | Route calculation and guidance |
| **TrackSimulationService** | Simulates GPS movement along track |

---

## GPS Update Flow

This sequence diagram shows how GPS position updates flow through the system:

```
┌──────────┐    ┌────────────┐    ┌────────────────┐    ┌─────────────────────┐
│GPS HW    │    │GPSService  │    │GPSCoordinator  │    │IntegratedWebService │
│/dev/tty  │    │            │    │                │    │                     │
└────┬─────┘    └─────┬──────┘    └───────┬────────┘    └──────────┬──────────┘
     │                │                   │                        │
     │ NMEA Sentence  │                   │                        │
     │ $GPGGA,...     │                   │                        │
     ├───────────────►│                   │                        │
     │                │                   │                        │
     │                │ parseNMEA()       │                        │
     │                │ ────────────►     │                        │
     │                │                   │                        │
     │                │ updatePosition()  │                        │
     │                │ store & notify    │                        │
     │                ├──────────────────►│                        │
     │                │                   │                        │
     │                │                   │ Filter checks:         │
     │                │                   │ - Skip if simulating   │
     │                │                   │ - Skip (0,0) during nav│
     │                │                   │                        │
     │                │                   │ Store lastGPSPosition  │
     │                │                   │                        │
     │                │                   │ Forward to:            │
     │                │                   │ - OnboardingCoordinator│
     │                │                   │ - DriveNavigationSvc   │
     │                │                   │                        │
     │                │                   │ Notify callbacks       │
     │                │                   ├───────────────────────►│
     │                │                   │                        │
     │                │                   │                        │ broadcast
     │                │                   │                        │'gps:update'
     │                │                   │                        ├──────────►
     │                │                   │                        │  WebSocket
     │                │                   │                        │  clients
```

### GPS Update Flow (Detailed)

```
1. GPS Hardware → GPSService
   ├── Serial port /dev/ttyAMA0 receives NMEA sentences
   ├── ReadlineParser extracts complete sentences
   └── processNMEASentence() parses GGA/RMC/GSA data

2. GPSService → GPSCoordinator
   ├── Calls positionCallbacks registered by GPSCoordinator
   ├── GPSCoordinator applies filtering:
   │   ├── Skips updates during simulation (avoids mixing real/simulated)
   │   └── Skips (0,0) positions during drive navigation
   └── Stores position in lastGPSPosition

3. GPSCoordinator → Downstream Services
   ├── OnboardingCoordinator (for "Select Track" screen GPS display)
   ├── DriveNavigationService (updates position for turn calculations)
   └── All registered gpsUpdateCallbacks

4. IntegratedWebService → Browser
   ├── Receives callback from orchestrator.onGPSUpdate()
   └── Broadcasts 'gps:update' event via Socket.IO to all clients

5. Browser → DOM Update
   ├── PapertrailClient receives 'gps:update' event
   └── Updates latitude/longitude display in real-time
```

### HTTP Request Path (On-Demand)

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌───────────────┐     ┌───────────┐
│ Browser │     │IntegratedWeb │     │WebController│     │Rendering      │     │GPSService │
│         │     │   Service    │     │             │     │ Orchestrator  │     │           │
└────┬────┘     └──────┬───────┘     └──────┬──────┘     └───────┬───────┘     └─────┬─────┘
     │                 │                    │                    │                   │
     │ GET /api/gps/   │                    │                    │                   │
     │    position     │                    │                    │                   │
     ├────────────────►│                    │                    │                   │
     │                 │ route to           │                    │                   │
     │                 │ getGPSPosition()   │                    │                   │
     │                 ├───────────────────►│                    │                   │
     │                 │                    │                    │                   │
     │                 │                    │getCurrentPosition()│                   │
     │                 │                    ├───────────────────►│                   │
     │                 │                    │                    │                   │
     │                 │                    │                    │getCurrentPosition()
     │                 │                    │                    ├──────────────────►│
     │                 │                    │                    │                   │
     │                 │                    │                    │◄──────────────────┤
     │                 │                    │                    │   Result<GPS>     │
     │                 │                    │◄───────────────────┤                   │
     │                 │                    │   Result<GPS>      │                   │
     │                 │◄───────────────────┤                    │                   │
     │                 │   JSON response    │                    │                   │
     │◄────────────────┤                    │                    │                   │
     │ { latitude,     │                    │                    │                   │
     │   longitude,    │                    │                    │                   │
     │   altitude }    │                    │                    │                   │
```

---

## Track Selection Flow

This sequence shows what happens when a user selects a GPX track:

```
┌─────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────┐
│ Browser │   │IntegratedWeb │   │TrackCtrl    │   │  Rendering   │   │  Map     │   │ Epaper   │
│         │   │   Service    │   │             │   │ Orchestrator │   │ Service  │   │ Service  │
└────┬────┘   └──────┬───────┘   └──────┬──────┘   └──────┬───────┘   └────┬─────┘   └────┬─────┘
     │               │                  │                 │                │              │
     │ POST /api/map/│                  │                 │                │              │
     │   set-active  │                  │                 │                │              │
     │ {path: "..."}│                  │                 │                │              │
     ├──────────────►│                  │                 │                │              │
     │               │setActiveGPX()    │                 │                │              │
     │               ├─────────────────►│                 │                │              │
     │               │                  │ setActiveGPX()  │                │              │
     │               │                  ├────────────────►│                │              │
     │               │                  │                 │                │              │
     │               │                  │                 │ Queue request  │              │
     │               │                  │                 │ (if busy)      │              │
     │               │                  │                 │                │              │
     │               │                  │                 │ getTrack()     │              │
     │               │                  │                 ├───────────────►│              │
     │               │                  │                 │                │              │
     │               │                  │                 │◄───────────────┤              │
     │               │                  │                 │  GPXTrack data │              │
     │               │                  │                 │                │              │
     │               │                  │                 │ Analyze turns  │              │
     │               │                  │                 │ (TrackTurn     │              │
     │               │                  │                 │  Analyzer)     │              │
     │               │                  │                 │                │              │
     │               │                  │                 │ SVGService     │              │
     │               │                  │                 │ renderViewport │              │
     │               │                  │                 │ ────────────►  │              │
     │               │                  │                 │                │              │
     │               │                  │                 │ display()      │              │
     │               │                  │                 ├─────────────────────────────►│
     │               │                  │                 │                │              │
     │               │                  │                 │                │              │ SPI write
     │               │                  │                 │                │              │ to display
     │               │                  │                 │                │              │
     │               │                  │◄────────────────┤                │              │
     │               │◄─────────────────┤ Result<void>    │                │              │
     │◄──────────────┤ { success: true }│                 │                │              │
     │               │                  │                 │                │              │
```

### Track Selection Flow Steps

```
1. User Action
   └── User selects GPX file from list in mobile browser

2. API Request
   ├── POST /api/map/set-active with { path: "/path/to/track.gpx" }
   └── Request validated by Zod schema

3. WebController → Orchestrator
   ├── TrackController.setActiveGPX() called
   └── Delegates to orchestrator.setActiveGPX()

4. Queue Management
   ├── ActiveGPXQueue ensures only latest request is processed
   └── If display is busy, previous request is cancelled

5. Track Loading
   ├── MapService.getTrack() parses GPX file
   ├── Extracts segments, points, metadata
   └── Returns GPXTrack structure

6. Position Determination
   ├── Check if simulation is running → use simulated position
   ├── Check if GPS has fix → use GPS position
   └── Fallback → use track start point

7. Turn Analysis (if drive mode)
   ├── TrackTurnAnalyzer scans track for turns
   ├── Calculates turn angles and directions
   └── Caches results for performance

8. Rendering
   ├── SVGService.renderViewport() generates bitmap
   │   ├── ProjectionService converts lat/lon to screen coords
   │   ├── TrackRenderer draws the track line
   │   ├── UIRenderer adds progress bar, info panels
   │   └── ManeuverRenderer adds turn icons if navigating
   └── Returns 1-bit bitmap for e-paper

9. Display Update
   ├── EpaperService.display() sends bitmap to hardware
   ├── Uses partial refresh (fast) or full refresh (clean)
   └── Hardware updates e-paper display

10. Response
    ├── Success: { success: true, data: { path, name } }
    └── Failure: { success: false, error: { code, message } }
```

---

## WiFi/Onboarding State Machine

The WiFi service uses a state machine to manage connection to the user's mobile hotspot:

```
                              ┌───────────────────────────────────────────────────┐
                              │             WiFi State Machine                     │
                              │                                                    │
                              │   Mode: DRIVING (no WebSocket clients)            │
                              │   Mode: STOPPED (WebSocket clients connected)      │
                              └───────────────────────────────────────────────────┘

                                              ┌─────────┐
                                              │  IDLE   │ ◄─── Initial state
                                              └────┬────┘
                                                   │
                         ┌─────────────────────────┼─────────────────────────┐
                         │                         │                         │
                         ▼                         ▼                         ▼
               ┌──────────────────┐      ┌────────────────┐        ┌──────────────┐
               │    SCANNING      │      │  DISCONNECTED  │        │    ERROR     │
               │ (scan networks)  │      │ (no connection)│        │              │
               └────────┬─────────┘      └────────────────┘        └──────────────┘
                        │                         ▲                        ▲
                        │                         │                        │
                        ▼                         │                        │
          ┌──────────────────────────┐            │                        │
          │   WAITING_FOR_HOTSPOT    │────────────┴────────────────────────┘
          │                          │  (hotspot not visible / timeout)
          │  Shows instruction screen│
          │  "Enable mobile hotspot" │
          └────────────┬─────────────┘
                       │
                       │ Hotspot visible + in STOPPED mode
                       ▼
              ┌─────────────────┐
              │   CONNECTING    │
              │                 │
              │ nmcli connect   │
              └────────┬────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
    ┌─────────────┐       ┌────────────────────────┐
    │  CONNECTED  │       │ RECONNECTING_FALLBACK  │
    │             │       │                        │
    │Shows URL:   │       │ Connection failed,     │
    │192.168.x.x  │       │ reverting to previous  │
    └─────────────┘       │ WiFi network           │
           │              └────────────────────────┘
           │
           │ WebSocket clients connect
           ▼
    ┌─────────────────────────────────────────┐
    │      "Select Track" Screen              │
    │                                          │
    │  Shows GPS info, waiting for user       │
    │  to select track via mobile browser     │
    └─────────────────────────────────────────┘
```

### State Descriptions

| State | Description | Next States |
|-------|-------------|-------------|
| **IDLE** | Initial state, not actively managing | SCANNING, WAITING_FOR_HOTSPOT |
| **SCANNING** | Actively scanning for networks | WAITING_FOR_HOTSPOT |
| **WAITING_FOR_HOTSPOT** | Waiting for user to enable hotspot | CONNECTING, ERROR |
| **CONNECTING** | Attempting nmcli connection | CONNECTED, RECONNECTING_FALLBACK |
| **CONNECTED** | Successfully connected to hotspot | WAITING_FOR_HOTSPOT (disconnect) |
| **RECONNECTING_FALLBACK** | Reverting to previous network | IDLE, ERROR |
| **DISCONNECTED** | No network connection | WAITING_FOR_HOTSPOT |
| **ERROR** | Error state, will retry | IDLE |

### State Transitions

```
Polling Tick (every 10 seconds):
├── If CONNECTED
│   └── Check still connected → if not, WAITING_FOR_HOTSPOT
├── If STOPPED mode (WebSocket clients)
│   ├── Check if hotspot visible
│   │   ├── Yes → CONNECTING
│   │   └── No → WAITING_FOR_HOTSPOT (show instructions)
│   └── Save fallback network before connecting
└── If DRIVING mode (no clients)
    └── Don't attempt connections (save battery/data)

WebSocket Client Events:
├── First client connects (DRIVING → STOPPED)
│   └── Trigger immediate hotspot check
└── Last client disconnects (STOPPED → DRIVING)
    └── Abort any in-progress connection, reset to IDLE
```

### Onboarding Screen Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Onboarding Screen Flow                        │
└─────────────────────────────────────────────────────────────────┘

         ┌─────────────┐
         │   Boot Up   │
         └──────┬──────┘
                │
                ▼
    ┌───────────────────────┐     Already connected
    │ Check onboarding      │────────────────────────────┐
    │ complete?             │                            │
    └───────────┬───────────┘                            │
                │ No                                     │
                ▼                                        ▼
    ┌───────────────────────┐              ┌────────────────────┐
    │  Show Logo Screen     │              │  Normal Operation  │
    │  (3 seconds)          │              │  (track display)   │
    └───────────┬───────────┘              └────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │ WAITING_FOR_HOTSPOT   │◄────────────┐
    │                       │             │
    │  ┌─────────────────┐  │             │
    │  │ E-paper shows:  │  │             │ Not connected yet
    │  │                 │  │             │
    │  │ "Enable mobile  │  │             │
    │  │  hotspot on     │  │             │
    │  │  your phone"    │  │             │
    │  │                 │  │             │
    │  │ SSID: papertrail│  │             │
    │  │ Pass: ********  │  │             │
    │  └─────────────────┘  │             │
    └───────────┬───────────┘             │
                │                         │
                │ Connection successful   │
                ▼                         │
    ┌───────────────────────┐             │
    │     CONNECTED         │             │
    │                       │             │
    │  ┌─────────────────┐  │             │
    │  │ E-paper shows:  │  │             │
    │  │                 │  │             │
    │  │ "Connected!"    │  │             │
    │  │                 │  │             │
    │  │ Open browser:   │  │             │
    │  │ 192.168.x.x:3000│  │             │
    │  └─────────────────┘  │             │
    └───────────┬───────────┘             │
                │                         │
                │ User opens browser      │
                │ (WebSocket connects)    │
                ▼                         │
    ┌───────────────────────┐             │
    │   SELECT TRACK        │             │
    │                       │             │
    │  ┌─────────────────┐  │             │
    │  │ E-paper shows:  │  │             │
    │  │                 │  │             │
    │  │ "Select a Track"│  │             │
    │  │                 │  │             │
    │  │ GPS: 51.5°N     │  │             │
    │  │ Sats: 8         │  │             │
    │  │ Fix: 3D         │  │             │
    │  └─────────────────┘  │             │
    └───────────┬───────────┘             │
                │                         │
                │ User selects track      │
                ▼                         │
    ┌───────────────────────┐             │
    │  Mark onboarding      │             │
    │  complete             │             │
    └───────────┬───────────┘             │
                │                         │
                ▼                         │
    ┌───────────────────────┐             │
    │  Show track on        │─────────────┘
    │  e-paper display      │  (Connection lost during
    └───────────────────────┘   onboarding → back to start)
```

---

## Drive Navigation Flow

When drive navigation is active, the system provides turn-by-turn guidance:

```
┌─────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐
│ Browser │  │DriveController│  │DriveCoord.   │  │DriveNavSvc   │  │SVGService│
└────┬────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘
     │              │                 │                 │                │
     │ POST /api/   │                 │                 │                │
     │ drive/start  │                 │                 │                │
     │{destination} │                 │                 │                │
     ├─────────────►│                 │                 │                │
     │              │startDrive()     │                 │                │
     │              ├────────────────►│                 │                │
     │              │                 │                 │                │
     │              │                 │startDrive()     │                │
     │              │                 ├────────────────►│                │
     │              │                 │                 │                │
     │              │                 │                 │ Calculate route│
     │              │                 │                 │ using OSRM API │
     │              │                 │                 │                │
     │              │                 │◄────────────────┤                │
     │              │                 │  DriveRoute     │                │
     │              │                 │                 │                │
     │              │                 │ Subscribe to    │                │
     │              │                 │ navigation      │                │
     │              │                 │ updates         │                │
     │              │                 │                 │                │
     │◄─────────────┤                 │                 │                │
     │ Route info   │                 │                 │                │
     │              │                 │                 │                │

                     ... GPS Position Update ...

     │              │                 │                 │                │
     │              │                 │ GPS update      │                │
     │              │                 │ received        │                │
     │              │                 │                 │                │
     │              │                 │updatePosition() │                │
     │              │                 ├────────────────►│                │
     │              │                 │                 │                │
     │              │                 │                 │ Calculate:     │
     │              │                 │                 │ - Distance to  │
     │              │                 │                 │   next turn    │
     │              │                 │                 │ - Turn type    │
     │              │                 │                 │ - ETA          │
     │              │                 │                 │                │
     │              │                 │◄────────────────┤                │
     │              │                 │NavigationUpdate │                │
     │              │                 │                 │                │
     │              │                 │ renderDrive     │                │
     │              │                 │ Maneuver()      │                │
     │              │                 ├─────────────────────────────────►│
     │              │                 │                 │                │
     │              │                 │                 │                │ Draw turn
     │              │                 │                 │                │ icon and
     │              │                 │                 │                │ distance
     │              │                 │                 │                │
     │              │                 │◄────────────────────────────────┤│
     │              │                 │ Bitmap          │                │
     │              │                 │                 │                │
     │              │                 │ Update e-paper  │                │
     │              │                 │ display         │                │
```

### Drive Navigation Update Types

```
NavigationUpdate:
├── currentStep: Current instruction being followed
├── nextStep: Upcoming instruction (for preview)
├── distanceToNextStep: Meters to next maneuver
├── totalDistanceRemaining: Meters to destination
├── estimatedTimeRemaining: Seconds to arrival
├── currentSpeed: Current GPS speed
└── offRoute: Boolean if user deviated from route

ManeuverTypes:
├── TURN_LEFT / TURN_RIGHT
├── TURN_SLIGHT_LEFT / TURN_SLIGHT_RIGHT
├── TURN_SHARP_LEFT / TURN_SHARP_RIGHT
├── CONTINUE_STRAIGHT
├── ROUNDABOUT (with exit number)
├── UTURN_LEFT / UTURN_RIGHT
├── ARRIVE_DESTINATION
└── DEPART
```

---

## Related Files

### Orchestrator Layer
- `src/services/orchestrator/RenderingOrchestrator.ts` (1,156 lines)
- `src/services/orchestrator/GPSCoordinator.ts` (327 lines)
- `src/services/orchestrator/DriveCoordinator.ts` (515 lines)
- `src/services/orchestrator/SimulationCoordinator.ts` (215 lines)
- `src/services/orchestrator/TrackDisplayCoordinator.ts` (685 lines)
- `src/services/orchestrator/OnboardingCoordinator.ts` (965 lines)
- `src/services/orchestrator/DisplayUpdateQueue.ts` (272 lines)

### Core Services
- `src/services/gps/GPSService.ts` - GPS hardware interface
- `src/services/map/MapService.ts` - GPX file management
- `src/services/svg/SVGService.ts` (1,246 lines) - Map rendering
- `src/services/epaper/EPaperService.ts` - E-paper display
- `src/services/config/ConfigService.ts` - Configuration persistence
- `src/services/wifi/WiFiService.ts` (241 lines) - WiFi facade

### WiFi Sub-Services
- `src/services/wifi/NetworkScanner.ts` (137 lines)
- `src/services/wifi/ConnectionManager.ts` (523 lines)
- `src/services/wifi/HotspotManager.ts` (550 lines)
- `src/services/wifi/WiFiStateMachine.ts` (492 lines)

### Web Layer
- `src/web/IntegratedWebService.ts` (809 lines)
- `src/web/controllers/WebController.ts` (459 lines)
- `src/web/controllers/*.ts` - Sub-controllers

### Types and Interfaces
- `src/core/types/WiFiTypes.ts` - WiFiState enum
- `src/core/interfaces/*.ts` - Service interfaces

---

## Display Abstraction Layer

The display system is decoupled from specific hardware implementations through a layered abstraction. This allows support for different display types (e-paper brands, LCD, HDMI framebuffer) without changing the core application logic.

### Interface Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Display Interface Hierarchy                          │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌─────────────────────┐
                        │   IDisplayService   │ ◄── Generic display interface
                        │                     │     (all display types)
                        │  - initialize()     │
                        │  - displayBitmap()  │
                        │  - clear()          │
                        │  - getStatus()      │
                        │  - isBusy()         │
                        │  - dispose()        │
                        └──────────┬──────────┘
                                   │ extends
                                   ▼
                        ┌─────────────────────┐
                        │   IEpaperService    │ ◄── E-paper specific interface
                        │                     │
                        │  + sleep()          │     (adds power management)
                        │  + wake()           │
                        │  + fullRefresh()    │
                        │  + reset()          │
                        └─────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                          Driver Interface Hierarchy                          │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌─────────────────────┐
                        │   IDisplayDriver    │ ◄── Generic driver interface
                        │                     │
                        │  - init()           │
                        │  - display()        │
                        │  - clear()          │
                        │  - reset()          │
                        │  - capabilities     │
                        └──────────┬──────────┘
                                   │ extends
                                   ▼
                        ┌─────────────────────┐
                        │   IEpaperDriver     │ ◄── E-paper specific driver
                        │                     │
                        │  + displayWithMode()│     (partial/full refresh)
                        │  + sleep()          │
                        │  + wake()           │
                        └─────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                         Adapter Interface Hierarchy                          │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌─────────────────────┐
                        │  IDisplayAdapter    │ ◄── Base adapter interface
                        │                     │
                        │  - init()           │
                        │  - dispose()        │
                        │  - delay()          │
                        └─────────────────────┘

                        ┌─────────────────────┐
                        │  IHardwareAdapter   │ ◄── SPI/GPIO adapter
                        │  (ISPIAdapter)      │     (for e-paper displays)
                        │                     │
                        │  - gpioWrite()      │
                        │  - gpioRead()       │
                        │  - spiWrite()       │
                        │  - sendCommand()    │
                        │  - sendData()       │
                        └─────────────────────┘
```

### Display Types

The `DisplayType` enum identifies the type of display at runtime:

```typescript
enum DisplayType {
  EPAPER = "epaper",  // E-paper displays (Waveshare, Good Display, etc.)
  LCD = "lcd",        // LCD screens (SPI, I2C, parallel)
  HDMI = "hdmi",      // HDMI framebuffer displays
  MOCK = "mock",      // Mock display for testing/development
}
```

### Color Depth Support

The system supports various color depths for different display technologies:

| Color Depth | Description | Use Case |
|-------------|-------------|----------|
| `1bit` | Black/white only | E-paper displays |
| `4bit-grayscale` | 16 shades of gray | E-paper with grayscale |
| `3color-bwr` | Black/white/red | 3-color e-paper |
| `3color-bwy` | Black/white/yellow | 3-color e-paper |
| `8bit-grayscale` | 256 shades of gray | LCD displays |
| `rgb565` | 16-bit color (65K colors) | LCD displays |
| `rgb888` | 24-bit color (16M colors) | HDMI/high-end LCD |
| `rgba8888` | 32-bit with alpha | Compositing |

### Type Guards

Use the `isEpaperService()` type guard to check for e-paper specific features:

```typescript
import { IDisplayService, isEpaperService } from "@core/interfaces";

async function sleepDisplay(displayService: IDisplayService): Promise<void> {
  if (isEpaperService(displayService)) {
    await displayService.sleep();  // E-paper specific
  }
  // No-op for LCD/HDMI displays
}
```

### Implementation Classes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         E-Paper Implementation Stack                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────┐
    │   EPaperService    │ ◄── Service layer (implements IEpaperService)
    │                    │
    │  Manages lifecycle,│
    │  update modes,     │
    │  status tracking   │
    └─────────┬──────────┘
              │ uses
              ▼
    ┌────────────────────┐     ┌────────────────────────┐
    │  BaseEpaperDriver  │────►│ Waveshare7in5BWDriver  │ ◄── Concrete driver
    │                    │     │                        │
    │  Common e-paper    │     │  Waveshare-specific    │
    │  functionality     │     │  command sequences     │
    └─────────┬──────────┘     └────────────────────────┘
              │ extends
              ▼
    ┌────────────────────┐
    │  BaseDisplayDriver │ ◄── Generic display driver base
    │                    │
    │  Buffer management │
    │  Dimension handling│
    └────────────────────┘


    ┌────────────────────┐
    │  GPIOSPIAdapter    │ ◄── Hardware adapter
    │                    │
    │  GPIO pin control  │
    │  SPI communication │
    └────────────────────┘
```

### Adding a New Display Type

To add support for a new display type (e.g., LCD via framebuffer):

1. **Create Adapter** (if needed):
   ```
   src/services/display/adapters/FramebufferAdapter.ts
   ```
   Implements `IDisplayAdapter` for `/dev/fb0` operations.

2. **Create Driver**:
   ```
   src/services/display/drivers/FramebufferDriver.ts
   ```
   Implements `IDisplayDriver` (not `IEpaperDriver` - no sleep/wake needed).

3. **Create Service**:
   ```
   src/services/display/LCDDisplayService.ts
   ```
   Implements `IDisplayService` (not `IEpaperService`).

4. **Register in ServiceContainer**:
   ```typescript
   this.registerDisplayDriver("rpi_lcd", (config) => new FramebufferDriver());
   ```

5. **Configure via Environment**:
   ```bash
   DISPLAY_TYPE=lcd
   DISPLAY_DRIVER=rpi_lcd
   ```

### Display Abstraction Files

| File | Purpose |
|------|---------|
| `src/core/interfaces/IDisplayService.ts` | Generic display service interface + `isEpaperService` type guard |
| `src/core/interfaces/IEpaperService.ts` | E-paper specific service interface (extends IDisplayService) |
| `src/core/interfaces/IDisplayDriver.ts` | Generic display driver interface |
| `src/core/interfaces/IEpaperDriver.ts` | E-paper specific driver interface |
| `src/core/interfaces/IDisplayAdapter.ts` | Base adapter interface |
| `src/core/interfaces/IHardwareAdapter.ts` | SPI/GPIO adapter interface (ISPIAdapter alias) |
| `src/core/types/DisplayTypes.ts` | DisplayType enum, DisplayStatus, ColorDepth |
| `src/services/epaper/drivers/BaseDisplayDriver.ts` | Base class for all display drivers |
| `src/services/epaper/drivers/BaseEpaperDriver.ts` | Base class for e-paper drivers |
| `src/services/epaper/drivers/Waveshare7in5BWDriver.ts` | Waveshare 7.5" B&W driver |
| `src/services/epaper/EPaperService.ts` | E-paper service implementation |
| `src/services/epaper/MockEpaperService.ts` | Mock service for development |

### ServiceContainer Methods

```typescript
// Get generic display service (works with any display type)
const displayService: IDisplayService = container.getDisplayService();

// Get e-paper specific service (has sleep/wake/fullRefresh)
const epaperService: IEpaperService = container.getEpaperService();
```

### Backwards Compatibility

The refactoring maintains full backwards compatibility:

- `IEpaperService` remains valid and extends `IDisplayService`
- `EpaperStatus` is a deprecated alias for `DisplayStatus`
- `IHardwareAdapter` has `ISPIAdapter` alias
- `getEpaperService()` is preserved in ServiceContainer
- All existing consumer code continues to work
