import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { FLAG_AUDIENCES, type FlagAudience } from "@/lib/flags/audience";

/**
 * SWITCHES FOR NEW TOOLS AND BIG CHANGES (MASTER Μέρος 13 Β, 2026-10-05).
 *
 * Every new tool and every big change ships behind one of these. The
 * owner turns it from 'staff' (himself and the test account) to
 * 'everyone', or to 'off', on /dashboard/system-health — no deploy.
 *
 * THE LIST IS HERE, THE CHOICE IS IN THE DATABASE. A switch is added to
 * FLAGS in the same commit as the code behind it; the owner's choice for
 * it lives in public.feature_flags
 * (supabase/migrations/20261017000000_feature_flags.sql).
 *
 * IT FAILS TOWARDS 'staff'. No row, an unreadable table, a migration not
 * yet run: every case reads as 'staff', so a customer never sees an
 * unfinished thing because something went wrong, and the owner still can.
 * scripts/tests/feature-flags.test.mjs runs this rule.
 */
export { FLAG_AUDIENCES, type FlagAudience };

export const FLAGS = {
  "chat-work-area": "Chat: the work area beside the conversation, and the card that reopens it (ΣΥΣΤΗΜΑ DESIGN §5, Δ.2)",
  "tool-shell": "Every tool in one shell: the conversation on the left, the work on the right, one field and at most four options (MASTER 14.3, package 3)",
  "chat-opens-tools": "Chat opens tools: «φτιάξε μου site για το camping» opens the Site beside the conversation, with its price, and builds it there on one press (MASTER 2.3, package 7)",
  "file-pages": "Files that say where: every page an answer cites is pressed to read that page, or to open the PDF at it, and a PDF read only in part says which pages it did not read (MASTER 16, package 12)",
  "research-slides": "Research you can follow and present: every [n] in a report opens its source, and one press makes a presentation of the report in Slides, with its sources (MASTER 16, package 11)",
  "site-pages": "Site with pages: ask for one, three or five pages, see and change every page in the Site, take back the last change, and download the whole site (MASTER 16, package 10)",
  "chat-attachments": "Chat reads what you give it: PDFs and images attached to a message, asked about, and under the answer the remembered facts it used (MASTER 16, package 9)",
  "brand-memory": "Memory: a business name and colours said in Chat are remembered as such, and Site uses them without being told again (MASTER 2.2, package 6)",
  library: "The Library: everything made in Site, Slides, Posts, Documents, Research, Analyze and Files in one place, searched in what it says, pressed to open it in its tool (MASTER 4.1, package 5)",
} as const;

export type FlagKey = keyof typeof FLAGS;

export const DEFAULT_AUDIENCE: FlagAudience = "staff";

export function isFlagKey(value: unknown): value is FlagKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FLAGS, value);
}

export function isFlagAudience(value: unknown): value is FlagAudience {
  return typeof value === "string" && (FLAG_AUDIENCES as readonly string[]).includes(value);
}

/** The owner (ADMIN_EMAILS) and the test account (TEST_ACCOUNT_EMAILS). */
export function isStaffEmail(email: string | null | undefined, testAccounts: string | undefined = process.env.TEST_ACCOUNT_EMAILS): boolean {
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  const testers = (testAccounts ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return testers.includes(email.trim().toLowerCase());
}

export function audienceAllows(audience: FlagAudience, staff: boolean): boolean {
  if (audience === "everyone") return true;
  if (audience === "staff") return staff;
  return false;
}

/** Every switch with the owner's choice, or the default where there is none. */
export async function readFlagAudiences(): Promise<Record<FlagKey, FlagAudience>> {
  const out = Object.fromEntries(Object.keys(FLAGS).map((k) => [k, DEFAULT_AUDIENCE])) as Record<FlagKey, FlagAudience>;
  try {
    const { data, error } = await createAdminClient().from("feature_flags").select("key, audience");
    if (error) throw error;
    for (const row of data ?? []) {
      if (isFlagKey(row.key) && isFlagAudience(row.audience)) out[row.key] = row.audience;
    }
  } catch (err) {
    logApiError("flags:read", err);
  }
  return out;
}

export async function isFeatureOn(key: FlagKey, user: { email?: string | null } | null | undefined): Promise<boolean> {
  const audiences = await readFlagAudiences();
  return audienceAllows(audiences[key], isStaffEmail(user?.email));
}
