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
  "^@services/(.*)$": "<rootDir>/src/services/$1",
  "^@di/(.*)$": "<rootDir>/src/di/$1",
  "^@web/(.*)$": "<rootDir>/src/web/$1",
  "^@utils/(.*)$": "<rootDir>/src/utils/$1",
};
export const collectCoverageFrom = [
  "src/**/*.ts",
  "!src/**/*.test.ts",
  "!src/**/*.d.ts",
  "!src/**/__tests__/**",
];
export const coverageThreshold = {
  global: {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
  },
};
export const testTimeout = 10000;
