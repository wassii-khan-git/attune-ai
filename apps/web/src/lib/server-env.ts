import * as z from 'zod';

const schema = z.object({
  /** Where the API lives. Every /v1 request is forwarded there. */
  API_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  /**
   * The public address of this site. A link preview is built by another
   * service, which needs absolute addresses for the page and its image, so the
   * metadata resolves them against this. The default is the deployed demo.
   */
  SITE_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://attune-ai-web.vercel.app')
    .transform((url) => new URL(url).origin),
  /**
   * Shared with the API (same variable name there). With it, the API accepts
   * the browser's address from this app; without it, the API counts all
   * browser traffic as coming from this app's own address.
   */
  WEB_PROXY_SECRET: z.string().min(32).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

/**
 * Server-side settings, validated. Called when the server starts and when the
 * app is built, so a missing or malformed value stops the process instead of
 * producing a site whose every request fails. Never import this into client
 * code: nothing here is meant for the browser.
 */
export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment for the web app. ${problems}`);
  }
  return result.data;
}
