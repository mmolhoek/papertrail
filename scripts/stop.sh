#!/bin/bash

# Papertrail GPS Tracker - Stop Script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Papertrail GPS Tracker Stop        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

SCREEN_NAME="papertrail"
STOPPED=false

# Stop the screen session if running
if screen -list | grep -q "\.${SCREEN_NAME}"; then
  echo -e "${BLUE}Stopping screen session...${NC}"
  screen -S "${SCREEN_NAME}" -X quit
  STOPPED=true
fi

# Kill any remaining node processes
if pgrep -f "node dist/index.js" >/dev/null; then
  echo -e "${BLUE}Stopping Node.js process...${NC}"
  pkill -f "node dist/index.js" || true
  STOPPED=true
fi

# Wait for processes to fully stop
if [ "$STOPPED" = true ]; then
  sleep 2

  # Verify everything is stopped
  if pgrep -f "node dist/index.js" >/dev/null; then
    echo -e "${RED}✗ Failed to stop Node.js process${NC}"
    echo -e "${BLUE}Attempting force kill...${NC}"
    pkill -9 -f "node dist/index.js" || true
    sleep 1
  fi

  echo -e "${GREEN}✓ Papertrail stopped successfully${NC}"
else
  echo -e "${BLUE}Papertrail is not running${NC}"
fi
