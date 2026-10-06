import { createLogger, type Logger } from '../lib/logger.js';

export type LogCapture = {
  logger: Logger;
  /** Everything written so far, as one string. */
  raw: () => string;
  /** Everything written so far, one parsed object per line. */
  entries: () => Record<string, unknown>[];
};

/** A real logger, redaction included, that writes to memory instead of stdout. */
export function captureLogs(): LogCapture {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    destination: { write: (line) => lines.push(line) },
  });

  return {
    logger,
    raw: () => lines.join(''),
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
