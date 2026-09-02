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
  /^(?:api_?key|secret|password|credentials?|access_token|refresh_token|private_journal|chain_of_thought)$/i;

function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_FIELD.test(key) ? "[REDACTED]" : value,
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
