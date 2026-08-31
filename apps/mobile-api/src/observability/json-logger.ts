import type { LoggerService } from "@nestjs/common";

function write(level: string, message: unknown, context?: string, trace?: string) {
  const priorities: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const configured = process.env.LOG_LEVEL || "info";
  if ((priorities[level] ?? 20) < (priorities[configured] ?? 20)) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "mobile-api",
    message: typeof message === "string" ? message : JSON.stringify(message),
    ...(context ? { context } : {}),
    ...(trace && process.env.NODE_ENV !== "production" ? { trace } : {})
  };
  const output = `${JSON.stringify(entry)}\n`;
  if (level === "error") process.stderr.write(output);
  else process.stdout.write(output);
}

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string) {
    write("info", message, context);
  }
  error(message: unknown, trace?: string, context?: string) {
    write("error", message, context, trace);
  }
  warn(message: unknown, context?: string) {
    write("warn", message, context);
  }
  debug(message: unknown, context?: string) {
    if (process.env.LOG_LEVEL === "debug") write("debug", message, context);
  }
  verbose(message: unknown, context?: string) {
    if (process.env.LOG_LEVEL === "debug") write("debug", message, context);
  }
}
