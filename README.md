# Papertrail GPS Tracker

A GPS tracker with e-paper display for Raspberry Pi 5, featuring a mobile web interface for control.

## Features

- 📍 Real-time GPS tracking
- 🗺️ GPX track visualization
- 📱 Mobile-responsive web interface
- 🖥️ E-paper display output
- 🔄 Auto-update display
- ⚙️ Configurable zoom and display options
- 🔌 WebSocket support for live updates

## Hardware Requirements

- Raspberry Pi 5
- GPS module connected to `/dev/ttyAMA0`
- E-paper display (800x480) connected via SPI
- WiFi adapter (for access point mode)

## Project Structure

```
papertrail/
├── src/
│   ├── core/              # Core types, interfaces, and errors
│   ├── services/          # Service implementations
│   ├── di/                # Dependency injection container
│   ├── web/               # Web interface
│   │   ├── public/        # Static web files
│   │   └── ...
│   └── index.ts           # Main entry point
├── data/                  # Runtime data
│   ├── gpx-files/         # GPX tracks
│   └── cache/             # Cached data
├── logs/                  # Application logs
└── config/                # Configuration files
```

## Installation

### 1. Clone and Setup

```bash
cd ~
git clone <your-repo> papertrail
cd papertrail
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
vi/nano .env  # Edit configuration as needed
```

### 4. Build

```bash
npm run build
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

Use the startup script:
This will start the code in a screen session
And writes logs to /var/log/papertrail.log
Which you can follow with `tail -f /var/log/papertrail.log`

```bash
chmod +x ./scripts/st*
# start the service in a background screen session
# will stop the service first if running
./scripts/start.sh
# stop the service manually if running
./scripts/stop.sh
```

## Running as a System Service WIP (not used yet)

To run Papertrail automatically on boot:

### 1. Install Service

```bash
sudo cp papertrail.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 2. Enable and Start

```bash
sudo systemctl enable papertrail
sudo systemctl start papertrail
```

### 3. Check Status

```bash
sudo systemctl status papertrail
```

### 4. View Logs

```bash
sudo journalctl -u papertrail -f
```

### 5. Stop Service

```bash
sudo systemctl stop papertrail
```

## Web Interface

Once running, access the control panel from your mobile device:

```
http://your-pi-ip:3000
```

Default port is 3000 (configurable via `WEB_PORT` environment variable).

## How a request flows through the system

```diagram

┌─────────────────────────────────────────────┐
│ Mobile Web Browser                          │
│ (<http://your-pi-ip:3000>)                  │
└─────────────┬───────────────────────────────┘
              │ HTTP/WebSocket
              ▼
┌─────────────────────────────────────────────┐
│ IntegratedWebService                        │
│ (coordinates all requests)                  │
│ ├─ Express HTTP Server                      │
│ ├─ Socket.IO WebSocket                      │
│ └─ WebController                            │
└─────────────┬───────────────────────────────┘
              │ Method calls
              ▼
┌─────────────────────────────────────────────┐
│ RenderingOrchestrator                       │
│ (coordinates all services)                  │
└───┬──────┬──────┬──────┬──────┬─────────────┘
    │      │      │      │      │
    ▼      ▼      ▼      ▼      ▼
   GPS    Map    SVG   Epaper Config (services)
    │      │      │      │      │
    ▼      ▼      ▼      ▼      ▼
Hardware Files Canvas Display State

```

## API Endpoints

### GPS

- `GET /api/gps/position` - Get current GPS position
- `GET /api/gps/status` - Get GPS status

### Map

- `GET /api/map/files` - List available GPX files
- `GET /api/map/active` - Get active track
- `POST /api/map/active` - Set active track

### Display

- `POST /api/display/update` - Refresh display
- `POST /api/display/clear` - Clear display

### System

- `GET /api/system/status` - Get system status
- `POST /api/config/zoom` - Set zoom level
- `POST /api/config/auto-center` - Toggle auto-center
- `POST /api/auto-update/start` - Start auto-update
- `POST /api/auto-update/stop` - Stop auto-update

## WebSocket Events

### Client → Server

- `gps:subscribe` - Subscribe to GPS updates
- `display:refresh` - Request display refresh
- `ping` - Keep-alive ping

### Server → Client

- `gps:update` - GPS position update
- `status:update` - System status update
- `display:updated` - Display updated notification
- `error` - Error notification
- `pong` - Keep-alive response

## Development

### Run Tests

```bash
npm test
```

### Watch Tests

```bash
npm run test:watch
```

### Test Coverage

```bash
npm run test:coverage
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Format

```bash
npm run format
```

## Configuration

Configuration is done via environment variables in `.env`:

### GPS Settings

- `GPS_DEVICE_PATH` - Serial device path (default: `/dev/ttyAMA0`)
- `GPS_BAUD_RATE` - Baud rate (default: `9600`)
- `GPS_UPDATE_INTERVAL` - Update interval in ms (default: `1000`)

### Display Settings

- `EPAPER_WIDTH` - Display width (default: `800`)
- `EPAPER_HEIGHT` - Display height (default: `480`)
- `EPAPER_SPI_DEVICE` - SPI device path (default: `/dev/spidev0.0`)

### Web Settings

- `WEB_PORT` - HTTP server port (default: `3000`)
- `WEB_HOST` - HTTP server host (default: `0.0.0.0`)
- `WEB_CORS` - Enable CORS (default: `true`)

See `.env.example` for all available options.

## Adding GPX Files

Place GPX files in the `data/gpx-files/` directory. They will be automatically available in the web interface.

```bash
cp my-track.gpx ~/papertrail/data/gpx-files/
```

## Troubleshooting

### GPS Not Working

- Check device permissions: `sudo chmod 666 /dev/ttyAMA0`
- Verify GPS is connected: `ls -l /dev/ttyAMA0`
- Check UART is enabled in `raspi-config`

### Display Not Working

- Verify SPI is enabled: `lsmod | grep spi`
- Check GPIO pins are correct
- Ensure proper power supply to display

### Web Interface Not Accessible

- Check firewall settings
- Verify port is not in use: `sudo netstat -tulpn | grep 3000`
- Check WiFi access point is configured correctly

### Service Won't Start

- Check logs: `sudo journalctl -u papertrail -n 50`
- Verify paths in `papertrail.service` match your installation
- Ensure user has permissions for GPIO/SPI

## License

MIT

## Contributing

Contributions welcome! Please ensure tests pass before submitting PRs.

```bash
npm test
npm run lint
```
