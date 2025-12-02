#!/bin/bash

# Papertrail GPS Tracker - Development Start Script
# Use this for development/testing. For production, use systemd service.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Papertrail GPS Tracker (Dev Mode)    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

SCREEN_NAME="papertrail"

# Check if systemd service is running
if systemctl is-active --quiet papertrail 2>/dev/null; then
  echo -e "${BLUE}Systemd service is running. Stop it first with:${NC}"
  echo -e "  ${GREEN}sudo systemctl stop papertrail${NC}"
  exit 1
fi

# Check if already running in screen
if screen -list | grep -q "\.${SCREEN_NAME}" || pgrep -f "node dist/index.js" >/dev/null; then
  echo -e "${BLUE}Stopping existing instance...${NC}"
  "${SCRIPT_DIR}/stop.sh"
  echo ""
fi

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${BLUE}Creating .env from .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}✓ .env created${NC}"
  echo ""
fi

# Load environment
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check dependencies
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}Installing dependencies...${NC}"
  npm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"
  echo ""
fi

# Build
echo -e "${BLUE}Building...${NC}"
npm run clean
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Create data directories
mkdir -p data/gpx-files data/cache logs

# Ensure log file exists
if [ ! -f /var/log/papertrail.log ]; then
  echo -e "${BLUE}Creating log file (needs sudo)...${NC}"
  sudo touch /var/log/papertrail.log
  sudo chmod 0644 /var/log/papertrail.log
fi

# Start in screen session
echo -e "${BLUE}Starting in screen session '${SCREEN_NAME}'...${NC}"
screen -dmS "${SCREEN_NAME}" bash -c "node dist/index.js 2>&1 | tee -a /var/log/papertrail.log"

sleep 1

if screen -list | grep -qw "${SCREEN_NAME}"; then
  echo -e "${GREEN}✓ Papertrail started${NC}"
  echo ""
  echo -e "${BLUE}Commands:${NC}"
  echo -e "  ${GREEN}screen -r ${SCREEN_NAME}${NC}        - Attach to session"
  echo -e "  ${GREEN}${SCRIPT_DIR}/stop.sh${NC}  - Stop"
  echo -e "  ${GREEN}tail -f /var/log/papertrail.log${NC} - Follow logs"
else
  echo -e "${BLUE}Failed to start Papertrail${NC}"
  exit 1
fi
