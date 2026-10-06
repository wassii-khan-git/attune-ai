import { describe, expect, it } from 'vitest';

import { createInMemoryAuditRepository } from '../testing/in-memory-audit.repository.js';
import { createAuditService } from './audit.service.js';

const event = {
  actorId: '0199a8f2-0000-7000-8000-000000000001',
  action: 'VISIT_VIEWED',
  resourceType: 'VISIT',
  resourceId: '0199a8f2-0000-7000-8000-000000000002',
} as const;

describe('audit service', () => {
  it('stores the event as given', async () => {
    const repository = createInMemoryAuditRepository();

    await createAuditService(repository).record(event);

    expect(repository.events).toEqual([event]);
  });

  it('accepts a system actor', async () => {
    const repository = createInMemoryAuditRepository();

    await createAuditService(repository).record({ ...event, actorId: null });

    expect(repository.events[0]?.actorId).toBeNull();
  });

  it('rejects when the event cannot be stored, so the caller fails too', async () => {
    const service = createAuditService({
      insert: () => Promise.reject(new Error('database unavailable')),
    });

    await expect(service.record(event)).rejects.toThrow('database unavailable');
  });
});
