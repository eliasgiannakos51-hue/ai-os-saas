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
  games: "Games: describe a game, see its plan in five boxes and change any with words, then play it in the browser sealed off from the account, change it with words, step back to any version, and download its code (MASTER 16, package 26). Needs migration 20261024000000_user_games.sql",
  translate: "Translate: a site and a document into another language in the same form, as a new copy beside the original, with the price before (MASTER 16, package 28)",
  "finance-sales": "Finances: write «πλήρωσα 50 ευρώ ρεύμα» and it is recorded, read by code; Sales: move a contact from stage to stage with a reminder that arrives in the bell (MASTER 16, package 18). Needs migration 20261023000000_lead_stages.sql",
  "meeting-goal": "Meetings: the actions you tick become the steps of a goal, inside a project you choose or make there (MASTER 16, package 17)",
  "analysis-provenance": "Analyze: every number in a finding is a fact computed from the file, pressable to show how it was made, and every chart value says how many rows it came from (MASTER 16, package 16)",
  "posts-images": "Posts with a picture: your own photo, or one from Unsplash, on every post at its platform's own size (LinkedIn 1200x627, X 1600x900, Instagram and Threads 1080x1350, Facebook 1200x630), each downloadable (MASTER 16, package 15)",
  "document-writer": "Document that writes: a document from a description (an offer, a letter, a CV, a report, an invoice, a script, or anything), one paragraph changed with words and nothing else, and downloads in Word and PDF; Document returns to All tools for whoever has it (MASTER 16, package 14)",
  "slides-charts": "Slides from your own file: a spreadsheet given to Slides with «+» becomes a deck with a real chart of its numbers, computed from the file and drawn as a chart PowerPoint can edit (MASTER 16, package 13)",
  "first-task": "First task: a new account lands on one screen with three tasks that finish on any plan, the free one included, in one press each — instead of the three-step questionnaire — with its own field, and the data import one press away (MASTER 16, package 39)",
  "flows": "Flows: one sentence that names several tools — «φτιάξε site για το camping μου, με εικόνες, και posts» — becomes a plan with its total price, and once approved every result goes into one project, in one colour (MASTER 6.1, 6.3; package 36)",
  "automations": "Automations as boxes: say it in a sentence, see the boxes, change one with words or by hand, try it without sending anything, and it runs by itself on the server with its history and its cost (MASTER 16, package 30)",
  "connections": "Connections in one press: a Connect button on every card that opens what the AI will read, Google Calendar as a connection, and Chat answering «τι έχω αύριο;» from it (MASTER 16, package 31)",
  "image-studio": "Image: four pictures from one description, one of them changed with words, and downloaded at the largest size the provider makes (MASTER 16, package 19)",
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
