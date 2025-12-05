# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Papertrail is a GPS tracker with e-paper display for Raspberry Pi 5. It tracks GPS position, displays GPX tracks on an e-paper screen, and provides a mobile web interface for control via WebSocket.

## Common Commands

### Build and Run

```bash
npm run build          # Compile TypeScript to dist/
npm start             # Run compiled code from dist/
npm run dev           # Development mode with auto-reload
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

Coverage threshold: 70% for branches, functions, lines, and statements.

### Code Quality

```bash
npm run lint          # Check code style
npm run lint:fix      # Fix linting issues
npm run format        # Format code with Prettier
```

### Cleanup

```bash
npm run clean         # Remove dist/ directory
```

### Build Process

The build process uses a two-step approach to handle TypeScript path aliases:

```bash
npm run build         # Runs: tsc && tsc-alias
```

1. **TypeScript Compilation** (`tsc`): Compiles .ts files to .js files in dist/
2. **Path Alias Resolution** (`tsc-alias`): Rewrites path aliases to relative paths in compiled JavaScript

This ensures the compiled JavaScript works in production Node.js without runtime path resolution overhead.

#### Path Aliases

The project uses TypeScript path aliases for clean, maintainable imports. **Always use path aliases in source code** instead of relative paths:

```typescript
// ✓ CORRECT - Use path aliases
import { IGPSService } from "@core/interfaces";
import { Result, success, failure } from "@core/types";
import { GPSError } from "@core/errors";
import { GPSService } from "@services/gps/GPSService";
import { ServiceContainer } from "@di/ServiceContainer";
import { WebController } from "@web/controllers/WebController";
import { getLogger } from "@utils/logger";

