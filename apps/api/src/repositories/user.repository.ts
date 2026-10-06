import { Prisma } from '../generated/prisma/client.js';
import type { Role } from '../generated/prisma/enums.js';
import type { PrismaClient } from './prisma.js';

export type { Role };

export type UserRecord = {
  id: string;
  /** Null for guests. */
  email: string | null;
  /** Null for guests. Never leaves the service layer. */
  passwordHash: string | null;
  role: Role;
  isGuest: boolean;
  createdAt: Date;
};

/** The email already belongs to an account. */
export class EmailTakenError extends Error {
  constructor() {
    super('Email is already registered');
    this.name = 'EmailTakenError';
  }
}

export type UserRepository = {
  /** Rejects with `EmailTakenError` if the email is in use. */
  createRegistered: (input: { email: string; passwordHash: string }) => Promise<UserRecord>;
  createGuest: () => Promise<UserRecord>;
  findByEmail: (email: string) => Promise<UserRecord | null>;
  findById: (id: string) => Promise<UserRecord | null>;
};

const select = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  isGuest: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const UNIQUE_VIOLATION = 'P2002';

export function createUserRepository(prisma: PrismaClient): UserRepository {
  return {
    createRegistered: async ({ email, passwordHash }) => {
      try {
        return await prisma.user.create({ data: { email, passwordHash }, select });
      } catch (error) {
        // The unique index decides, so two simultaneous registrations cannot both win.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION
        ) {
          throw new EmailTakenError();
        }
        throw error;
      }
    },

    createGuest: () => prisma.user.create({ data: { isGuest: true }, select }),

    findByEmail: (email) => prisma.user.findUnique({ where: { email }, select }),

    findById: (id) => prisma.user.findUnique({ where: { id }, select }),
  };
}
