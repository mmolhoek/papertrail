#!/bin/bash

# Papertrail GPS Tracker - Installation Script
# Run this once after deploying to set up the system

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Papertrail GPS Tracker Installation  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo -e "${BLUE}Project directory: ${PROJECT_DIR}${NC}"

# Detect platform
IS_PI=false
IS_CHROOT=false

# Check for chroot environment
if [ -r /proc/1/root ] && [ -r /proc/1/cwd ]; then
  if [ "$(stat -c %d:%i /)" != "$(stat -c %d:%i /proc/1/root/.)" ]; then
    IS_CHROOT=true
  fi
fi

# Check for PRoot/Android chroot environment indicators
if [ -n "$PROOT_TMP_DIR" ] || [ -n "$PREFIX" ] || grep -q "PRoot" /proc/version 2>/dev/null; then
  IS_CHROOT=true
fi

if [[ "$(uname -s)" == "Linux" ]] && [ -f /proc/device-tree/model ] && grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
  IS_PI=true
  echo -e "${BLUE}Platform: Raspberry Pi${NC}"
else
  echo -e "${BLUE}Platform: $(uname -s) (development mode)${NC}"
fi

if [ "$IS_CHROOT" = true ]; then
  echo -e "${YELLOW}Detected chroot environment (native compilation may fail)${NC}"
fi
echo ""