// ✗ WRONG - Don't use relative paths for cross-directory imports
import { IGPSService } from "../../core/interfaces";
import { Result } from "../../core/types";
```

**Available aliases:**
- `@core/*` → `src/core/*`
- `@errors/*` → `src/core/errors/*` (prefer `@core/errors` barrel export)
- `@services/*` → `src/services/*`
- `@di/*` → `src/di/*`
- `@web/*` → `src/web/*`
- `@utils/*` → `src/utils/*`

**Note:** Relative imports are acceptable only for files in the same directory (e.g., `./BaseError` within the errors folder).

**Development mode** (`npm run dev`) uses `ts-node-dev` with `tsconfig-paths/register` to resolve aliases at runtime automatically.

## Architecture

### Core Pattern: Result Type

The codebase uses a **Result type** pattern instead of throwing exceptions. All service methods return `Result<T>`:

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
```

Helper functions: `success()`, `failure()`, `isSuccess()`, `isFailure()`

**Always check result success before using data:**

```typescript
const result = await service.someMethod();
if (!result.success) {
  return failure(result.error);
}
// Use result.data safely here
```

### Dependency Injection

All services are managed by `ServiceContainer` (singleton in `src/di/ServiceContainer.ts`):

- Provides factory methods for production services
- Provides setters for test mocking
- Reads configuration from environment variables

**To add a new service:**

1. Define interface in `src/core/interfaces/`
2. Implement service in `src/services/`
3. Add factory method to `ServiceContainer`
4. Add test setter method for mocking

### Request Flow

```
Mobile Browser (HTTP/WebSocket)
    ↓
IntegratedWebService (src/web/IntegratedWebService.ts)
  ├─ Express HTTP Server (REST API)
  ├─ Socket.IO WebSocket (real-time updates)
  └─ WebController (src/web/controllers/WebController.ts)
    ↓
RenderingOrchestrator (src/services/orchestrator/RenderingOrchestrator.ts)
  ├─ Coordinates all services
  ├─ Manages callbacks/events
  └─ Delegates to services:
    ↓
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  GPS    │  Map    │  SVG    │ Epaper  │ Config  │
│ Service │ Service │ Service │ Service │ Service │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

**Key insight:** `RenderingOrchestrator` is the central coordinator. It:

- Initializes all services
- Subscribes to GPS updates from GPSService
- Forwards GPS updates to registered callbacks
- Orchestrates the full rendering pipeline: GPS → Map → SVG → Epaper

**Event Flow:** GPS hardware → GPSService → RenderingOrchestrator callbacks → IntegratedWebService → WebSocket broadcast → All clients

### Service Layer

Each service follows this structure:

- **Interface** in `src/core/interfaces/I{Name}Service.ts`
- **Implementation** in `src/services/{name}/{Name}Service.ts`
- **Tests** in `src/services/{name}/__tests__/{Name}Service.test.ts`
- **Errors** in `src/core/errors/{Name}Error.ts`

Services must implement:

- `initialize(): Promise<Result<void>>` - Setup/initialization
- `dispose(): Promise<void>` - Cleanup resources

### Path Aliases

TypeScript path aliases are configured in `tsconfig.json` and `jest.config.js`:

```typescript
import { IGPSService } from "@core/interfaces";
import { GPSService } from "@services/gps/GPSService";
import { ServiceContainer } from "@di/ServiceContainer";
import { WebController } from "@web/controllers/WebController";
import { getLogger } from "@utils/logger";
```

Available aliases:

- `@core/*` → `src/core/*`
- `@errors/*` → `src/core/errors/*`
- `@services/*` → `src/services/*`
- `@di/*` → `src/di/*`
- `@web/*` → `src/web/*`
- `@utils/*` → `src/utils/*`

### Error Handling

Custom error classes extend `BaseError` from `src/core/errors/BaseError.ts`:

- `GPSError` - GPS-related errors
- `MapError` - GPX/map-related errors
- `DisplayError` - E-paper display errors
- `OrchestratorError` - Orchestration errors
- `WebError` - Web interface errors
- `ConfigError` - Configuration errors

Each error has typed error codes (enums) and static factory methods.

## Configuration

Configuration is loaded from environment variables via `.env` file (see `.env.example`).

All config is read in `ServiceContainer` getter methods:

- `getGPSConfig()` - GPS settings
- `getMapConfig()` - Map/GPX settings
- `getEpaperConfig()` - E-paper display settings
- `getWebConfig()` - Web interface settings

**Config is read at service creation time**, not runtime, so changes require restart.

## Testing Strategy

Tests are in `__tests__/` directories next to the code they test.

Jest is configured with:

- `ts-jest` preset for TypeScript
- Path alias mappings (must match tsconfig.json)
- 10 second timeout
- Coverage thresholds: 70%

**To test services:**

1. Use `ServiceContainer.reset()` to clear singleton state
2. Create mock services implementing interfaces
3. Inject mocks via `ServiceContainer.set{Service}()` methods
4. Test in isolation

## Hardware Interface

This application interfaces with:

- **GPS Module** at `/dev/ttyAMA0` (configurable) via serialport library
- **E-paper Display** via SPI at `/dev/spidev0.0` with GPIO pins (reset, dc, busy, cs)

### Development on Non-Raspberry Pi Hardware

The application **automatically detects non-Linux platforms** (macOS, Windows) and uses mock services for GPS and E-paper display. No configuration needed!

**Mock Services:**

- **MockGPSService** (`src/services/gps/MockGPSService.ts`) - Simulates GPS with realistic coordinates (San Francisco by default), supports position callbacks, and simulates satellite data
- **MockEpaperService** (`src/services/epaper/MockEpaperService.ts`) - Logs display operations without actual hardware, tracks refresh counts, and validates bitmaps
- **MockWiFiService** (`src/services/wifi/MockWiFiService.ts`) - Simulates WiFi operations (already existed)

**Environment Variables** (`.env` file):

```bash
USE_MOCK_GPS=false      # Set to "true" to force mock GPS (auto-enabled on non-Linux)
USE_MOCK_EPAPER=false   # Set to "true" to force mock E-paper (auto-enabled on non-Linux)
```

**How it works:**

1. ServiceContainer detects platform via `process.platform`
2. On non-Linux systems, automatically instantiates mock services
3. Mock services implement full interfaces with realistic behavior
4. Can be explicitly enabled on Linux with environment variables (useful for testing without hardware)

**Mock service features:**

- Full callback support for orchestrator integration
- Realistic delays to simulate hardware timing
- Proper state management (busy, sleeping, tracking)
- Comprehensive logging with "Mock:" prefix
- Return proper Result types with error handling

### Chroot/Android Environment Support

The application supports running in chroot environments (e.g., Android with Termux/PRoot) where native compilation may fail.

**Installation in Chroot Environments:**

The `scripts/install.sh` script **automatically detects chroot environments** and skips native dependencies (serialport) that require gyp compilation:

- Detects standard chroot via `/proc/1/root` comparison
- Detects PRoot environments via `$PROOT_TMP_DIR` or `$PREFIX` env vars
- Detects PRoot in kernel version string

**Manual Override:**

You can manually skip native dependencies by setting an environment variable before running the install script:

```bash
SKIP_NATIVE_DEPS=true ./scripts/install.sh
```

Or add to your `.env` file:

```bash
SKIP_NATIVE_DEPS=true
```

**What happens in chroot mode:**

1. Install script creates temporary `package.json` without serialport and sharp
2. Runs `npm install` with the modified package
3. Installs sharp separately with `--cpu=wasm32` flag (WebAssembly version, no native compilation)
4. Restores original `package.json`
5. MockGPSService is automatically used at runtime (no hardware access possible in chroot)

**Manual installation (if not using install script):**

If installing manually in a chroot environment:

```bash
# Remove serialport from package.json, then:
npm install --production=false

# Install sharp with WebAssembly support:
npm install --cpu=wasm32 sharp
```

**Current package.json on your system:**

If you've already removed serialport from `package.json`, you can either:
- Keep it removed and manually install sharp with `--cpu=wasm32` flag
- Restore serialport to `package.json` and use the install script's auto-detection (recommended for portability)

## GPX File Management

GPX files are stored in `data/gpx-files/` (configurable via `GPX_DIRECTORY`).

The active track is set via:

1. Web UI → POST `/api/map/active` → `RenderingOrchestrator.setActiveGPX()`
2. Stored in ConfigService state
3. Used by `RenderingOrchestrator.updateDisplay()` to render map

## Web Interface

Static files: `src/web/public/` (HTML, CSS, JS)

API Base: `/api` (configurable via `WEB_API_BASE`)

WebSocket events are defined in `IntegratedWebService.subscribeToOrchestratorEvents()`:

- Client ← `gps:update` - Position updates with fix quality
- Client ← `gps:status` - GPS status changes
- Client ← `display:updated` - Display refresh complete
- Client ← `error` - Error notifications
- Client → `display:refresh` - Request display update
- Client → `ping`/`pong` - Keep-alive

## Development Notes

- **Entry point:** `src/index.ts` - Initializes container, orchestrator, and web service
- **Graceful shutdown:** Handles SIGTERM, SIGINT, uncaughtException, unhandledRejection
- **Logging:** Uses winston logger via `src/utils/logger.ts` - Call `getLogger(name)` for named loggers
- **Auto-update:** RenderingOrchestrator can run periodic display updates via `startAutoUpdate()`
- **Systemd service:** `papertrail.service` file for running as system service
- alway run npm run format after you are done making changes