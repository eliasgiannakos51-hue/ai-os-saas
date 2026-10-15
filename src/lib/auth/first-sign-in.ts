/**
 * AN ACCOUNT'S FIRST SIGN-IN IS NOT A NEW DEVICE (2026-10-14).
 *
 * api/auth/device-check sends the «new sign-in» security email for a
 * device it has not seen on this account. On a brand-new account the
 * very first sign-in reached that branch too — found by the package 39
 * check (docs/PROGRESS.md, 2026-10-08): the person who had just made the
 * account was told, minutes later, that someone had signed in to it.
 * There was nothing for that device to be new against.
 *
 * So the email is not sent when BOTH hold: the account has no device on
 * record yet, and it was made within FIRST_SIGN_IN_WINDOW_MS. The device
 * is recorded either way, so every later sign-in from a device not on
 * record is told exactly as before; an account older than the window is
 * told on its first recorded device as before too. When the count of
 * devices cannot be read, it is not zero here, and the email goes.
 *
 * Pure; held by scripts/tests/first-sign-in.test.mjs.
 */
export const FIRST_SIGN_IN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isAccountsFirstSignIn(input: {
  /** How many devices the account has on record before this one; null when the count could not be read. */
  devicesOnRecord: number | null;
  /** The account's creation time (Supabase auth `created_at`). */
  accountCreatedAt: string | null | undefined;
  now?: number;
}): boolean {
  if (input.devicesOnRecord !== 0) return false;
  const created = Date.parse(String(input.accountCreatedAt ?? ""));
  if (!Number.isFinite(created)) return false;
  const age = (input.now ?? Date.now()) - created;
  return age >= 0 && age < FIRST_SIGN_IN_WINDOW_MS;
}
