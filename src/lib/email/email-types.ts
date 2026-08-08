// Pure constants, deliberately NOT `server-only` — the Settings panel is
// a Client Component and needs the same list of togglable types the
// server-side gate enforces. Keeping them here means the UI can't drift
// out of sync with what the gate actually honours. Everything that talks
// to the database or Resend lives in email-gate.ts, which is server-only.

// Every email the app can send, and whether the user is allowed to turn
// it off.
//
// `critical: true` means the message is a direct consequence of something
// the user just did, or is required for them to keep control of their
// account — those bypass BOTH the per-type preference and the daily cap.
// Silently swallowing a delete-account confirmation because an automation
// burned through the day's quota would leave someone unable to finish an
// account action they explicitly started, which is a far worse outcome
// than one extra email.
//
// `team_invite` is critical for a different reason: it isn't addressed to
// the account holder at all, it's addressed to the person being invited,
// who has no preferences row here and never consented to being rate
// limited by someone else's mailbox activity.
export const EMAIL_TYPES = {
  welcome: { critical: true },
  team_invite: { critical: true },
  delete_account_confirmation: { critical: true },
  new_device_login: { critical: false },
  weekly_digest: { critical: false },
  scheduled_run_complete: { critical: false },
  stuck_generation: { critical: false },
  website_form_submission: { critical: false },
  // V3 — Autonomous Agents. The result of a scheduled run is the whole
  // point of the feature, but it is still something a user may want to
  // stop receiving without deleting the agent, so it is togglable and
  // counts against the daily cap.
  agent_run_result: { critical: false },
  // Critical for the same reason delete_account_confirmation is: it
  // reports a state change the user must act on to undo. An agent that
  // switched itself off silently — because a busy day had already hit the
  // 20-email cap — is a user who stops receiving what they built and does
  // not find out for weeks.
  agent_disabled: { critical: true },
  // V3 Task 13 — the day-1/3/7/14/30 lifecycle sequence. The definition
  // of marketing-adjacent: one toggle turns the whole sequence off.
  lifecycle: { critical: false },
  // "The thing you asked for shipped." Separate from lifecycle because a
  // person who wants no drip emails may very much still want this one.
  feature_request_shipped: { critical: false },
} as const;

export type EmailType = keyof typeof EMAIL_TYPES;

// The user-togglable subset — exactly the non-critical types above, which
// is also the column set of user_email_preferences. Derived rather than
// re-listed so a new type can't be added to one and forgotten in the other.
export const OPTIONAL_EMAIL_TYPES = (Object.keys(EMAIL_TYPES) as EmailType[]).filter(
  (t) => !EMAIL_TYPES[t].critical
);

// Hard ceiling on non-critical email per user per rolling 24h. A single
// runaway automation (or a website contact form being scraped/spammed)
// could otherwise generate hundreds of messages to one inbox, which is
// both a deliverability risk for the sending domain and a genuinely
// awful experience for the recipient.
export const MAX_EMAILS_PER_DAY = 20;
