/**
 * The wording about what this product is and is not. Kept in one place so the
 * landing page, the footer and the sign-in pages cannot drift apart, and so a
 * test can check that nothing here ever claims compliance.
 */
export const DISCLAIMER = {
  short: 'Demo only, for synthetic data. Built with HIPAA-style safeguards; not a medical device.',
  title: 'This is a demo, not a clinical product',
  body: 'Attune AI is built with HIPAA-style safeguards, but it is not HIPAA compliant and it is not a medical device. Use synthetic data only, and never enter information about a real patient.',
  guest:
    'You are using a guest session. It ends 24 hours after it started, and its data is then deleted.',
  recording: 'Use invented conversations only. Never record or upload a real patient.',
  draft: 'Drafted by AI from the conversation. Read it and correct it before relying on it.',
} as const;
