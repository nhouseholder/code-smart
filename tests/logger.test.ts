import { describe, it, expect, beforeEach } from "vitest";
import {
  createLogger,
  getLogBuffer,
  clearLogBuffer,
  setLogLevel,
  getLogBufferFiltered,
} from "../src/lib/logger";

beforeEach(() => {
  clearLogBuffer();
  setLogLevel("debug"); // capture everything during tests
});

describe("createLogger", () => {
  it("creates a logger with info/warn/error/debug methods", () => {
    const log = createLogger("test-component");
    expect(log).toHaveProperty("info");
    expect(log).toHaveProperty("warn");
    expect(log).toHaveProperty("error");
    expect(log).toHaveProperty("debug");
    expect(typeof log.info).toBe("function");
  });

  it("accumulates entries in the buffer", () => {
    const log = createLogger("test");
    log.info("hello world");
    const buffer = getLogBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0].message).toBe("hello world");
    expect(buffer[0].component).toBe("test");
    expect(buffer[0].level).toBe("info");
  });

  it("includes structured data in log entries", () => {
    const log = createLogger("test");
    log.info("request complete", { durationMs: 150, status: 200 });
    const entry = getLogBuffer()[0];
    expect(entry.data).toEqual({ durationMs: 150, status: 200 });
  });

  it("produces ISO timestamps", () => {
    const log = createLogger("test");
    log.info("timed");
    const entry = getLogBuffer()[0];
    expect(() => new Date(entry.timestamp)).not.toThrow();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("captures multiple log levels", () => {
    const log = createLogger("multi");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");
    log.debug("debug msg");

    const buffer = getLogBuffer();
    expect(buffer).toHaveLength(4);
    expect(buffer.map((e) => e.level)).toEqual(["info", "warn", "error", "debug"]);
  });
});

describe("clearLogBuffer", () => {
  it("empties the buffer", () => {
    const log = createLogger("test");
    log.info("one");
    expect(getLogBuffer()).toHaveLength(1);
    clearLogBuffer();
    expect(getLogBuffer()).toHaveLength(0);
  });
});

describe("setLogLevel", () => {
  it("suppresses messages below the minimum level", () => {
    setLogLevel("warn");
    const log = createLogger("test");
    log.info("should not appear");
    log.warn("should appear");
    log.error("should also appear");

    const buffer = getLogBuffer();
    expect(buffer).toHaveLength(2);
    expect(buffer[0].level).toBe("warn");
    expect(buffer[1].level).toBe("error");
  });

  it("allows all levels when set to debug", () => {
    setLogLevel("debug");
    const log = createLogger("test");
    log.debug("debug msg");
    log.info("info msg");
    expect(getLogBuffer()).toHaveLength(2);
  });

  it("allows only error when set to error", () => {
    setLogLevel("error");
    const log = createLogger("test");
    log.info("ignored");
    log.warn("ignored");
    log.error("captured");
    expect(getLogBuffer()).toHaveLength(1);
    expect(getLogBuffer()[0].level).toBe("error");
  });
});

describe("getLogBufferFiltered", () => {
  it("returns only entries at or above the given level", () => {
    const log = createLogger("test");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    const filtered = getLogBufferFiltered("warn");
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.level)).toEqual(["warn", "error"]);
  });
});

describe("multiple loggers", () => {
  it("share the same buffer", () => {
    const logA = createLogger("component-a");
    const logB = createLogger("component-b");

    logA.info("from a");
    logB.info("from b");

    const buffer = getLogBuffer();
    expect(buffer).toHaveLength(2);
    expect(buffer[0].component).toBe("component-a");
    expect(buffer[1].component).toBe("component-b");
  });
});
