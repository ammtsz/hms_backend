export const PASSWORD_CHANGE_MAX_ATTEMPTS = 5;
export const PASSWORD_CHANGE_LOCK_DURATION_MINUTES = 15;

export const passwordChangeMessages = {
  incorrect: 'Current password is incorrect',
  incorrectWithRemaining: (remaining: number) =>
    `Current password is incorrect. ${remaining} attempt(s) remaining.`,
  accountLocked: (minutes: number) =>
    `Too many failed password change attempts. Your account has been locked for ${minutes} minutes.`,
  tryAgainIn: (minutes: number) =>
    `Too many failed password change attempts. Please try again in ${minutes} minute(s).`,
} as const;
