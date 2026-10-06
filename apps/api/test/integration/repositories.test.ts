import { createHash, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { EmailTakenError } from '../../src/repositories/user.repository.js';
import { UnknownOwnerError } from '../../src/repositories/visit.repository.js';
import { connectTestDatabase, uniqueEmail } from './database.js';

const db = connectTestDatabase();
const { prisma, repositories } = db;

afterAll(db.cleanUp);

const HASH = '$2b$04$abcdefghijklmnopqrstuuJ1b0Zz0Zz0Zz0Zz0Zz0Zz0Zz0Zz0Zz0Z';
const LONG_AGO = new Date('2000-01-01T00:00:00.000Z');

async function newUser() {
  const user = await repositories.users.createRegistered({
    email: uniqueEmail(),
    passwordHash: HASH,
  });
  db.track(user.id);
  return user;
}

async function newVisit(userId: string, title = 'Synthetic visit') {
  return repositories.visits.create({ userId, title, consentAt: new Date() });
}

describe('health', () => {
  it('answers a ping', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });
});

describe('users', () => {
  it('stores and finds a registered user', async () => {
    const user = await newUser();

    expect(await repositories.users.findByEmail(user.email ?? '')).toMatchObject({
      id: user.id,
      isGuest: false,
      role: 'USER',
    });
    expect(await repositories.users.findById(user.id)).toMatchObject({ email: user.email });
  });

  it('turns a duplicate email into EmailTakenError, even when both arrive together', async () => {
    const email = uniqueEmail();
    const attempts = await Promise.allSettled(
      [1, 2, 3].map(() => repositories.users.createRegistered({ email, passwordHash: HASH })),
    );

    const created = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    created.forEach((attempt) => db.track(attempt.value.id));

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((attempt) => attempt.reason instanceof EmailTakenError)).toBe(true);
  });

  it('lets the database refuse a registered account without credentials', async () => {
    await expect(prisma.user.create({ data: { isGuest: false } })).rejects.toThrow();
  });

  it('allows a guest without credentials', async () => {
    const guest = await repositories.users.createGuest();
    db.track(guest.id);

    expect(guest).toMatchObject({ isGuest: true, email: null, passwordHash: null });
  });

  it('purges only guests older than the cutoff and audits each one in the same statement', async () => {
    const oldGuest = db.track((await repositories.users.createGuest()).id);
    const newGuest = db.track((await repositories.users.createGuest()).id);
    const oldMember = await newUser();
    await prisma.user.updateMany({
      where: { id: { in: [oldGuest, oldMember.id] } },
      data: { createdAt: LONG_AGO },
    });
    const cutoff = new Date(LONG_AGO.getTime() + 1000);

    const purged = await repositories.retention.purgeGuestsCreatedBefore(cutoff);
    const again = await repositories.retention.purgeGuestsCreatedBefore(cutoff);

    expect(purged).toBe(1);
    expect(again).toBe(0);
    expect(await repositories.users.findById(oldGuest)).toBeNull();
    expect(await repositories.users.findById(newGuest)).not.toBeNull();
    expect(await repositories.users.findById(oldMember.id)).not.toBeNull();
    expect(await prisma.auditEvent.findMany({ where: { resourceId: oldGuest } })).toEqual([
      expect.objectContaining({ userId: null, action: 'ACCOUNT_DELETED', resourceType: 'USER' }),
    ]);
  });
});

