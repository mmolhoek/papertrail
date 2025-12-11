# Papertrail Codebase Improvement TODO

---

## Instructions for Claude

**When the user says "read TODO and continue" or similar:**

1. **Read this file** to find the next unchecked item (first `- [ ]`)
2. **Pick the next item** - identify the first unchecked checkbox in order
3. **Break it into tasks** - split into manageable sub-tasks if needed
4. **For each task:**
   - Plan the implementation
   - Implement the changes
   - Run tests: `npm test`
   - Run format: `npm run format`
   - Commit with descriptive message
   - Push to remote
   - Adjust plan if needed based on findings
5. **Mark complete** - change `- [ ]` to `- [x]` when done
6. **Add discoveries** - if you find new issues during work, add them to the appropriate section
7. **Stop after completing one numbered section** (e.g., 1.1) and wait for user to continue

**Commit message format:** `refactor: <description>` or `feat: <description>` or `fix: <description>`

---

## Current Progress

**Next item:** 1.1 Split RenderingOrchestrator - GPS coordination extraction

**Completed:**

- [x] DisplayUpdateQueue extracted and integrated (3,014 → 2,959 lines)
- [x] OnboardingCoordinator extracted and integrated (2,959 → 2,143 lines)

---

## Phase 1: Critical Architecture Improvements

These items address the largest technical debt and will make subsequent improvements easier.

### 1.1 Split RenderingOrchestrator (started at 3,014 lines, now 2,143 lines)

- [x] Extract display update queuing into `DisplayUpdateQueue` class
- [x] Extract WiFi/onboarding flow into `OnboardingCoordinator` class
- [ ] Extract GPS coordination logic into `GPSCoordinator` class
- [ ] Extract drive navigation logic into `DriveCoordinator` class
- [ ] Extract simulation handling into `SimulationCoordinator` class
- [ ] Keep `RenderingOrchestrator` as thin coordinator delegating to sub-coordinators
- [ ] Target: <500 lines per file

**Files:**

- `src/services/orchestrator/RenderingOrchestrator.ts` (2,143 lines)
- `src/services/orchestrator/DisplayUpdateQueue.ts` (272 lines)
- `src/services/orchestrator/OnboardingCoordinator.ts` (965 lines)

### 1.2 Split SVGService (2,348 lines)

- [ ] Extract bitmap manipulation into `BitmapUtils` class
- [ ] Extract coordinate projection logic into `ProjectionService`
- [ ] Extract track rendering into `TrackRenderer` class
- [ ] Extract UI rendering (progress bars, info panels) into `UIRenderer` class
- [ ] Extract maneuver icon rendering into `ManeuverRenderer` class
- [ ] Keep `SVGService` as facade coordinating renderers

**Files:** `src/services/svg/SVGService.ts`

### 1.3 Split WebController (2,150 lines)

- [ ] Extract GPS endpoints into `GPSController`
- [ ] Extract track/GPX endpoints into `TrackController`
- [ ] Extract WiFi endpoints into `WiFiController`
- [ ] Extract drive navigation endpoints into `DriveController`
- [ ] Extract simulation endpoints into `SimulationController`
- [ ] Extract config endpoints into `ConfigController`
- [ ] Keep shared utilities in base controller or utils

**Files:** `src/web/controllers/WebController.ts`

### 1.4 Split WiFiService (1,542 lines)

- [ ] Extract network scanning into `NetworkScanner` class
- [ ] Extract connection management into `ConnectionManager` class
- [ ] Extract AP mode handling into `AccessPointManager` class
- [ ] Extract state machine into dedicated `WiFiStateMachine` class

**Files:** `src/services/wifi/WiFiService.ts`

---

## Phase 2: Test Coverage Improvements

Increase confidence in the codebase before making further changes.

### 2.1 Add Integration Tests for Orchestrator

- [ ] Create `src/services/orchestrator/__tests__/integration/` directory
- [ ] Add tests for GPS → Display update flow
- [ ] Add tests for WiFi state transitions
- [ ] Add tests for drive navigation flow
- [ ] Add tests for track simulation flow
- [ ] Remove `RenderingOrchestrator.ts` from coverage exclusions in `jest.config.js:35`

### 2.2 Add Tests for Hardware Services

- [ ] Create integration tests for `GPSService` with mock serial port
- [ ] Create integration tests for `EPaperService` with mock SPI
- [ ] Create integration tests for `WiFiService` with mock nmcli
- [ ] Consider creating a `TestHardwareAdapter` for easier mocking

### 2.3 Increase Coverage Thresholds

- [ ] After completing 2.1 and 2.2, raise thresholds in `jest.config.js`:
  - branches: 68 → 75
  - functions: 70 → 80
  - lines: 70 → 80
  - statements: 70 → 80

**Files:** `jest.config.js:37-43`

---

## Phase 3: Code Quality Improvements

### 3.1 Complete GPS NMEA Parsing

- [ ] Implement full GGA sentence parsing (latitude, longitude, altitude)
- [ ] Parse GSA sentences for PDOP/VDOP
- [ ] Parse RMC sentences for speed and bearing
- [ ] Remove mock position return at lines 419-423
- [ ] Add unit tests for NMEA parsing
- [ ] Consider extracting `NMEAParser` class

**Files:** `src/services/gps/GPSService.ts:366-433`

### 3.2 Extract Configuration Constants

- [ ] Create `src/core/constants/defaults.ts` for default values
- [ ] Move magic numbers from `ServiceContainer.ts:334-431`:
  - GPS defaults (9600 baud, 1000ms interval)
  - Map defaults (10MB max file size, zoom levels)
  - E-paper defaults (800x480, pin numbers)
  - Web defaults (port 3000)
  - WiFi defaults (30s scan interval)
