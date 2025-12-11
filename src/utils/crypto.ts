/**
 * Cryptographic Utilities
 *
 * This module provides secure random generation utilities for passwords
 * and other security-sensitive operations.
 */

import { randomBytes } from "crypto";

/**
 * Characters used for password generation
 * Excludes ambiguous characters (0, O, l, 1, I) for readability
 */
const PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * Default password length for generated passwords
 */
export const DEFAULT_PASSWORD_LENGTH = 16;

/**
 * Minimum allowed password length
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Maximum allowed password length
 */
export const MAX_PASSWORD_LENGTH = 64;

/**
 * Generates a cryptographically secure random password.
 *
 * Uses Node's crypto.randomBytes() which is suitable for cryptographic use.
 * The generated password uses a character set that excludes ambiguous
 * characters for improved readability when displayed or typed.
 *
 * @param length - The desired password length (default: 16)
 * @returns A cryptographically secure random password string
 * @throws Error if length is outside valid bounds
 *
 * @example
 * ```typescript
 * const password = generateSecurePassword();
 * // Returns something like: "xK7mNpQr9sT2vW4y"
 *
 * const shortPassword = generateSecurePassword(8);
 * // Returns something like: "xK7mNpQr"
 * ```
 */
export function generateSecurePassword(
  length: number = DEFAULT_PASSWORD_LENGTH,
): string {
  if (length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password length must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password length must not exceed ${MAX_PASSWORD_LENGTH} characters`,
    );
  }

  const charsetLength = PASSWORD_CHARSET.length;
  const bytes = randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i++) {
    // Use modulo to map random byte to character index
    // This has slight bias but is acceptable for password generation
    password += PASSWORD_CHARSET[bytes[i] % charsetLength];
  }

  return password;
}

/**
 * Checks if a password appears to be a known insecure default.
 *
 * This is used to detect when users haven't configured secure credentials.
 *
 * @param password - The password to check
 * @returns true if the password matches a known insecure default
 */
export function isInsecureDefaultPassword(password: string): boolean {
  const insecureDefaults = [
    "papertrail",
    "papertrail123",
    "password",
    "password123",
    "admin",
    "admin123",
    "123456",
    "12345678",
    "qwerty",
    "letmein",
    "welcome",
    "default",
  ];

  return insecureDefaults.includes(password.toLowerCase());
}
