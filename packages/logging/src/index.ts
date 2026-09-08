export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export interface LogContext {
  correlation_id?: string;
  request_id?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;
}

interface LoggerOptions {
  environment: string;
  now?: () => Date;
  service: string;
  write?: (line: string) => void;
}

const SENSITIVE_FIELD =
  /(?:^|[_-])(?:api[_-]?key|client[_-]?secret|secret(?:[_-]?value)?|password|credentials?|authorization(?:[_-]?header)?|cookies?|set[_-]?cookie|access[_-]?token|refresh[_-]?token|session[_-]?token|token|private[_-]?journal|chain[_-]?of[_-]?thought)(?:$|[_-])/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_FIELD.test(key)) return "[REDACTED]";
  if (
    /^headers?$/i.test(key) &&
    (typeof value === "string" || Array.isArray(value))
  )
    return "[REDACTED]";
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue("", entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeValue(nestedKey, nestedValue),
      ]),
    );
  }
  return value;
}

export function redactStructuredData(value: unknown): unknown {
  return sanitizeValue("", value);
}

function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sanitizeValue(key, value),
    ]),
  );
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const write =
    options.write ?? ((line: string) => process.stdout.write(`${line}\n`));

  const log = (
    level: LogLevel,
    message: string,
    context: LogContext = {},
  ): void => {
    const safeContext = sanitizeContext(context);
    const record = {
      ...safeContext,
      timestamp: now().toISOString(),
      level,
      service: options.service,
      environment: options.environment,
      request_id: context.request_id ?? null,
      correlation_id: context.correlation_id ?? null,
      message,
    };
    write(JSON.stringify(record));
  };

  return {
    debug: (message, context) => log("DEBUG", message, context),
    info: (message, context) => log("INFO", message, context),
    warn: (message, context) => log("WARN", message, context),
    error: (message, context) => log("ERROR", message, context),
    fatal: (message, context) => log("FATAL", message, context),
  };
}
