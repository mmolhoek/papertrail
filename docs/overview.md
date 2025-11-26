# System overview for Papertrail

Let me walk you through the complete flow from the moment someone opens the web interface.

## Complete Flow: Web Interface → GPS Data

### Phase 1: Initial Page Load

1. User opens browser
   → <http://192.168.1.100:3000>

2. Express serves static files
   IntegratedWebService (src/web/IntegratedWebService.ts:setupMiddleware)
   ↓
   this.app.use(express.static(this.config.staticDirectory))
   ↓
   Serves: /src/web/public/index.html
   /src/web/public/css/styles.css
   /src/web/public/js/app.js

### Phase 2: Client-Side Initialization

```js
// File: src/web/public/js/app.js

// When DOM loads, create PapertrailClient instance
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PapertrailClient();
    // ↓ calls init()
});

constructor() {
    this.init();
}

init() {
    // 1. Initialize WebSocket connection
    this.initWebSocket();

    // 2. Setup UI event listeners (buttons, etc.)
    this.setupEventListeners();

    // 3. Load initial data via HTTP
    this.loadInitialData();
}
```

### Phase 3: WebSocket Connection Established

```js
// File: src/web/public/js/app.js

initWebSocket() {
    this.socket = io(); // Connects to Socket.IO server

    this.socket.on('connect', () => {
        console.log('Connected to server');
        this.updateConnectionStatus(true); // Green indicator

        // Subscribe to GPS updates
        this.socket.emit('gps:subscribe');
    });
}
```

On the server side:

```ts
// File: src/web/IntegratedWebService.ts

private setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
        console.log('Client connected:', socket.id);

        socket.on('gps:subscribe', () => {
            console.log('Client subscribed to GPS updates:', socket.id);
            // Client is now listening for broadcasts
        });
    });
}
```

### Phase 4: Initial Data Load (HTTP Requests)

```js
// File: src/web/public/js/app.js

async loadInitialData() {
    // Request 1: Get GPS position
    const position = await this.fetchJSON('/api/gps/position');
    this.updateGPSPosition(position);

    // Request 2: Get system status
    const status = await this.fetchJSON('/api/system/status');
    this.updateSystemStatus(status);

    // Request 3: Get available tracks
    const tracks = await this.fetchJSON('/api/map/files');
    this.populateTrackList(tracks);
}
```

Now let's trace the /api/gps/position request in detail:

### Step 1: HTTP Request Sent

```js
// Client: src/web/public/js/app.js
const position = await fetch("/api/gps/position");
```

### Step 2: Express Router Receives Request

```ts
// Server: src/web/IntegratedWebService.ts (setupRoutes method)

this.app.get(`${api}/gps/position`, (req, res) =>
  this.controller.getGPSPosition(req, res),
);

// Routes to WebController
```

### Step 3: WebController Handles Requests

```ts
// File: src/web/WebController.ts

async getGPSPosition(req: Request, res: Response): Promise<void> {
    // Call orchestrator (the brain of the system)
    const result = await this.orchestrator.getCurrentPosition();
    //                    ↑
    //                    Orchestrator coordinates all services

    if (isSuccess(result)) {
        // Send GPS data back to client
        res.json({
            success: true,
            data: {
                latitude: result.data.latitude,
                longitude: result.data.longitude,
                altitude: result.data.altitude,
                timestamp: result.data.timestamp,
            },
        });
    } else {
        // Send error back to client
        res.status(500).json({
            success: false,
            error: {
                code: result.error.code,
                message: result.error.getUserMessage(),
            },
        });
    }
}
```

### Step 4: Orchestrator Gets GPS Data

```ts
// File: src/services/orchestrator/RenderingOrchestrator.ts
// (This will be implemented, but here's how it works)

async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    // Orchestrator delegates to GPS Service
    return await this.gpsService.getCurrentPosition();
    //                            ↑
    //                            GPS Service does the actual hardware work
}
```

