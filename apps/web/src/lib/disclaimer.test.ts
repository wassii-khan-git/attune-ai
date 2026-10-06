import { describe, expect, it } from 'vitest';

import { DISCLAIMER } from './disclaimer';

describe('disclaimer wording', () => {
  const all = Object.values(DISCLAIMER).join(' ');

  it('says plainly that the product is not compliant and not a medical device', () => {
    expect(DISCLAIMER.body).toContain('not HIPAA compliant');
    expect(DISCLAIMER.body).toContain('not a medical device');
    expect(DISCLAIMER.short).toContain('not a medical device');
  });

  it('never claims compliance: every mention of "compliant" is negated', () => {
    const mentions = [...all.matchAll(/(\bnot\s+)?HIPAA[- ]compliant/gi)];

    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.every((match) => match[1] !== undefined)).toBe(true);
  });

  it('tells people to use synthetic data only', () => {
    expect(DISCLAIMER.body).toMatch(/synthetic data only/i);
    expect(DISCLAIMER.body).toMatch(/never enter information about a real patient/i);
  });
});
