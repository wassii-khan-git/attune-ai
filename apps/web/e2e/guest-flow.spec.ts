import { expect, test } from '@playwright/test';

const VISIT_TITLE = 'Sore throat and cough';

/**
 * The main path through the product, end to end, as a first-time visitor
 * takes it. The API behind it is the in-memory test server, whose scripted
 * model always returns the same short transcript and note.
 */
test('a guest turns a sample consultation into a note, edits it, finds it again and deletes everything', async ({
  page,
}) => {
  // Nothing on the way may throw in the page or log an error to the console.
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(message.text());
    }
  });

  const mainNav = page.getByRole('navigation', { name: 'Main' });
  const visits = page.getByRole('list', { name: 'Visits' });
  const plan = page.getByLabel('Plan');
  const consent = page.getByRole('alertdialog', { name: 'Has everyone agreed?' });

  await test.step('start as a guest, with no visits', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try as guest' }).click();

    await expect(page.getByRole('heading', { name: 'Your visits' })).toBeVisible();
    await expect(page.getByText('No visits yet')).toBeVisible();
    await expect(page.getByText(/You are using a guest session/)).toBeVisible();
  });

  await test.step('a note cannot be created without consent', async () => {
    await page.getByRole('link', { name: 'New visit' }).click();
    await page.getByText('Sample', { exact: true }).click();
    await page.getByRole('button', { name: `Use the sample: ${VISIT_TITLE}` }).click();
    await expect(page.getByLabel('Visit title')).toHaveValue(VISIT_TITLE);
    // The button that was pressed is gone; the focus moved to what replaced it.
    await expect(page.getByRole('group', { name: `Selected audio: ${VISIT_TITLE}` })).toBeFocused();

    await page.getByRole('button', { name: 'Create note' }).click();
    await expect(consent).toBeVisible();
    // The question opens with the focus on the way out, so a stray Enter never confirms.
    await expect(consent.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await consent.getByRole('button', { name: 'Cancel' }).click();
    await expect(consent).toBeHidden();
    await expect(page).toHaveURL(/\/visits\/new$/);
  });

  await test.step('leaving with audio that was never uploaded asks first', async () => {
    page.once('dialog', (dialog) => void dialog.dismiss());
    await mainNav.getByRole('link', { name: 'Visits' }).click();

    await expect(page).toHaveURL(/\/visits\/new$/);
    await expect(page.getByLabel('Visit title')).toHaveValue(VISIT_TITLE);
  });

  await test.step('with consent, the note arrives on the visit page', async () => {
    await page.getByRole('button', { name: 'Create note' }).click();
    await consent.getByRole('button', { name: 'Yes, everyone has agreed' }).click();

    await expect(page).toHaveURL(/\/visits\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: VISIT_TITLE })).toBeVisible();
    await expect(page.getByLabel('Subjective')).toHaveValue(/Sore throat/);
    await expect(plan).toHaveValue('Rest and fluids.');
    await expect(page.getByRole('button', { name: 'Copy note' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
  });

  await test.step('the transcript stays out of sight until it is asked for', async () => {
    const transcript = page.getByRole('dialog', { name: 'Transcript' });
    await expect(page.getByText('What brings you in today?')).toBeHidden();

    await page.getByRole('button', { name: 'Show transcript' }).click();
    await expect(transcript.getByText('What brings you in today?')).toBeVisible();

    await transcript.getByRole('button', { name: 'Close' }).click();
    await expect(transcript).toBeHidden();
  });

  await test.step('an edit is saved without asking, and survives a reload', async () => {
    await plan.fill('Rest and fluids. Review in a week.');
    await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();

    await page.reload();
    await expect(plan).toHaveValue('Rest and fluids. Review in a week.');
  });

  await test.step('the visit is in the list and is found by its title', async () => {
    await mainNav.getByRole('link', { name: 'Visits' }).click();
    await expect(visits.getByRole('link', { name: new RegExp(VISIT_TITLE) })).toBeVisible();

    await page.getByLabel('Search visits by title').fill('knee');
    await expect(page.getByText('No visits match “knee”')).toBeVisible();

    await page.getByRole('button', { name: 'Clear the search' }).click();
    await expect(visits.getByRole('link', { name: new RegExp(VISIT_TITLE) })).toBeVisible();
  });

  await test.step('deleting the visit takes two clicks and empties the list', async () => {
    await visits.getByRole('link', { name: new RegExp(VISIT_TITLE) }).click();
    await page.getByRole('button', { name: 'Delete visit' }).click();
    await page.getByRole('button', { name: 'Yes, delete it' }).click();

    await expect(page.getByText('No visits yet')).toBeVisible();
  });

  await test.step('deleting the guest session ends it', async () => {
    await mainNav.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Delete guest session' }).click();
    await page.getByRole('button', { name: 'Yes, delete everything' }).click();

    await expect(page.getByText('Your account has been deleted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try as guest' })).toBeVisible();
  });

  expect(problems).toEqual([]);
});
