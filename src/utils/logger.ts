/** Minimal structured logger. Replace with a full logger library in production. */
export const logger = {
    info: (message: string, meta?: Record<string, unknown>): void => {
        const logStr =`${new Date().toISOString()} | INFO | ${message} ${meta ? Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' ') : ''}`;
        console.info(logStr)
    },
    warn: (message: string, meta?: Record<string, unknown>): void => {
      const logStr =`${new Date().toISOString()} | WARN | ${message} ${meta ? Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' ') : ''}`;
      console.info(logStr)
    },
    error: (message: string, meta?: Record<string, unknown>): void => {
      const logStr =`${new Date().toISOString()} | ERROR | ${message} ${meta ? Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' ') : ''}`;
      console.info(logStr)
    },
    debug: (message: string, meta?: Record<string, unknown>): void => {
        if (process.env['NODE_ENV'] !== 'production') {
          const logStr =`${new Date().toISOString()} | DEBUG | ${message} ${meta ? Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' ') : ''}`;
          console.info(logStr)
        }
    },
};

export const toError = (err: unknown): string =>
    err instanceof Error ? err.stack??  String(err):String(err);