describe('refresh tokens', () => {
  it('lets exactly one of several simultaneous revocations win', async () => {
    const user = await newUser();
    const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
    await repositories.refreshTokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const stored = await repositories.refreshTokens.findByHash(tokenHash);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        repositories.refreshTokens.revokeIfActive(stored?.id ?? '', new Date()),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repositories.refreshTokens.findByHash(tokenHash))?.revokedAt).not.toBeNull();
  });

  it('removes only tokens that expired before the cutoff', async () => {
    const user = await newUser();
    const expired = createHash('sha256').update(randomUUID()).digest('hex');
    const live = createHash('sha256').update(randomUUID()).digest('hex');
    await repositories.refreshTokens.create({
      userId: user.id,
      tokenHash: expired,
      expiresAt: LONG_AGO,
    });
    await repositories.refreshTokens.create({
      userId: user.id,
      tokenHash: live,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const removed = await repositories.refreshTokens.deleteExpiredBefore(
      new Date(LONG_AGO.getTime() + 1000),
    );

    expect(removed).toBe(1);
    expect(await repositories.refreshTokens.findByHash(expired)).toBeNull();
    expect(await repositories.refreshTokens.findByHash(live)).not.toBeNull();
  });
});

describe('rate limit and usage counters', () => {
  it('loses no increment under concurrency', async () => {
    const key = createHash('sha256').update(randomUUID()).digest('hex');

    const counts = await Promise.all(
      Array.from({ length: 20 }, () => repositories.rateLimits.increment(key, LONG_AGO)),
    );
    const removed = await repositories.rateLimits.deleteWindowsBefore(
      new Date(LONG_AGO.getTime() + 1000),
    );

    expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(removed).toBe(1);
  });

  it('counts usage per user and per day', async () => {
    const user = await newUser();
    const monday = new Date('2026-03-02T23:59:00.000Z');
    const tuesday = new Date('2026-03-03T00:01:00.000Z');

    const sameDay = await Promise.all(
      Array.from({ length: 10 }, () => repositories.usage.increment(user.id, monday)),
    );

    expect(Math.max(...sameDay)).toBe(10);
    expect(await repositories.usage.increment(user.id, tuesday)).toBe(1);
  });
});

