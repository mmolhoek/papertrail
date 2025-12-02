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
├── scripts/
│   ├── install.sh         # One-time installation script
│   ├── start.sh           # Development start script
│   └── stop.sh            # Stop script (dev and production)
├── config/
│   ├── 50-gps.rules                 # Udev rules for GPS serial port
│   ├── logrotate                    # Logrotate configuration
│   ├── papertrail-sudoers           # Sudoers for nmcli
│   └── papertrail.service.example   # Systemd service template
├── data/                  # Runtime data
│   ├── gpx-files/         # GPX tracks
│   └── cache/             # Cached data
└── logs/                  # Application logs
```

## Installation

### First-Time Setup

Deploy to your Raspberry Pi and run the install script:

```bash
# On your Pi
cd ~
git clone <your-repo> papertrail
cd papertrail
./scripts/install.sh
```

The install script automatically:
- Installs system packages (nodejs, npm, screen, build-essential, gpiod)
- Sets up GPS udev rules for serial port permissions
- Disables getty on ttyAMA0 (frees serial port for GPS)
- Configures SPI buffer size for e-paper display (requires reboot)
- Adds user to dialout group for serial port access
- Sets up sudoers for WiFi management (nmcli)
- Creates log file at `/var/log/papertrail.log`
- Configures logrotate
- Creates `.env` from `.env.example`
- Installs npm dependencies
- Builds the project
- Installs the systemd service

**Note:** If the SPI buffer size is configured for the first time, a reboot is required before the e-paper display will work correctly.

### Enable Auto-Start on Boot

```bash
sudo systemctl enable papertrail
```

## Running the Application

### Production Mode (Recommended)

Use systemd to manage the service:

```bash
sudo systemctl start papertrail     # Start
sudo systemctl stop papertrail      # Stop
sudo systemctl restart papertrail   # Restart
sudo systemctl status papertrail    # Check status
```

View logs:

```bash
tail -f /var/log/papertrail.log     # Application logs
sudo journalctl -u papertrail -f    # Systemd logs
```

### Development Mode

For active development with auto-reload:

```bash
npm run dev
```

Or use the development script (builds and runs in a screen session):

```bash
./scripts/start.sh
```

Useful commands for development:

```bash
screen -r papertrail                # Attach to screen session
./scripts/stop.sh                   # Stop (works for both screen and systemd)
```

### Deploying Updates

After making changes on your development machine:

```bash
# From your dev machine
rsync -av --exclude node_modules --exclude dist . pi@your-pi:~/papertrail/

# On the Pi
cd ~/papertrail
npm run build
sudo systemctl restart papertrail
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
- Check app logs: `tail -50 /var/log/papertrail.log`
- Re-run install script: `./scripts/install.sh`
- Ensure user has permissions for GPIO/SPI

## License

MIT

## Contributing

Contributions welcome! Please ensure tests pass before submitting PRs.

```bash
npm test
npm run lint
```
