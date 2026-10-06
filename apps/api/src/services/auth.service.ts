import { randomBytes } from 'node:crypto';

import type { User } from '@attune/shared';

import { AppError } from '../lib/app-error.js';
import { BCRYPT_MAX_PASSWORD_BYTES, type PasswordHasher } from '../lib/password-hasher.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import {
  EmailTakenError,
  type UserRecord,
  type UserRepository,
} from '../repositories/user.repository.js';
import type { AuditService } from './audit.service.js';
import type { TokenService } from './token.service.js';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Guest accounts are purged after this long, so their sessions never outlive it. */
export const GUEST_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type Session = {
  user: User;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type AuthService = {
  register: (input: { email: string; password: string }) => Promise<Session>;
  login: (input: { email: string; password: string }) => Promise<Session>;
  createGuest: () => Promise<Session>;
  /** Exchanges a refresh token for a new session and retires the old token. */
  refresh: (refreshToken: string | undefined) => Promise<Session>;
  /** Idempotent: an unknown, expired or already revoked token is not an error. */
  logout: (refreshToken: string | undefined) => Promise<void>;
  getUser: (userId: string) => Promise<User>;
};

export type AuthServiceDependencies = {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  tokens: TokenService;
  hasher: PasswordHasher;
  audit: AuditService;
  now: () => Date;
};

function toUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    isGuest: record.isGuest,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * One message for "no such account" and "wrong password", so a caller cannot
 * tell them apart. The account id, when there is one, goes to the log only.
 */
function invalidCredentials(userId?: string): AppError {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.', {
    reason: 'invalid_credentials',
    ...(userId === undefined ? {} : { userId }),
  });
}

/** `reason` says why for the log; the client is told the same thing in every case. */
function sessionExpired(reason?: string, userId?: string): AppError {
  return new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.', {
    ...(reason === undefined ? {} : { reason }),
    ...(userId === undefined ? {} : { userId }),
  });
}

export function createAuthService({
  users,
  refreshTokens,
  tokens,
  hasher,
  audit,
  now,
}: AuthServiceDependencies): AuthService {
  // Compared against when the account does not exist, so that case takes as long as a real check.
  const decoyHash = hasher.hash(randomBytes(16).toString('hex'));

  async function openSession(record: UserRecord): Promise<Session> {
    const issuedAt = now().getTime();
    const refreshTokenExpiresAt = new Date(
      record.isGuest
        ? record.createdAt.getTime() + GUEST_LIFETIME_MS
        : issuedAt + REFRESH_TOKEN_TTL_MS,
    );

    const access = await tokens.issueAccessToken({
      userId: record.id,
      role: record.role,
      isGuest: record.isGuest,
    });
    const refresh = tokens.issueRefreshToken();
    await refreshTokens.create({
      userId: record.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      user: toUser(record),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt,
    };
  }

  return {
    register: async ({ email, password }) => {
      if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
        throw new AppError(400, 'VALIDATION_ERROR', 'The request is not valid.', {
          details: [
            {
              path: 'password',
              message: `Too long: must be at most ${String(BCRYPT_MAX_PASSWORD_BYTES)} bytes`,
            },
          ],
        });
      }

      let record: UserRecord;
      try {
        record = await users.createRegistered({ email, passwordHash: await hasher.hash(password) });
      } catch (error) {
        if (error instanceof EmailTakenError) {
          throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
        }
        throw error;
      }

      await audit.record({
        actorId: record.id,
        action: 'USER_REGISTERED',
        resourceType: 'USER',
        resourceId: record.id,
      });
      return openSession(record);
    },

    login: async ({ email, password }) => {
      const record = await users.findByEmail(email);
      const passwordMatches = await hasher.verify(
        password,
        record?.passwordHash ?? (await decoyHash),
      );
      if (record?.passwordHash == null) {
        throw invalidCredentials();
      }
      if (!passwordMatches) {
        // Repeated failures against one account are what an attack on it looks like.
        await audit.record({
          actorId: null,
          action: 'LOGIN_FAILED',
          resourceType: 'USER',
          resourceId: record.id,
        });
        throw invalidCredentials(record.id);
      }

      await audit.record({
        actorId: record.id,
        action: 'USER_LOGGED_IN',
        resourceType: 'USER',
        resourceId: record.id,
      });
      return openSession(record);
    },

    createGuest: async () => {
      const record = await users.createGuest();
      await audit.record({
        actorId: record.id,
        action: 'GUEST_CREATED',
        resourceType: 'USER',
        resourceId: record.id,
      });
      return openSession(record);
    },

    refresh: async (refreshToken) => {
      if (refreshToken === undefined) {
        throw sessionExpired();
      }
      const current = now();
      const stored = await refreshTokens.findByHash(tokens.hashRefreshToken(refreshToken));
      if (stored === null) {
        throw sessionExpired('refresh_token_unknown');
      }

      // A retired token came back, or two requests raced for the same one. Either it
      // was stolen or the client replayed it; both are answered the same way, by
      // ending every session of that user and leaving a record that it happened.
      const revokeEverything = async (): Promise<AppError> => {
        await refreshTokens.revokeAllForUser(stored.userId, current);
        await audit.record({
          actorId: null,
          action: 'SESSIONS_REVOKED',
          resourceType: 'USER',
          resourceId: stored.userId,
        });
        return sessionExpired('refresh_token_replayed', stored.userId);
      };

      if (stored.revokedAt !== null) {
        throw await revokeEverything();
      }
      if (stored.expiresAt.getTime() <= current.getTime()) {
        throw sessionExpired('refresh_token_expired', stored.userId);
      }
      if (!(await refreshTokens.revokeIfActive(stored.id, current))) {
        throw await revokeEverything();
      }

      const record = await users.findById(stored.userId);
      if (record === null) {
        throw sessionExpired('account_gone', stored.userId);
      }
      return openSession(record);
    },

    logout: async (refreshToken) => {
      if (refreshToken === undefined) {
        return;
      }
      const current = now();
      const stored = await refreshTokens.findByHash(tokens.hashRefreshToken(refreshToken));
      if (stored === null || !(await refreshTokens.revokeIfActive(stored.id, current))) {
        return;
      }

      await audit.record({
        actorId: stored.userId,
        action: 'USER_LOGGED_OUT',
        resourceType: 'USER',
        resourceId: stored.userId,
      });
    },

    getUser: async (userId) => {
      const record = await users.findById(userId);
      if (record === null) {
        // The access token is still valid but its account was deleted or purged.
        throw sessionExpired('account_gone', userId);
      }
      return toUser(record);
    },
  };
}