describe('visits', () => {
  it('hides a visit from anyone but its owner', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const visit = await newVisit(owner.id);

    expect(await repositories.visits.findOwned(visit.id, owner.id)).not.toBeNull();
    expect(await repositories.visits.findOwned(visit.id, stranger.id)).toBeNull();
    expect(
      await repositories.visits.updateNoteUnlessProcessing(
        visit.id,
        stranger.id,
        'v1.x.y.z',
        LONG_AGO,
      ),
    ).toBeNull();
    expect(await repositories.visits.deleteOwned(visit.id, stranger.id)).toBe(false);
    expect(await repositories.visits.claimForProcessing(visit.id, stranger.id, LONG_AGO)).toBe(
      false,
    );
    expect((await repositories.visits.findOwned(visit.id, owner.id))?.status).toBe('DRAFT');
  });

  it('refuses a visit for a user that does not exist, and counts visits per user', async () => {
    const owner = await newUser();
    await newVisit(owner.id);
    await newVisit(owner.id);

    await expect(
      repositories.visits.create({ userId: randomUUID(), title: 'Orphan', consentAt: null }),
    ).rejects.toBeInstanceOf(UnknownOwnerError);
    expect(await repositories.visits.countForUser(owner.id)).toBe(2);
  });

  it('pages newest first without gaps or repeats, including rows with equal timestamps', async () => {
    const owner = await newUser();
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await newVisit(owner.id, `Visit ${String(i)}`));
    }
    // Force two pairs of rows onto the same instant, so the id has to break the tie.
    const instant = new Date('2026-03-01T10:00:00.000Z');
    await prisma.visit.updateMany({
      where: { id: { in: created.slice(0, 2).map((visit) => visit.id) } },
      data: { createdAt: instant },
    });

    const seen: string[] = [];
    let after: { createdAt: Date; id: string } | undefined;
    for (let page = 0; page < 5; page++) {
      const rows = await repositories.visits.list({
        userId: owner.id,
        take: 2,
        ...(after === undefined ? {} : { after }),
      });
      if (rows.length === 0) {
        break;
      }
      seen.push(...rows.map((row) => row.id));
      after = rows.at(-1);
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(created.map((visit) => visit.id)));
  });

  it('searches titles without case, treating % and _ as ordinary characters', async () => {
    const owner = await newUser();
    const knee = await newVisit(owner.id, 'Knee pain follow-up');
    await newVisit(owner.id, 'Annual review');
    const literal = await newVisit(owner.id, '100% recovery_check');
    const search = async (titleContains: string) =>
      (await repositories.visits.list({ userId: owner.id, titleContains, take: 10 })).map(
        (visit) => visit.id,
      );

    expect(await search('KNEE')).toEqual([knee.id]);
    expect(await search('%')).toEqual([literal.id]);
    expect(await search('_')).toEqual([literal.id]);
    expect(await search('nothing-matches-this')).toEqual([]);
  });

  it('gives a processing claim to exactly one of several simultaneous requests', async () => {
    const owner = await newUser();
    const visit = await newVisit(owner.id);
    const staleBefore = new Date(Date.now() - 5 * 60_000);

    const claims = await Promise.all(
      Array.from({ length: 5 }, () =>
        repositories.visits.claimForProcessing(visit.id, owner.id, staleBefore),
      ),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await repositories.visits.findOwned(visit.id, owner.id))?.status).toBe('PROCESSING');
  });

  it('blocks note edits during a run, releases a stale run, and stores a finished one', async () => {
    const owner = await newUser();
    const visit = await newVisit(owner.id);
    const fresh = new Date(Date.now() - 5 * 60_000);
    const future = new Date(Date.now() + 60_000);
    await repositories.visits.claimForProcessing(visit.id, owner.id, fresh);

    expect(
      await repositories.visits.updateNoteUnlessProcessing(visit.id, owner.id, 'v1.a.b.c', fresh),
    ).toBeNull();
    // With the staleness line moved past "now", the same run counts as abandoned.
    expect(await repositories.visits.claimForProcessing(visit.id, owner.id, future)).toBe(true);

    const done = await repositories.visits.completeProcessing(visit.id, owner.id, {
      transcriptEnc: 'v1.t.t.t',
      noteEnc: 'v1.n.n.n',
      durationSec: 42,
    });

    expect(done).toMatchObject({ status: 'READY', durationSec: 42 });
    expect(await repositories.visits.findOwned(visit.id, owner.id)).toMatchObject({
      transcriptEnc: 'v1.t.t.t',
      noteEnc: 'v1.n.n.n',
    });
  });

  it('removes visits, sessions and counters with their user, and keeps the audit trail', async () => {
    const owner = await newUser();
    const visit = await newVisit(owner.id);
    await repositories.usage.increment(owner.id, new Date());
    await repositories.audit.insert({
      actorId: owner.id,
      action: 'VISIT_CREATED',
      resourceType: 'VISIT',
      resourceId: visit.id,
    });

    expect(await repositories.users.delete(owner.id)).toBe(true);
    expect(await repositories.users.delete(owner.id)).toBe(false);

    expect(await prisma.visit.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.usageCounter.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { userId: owner.id } })).toBe(1);
  });
});

describe('audit events', () => {
  it('accepts the actions added for refused sign-ins', async () => {
    const subject = await newUser();

    for (const action of ['LOGIN_FAILED', 'SESSIONS_REVOKED'] as const) {
      await repositories.audit.insert({
        actorId: null,
        action,
        resourceType: 'USER',
        resourceId: subject.id,
      });
    }

    expect(await prisma.auditEvent.count({ where: { resourceId: subject.id } })).toBe(2);
  });

  it('stores an event with no acting user', async () => {
    const subject = await newUser();

    await repositories.audit.insert({
      actorId: null,
      action: 'ACCOUNT_DELETED',
      resourceType: 'USER',
      resourceId: subject.id,
    });

    expect(
      await prisma.auditEvent.findFirst({ where: { resourceId: subject.id, userId: null } }),
    ).toMatchObject({ action: 'ACCOUNT_DELETED', resourceType: 'USER' });
  });
});
