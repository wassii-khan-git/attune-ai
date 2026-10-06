import { z } from 'zod';

/** Emails are compared and stored lower-cased, so the same address always maps to one account. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Length is the only rule. The upper bound is bcrypt's: it ignores everything
 * past 72 bytes, so a longer password would be silently weaker than it looks.
 */
export const passwordSchema = z.string().min(10).max(72);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Login does not apply the password policy: it must keep working if the policy changes. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Native clients send the refresh token in the body; the web app sends it as a cookie. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1).max(512).optional(),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const roleSchema = z.enum(['USER', 'ADMIN']);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  /** Null for guest accounts. */
  email: z.email().nullable(),
  role: roleSchema,
  isGuest: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

/**
 * Returned by register, login, guest and refresh. `tokens` is present only for
 * native clients; browsers receive the same tokens as httpOnly cookies.
 */
export const authResponseSchema = z.object({
  user: userSchema,
  accessTokenExpiresAt: z.iso.datetime(),
  tokens: tokenPairSchema.optional(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
