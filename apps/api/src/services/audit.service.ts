import type { AuditRepository, NewAuditEvent } from '../repositories/audit.repository.js';

export type AuditService = {
  /**
   * Records who did what to which resource. It rejects if the row cannot be
   * written, and callers let that fail the request: an action that cannot be
   * audited should not appear to have succeeded.
   */
  record: (event: NewAuditEvent) => Promise<void>;
};

export function createAuditService(repository: AuditRepository): AuditService {
  return {
    record: (event) => repository.insert(event),
  };
}
