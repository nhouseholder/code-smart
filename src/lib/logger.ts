/**
 * Structured logger for code-smart.
 *
 * Provides component-scoped logging with level filtering, structured
 * data attachment, and an in-memory buffer for test assertion and
 * pipeline status capture.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/** In-memory log buffer shared across all loggers. */
let buffer: LogEntry[] = [];

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

function toISO(ts: number): string {
  return new Date(ts).toISOString();
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minLevel);
}

const currentMinLevel: { level: LogLevel } = { level: "info" };

/**
 * Set the minimum log level globally. Messages below this level are
 * silently dropped.
 */
export function setLogLevel(level: LogLevel): void {
  currentMinLevel.level = level;
}

function emit(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level, currentMinLevel.level)) return;

  const entry: LogEntry = {
    timestamp: toISO(Date.now()),
    level,
    component,
    message,
    data,
  };

  buffer.push(entry);

  // Also write to console for operational visibility
  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${component}]`;
  const suffix = data ? ` ${JSON.stringify(data)}` : "";

  switch (level) {
    case "error":
      console.error(`${prefix} ${message}${suffix}`);
      break;
    case "warn":
      console.warn(`${prefix} ${message}${suffix}`);
      break;
    case "debug":
      console.debug(`${prefix} ${message}${suffix}`);
      break;
    default:
      console.log(`${prefix} ${message}${suffix}`);
  }
}

/**
 * Create a scoped logger for a named component.
 *
 * ```ts
 * const log = createLogger("pipeline");
 * log.info("step complete", { step: "scrape", durationMs: 1200 });
 * ```
 */
export function createLogger(component: string): Logger {
  return {
    info: (msg, data?) => emit("info", component, msg, data),
    warn: (msg, data?) => emit("warn", component, msg, data),
    error: (msg, data?) => emit("error", component, msg, data),
    debug: (msg, data?) => emit("debug", component, msg, data),
  };
}

/** Return all accumulated log entries (for testing / pipeline capture). */
export function getLogBuffer(): LogEntry[] {
  return buffer;
}

/** Clear the in-memory log buffer. */
export function clearLogBuffer(): void {
  buffer = [];
}

/** Return entries at or above a severity level. */
export function getLogBufferFiltered(level: LogLevel): LogEntry[] {
  return buffer.filter((e) => shouldLog(e.level, level));
}
