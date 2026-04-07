const MASKED = "***hidden***";

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token",
  "authorization",
  "apikey",
  "api_key",
  "secret",
  "session",
  "user",
]);

const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+\b/g;
const BEARER_PATTERN = /bearer\s+[a-zA-Z0-9._-]+/gi;

const maskString = (value: string) =>
  value.replace(JWT_PATTERN, MASKED).replace(BEARER_PATTERN, `Bearer ${MASKED}`);

const sanitizeForLogging = (value: unknown, key?: string): unknown => {
  if (value == null) return value;

  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return MASKED;
  }

  if (typeof value === "string") {
    return maskString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeForLogging(item));
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    return {
      status: value.status,
      ok: value.ok,
      type: value.type,
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    return Object.fromEntries(entries.map(([entryKey, entryValue]) => [entryKey, sanitizeForLogging(entryValue, entryKey)]));
  }

  return String(value);
};

const writeLog = (method: "debug" | "info" | "warn" | "error", args: unknown[]) => {
  if (import.meta.env.PROD) return;
  const sanitizedArgs = args.map((arg) => sanitizeForLogging(arg));
  console[method](...sanitizedArgs);
};

export const logger = {
  debug: (...args: unknown[]) => writeLog("debug", args),
  info: (...args: unknown[]) => writeLog("info", args),
  warn: (...args: unknown[]) => writeLog("warn", args),
  error: (...args: unknown[]) => writeLog("error", args),
};

export const silenceConsoleInProduction = () => {
  if (!import.meta.env.PROD) return;
  const noop = () => undefined;
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
};

export const getSafeErrorMessage = (error: unknown, fallback = "Something went wrong") => {
  if (error instanceof Error && error.message) {
    return maskString(error.message);
  }

  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return maskString((error as { message: string }).message);
  }

  return fallback;
};
