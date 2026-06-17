/**
 * Password Validator
 * Validates password strength according to system requirements
 */

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate password meets minimum requirements
 * Requirement: Minimum 12 characters
 *
 * @param password - The password to validate
 * @returns Validation result with errors if any
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
