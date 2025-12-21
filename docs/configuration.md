# Configuration

Configuration is done via environment variables in `.env`. See `.env.example` for all available options.

## Environment Variables

### GPS Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `GPS_DEVICE_PATH` | `/dev/ttyAMA0` | Serial device path |
| `GPS_BAUD_RATE` | `9600` | Baud rate |
| `GPS_UPDATE_INTERVAL` | `1000` | Update interval (ms) |
| `GPS_DEBOUNCE_MS` | `500` | Update throttling |
| `GPS_DISTANCE_THRESHOLD_METERS` | `2` | Movement threshold |
| `USE_MOCK_GPS` | `false` | Use mock GPS for development |

### E-Paper Display

| Variable | Default | Description |
|----------|---------|-------------|
| `EPAPER_WIDTH` | `800` | Display width in pixels |
| `EPAPER_HEIGHT` | `480` | Display height in pixels |
| `EPAPER_SPI_DEVICE` | `/dev/spidev0.0` | SPI device path |
| `EPAPER_DRIVER` | `waveshare_7in5_bw` | Display driver |
| `EPAPER_ROTATION` | `0` | Rotation (0/90/180/270) |
| `USE_MOCK_EPAPER` | `false` | Use mock display for development |

### Web Server

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3000` | HTTP server port |
| `WEB_HOST` | `0.0.0.0` | Bind address |
| `WEB_AUTH_ENABLED` | `false` | Enable authentication |
| `WEB_AUTH_PASSWORD` | (generated) | Web interface password |
| `WEB_CORS` | `true` | Enable CORS |
| `WEB_CORS_ORIGINS` | `*` | Allowed origins (comma-separated) |

### WiFi

| Variable | Default | Description |
|----------|---------|-------------|
| `WIFI_ENABLED` | `true` | Enable WiFi management |
| `WIFI_PRIMARY_SSID` | `Papertrail-Setup` | Access point SSID |
| `WIFI_PRIMARY_PASSWORD` | (generated) | Access point password |
| `WIFI_SCAN_INTERVAL_MS` | `5000` | Network scan interval |

### GPX Files

| Variable | Default | Description |
|----------|---------|-------------|
| `GPX_DIRECTORY` | `data/gpx-files` | GPX files location |
| `GPX_MAX_FILE_SIZE` | `50MB` | Maximum file size |
| `GPX_ENABLE_CACHE` | `true` | Enable caching |

---

## Security

### Credential Management

Papertrail automatically generates secure random passwords at startup if none are configured. Generated passwords are displayed in the startup logs and on the e-paper onboarding screen.

**For production use, set permanent passwords in your `.env` file:**

```bash
# WiFi Access Point password (for device setup mode)
WIFI_PRIMARY_PASSWORD=your-secure-wifi-password

# Web interface authentication (only used when WEB_AUTH_ENABLED=true)
WEB_AUTH_ENABLED=true
WEB_AUTH_PASSWORD=your-secure-web-password
```

### Security Warnings

At startup, Papertrail will display warnings if:
- Passwords were auto-generated (temporary, will change on restart)
- Known insecure default passwords are detected

### Network Exposure

By default, the web interface binds to `0.0.0.0:3000`, making it accessible from any device on the network. This is intentional for local device use (e.g., controlling from a mobile phone).

**If exposing Papertrail to untrusted networks:**
1. Enable web authentication: `WEB_AUTH_ENABLED=true`
2. Set a strong password: `WEB_AUTH_PASSWORD=...`
3. Consider using a reverse proxy with HTTPS
4. Use firewall rules to restrict access

---

## CORS Configuration

CORS (Cross-Origin Resource Sharing) is enabled by default with `origin: "*"` to allow the mobile web interface to work from any device on the local network.

**Why allow all origins by default?**

Papertrail is designed for local network use where:
- The device creates a WiFi access point for initial setup
- Users connect from various mobile devices with unpredictable IP addresses
- The web interface needs to work immediately without configuration

**For restricted environments:**

1. **Disable CORS entirely** (only same-origin requests allowed):
   ```bash
   WEB_CORS=false
   ```

2. **Restrict to specific origins** (recommended for production):
   ```bash
   WEB_CORS_ORIGINS=http://192.168.1.100:3000,http://localhost:3000
   ```

3. **Combine with authentication** for additional security:
   ```bash
   WEB_CORS_ORIGINS=http://192.168.1.100:3000
   WEB_AUTH_ENABLED=true
   WEB_AUTH_PASSWORD=your-secure-password
   ```
