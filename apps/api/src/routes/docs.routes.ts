import { Router } from 'express';

const SWAGGER_UI_VERSION = '5.33.1';
const CDN = 'https://cdn.jsdelivr.net';
const SWAGGER_UI = `${CDN}/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

// Subresource integrity: the browser refuses these files if their content ever
// differs from what was reviewed, even if the CDN is compromised. Recompute
// both hashes when changing the version.
const STYLES_INTEGRITY = 'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW';
const SCRIPT_INTEGRITY = 'sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw';

/**
 * The rest of the API answers with a deny-all policy. This page has to load
 * the viewer, so it gets the narrowest policy that allows exactly that.
 * Swagger UI sets inline styles, hence 'unsafe-inline' for styles only.
 */
const DOCS_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src 'self' ${CDN}`,
  `style-src ${CDN} 'unsafe-inline'`,
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join(';');

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Attune AI API</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" integrity="${STYLES_INTEGRITY}" crossorigin="anonymous" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js" integrity="${SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
    <script src="/docs/init.js"></script>
  </body>
</html>
`;

// Served as a file so the page needs no inline script, which the policy forbids.
const INIT_SCRIPT = `window.addEventListener('load', function () {
  window.SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' });
});
`;

/** `GET /openapi.json` for tools, `GET /docs` for people. */
export function createDocsRouter(document: Record<string, unknown>): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });

  router.get('/docs', (_req, res) => {
    res.set('Content-Security-Policy', DOCS_CONTENT_SECURITY_POLICY).type('html').send(PAGE);
  });

  router.get('/docs/init.js', (_req, res) => {
    res.type('application/javascript').send(INIT_SCRIPT);
  });

  return router;
}
