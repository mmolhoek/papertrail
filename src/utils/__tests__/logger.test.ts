import winston from "winston";
import dotenv from "dotenv";

dotenv.config();
import { getLogger } from "../logger";

class TestTransport extends winston.transports.Stream {
  logs: winston.Logform.TransformableInfo[] = [];

  constructor() {
    super({ stream: process.stdout as unknown as NodeJS.WritableStream });
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
});
