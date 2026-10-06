import type { Logger } from './logger.js';

type ProcessEvents = Pick<NodeJS.Process, 'on'>;

/**
 * Sends the two "nothing caught this" events through the redacting logger.
 * Left alone, Node prints the raw error to stderr, message and all, which is
 * the one route by which an error could reach the logs unfiltered.
 *
 * The process then exits: after an uncaught error its state cannot be trusted,
 * and the platform starts a clean instance for the next request.
 */
export function installCrashHandlers(
  logger: Logger,
  target: ProcessEvents = process,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  target.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    exit(1);
  });
  target.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    exit(1);
  });
}
