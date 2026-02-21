# Papertrail GPS Tracker

A GPS tracker with e-paper display for Raspberry Pi 5, featuring a mobile web interface for control.

> **[Read the story of how this project was built](article.md)** — 90,000 lines of TypeScript, built with Claude Code on a phone in your pocket.

## Features

- Real-time GPS tracking
- GPX track visualization on 800x480 e-paper display
- Turn-by-turn navigation with offline route calculation
- Mobile-responsive web interface via WebSocket
- WiFi management with mobile hotspot pairing
- Track simulation for testing and demos

## Quick Start

```bash
# Clone and install
git clone <your-repo> papertrail
cd papertrail
./scripts/install.sh

# Run
sudo systemctl start papertrail

# Access web interface
open http://your-pi-ip:3000
```

## Documentation

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/installation.md) | Hardware requirements, setup, running, troubleshooting |
| [Configuration](docs/configuration.md) | Environment variables, security, CORS |
| [Developer Guide](docs/developer-guide.md) | Architecture, services, testing, adding features |
| [Architecture](docs/architecture.md) | System diagrams and data flows |

## Common Commands

```bash
# Production
sudo systemctl start papertrail
sudo systemctl stop papertrail
sudo systemctl status papertrail
tail -f /var/log/papertrail.log

# Development
npm run dev              # Dev mode with auto-reload
npm test                 # Run tests
npm run build            # Build for production
```

## API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /api/gps/position` | Current GPS position |
| `GET /api/gps/status` | GPS status and satellites |
| `GET /api/map/files` | List available GPX tracks |
| `POST /api/map/active` | Set active track |
| `POST /api/display/update` | Refresh display |
| `GET /api/system/status` | System status |

WebSocket events: `gps:update`, `display:updated`, `drive:update`, `wifi:state`

See [Developer Guide](docs/developer-guide.md) for complete API documentation.

## License

MIT

## Contributing

Contributions welcome! Please ensure tests pass before submitting PRs.

```bash
npm test
npm run lint
```
