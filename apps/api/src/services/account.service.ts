import type { UserRepository } from '../repositories/user.repository.js';
import type { AuditService } from './audit.service.js';

export type AccountService = {
  /**
   * Deletes the caller's account and, through the database cascade, every
   * visit, session and usage counter that belongs to it. The audit trail keeps
   * a record that the deletion happened. Idempotent.
   */
  deleteAccount: (userId: string) => Promise<void>;
};

export function createAccountService(users: UserRepository, audit: AuditService): AccountService {
  return {
    deleteAccount: async (userId) => {
      if (await users.delete(userId)) {
        await audit.record({
          actorId: userId,
          action: 'ACCOUNT_DELETED',
          resourceType: 'USER',
          resourceId: userId,
        });
      }
    },
  };
}
