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

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
  echo -e "${BLUE}Creating .env file from .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}✓ .env file created${NC}"
  echo ""
fi

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}Installing dependencies...${NC}"
  npm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"
  echo ""
fi

# Check if dist exists, if not build
if [ ! -d "dist" ]; then
  echo -e "${BLUE}Building TypeScript...${NC}"
  npm run build
  echo -e "${GREEN}✓ Build complete${NC}"
  echo ""
fi

# Create data directories if they don't exist
mkdir -p data/gpx-files
mkdir -p data/cache
mkdir -p logs

echo -e "${BLUE}Starting Papertrail...${NC}"
echo ""

# Start the application
node dist/index.js

