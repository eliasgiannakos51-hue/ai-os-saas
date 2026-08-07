// Collaborative projects (V3 Task 11) — the rules, kept pure.
//
// The design decisions live in v3_collaboration_migration.sql's header;
// this module is the arithmetic the routes and UI share: what a role may
// do, how long an invite lives, how many people fit on a project. Pure
// so every rule is testable without a database.

export type CollaboratorRole = "editor" | "viewer";

export const COLLABORATOR_ROLES: readonly CollaboratorRole[] = ["editor", "viewer"] as const;

export function isCollaboratorRole(value: unknown): value is CollaboratorRole {
  return value === "editor" || value === "viewer";
}

/** Owner + this many guests. Enough for any real working group; small
 *  enough that a project cannot be repurposed as a broadcast list. */
export const MAX_COLLABORATORS_PER_PROJECT = 8;

/** A pending invite is claimable for this long. After that the token in
 *  the email is dead and the owner sends a fresh one — an unbounded
 *  credential in an inbox is exactly what expiry exists for. */
export const INVITE_EXPIRY_DAYS = 14;

export function inviteExpired(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true; // unreadable = unclaimable
  return now.getTime() - created.getTime() > INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * What each role may do. The server truth is RLS (editors have the
 * shared update policy, viewers do not); this mirror exists so the UI
 * can hide what would be refused instead of offering buttons that 403.
 */
export function canEditProject(role: CollaboratorRole | "owner"): boolean {
  return role === "owner" || role === "editor";
}

/**
 * The signup attribution rule: an invite "brought" this account to the
 * product only if the account was created AFTER the invite was sent.
 * Strictly after — an account created the same instant is a clock
 * artefact, and the measurement must undercount rather than flatter.
 */
export function isInviteDrivenSignup(params: {
  inviteCreatedAt: string;
  accountCreatedAt: string | null | undefined;
}): boolean {
  if (!params.accountCreatedAt) return false;
  const invite = new Date(params.inviteCreatedAt).getTime();
  const account = new Date(params.accountCreatedAt).getTime();
  if (Number.isNaN(invite) || Number.isNaN(account)) return false;
  return account > invite;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseInviteEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}
