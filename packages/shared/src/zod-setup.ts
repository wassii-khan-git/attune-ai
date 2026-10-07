import * as z from 'zod';

/**
 * Zod can speed up validation by compiling code with `new Function`. Whether
 * it may do so is decided when a schema is created, and merely probing for it
 * is reported by a browser as a violation of a content security policy that
 * forbids generated code, as the web app's does.
 *
 * So in a browser the feature is switched off, and that has to happen before
 * the first schema exists: this module is imported first, for its effect.
 * Validation gives the same results either way. Servers keep the faster path.
 */
if ('document' in globalThis) {
  z.config({ jitless: true });
}
