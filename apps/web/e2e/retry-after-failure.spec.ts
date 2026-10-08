import { expect, test } from '@playwright/test';

import { API_ORIGIN } from './servers';

const VISIT_TITLE = 'Sore throat and cough';
const MODEL_OUTAGE = `${API_ORIGIN}/e2e/model-outage`;
const VISIT_PAGE = /\/visits\/[0-9a-f-]{36}$/;

// Another test must never inherit an outage, whatever happens in this one.
test.afterEach(async ({ request }) => {
  await request.delete(MODEL_OUTAGE);
});

/**
 * The AI service is overloaded when the note is asked for, and recovers
 * later. The API here is the in-memory test server with its model switched
 * off, so the failure takes the real path: the upload is accepted, the run
 * starts, the model fails twice and the visit is marked as failed.
 */
test('when the AI service is busy, the audio is kept and one click retries it on the same visit', async ({
  page,
  request,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(message.text());
    }
  });

  const tryAgain = page.getByRole('button', { name: 'Try again' });
  let failedVisit = '';

  await test.step('the note is asked for while the AI service is down', async () => {
    expect((await request.put(MODEL_OUTAGE)).status()).toBe(204);

    await page.goto('/');
    await page.getByRole('button', { name: 'Try as guest' }).click();
    await page.getByRole('link', { name: 'New visit' }).click();
    await page.getByText('Sample', { exact: true }).click();
    await page.getByRole('button', { name: `Use the sample: ${VISIT_TITLE}` }).click();
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.getByRole('button', { name: 'Yes, everyone has agreed' }).click();
  });

  await test.step('the failure is explained in plain words, with a way to try again', async () => {
    await expect(
      page.getByText(
        'The AI service is busy right now. Please try again in a minute. Your recording is still here.',
      ),
    ).toBeVisible();
    await expect(page).toHaveURL(VISIT_PAGE);
    await expect(page.getByRole('heading', { name: VISIT_TITLE })).toBeVisible();
    await expect(tryAgain).toBeVisible();
    // Nothing of what the model or the server said about the failure reaches the page.
    await expect(page.locator('body')).not.toContainText(/overloaded|scripted|HTTP|AI_UNAVAILABLE/);

    failedVisit = page.url();
  });

  await test.step('a reload would lose the audio, so the browser asks first', async () => {
    const asked: string[] = [];
    page.once('dialog', (dialog) => {
      asked.push(dialog.type());
      void dialog.dismiss();
    });
    await page.evaluate(() => {
      window.location.reload();
    });

    await expect.poll(() => asked).toEqual(['beforeunload']);
    await expect(tryAgain).toBeVisible();
  });

  await test.step('once the service is back, one click sends the same audio to the same visit', async () => {
    expect((await request.delete(MODEL_OUTAGE)).status()).toBe(204);

    await tryAgain.click();

    await expect(page.getByLabel('Subjective')).toHaveValue(/Sore throat/);
    await expect(page.getByLabel('Plan')).toHaveValue('Rest and fluids.');
    expect(page.url()).toBe(failedVisit);
  });

  await test.step('the failed attempt left no second visit behind', async () => {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Visits' })
      .click();

    const visits = page.getByRole('list', { name: 'Visits' });
    await expect(visits.getByRole('link', { name: new RegExp(VISIT_TITLE) })).toHaveCount(1);
    await expect(visits.getByRole('listitem')).toHaveCount(1);
  });

  expect(problems).toEqual([]);
});
