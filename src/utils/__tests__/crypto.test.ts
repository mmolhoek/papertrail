import {
  generateSecurePassword,
  isInsecureDefaultPassword,
  DEFAULT_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../crypto";

describe("generateSecurePassword", () => {
  it("generates a password of default length", () => {
    const password = generateSecurePassword();
    expect(password.length).toBe(DEFAULT_PASSWORD_LENGTH);
  });

  it("generates a password of specified length", () => {
    const password = generateSecurePassword(12);
    expect(password.length).toBe(12);
  });

  it("generates different passwords on each call", () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generateSecurePassword());
    }
    // All 100 passwords should be unique
    expect(passwords.size).toBe(100);
  });

  it("generates passwords with valid characters only", () => {
    const validChars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    for (let i = 0; i < 50; i++) {
      const password = generateSecurePassword();
      for (const char of password) {
        expect(validChars).toContain(char);
      }
    }
  });

  it("does not include ambiguous characters", () => {
    const ambiguousChars = "0O1lI";
    for (let i = 0; i < 100; i++) {
      const password = generateSecurePassword();
      for (const char of password) {
        expect(ambiguousChars).not.toContain(char);
      }
    }
  });

  it("throws error for length below minimum", () => {
    expect(() => generateSecurePassword(MIN_PASSWORD_LENGTH - 1)).toThrow(
      `Password length must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });

  it("throws error for length above maximum", () => {
    expect(() => generateSecurePassword(MAX_PASSWORD_LENGTH + 1)).toThrow(
      `Password length must not exceed ${MAX_PASSWORD_LENGTH} characters`,
    );
  });

  it("generates password at minimum length boundary", () => {
    const password = generateSecurePassword(MIN_PASSWORD_LENGTH);
    expect(password.length).toBe(MIN_PASSWORD_LENGTH);
  });

  it("generates password at maximum length boundary", () => {
    const password = generateSecurePassword(MAX_PASSWORD_LENGTH);
    expect(password.length).toBe(MAX_PASSWORD_LENGTH);
  });

  it("generates passwords with reasonable entropy distribution", () => {
    // Generate many passwords and check character distribution
    const charCounts = new Map<string, number>();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const password = generateSecurePassword();
      for (const char of password) {
        charCounts.set(char, (charCounts.get(char) || 0) + 1);
      }
    }

    // All characters in the charset should appear at least once
    // with 1000 iterations and 16-char passwords = 16000 chars total
    // for 54 character charset, each should appear ~296 times on average
    const minExpectedCount = 50; // Very conservative lower bound
    for (const [, count] of charCounts) {
      expect(count).toBeGreaterThan(minExpectedCount);
    }
  });
});

describe("isInsecureDefaultPassword", () => {
  it("detects known insecure defaults", () => {
    expect(isInsecureDefaultPassword("papertrail")).toBe(true);
    expect(isInsecureDefaultPassword("papertrail123")).toBe(true);
    expect(isInsecureDefaultPassword("password")).toBe(true);
    expect(isInsecureDefaultPassword("password123")).toBe(true);
    expect(isInsecureDefaultPassword("admin")).toBe(true);
    expect(isInsecureDefaultPassword("admin123")).toBe(true);
    expect(isInsecureDefaultPassword("123456")).toBe(true);
    expect(isInsecureDefaultPassword("12345678")).toBe(true);
    expect(isInsecureDefaultPassword("qwerty")).toBe(true);
    expect(isInsecureDefaultPassword("letmein")).toBe(true);
    expect(isInsecureDefaultPassword("welcome")).toBe(true);
    expect(isInsecureDefaultPassword("default")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isInsecureDefaultPassword("PAPERTRAIL")).toBe(true);
    expect(isInsecureDefaultPassword("PaperTrail")).toBe(true);
    expect(isInsecureDefaultPassword("PASSWORD")).toBe(true);
    expect(isInsecureDefaultPassword("ADMIN")).toBe(true);
  });

  it("returns false for secure passwords", () => {
    expect(isInsecureDefaultPassword(generateSecurePassword())).toBe(false);
    expect(isInsecureDefaultPassword("xK7mNpQr9sT2vW4y")).toBe(false);
    expect(isInsecureDefaultPassword("MySecure!Pass#2024")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isInsecureDefaultPassword("")).toBe(false);
  });

  it("returns false for partial matches", () => {
    expect(isInsecureDefaultPassword("papertrail_modified")).toBe(false);
    expect(isInsecureDefaultPassword("my_papertrail")).toBe(false);
    expect(isInsecureDefaultPassword("password!")).toBe(false);
  });
});

describe("constants", () => {
  it("has reasonable default password length", () => {
    expect(DEFAULT_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
    expect(DEFAULT_PASSWORD_LENGTH).toBeLessThanOrEqual(32);
  });

  it("has reasonable minimum password length", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it("has reasonable maximum password length", () => {
    expect(MAX_PASSWORD_LENGTH).toBeGreaterThanOrEqual(32);
    expect(MAX_PASSWORD_LENGTH).toBeLessThanOrEqual(128);
  });
});