### Step 5: GPS Service Reads Hardware

```ts
// File: src/services/gps/GPSService.ts

async getCurrentPosition(): Promise<Result<GPSCoordinate>> {
    if (!this.isInitialized) {
        return failure(GPSError.deviceNotFound(...));
    }

    if (!this.currentPosition) {
        return failure(GPSError.noFix(...));
    }

    // Return the latest GPS reading from hardware
    return success(this.currentPosition);
    //              ↑
    //              This was read from /dev/ttyAMA0 and parsed from NMEA
}
```

How did this.currentPosition get set?

```ts
// GPS Service continuously reads from serial port

private setupDataListener(): void {
    this.parser.on('data', (line: string) => {
        this.processNMEASentence(line.trim());
        //  ↑
        //  Parses NMEA sentence like:
        //  $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
    });
}

private processNMEASentence(sentence: string): void {
    if (sentence.startsWith('$GPGGA') || sentence.startsWith('$GNGGA')) {
        // Parse GGA sentence → extract lat/lon/altitude
        const position = parseGGA(sentence);

        // Update internal state
        this.updatePosition(position);
    }
}

private updatePosition(position: GPSCoordinate): void {
    this.currentPosition = position;  // ← Stored here!

    // Notify all subscribers (including WebSocket broadcasts)
    this.positionCallbacks.forEach(callback => {
        callback(position);
    });
}
```

### Step 6: Response Travels Back

```txt
GPSService.currentPosition
    ↓ (returns)
Orchestrator.getCurrentPosition()
    ↓ (returns)
WebController.getGPSPosition()
    ↓ (sends HTTP response)
Express
    ↓ (HTTP)
Client's fetch()
    ↓ (JSON parsed)
updateGPSPosition() method
    ↓ (updates DOM)
Browser displays: "51.5074° N, -0.1278° W"
```

## Real-Time Updates (WebSocket Flow)

### Setup: Orchestrator Monitors GPS

```ts
// File: src/web/IntegratedWebService.ts

private subscribeToOrchestratorEvents(): void {
    // When orchestrator detects GPS update, broadcast to all clients

    // Note: This callback would be set up when orchestrator is implemented
    // The orchestrator would call this whenever GPS position changes

    // Example of how it would work:
    // this.orchestrator.onGPSUpdate((position) => {
    //     this.broadcast('gps:update', position);
    // });
}
```

### GPS Service Continuously Updates

```ts
// File: src/services/gps/GPSService.ts

// Serial port is constantly receiving data from GPS hardware:
// /dev/ttyAMA0 → SerialPort → ReadlineParser → processNMEASentence()

private processNMEASentence(sentence: string): void {
    // Every time a new GPS sentence arrives (every 1 second typically)
    const position = parseNMEA(sentence);

    this.currentPosition = position;

    // Notify all callbacks
    this.positionCallbacks.forEach(callback => {
        callback(position);  // ← This triggers WebSocket broadcast!
    });
}
```

### Orchestrator Subscribes to GPS updates

```ts
// File: src/services/orchestrator/RenderingOrchestrator.ts
// (Will be implemented like this)

constructor(private gpsService: IGPSService, ...) {
    // Subscribe to GPS position updates
    this.gpsService.onPositionUpdate((position) => {
        // Store latest position
        this.latestPosition = position;

        // Trigger any registered callbacks (web interface listens here)
        this.notifyGPSUpdate(position);
    });
}
```

### Web Service Broadcasts to clients

```ts
// File: src/web/IntegratedWebService.ts

private subscribeToOrchestratorEvents(): void {
    // When orchestrator gets new GPS data
    this.gpsUpdateUnsubscribe = this.orchestrator.onGPSUpdate((position) => {
        // Broadcast to ALL connected WebSocket clients
        this.broadcast('gps:update', {
            latitude: position.latitude,
            longitude: position.longitude,
            altitude: position.altitude,
            timestamp: position.timestamp,
        });
    });
}
```

