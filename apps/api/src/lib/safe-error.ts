/**
 * Base class for errors whose message this codebase wrote itself. Such a
 * message is a fixed sentence, perhaps with an identifier or a number in it,
 * and is known to contain no user data, so the logger may record it.
 *
 * Errors from libraries do not get that trust. Their messages can quote the
 * data being handled (the AI SDK quotes model output, `JSON.parse` quotes its
 * input), so the logger records only their type, code and stack frames.
 *
 * Never build the message of a `SafeError` from request data, model output or
 * anything read from the database.
 */
export class SafeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SafeError';
  }
}
