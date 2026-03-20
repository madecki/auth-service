/**
 * Password strength rules and human-readable messages for missing requirements.
 * Used to return a clear list of what the user must fix.
 */

export const MIN_PASSWORD_LENGTH = 10;

const REQUIREMENTS = {
  minLength: (len: number) => `At least ${len} characters`,
  uppercase: 'At least one uppercase letter',
  lowercase: 'At least one lowercase letter',
  digit: 'At least one digit',
  special: 'At least one special character (!@#$%^&*()_+-=[]{}|;\':",.<>?/~`)',
} as const;

const UPPERCASE = /[A-Z]/;
const LOWERCASE = /[a-z]/;
const DIGIT = /[0-9]/;
const SPECIAL = /[!@#$%^&*()_+\-=[\]{}|;':",.<>?/~`]/;

/**
 * Returns a list of human-readable messages for password requirements that are not met.
 */
export function getMissingPasswordRequirements(password: string): string[] {
  const missing: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    missing.push(REQUIREMENTS.minLength(MIN_PASSWORD_LENGTH));
  }
  if (!UPPERCASE.test(password)) {
    missing.push(REQUIREMENTS.uppercase);
  }
  if (!LOWERCASE.test(password)) {
    missing.push(REQUIREMENTS.lowercase);
  }
  if (!DIGIT.test(password)) {
    missing.push(REQUIREMENTS.digit);
  }
  if (!SPECIAL.test(password)) {
    missing.push(REQUIREMENTS.special);
  }

  return missing;
}

export function isPasswordStrong(password: string): boolean {
  return getMissingPasswordRequirements(password).length === 0;
}
