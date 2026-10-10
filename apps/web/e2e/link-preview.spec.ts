import { expect, test } from '@playwright/test';

import { SITE_ORIGIN } from './servers';

/** How LinkedIn's crawler introduces itself. Slack's and X's fetch a page the same way. */
const CRAWLER =
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)';

/** The `content` of the `<meta>` tag with this `property` or `name`. */
function metaContent(html: string, key: string): string | undefined {
  return new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];
}

/**
 * What happens when someone posts the site's address on LinkedIn, Slack or X.
 * The service fetches the page and its picture itself: with no session, and
 * without running any script. So the tags have to be in the `<head>` as it is
 * served, the picture's address has to be absolute, and neither may ask for a
 * sign-in. No browser is involved, only requests.
 */
test('a link to the landing page can be shown as a card with a picture', async ({ request }) => {
  let pictureAddress = '';

  await test.step('the page describes itself in its head, to a crawler with no session', async () => {
    const response = await request.get('/', {
      headers: { 'User-Agent': CRAWLER },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const [head = ''] = (await response.text()).split('</head>');

    expect(metaContent(head, 'og:title')).toBe('Attune AI');
    expect(metaContent(head, 'og:description')).toMatch(/clinical scribe/);
    expect(metaContent(head, 'og:description')).toBe(metaContent(head, 'description'));
    expect(metaContent(head, 'og:type')).toBe('website');
    expect(metaContent(head, 'og:site_name')).toBe('Attune AI');
    expect(metaContent(head, 'og:url')).toBe(SITE_ORIGIN);
    expect(metaContent(head, 'twitter:card')).toBe('summary_large_image');

    pictureAddress = metaContent(head, 'og:image') ?? '';
    expect(metaContent(head, 'twitter:image')).toBe(pictureAddress);
    expect(metaContent(head, 'og:image:alt')).toMatch(/^Attune AI\. .* synthetic data only\.$/);
  });

  await test.step('the picture has an absolute address on the public site', () => {
    expect(URL.canParse(pictureAddress)).toBe(true);
    expect(new URL(pictureAddress).origin).toBe(SITE_ORIGIN);
  });

  await test.step('the picture is a 1200 by 630 PNG that anyone can fetch', async () => {
    const { pathname, search } = new URL(pictureAddress);
    const response = await request.get(`${pathname}${search}`, {
      headers: { 'User-Agent': CRAWLER },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');

    // A PNG states its size in its first chunk: the width at byte 16, the height at byte 20.
    const png = await response.body();
    expect(png.toString('latin1', 1, 4)).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
