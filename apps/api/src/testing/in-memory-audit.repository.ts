import type { AuditRepository, NewAuditEvent } from '../repositories/audit.repository.js';

export type InMemoryAuditRepository = AuditRepository & {
  readonly events: readonly NewAuditEvent[];
};

export function createInMemoryAuditRepository(): InMemoryAuditRepository {
  const events: NewAuditEvent[] = [];
  return {
    events,
    insert: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
}
