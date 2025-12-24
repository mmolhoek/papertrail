# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Papertrail is a GPS tracker with e-paper display for Raspberry Pi 5. It tracks GPS position, displays GPX tracks on an 800x480 e-paper screen, provides turn-by-turn navigation with offline route calculation, and offers a mobile web interface for control via WebSocket.

## Common Commands

```bash
npm run build          # Compile TypeScript (tsc && tsc-alias)
npm start              # Run compiled code from dist/
npm run dev            # Development mode with auto-reload
npm test               # Run all tests
npm test -- path/to/file.test.ts  # Run single test file
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run lint           # Check code style
npm run lint:fix       # Fix linting issues
npm run format         # Format code with Prettier
```

## Architecture

### Request Flow

```
Mobile Browser → IntegratedWebService (Express + Socket.IO, port 3000)
                        ↓
              WebController → Sub-controllers (GPS, Track, Drive, Config, WiFi, Simulation)
                        ↓
              RenderingOrchestrator (central coordinator)
                        ↓
     ┌──────────┬──────────┬───────────┬──────────┐
     ↓          ↓          ↓           ↓          ↓
GPSService  MapService  SVGService  EPaper  ConfigService
```

**RenderingOrchestrator** (`src/services/orchestrator/RenderingOrchestrator.ts`) is the central coordinator that initializes all services, manages GPS subscriptions, and orchestrates the rendering pipeline. Sub-coordinators handle specific domains: GPSCoordinator, DriveCoordinator, SimulationCoordinator, TrackDisplayCoordinator, OnboardingCoordinator.

### Result Type Pattern

All service methods return `Result<T>` instead of throwing exceptions:

```typescript
import { Result, success, failure } from "@core/types";

const result = await service.someMethod();
if (!result.success) {
  return failure(result.error);
}
// Use result.data safely
```

### Dependency Injection

Services are managed by `ServiceContainer` singleton (`src/di/ServiceContainer.ts`):
- Factory methods create production services
- Setter methods allow test mocking: `ServiceContainer.setGPSService(mockService)`
- Call `ServiceContainer.reset()` between tests to clear singleton state

### Path Aliases

Always use path aliases instead of relative paths:

```typescript
import { IGPSService } from "@core/interfaces";
import { Result, success, failure } from "@core/types";
import { GPSService } from "@services/gps/GPSService";
import { ServiceContainer } from "@di/ServiceContainer";
import { getLogger } from "@utils/logger";
```

Aliases: `@core/*`, `@services/*`, `@di/*`, `@web/*`, `@utils/*`, `@errors/*`

### Service Structure

Each service follows this pattern:
- Interface in `src/core/interfaces/I{Name}Service.ts`
- Implementation in `src/services/{name}/{Name}Service.ts`
- Tests in `src/services/{name}/__tests__/{Name}Service.test.ts`
- Errors in `src/core/errors/{Name}Error.ts`

Services implement `initialize(): Promise<Result<void>>` and `dispose(): Promise<void>`.

### Key Services

| Service | Location | Purpose |
|---------|----------|---------|
| RenderingOrchestrator | `src/services/orchestrator/` | Central coordinator, manages lifecycle |
| GPSService | `src/services/gps/` | Hardware interface for GPS receiver |
| MapService | `src/services/map/` | GPX file parsing and track management |
| SVGService | `src/services/svg/` | Renders maps and tracks to 1-bit bitmap |
| EPaperService | `src/services/epaper/` | E-paper display hardware interface |
| ConfigService | `src/services/config/` | Persists configuration to JSON |
| WiFiService | `src/services/wifi/` | Network management via nmcli |
| DriveNavigationService | `src/services/drive/` | Route calculation and turn-by-turn guidance |
| IntegratedWebService | `src/web/` | Express HTTP + Socket.IO WebSocket server |

### Display Abstraction

The display system uses a layered abstraction supporting different display types:
- `IDisplayService` - Generic display interface (all display types)
- `IEpaperService` - E-paper specific (extends IDisplayService with sleep/wake/fullRefresh)
- Use `isEpaperService()` type guard to check for e-paper features
- Drivers: `BaseDisplayDriver` → `BaseEpaperDriver` → `Waveshare7in5BWDriver`

### Error Handling

Custom errors extend `BaseError` with typed error codes (enums) and static factory methods: `GPSError`, `MapError`, `DisplayError`, `OrchestratorError`, `WebError`, `ConfigError`, `DriveError`, `WiFiError`.

## Testing

Tests use Jest and are located in `__tests__/` directories next to the code they test.

Test setup pattern:
```typescript
beforeEach(() => {
  ServiceContainer.reset();
  ServiceContainer.setGPSService(mockGPSService);
  // ... inject other mocks
});
```

Hardware services (GPS, E-paper, WiFi) are excluded from coverage as they require physical devices. Mock implementations are used automatically on non-Linux platforms.

Coverage thresholds: 52% branches, 71% functions, 72% lines.

## Development Notes

- **Entry point:** `src/index.ts`
- **Logging:** Use `getLogger(name)` from `@utils/logger`
- **Static web files:** `src/web/public/`
- **GPX files:** `data/gpx-files/`
- **Config persistence:** `data/config.json`
- **Pre-commit hooks:** Husky runs lint-staged (prettier + eslint) on staged files

Run `npm run format` after making changes.
