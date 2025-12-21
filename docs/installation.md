# Installation & Setup

Complete guide for setting up Papertrail on a Raspberry Pi 5.

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

## First-Time Setup

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