# Check if running as root on Pi (we need sudo for some operations)
if [ "$IS_PI" = true ] && [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Please run this script as a regular user (not root).${NC}"
  echo -e "${RED}The script will use sudo when needed.${NC}"
  exit 1
fi

CURRENT_USER=$(whoami)
REBOOT_REQUIRED=false

# Determine number of steps based on platform
if [ "$IS_PI" = true ]; then
  TOTAL_STEPS=13
else
  TOTAL_STEPS=4
fi

STEP=0

# Helper function to show step progress
step() {
  STEP=$((STEP + 1))
  echo -e "${BLUE}[${STEP}/${TOTAL_STEPS}] $1${NC}"
}

# =============================================================================
# PI-ONLY: System packages with apt
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Installing system packages..."
  PACKAGES="nodejs npm screen build-essential python3 gpiod"
  MISSING_PACKAGES=""

  for pkg in $PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg "; then
      MISSING_PACKAGES="$MISSING_PACKAGES $pkg"
    fi
  done

  if [ -n "$MISSING_PACKAGES" ]; then
    echo -e "${BLUE}  Installing:$MISSING_PACKAGES${NC}"
    sudo apt-get update
    sudo apt-get install -y $MISSING_PACKAGES
    echo -e "${GREEN}  ✓ System packages installed${NC}"
  else
    echo -e "${GREEN}  ✓ System packages already installed${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: GPS udev rules
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Setting up GPS serial port permissions..."
  if [ ! -f /etc/udev/rules.d/50-gps.rules ]; then
    sudo cp config/50-gps.rules /etc/udev/rules.d/50-gps.rules
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    echo -e "${GREEN}  ✓ GPS udev rules installed${NC}"
  else
    echo -e "${GREEN}  ✓ GPS udev rules already configured${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: Disable getty on ttyAMA0
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Disabling getty on ttyAMA0..."
  if systemctl is-enabled getty@ttyAMA0.service 2>/dev/null | grep -q "enabled\|static"; then
    sudo systemctl stop getty@ttyAMA0.service 2>/dev/null || true
    sudo systemctl disable getty@ttyAMA0.service 2>/dev/null || true
    sudo systemctl mask getty@ttyAMA0.service 2>/dev/null || true
    echo -e "${GREEN}  ✓ Getty disabled on ttyAMA0${NC}"
  else
    echo -e "${GREEN}  ✓ Getty already disabled on ttyAMA0${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: Configure SPI buffer size
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Configuring SPI buffer size..."
  BOOT_CONFIG="/boot/firmware/config.txt"
  if [ ! -f "$BOOT_CONFIG" ]; then
    BOOT_CONFIG="/boot/config.txt"  # Fallback for older Pi OS
  fi

  if [ -f "$BOOT_CONFIG" ]; then
    if ! grep -q "spidev.bufsiz=48000" "$BOOT_CONFIG"; then
      echo "" | sudo tee -a "$BOOT_CONFIG" >/dev/null
      echo "# Papertrail: SPI buffer size for 800x480 e-paper display" | sudo tee -a "$BOOT_CONFIG" >/dev/null
      echo "spidev.bufsiz=48000" | sudo tee -a "$BOOT_CONFIG" >/dev/null
      echo -e "${GREEN}  ✓ SPI buffer size configured${NC}"
      echo -e "${YELLOW}  ⚠ Reboot required for SPI changes to take effect${NC}"
      REBOOT_REQUIRED=true
    else
      echo -e "${GREEN}  ✓ SPI buffer size already configured${NC}"
    fi
  else
    echo -e "${YELLOW}  ⚠ Could not find boot config file, skipping SPI configuration${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: Add user to dialout group
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Adding user to dialout group..."
  if groups "$CURRENT_USER" | grep -q dialout; then
    echo -e "${GREEN}  ✓ User already in dialout group${NC}"
  else
    sudo usermod -a -G dialout "$CURRENT_USER"
    echo -e "${GREEN}  ✓ User added to dialout group${NC}"
    echo -e "${YELLOW}  ⚠ Log out and back in for group changes to take effect${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: Setup sudoers for nmcli
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Setting up sudoers for WiFi management..."
  if [ ! -f /etc/sudoers.d/papertrail ]; then
    sudo sed "s/USER/${CURRENT_USER}/g" config/papertrail-sudoers | sudo tee /etc/sudoers.d/papertrail >/dev/null
    sudo chmod 0440 /etc/sudoers.d/papertrail
    sudo visudo -c
    echo -e "${GREEN}  ✓ Sudoers configured${NC}"
  else
    echo -e "${GREEN}  ✓ Sudoers already configured${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: Create log file
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Setting up log file..."
  if [ ! -f /var/log/papertrail.log ]; then
    sudo touch /var/log/papertrail.log
    sudo chown root:root /var/log/papertrail.log || sudo chown root:admin /var/log/papertrail.log
    sudo chmod 0644 /var/log/papertrail.log
    echo -e "${GREEN}  ✓ Log file created${NC}"
  else
    echo -e "${GREEN}  ✓ Log file already exists${NC}"
  fi
fi

# =============================================================================
# PI-ONLY: Setup logrotate
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Setting up logrotate..."
  if [ ! -f /etc/logrotate.d/papertrail ]; then
    sudo mkdir -p /etc/logrotate.d
    sudo cp config/logrotate /etc/logrotate.d/papertrail
    echo -e "${GREEN}  ✓ Logrotate configured${NC}"
  else
    echo -e "${GREEN}  ✓ Logrotate already configured${NC}"
  fi
fi

# =============================================================================
# ALL PLATFORMS: Create .env file
# =============================================================================
step "Setting up environment file..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${GREEN}  ✓ .env file created from .env.example${NC}"
  echo -e "${BLUE}  Note: Edit .env to configure your settings${NC}"
else
  echo -e "${GREEN}  ✓ .env file already exists${NC}"
fi

# =============================================================================
# ALL PLATFORMS: Install npm dependencies
# =============================================================================
step "Installing npm dependencies..."

# In chroot environments, skip native dependencies that require compilation
if [ "$IS_CHROOT" = true ] || [ "$SKIP_NATIVE_DEPS" = "true" ]; then
  echo -e "${YELLOW}  Chroot environment detected - using special installation${NC}"
  echo -e "${BLUE}  - Skipping serialport (native GPS module)${NC}"

  # Create a temporary package.json without serialport
  TEMP_PKG="/tmp/package.json.$$"
  cat package.json | grep -v '"serialport"' | grep -v '"@serialport/parser-readline"' > "$TEMP_PKG"
  mv package.json package.json.backup
  mv "$TEMP_PKG" package.json

  # Install dependencies without native modules
  npm install --production=false

  # Restore original package.json
  mv package.json.backup package.json

  echo -e "${GREEN}  ✓ Dependencies installed for chroot environment${NC}"
  echo -e "${BLUE}  Note: MockGPSService will be used automatically${NC}"
else
  npm install --production=false
  echo -e "${GREEN}  ✓ Dependencies installed${NC}"
fi

# =============================================================================
# ALL PLATFORMS: Build the project
# =============================================================================
step "Building project..."
npm run clean
npm run build
echo -e "${GREEN}  ✓ Build complete${NC}"

# =============================================================================
# ALL PLATFORMS: Create data directories
# =============================================================================
step "Creating data directories..."
mkdir -p data/gpx-files
mkdir -p data/cache
mkdir -p logs
echo -e "${GREEN}  ✓ Data directories created${NC}"

# =============================================================================
# PI-ONLY: Install systemd service
# =============================================================================
if [ "$IS_PI" = true ]; then
  step "Installing systemd service..."

  SERVICE_FILE="/etc/systemd/system/papertrail.service"
  TEMP_SERVICE="/tmp/papertrail.service"

  cat > "$TEMP_SERVICE" << EOF
[Unit]
Description=Papertrail GPS Tracker
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/node ${PROJECT_DIR}/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/papertrail.log
StandardError=append:/var/log/papertrail.log

# Environment
Environment=NODE_ENV=production
EnvironmentFile=${PROJECT_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

  sudo cp "$TEMP_SERVICE" "$SERVICE_FILE"
  sudo chmod 644 "$SERVICE_FILE"
  sudo systemctl daemon-reload
  rm "$TEMP_SERVICE"

  echo -e "${GREEN}  ✓ Systemd service installed${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Installation Complete!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

if [ "$IS_PI" = true ]; then
  if [ "$REBOOT_REQUIRED" = true ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  REBOOT REQUIRED for hardware changes  ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}After reboot, enable and start the service:${NC}"
    echo -e "  ${GREEN}sudo systemctl enable papertrail${NC}"
    echo -e "  ${GREEN}sudo systemctl start papertrail${NC}"
    echo ""
  else
    echo -e "${BLUE}Usage:${NC}"
    echo -e "  ${GREEN}sudo systemctl start papertrail${NC}    - Start the service"
    echo -e "  ${GREEN}sudo systemctl stop papertrail${NC}     - Stop the service"
    echo -e "  ${GREEN}sudo systemctl restart papertrail${NC}  - Restart the service"
    echo -e "  ${GREEN}sudo systemctl status papertrail${NC}   - Check status"
    echo -e "  ${GREEN}sudo systemctl enable papertrail${NC}   - Enable start on boot"
    echo -e "  ${GREEN}sudo journalctl -u papertrail -f${NC}   - Follow logs"
    echo -e "  ${GREEN}tail -f /var/log/papertrail.log${NC}    - Follow app logs"
    echo ""
    echo -e "${BLUE}To enable auto-start on boot:${NC}"
    echo -e "  ${GREEN}sudo systemctl enable papertrail${NC}"
    echo ""
  fi
else
  echo -e "${BLUE}Development mode - run with:${NC}"
  echo -e "  ${GREEN}npm run dev${NC}    - Start with auto-reload"
  echo -e "  ${GREEN}npm start${NC}      - Start production build"
  echo ""
  echo -e "${YELLOW}Note: GPS and e-paper will use mock services.${NC}"
  echo -e "${YELLOW}Deploy to Raspberry Pi for full hardware support.${NC}"
  echo ""
fi
