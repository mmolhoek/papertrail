export const preset = "ts-jest";
export const testEnvironment = "node";
export const roots = ["<rootDir>/src"];
export const testMatch = ["**/__tests__/**/*.test.ts"];
export const moduleNameMapper = {
  "^core/(.*)$": "<rootDir>/src/core/$1",
  "^@core/types$": "<rootDir>/src/core/types",
  "^@core/interfaces$": "<rootDir>/src/core/interfaces",
  "^@core/types/(.*)$": "<rootDir>/src/core/types/$1",
  "^@core/errors$": "<rootDir>/src/core/errors",
  "^@core/errors/(.*)$": "<rootDir>/src/core/errors/$1",
  "^@core/constants$": "<rootDir>/src/core/constants",
  "^@core/constants/(.*)$": "<rootDir>/src/core/constants/$1",
  "^@errors/(.*)$": "<rootDir>/src/core/errors/$1",
  "^@services/(.*)$": "<rootDir>/src/services/$1",
  "^@di/(.*)$": "<rootDir>/src/di/$1",
  "^@web/(.*)$": "<rootDir>/src/web/$1",
  "^@utils/(.*)$": "<rootDir>/src/utils/$1",
  // Mock imagemagick wrapper since tests run without ImageMagick CLI installed
  "^@utils/imagemagick$": "<rootDir>/src/__mocks__/imagemagick.ts",
};
export const collectCoverageFrom = [
  "src/**/*.ts",
  "!src/**/*.test.ts",
  "!src/**/*.d.ts",
  "!src/**/__tests__/**",
  // Entry point - not unit tested
  "!src/index.ts",
  // Index re-export files (just re-exports, no logic)
  "!src/**/index.ts",
  // Hardware services requiring nmcli on Linux - tested via MockWiFiService
  "!src/services/wifi/WiFiService.ts",
  "!src/services/wifi/ConnectionManager.ts",
  "!src/services/wifi/HotspotManager.ts",
  "!src/services/wifi/NetworkScanner.ts",
  "!src/services/wifi/WiFiStateMachine.ts",
  // ImageMagick-dependent utilities - require ImageMagick CLI
  "!src/utils/magickTextRenderer.ts",
  "!src/utils/magickImageProcessor.ts",
  "!src/utils/unifiedTextRenderer.ts",
  // Hardware services requiring physical devices - tested via mocks
  "!src/services/gps/GPSService.ts",
  "!src/services/epaper/EPD.ts",
  "!src/services/epaper/EPaperService.ts",
  // E-paper hardware drivers and adapters - require GPIO/SPI hardware
  "!src/services/epaper/adapters/LgpioAdapter.ts",
  "!src/services/epaper/drivers/Waveshare7in5BWDriver.ts",
  // Road rendering depends on vector map data
  "!src/services/svg/RoadRenderer.ts",
];
export const coverageThreshold = {
  global: {
    branches: 52,
    functions: 71,
    lines: 72,
    statements: 72,
  },
};
export const testTimeout = 10000;
