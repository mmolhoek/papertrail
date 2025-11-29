import winston from "winston";
import dotenv from "dotenv";

dotenv.config();
import { getLogger } from "../logger";

class TestTransport extends winston.transports.Stream {
  logs: winston.Logform.TransformableInfo[] = [];

  constructor() {
    super({
      stream: process.stdout as unknown as NodeJS.WritableStream,
      format: winston.format.json(),
    });
  }

  log(info: winston.Logform.TransformableInfo, cb: () => void): void {
    this.logs.push(info);
    cb();
  }
}

describe("logger", () => {
  it("should log to info when LOG_LEVEL is not set", () => {
    const levelBackup = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "";
    const transport = new TestTransport();
    const logger = getLogger("test", transport);
    const nrLogs = 1;
    logger.debug("debug");
    logger.info("info");
    expect(transport.logs).toHaveLength(nrLogs);
    expect(transport).toHaveProperty("logs[0].level", "info");
    process.env.LOG_LEVEL = levelBackup;
  });

  it("should log to warn and above when LOG_LEVEL is set to warn", () => {
    const levelBackup = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "warn";
    const transport = new TestTransport();
    const logger = getLogger("test", transport);
    const nrLogs = 2;
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
    expect(transport.logs).toHaveLength(nrLogs);
    expect(transport).toHaveProperty("logs[0].level", "warn");
    expect(transport).toHaveProperty("logs[1].level", "error");
    process.env.LOG_LEVEL = levelBackup;
  });

  it("should log to stdout with timestamp", () => {
    const levelBackup = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    const transport = new TestTransport();
    const logger = getLogger("test", transport);
    logger.info("test");
    expect(transport.logs).toHaveLength(1);
    expect(transport).toHaveProperty("logs[0].level", "info");
    expect(transport).toHaveProperty("logs[0].message", "test");
    process.env.LOG_LEVEL = levelBackup;
  });

  it("should log to stdout with timestamp and context", () => {
    const levelBackup = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    const transport = new TestTransport();
    const logger = getLogger("test", transport);
    logger.info("test", { context: "test" });
    expect(transport.logs).toHaveLength(1);
    expect(transport).toHaveProperty("logs[0].level", "info");
    expect(transport).toHaveProperty("logs[0].message", "test");
    expect(transport).toHaveProperty("logs[0].context", "test");
    process.env.LOG_LEVEL = levelBackup;
  });

  it("should log to stdout with timestamp and error", () => {
    const levelBackup = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    const transport = new TestTransport();
    const logger = getLogger("test", transport);
    logger.error("test");
    expect(transport.logs).toHaveLength(1);
    expect(transport).toHaveProperty("logs[0].level", "error");
    expect(transport).toHaveProperty("logs[0].message", "test");
    process.env.LOG_LEVEL = levelBackup;
  });

  describe("timing functionality", () => {
    it("should measure time between time() and timeEnd() calls", async () => {
      const levelBackup = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "info";
      const transport = new TestTransport();
      const logger = getLogger("test", transport);

      logger.time("operation");
      await new Promise((resolve) => setTimeout(resolve, 50));
      logger.timeEnd("operation");

      expect(transport.logs).toHaveLength(1);
      expect(transport).toHaveProperty("logs[0].level", "info");
      const message = String(transport.logs[0].message);
      expect(message).toMatch(/operation: \d+ms/);

      const match = message.match(/operation: (\d+)ms/);
      expect(match).toBeTruthy();
      if (match) {
        const duration = parseInt(match[1], 10);
        expect(duration).toBeGreaterThanOrEqual(40);
        expect(duration).toBeLessThan(150);
      }

      process.env.LOG_LEVEL = levelBackup;
    });

    it("should handle multiple concurrent timers", async () => {
      const levelBackup = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "info";
      const transport = new TestTransport();
      const logger = getLogger("test", transport);

      logger.time("operation1");
      logger.time("operation2");
      await new Promise((resolve) => setTimeout(resolve, 20));
      logger.timeEnd("operation1");
      await new Promise((resolve) => setTimeout(resolve, 20));
      logger.timeEnd("operation2");

      expect(transport.logs).toHaveLength(2);
      expect(String(transport.logs[0].message)).toMatch(/operation1: \d+ms/);
      expect(String(transport.logs[1].message)).toMatch(/operation2: \d+ms/);

      process.env.LOG_LEVEL = levelBackup;
    });

    it("should warn when timeEnd is called without time", () => {
      const levelBackup = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "info";
      const transport = new TestTransport();
      const logger = getLogger("test", transport);

      logger.timeEnd("nonexistent");

      expect(transport.logs).toHaveLength(1);
      expect(transport).toHaveProperty("logs[0].level", "warn");
      expect(String(transport.logs[0].message)).toContain(
        "Timer 'nonexistent' does not exist",
      );

      process.env.LOG_LEVEL = levelBackup;
    });

    it("should remove timer after timeEnd is called", () => {
      const levelBackup = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "info";
      const transport = new TestTransport();
      const logger = getLogger("test", transport);

      logger.time("operation");
      logger.timeEnd("operation");
      logger.timeEnd("operation"); // Should warn

      expect(transport.logs).toHaveLength(2);
      expect(String(transport.logs[0].message)).toMatch(/operation: \d+ms/);
      expect(transport).toHaveProperty("logs[1].level", "warn");
      expect(String(transport.logs[1].message)).toContain(
        "Timer 'operation' does not exist",
      );

      process.env.LOG_LEVEL = levelBackup;
    });

    it("should allow reusing timer label after timeEnd", async () => {
      const levelBackup = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "info";
      const transport = new TestTransport();
      const logger = getLogger("test", transport);

      logger.time("operation");
      await new Promise((resolve) => setTimeout(resolve, 10));
      logger.timeEnd("operation");

      logger.time("operation");
      await new Promise((resolve) => setTimeout(resolve, 10));
      logger.timeEnd("operation");

      expect(transport.logs).toHaveLength(2);
      expect(String(transport.logs[0].message)).toMatch(/operation: \d+ms/);
      expect(String(transport.logs[1].message)).toMatch(/operation: \d+ms/);

      process.env.LOG_LEVEL = levelBackup;
    });
  });
});