- [ ] Document each constant with JSDoc

**Files:** `src/di/ServiceContainer.ts:328-431`

### 3.3 Standardize Test Imports

- [ ] Update `IntegrationTest.test.ts` to use path aliases instead of relative paths
- [ ] Update all test files to use `@core/`, `@services/`, etc.
- [ ] Add lint rule to enforce path alias usage

**Files:** `src/__tests__/integration/IntegrationTest.test.ts:23-24`

### 3.4 Add Input Validation Layer

- [ ] Add validation for API request parameters in controllers
- [ ] Validate file uploads (file type, not just size)
- [ ] Validate configuration values in `ServiceContainer`
- [ ] Consider using `zod` or `joi` for schema validation

---

## Phase 4: Security Hardening

### 4.1 Improve File Upload Security

- [ ] Add file type validation (check magic bytes, not just extension)
- [ ] Implement temp file cleanup on server shutdown
- [ ] Add cleanup job for orphaned uploads
- [ ] Move upload directory from `/tmp` to app-controlled location

**Files:** `src/web/IntegratedWebService.ts:91-96`

### 4.2 Secure Default Credentials

- [ ] Change default WiFi password from `papertrail123` to require user setup
- [ ] Change default web auth password from `papertrail` to random generated
- [ ] Add startup warning if using default credentials
- [ ] Document security requirements in README

**Files:**

- `src/di/ServiceContainer.ts:411-413` (web auth)
- `src/di/ServiceContainer.ts:425` (WiFi password)

### 4.3 Review CORS Configuration

- [ ] Document that `origin: "*"` is intentional for local device use
- [ ] Add environment variable to restrict CORS origins for production
- [ ] Add security note in README about network exposure

**Files:** `src/web/IntegratedWebService.ts:117`

---

## Phase 5: Developer Experience Improvements

### 5.1 Add Pre-commit Hooks

- [ ] Install `husky` for git hooks
- [ ] Add pre-commit hook for `npm run format`
- [ ] Add pre-commit hook for `npm run lint`
- [ ] Add pre-push hook for `npm test`

### 5.2 Improve Error Messages

- [ ] Extract error message switch statements to mapping objects
- [ ] Create `ErrorMessages.ts` constants file
- [ ] Add i18n-ready structure for future localization
- [ ] Ensure all errors have helpful user messages

### 5.3 Add JSDoc to Large Services

- [ ] Add comprehensive JSDoc to `SVGService` public methods
- [ ] Add JSDoc to `RenderingOrchestrator` public methods
- [ ] Add JSDoc to `WebController` endpoints
- [ ] Add `@example` tags for complex methods

### 5.4 Create Architecture Documentation

- [ ] Add sequence diagrams for main flows (GPS update, track selection)
- [ ] Document state machine for WiFi/onboarding flow
- [ ] Add component diagram showing service dependencies
- [ ] Place in `docs/` directory (only if requested)

---

## Phase 6: Performance Optimizations

### 6.1 Optimize Rendering Pipeline

- [ ] Profile `SVGService.renderViewport()` for bottlenecks
- [ ] Consider caching projected coordinates for unchanged viewports
- [ ] Optimize bitmap operations with typed arrays
- [ ] Add performance metrics logging (opt-in)

### 6.2 Reduce Memory Allocations

- [ ] Reuse bitmap buffers where possible in `SVGService`
- [ ] Pool coordinate arrays in projection calculations
- [ ] Review callback array allocations in orchestrator

### 6.3 Optimize GPS Update Handling

- [ ] Add configurable debouncing for display updates
- [ ] Implement position change threshold (skip updates if moved < X meters)
- [ ] Consider batching rapid position updates

---

## Phase 7: Code Cleanup

### 7.1 Remove Unused Code

- [ ] Remove `IProjectionInterface.ts` (listed as unused in jest.config.js:27)
- [ ] Remove `textRenderer.ts` (listed as unused in jest.config.js:26)
- [ ] Audit for other dead code

### 7.2 Consolidate Similar Patterns

- [ ] Review error class `getUserMessage()` methods for DRY opportunities
- [ ] Consider generic error message builder
- [ ] Consolidate duplicate validation logic across services

### 7.3 Improve Type Consistency

- [ ] Audit all `as` type assertions - replace with type guards where possible
- [ ] Review enum usage for consistency
- [ ] Consider branded types for IDs (TrackId, WaypointId)

---

## Completion Checklist

After all phases:

- [ ] Run full test suite: `npm test`
- [ ] Run coverage report: `npm run test:coverage`
- [ ] Run linter: `npm run lint`
- [ ] Run formatter: `npm run format`
- [ ] Update CLAUDE.md if architecture changed significantly
- [ ] Update README.md with any new setup requirements

---

## Notes

**File Size Reference (lines of code):**
| File | Lines | Priority |
|------|-------|----------|
| RenderingOrchestrator.ts | 3,014 | HIGH |
| SVGService.ts | 2,348 | HIGH |
| WebController.ts | 2,150 | HIGH |
| WiFiService.ts | 1,542 | MEDIUM |
| IntegratedWebService.ts | 809 | LOW |
| DriveNavigationService.ts | 677 | LOW |
| EPaperService.ts | 662 | LOW |

**Test Coverage Exclusions (jest.config.js):**

- `WiFiService.ts` - hardware dependency
- `GPSService.ts` - hardware dependency
- `EPaperService.ts` - hardware dependency
- `RenderingOrchestrator.ts` - needs integration tests

**Positive Aspects (keep as-is):**

- Result type pattern - excellent error handling
- ServiceContainer DI pattern - clean architecture
- Path aliases - good developer experience
- Custom error hierarchy - comprehensive error handling
- No `any` types - strong type safety
- No eslint-disable comments - clean code
