#!/bin/bash

# Papertrail GPS Tracker - Startup Script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
# RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Papertrail GPS Tracker Start       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if /etc/sudoers.d/papertrail exists, if not copy from example
if [ ! -f /etc/sudoers.d/papertrail ]; then
  echo -e "${BLUE}Creating /etc/sudoers.d/papertrail...${NC}"
  echo -e "${BLUE}You need to have sudo access...it might ask for your password...${NC}"
  CURRENT_USER=$(whoami)
  sudo sed "s/USER/${CURRENT_USER}/g" config/papertrail-sudoers | sudo tee /etc/sudoers.d/papertrail >/dev/null
  sudo chmod 0440 /etc/sudoers.d/papertrail
  sudo visudo -c
  echo -e "${GREEN}✓ /etc/sudoers.d/papertrail created, sudo can be used to call nmcli...${NC}"
  echo ""
fi

# Check if 'screen' is installed, if not install it
if ! command -v screen &>/dev/null; then
  echo -e "${BLUE}Installing 'screen'...${NC}"
  sudo apt-get update && sudo apt-get install -y screen
  echo -e "${GREEN}✓ 'screen' installed${NC}"
  echo ""
fi

# Ensure /var/log/papertrail.log exists with correct permissions
if [ ! -f /var/log/papertrail.log ]; then
  echo -e "${BLUE}Creating /var/log/papertrail.log...${NC}"
  sudo touch /var/log/papertrail.log
  sudo chown root:admin /var/log/papertrail.log
  sudo chmod 0640 /var/log/papertrail.log
  echo -e "${GREEN}✓ /var/log/papertrail.log created${NC}"
  echo ""
fi

# Ensure logrotate configuration is in place
if [ ! -f /etc/logrotate.d/papertrail ]; then
  echo -e "${BLUE}Setting up logrotate for Papertrail...${NC}"
  sudo mkdir -p /etc/logrotate.d
  sudo cp logrotate/papertrail /etc/logrotate.d/papertrail
  echo -e "${GREEN}✓ Logrotate configuration added${NC}"
  echo ""
fi

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
  echo -e "${BLUE}Creating .env file from .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}✓ .env file created${NC}"
  echo ""
fi

# Load environment variables
if [ -f .env ]; then
  echo -e "${BLUE}Loading environment...${NC}"
  export "$(cat .env | grep -v '^#' | xargs)"
  echo -e "${GREEN}✓ Environment loaded${NC}"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}Installing dependencies...${NC}"
  npm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"
  echo ""
fi

# Check if dist exists, if not build
echo -e "${BLUE}Building TypeScript...${NC}"
npm run clean
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Create data directories if they don't exist
mkdir -p data/gpx-files
mkdir -p data/cache
mkdir -p logs

# Stop any existing Papertrail processes using stop.sh
SCREEN_NAME="papertrail"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Papertrail is already running
if screen -list | grep -q "\.${SCREEN_NAME}" || pgrep -f "node dist/index.js" >/dev/null; then
  echo -e "${BLUE}Stopping existing Papertrail instance...${NC}"
  "${SCRIPT_DIR}/stop.sh"
  echo ""
fi

# Start a new screen session
echo -e "${BLUE}Starting Papertrail in a screen session, logging to /var/log/papertrail.log ....${NC}"
screen -dmS "${SCREEN_NAME}" bash -c "node dist/index.js 2>&1 | sudo tee -a /var/log/papertrail.log >/dev/null"

# Confirm the screen session was started
if screen -list | grep -qw "${SCREEN_NAME}"; then
  echo -e "${BLUE}Papertrail has started successfully.${NC}"
else
  echo -e "${BLUE}Failed to start Papertrail.${NC}"
fi
