module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@core/types$": "<rootDir>/src/core/types",
    "^@core/interfaces$": "<rootDir>/src/core/interfaces",
    "^@core/types/(.*)$": "<rootDir>/src/core/types/$1",
    "^@core/errors$": "<rootDir>/src/core/errors",
    "^@services/(.*)$": "<rootDir>/src/services/$1",
    "^@di/(.*)$": "<rootDir>/src/di/$1",
    "^@web/(.*)$": "<rootDir>/src/web/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  // Increase timeout for hardware-related tests
  testTimeout: 10000,
};