### Client Receives Updates

```js
// File: src/web/public/js/app.js

initWebSocket() {
    this.socket = io();

    // Listen for GPS updates from server
    this.socket.on('gps:update', (data) => {
        this.updateGPSPosition(data);
        //  ↓
        //  Updates the DOM immediately!
    });
}

updateGPSPosition(data) {
    // Update the displayed coordinates in real-time
    document.getElementById('latitude').textContent =
        data.latitude.toFixed(6) + '°';
    document.getElementById('longitude').textContent =
        data.longitude.toFixed(6) + '°';
    document.getElementById('altitude').textContent =
        data.altitude ? data.altitude.toFixed(1) + ' m' : '--';
}
```

## Complete Data Flow Diagram

### Diagram: From Browser to GPS Hardware and Back

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  index.html → loads → app.js → creates PapertrailClient     │
└────────┬──────────────────────────────────────────┬─────────┘
         │ HTTP GET                                 │ WebSocket
         │ /api/gps/position                        │ 'gps:update'
         │                                          │
         ▼                                          ▼
┌────────────────────────────────────────────────────────────┐
│              IntegratedWebService (Port 3000)              │
│  ┌────────────────────┐         ┌──────────────────────┐   │
│  │ Express HTTP       │         │ Socket.IO WebSocket  │   │
│  │ Routes → Controller│         │ Broadcasts events    │   │
│  └─────────┬──────────┘         └──────────▲───────────┘   │
└────────────┼───────────────────────────────┼───────────────┘
             │                               │
             │ calls method                  │ subscribes to
             ▼                               │
┌─────────────────────────────────────────────────────────────┐
│                    WebController                            │
│  Maps HTTP requests to Orchestrator method calls            │
│  getGPSPosition() → orchestrator.getCurrentPosition()       │
└────────────┬────────────────────────────────────────────────┘
             │
             │ delegates to
             ▼
┌─────────────────────────────────────────────────────────────┐
│              RenderingOrchestrator                          │
│  • Coordinates all services                                 │
│  • Subscribes to GPS updates via onPositionUpdate()         │
│  • getCurrentPosition() → gpsService.getCurrentPosition()   │
│  • Broadcasts updates to web service                        │
└────────────┬────────────────────────────────────────────────┘
             │
             │ uses
             ▼
┌─────────────────────────────────────────────────────────────┐
│                     GPSService                              │
│  • Reads from /dev/ttyAMA0 (GPS hardware)                   │
│  • Parses NMEA sentences                                    │
│  • Stores currentPosition                                   │
│  • Calls position callbacks when new data arrives           │
│                                                             │
│  SerialPort → Parser → processNMEASentence() → updatePosition()
│                                    ↓                        │
│                        this.currentPosition = {...}         │
│                                    ↓                        │
│                        this.positionCallbacks.forEach(...)  │
└─────────────────────────────────────────────────────────────┘
             ▲
             │ reads from
             │
      ┌──────┴───────┐
      │ /dev/ttyAMA0 │ ← GPS Hardware
      └──────────────┘
```

### Summary: Two Parallel Paths

**Path 1: HTTP Request (On-Demand)**

```
User clicks button/page loads
→ HTTP GET /api/gps/position
→ Express routes to WebController.getGPSPosition()
→ WebController calls orchestrator.getCurrentPosition()
→ Orchestrator calls gpsService.getCurrentPosition()
→ GPS Service returns cached currentPosition
→ Response flows back through the stack
→ Client updates UI
```

**Path 2: WebSocket Push (Real-Time)**

```
GPS Hardware sends NMEA data continuously
→ GPS Service parses and updates currentPosition
→ GPS Service calls positionCallbacks
→ Orchestrator receives callback
→ Orchestrator triggers its own callbacks
→ IntegratedWebService receives callback
→ IntegratedWebService broadcasts via Socket.IO
→ ALL connected clients receive 'gps:update' event
→ Client updates UI automatically
```
