/** Minimal structured logger. Replace with a full logger library in production. */
export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    const logStr = formatMessage("INFO", message, args);
    console.info(logStr);
  },
  warn: (message: string, ...args: unknown[]): void => {
    const logStr = formatMessage("WARN", message, args);
    console.warn(logStr);
  },
  error: (message: string, ...args: unknown[]): void => {
    const logStr = formatMessage("ERROR", message, args);
    console.error(logStr);
  },
  debug: (message: string, ...args: unknown[]): void => {
    // Safe guard: only output debug logs when import.meta.env.DEV is explicitly true.
    // Uses optional chaining to avoid TypeError in environments without import.meta.env.
    const isDev =
      (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ===
      true;
    if (isDev) {
      const logStr = formatMessage("DEBUG", message, args);
      console.debug(logStr);
    }
  },
};

function formatMessage(
  level: string,
  message: string,
  args: unknown[],
): string {
  const timestamp = new Date().toISOString();
  const serializedArgs = args.map(serializeArg).filter(Boolean).join(" ");
  return `${timestamp} | ${level} | ${message}${serializedArgs ? " " + serializedArgs : ""}`;
}

/**
 * Serialize a single argument for log output.
 * - Error → JSON {message, stack}
 * - Plain object → "key:value" pairs space-joined (consistent with legacy meta style)
 * - Others → String(value)
 */
function serializeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return JSON.stringify({ message: arg.message, stack: arg.stack });
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      return Object.entries(arg as Record<string, unknown>)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

export const toError = (err: unknown): string =>
  err instanceof Error ? (err.stack ?? String(err)) : String(err);
