# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Papertrail is a GPS tracker with e-paper display for Raspberry Pi 5. It tracks GPS position, displays GPX tracks on an e-paper screen, and provides a mobile web interface for control via WebSocket.

## Common Commands

```bash
npm run build          # Compile TypeScript (tsc && tsc-alias)
npm start              # Run compiled code from dist/
npm run dev            # Development mode with auto-reload
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage (threshold: 70%)
npm run lint           # Check code style
npm run lint:fix       # Fix linting issues
npm run format         # Format code with Prettier
```

## Architecture

### Request Flow

```
Mobile Browser → IntegratedWebService (Express + Socket.IO)
                        ↓
              WebController → RenderingOrchestrator
                                      ↓
          GPS / Map / SVG / Epaper / Config Services
```

**Key insight:** `RenderingOrchestrator` is the central coordinator that initializes all services, subscribes to GPS updates, and orchestrates the rendering pipeline.

### Result Type Pattern

All service methods return `Result<T>` instead of throwing exceptions:

```typescript
const result = await service.someMethod();
if (!result.success) {
  return failure(result.error);
}
// Use result.data safely
```

Helper functions: `success()`, `failure()`, `isSuccess()`, `isFailure()` from `@core/types`

### Dependency Injection

Services are managed by `ServiceContainer` singleton (`src/di/ServiceContainer.ts`):
- Factory methods for production services
- Setter methods for test mocking
- Reads configuration from environment variables

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

Each service follows:
- Interface in `src/core/interfaces/I{Name}Service.ts`
- Implementation in `src/services/{name}/{Name}Service.ts`
- Tests in `src/services/{name}/__tests__/{Name}Service.test.ts`
- Errors in `src/core/errors/{Name}Error.ts`

Services must implement `initialize(): Promise<Result<void>>` and `dispose(): Promise<void>`.

### Error Handling

Custom errors extend `BaseError` with typed error codes (enums) and static factory methods: `GPSError`, `MapError`, `DisplayError`, `OrchestratorError`, `WebError`, `ConfigError`.

## Testing

Tests are in `__tests__/` directories next to the code. Use:
1. `ServiceContainer.reset()` to clear singleton state
2. Inject mocks via `ServiceContainer.set{Service}()` methods

## Development Notes

- **Entry point:** `src/index.ts`
- **Logging:** Use `getLogger(name)` from `@utils/logger`
- **Static files:** `src/web/public/`
- **GPX files:** `data/gpx-files/`
- **Mock services:** Automatically used on non-Linux platforms for GPS/E-paper

**Workflow requirements:**
- Run `npm run format` after making changes
- Write tests for new code
- Use logger utility with extensive logging when adding services
