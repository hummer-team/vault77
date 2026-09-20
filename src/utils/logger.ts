/** Minimal structured logger. Replace with a full logger library in production. */
export const logger = {
    info: (message: string, ...args: unknown[]): void => {
        const logStr = formatMessage('INFO', message, args);
        console.info(logStr);
    },
    warn: (message: string, ...args: unknown[]): void => {
        const logStr = formatMessage('WARN', message, args);
        console.warn(logStr);
    },
    error: (message: string, ...args: unknown[]): void => {
        const logStr = formatMessage('ERROR', message, args);
        console.error(logStr);
    },
    debug: (message: string, ...args: unknown[]): void => {
        // Show debug in dev mode or when DEV is undefined (test/unknown environments)
        if (import.meta.env.DEV !== false) {
            const logStr = formatMessage('DEBUG', message, args);
            console.debug(logStr);
        }
    },
};

function formatMessage(level: string, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const serializedArgs = args.map(serializeArg).filter(Boolean).join(' ');
    return `${timestamp} | ${level} | ${message}${serializedArgs ? ' ' + serializedArgs : ''}`;
}

function serializeArg(arg: unknown): string {
    if (arg instanceof Error) {
        return JSON.stringify({ message: arg.message, stack: arg.stack });
    }
    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}

export const toError = (err: unknown): string =>
    err instanceof Error ? err.stack ?? String(err) : String(err);
