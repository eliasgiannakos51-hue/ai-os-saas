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
 *
 * THE EXCEPTION THAT USED TO BE HERE IS GONE (the owner's critical
 * message, 2026-10-22): `all-tools-tiles` could hide every All Tools
 * square from EVERYONE, the owner included, with no way back once
 * /dashboard/system-health 404s — exactly the failure mode this file's
 * own "fails towards 'staff'" rule exists to prevent, just inverted. It
 * is deleted, not set to 'everyone': a flag that can hide a screen from
 * its own owner should not exist at all.
 */
export { FLAG_AUDIENCES, type FlagAudience };

export const FLAGS = {
  translate: "Translate: a site and a document into another language in the same form, as a new copy beside the original, with the price before (MASTER 16, package 28). Still embedded inside Documents and the Site builder only — not yet its own tool, so the All tools tile at /dashboard/translate is Coming Soon (lib/nav/all-tools.ts) until it is.",
  "translate-tool": "Translate as its own tool (the owner's 'ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ', 2026-10-24): paste text, pick up to five languages and a style, get it back paragraph by paragraph, with the price before. Built piece by piece behind this switch — src/app/dashboard/translate/page.tsx falls back to the Coming Soon screen for anyone it is not open to, independently of all-tools.ts's own `ready` flag, so a half-built piece is never reachable by a customer who only sees the tile.",
  "apps-tool": "Apps as its own tool (the owner's 'APPS: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ', 2026-10-24): describe a business and get an app that SAVES DATA — bookings, orders, stock, customers, forms. The model returns a definition our own components draw, never code (docs/APPS-ISOLATION.md). Built piece by piece behind this switch — src/app/dashboard/app-builder/page.tsx falls back to the Coming Soon screen for anyone it is not open to, independently of all-tools.ts's own `ready` flag, so a half-built piece is never reachable by a customer who only sees the tile.",
  "editing-tool": "Editing as its own tool (the owner's 'EDITING: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΜΗΧΑΝΗ REMOTION', 2026-10-30): video edited from an AI-written JSON plan (clips, timings, zoom, graphics, subtitles, audio), built into a Remotion composition, previewed free in the browser (Remotion Player) and exported server-side from that same composition. The engine is shared with Image's Animate, Video, Films and Posts. Built piece by piece behind this switch — src/app/dashboard/editing/page.tsx falls back to the Coming Soon screen for anyone it is not open to, independently of all-tools.ts's own `ready` flag, so a half-built piece is never reachable by a customer who only sees the tile. Where the final export itself runs (Remotion Lambda vs Cloud Run) is docs/EDITING-REMOTION.md's own ΘΕΛΩ, not this switch.",
  "films-tool": "Films as its own tool (the owner's '20. FILMS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΕΛΕΓΧΟ ΑΝΑ ΠΛΑΝΟ', 2026-10-30): an idea or half-written script becomes a scene-by-scene storyboard, shot by shot in the background with a per-shot camera angle/light/move and a price before every charge, built on top of what Video, Audio and Editing already provide. Built piece by piece behind this switch — src/app/dashboard/films/page.tsx falls back to the Coming Soon screen for anyone it is not open to, independently of all-tools.ts's own `ready` flag, so a half-built piece is never reachable by a customer who only sees the tile. docs/FILMS-HONESTY.md is this tool's own honest-cost ΘΕΛΩ, not this switch.",
  "3d-tool": "3D as a brand new tool (the owner's '23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ', 2026-10-31): 1-4 photos of an object or product become a 3D model — rotate it 360°, view it on a table with AR on a phone, drop it into a site. Built piece by piece behind this switch — src/app/dashboard/3d/page.tsx falls back to the Coming Soon screen for anyone it is not open to, independently of all-tools.ts's own `ready` flag, so a half-built piece is never reachable by a customer who only sees the tile. Provider choice (Meshy/Tripo/TRELLIS) and its own ΘΕΛΩ live in docs/3D-PROVIDERS.md, not this switch.",
  "sheets-tool": "Sheets, a brand new tool (the owner's «28. SHEETS: ΠΙΝΑΚΕΣ ΜΕ ΠΡΑΓΜΑΤΙΚΟΥΣ ΤΥΠΟΥΣ», 2026-10-31): a table with real formulas — built from a description, changed by selecting cells and saying «πρόσθεσε ΦΠΑ 24%», edited by hand like Excel, exported to xlsx and csv with the formulas intact. Built piece by piece behind this switch — src/app/dashboard/sheets/page.tsx is notFound() for anyone it is not open to, since Sheets has no All tools tile to fall back to (it is not one of the owner's twenty-five squares, and whether it gets a twenty-sixth is his own question in docs/NEEDS-FROM-ELIAS.md). The formula engine and its licence are docs/SHEETS-ENGINE.md's own ΘΕΛΩ (Κομμάτι 2), not this switch.",
  "skills-tool": "Skills, a brand new feature (the owner's «29. SKILLS: ΤΟ ΜΑΘΑΙΝΕΙΣ ΜΙΑ ΦΟΡΑ», 2026-10-31): teach Ionexa a procedure once — a name, when it applies, its steps, its files — and it follows the same steps every time that procedure is needed again, in Chat, Agents, Automations and Telegram. Built piece by piece behind this switch — src/app/dashboard/skills/page.tsx is notFound() for anyone it is not open to, reached from a card on /dashboard/settings that only renders when the switch is on for the reader, so a half-built piece is never a dead link on a customer's own Settings page. Κομμάτι 1 is the screen alone (read-only: supabase/migrations/20261107000000_user_skills.sql grants select only, nothing can be created yet); Κομμάτι 2 opens the first write path.",
  "telegram-bot": "Ionexa in Telegram, both directions (the owner's '24. IONEXA ΣΤΟ TELEGRAM', 2026-10-31): the bot already sends notifications outwards; behind this switch a person can CONNECT their own Telegram chat to the account from /dashboard/integrations and, from κομμάτι 2 on, write to it and have Ionexa build. Built piece by piece behind this switch — the Telegram section on the Connect page is not drawn at all for anyone it is not open to, so a half-built flow is never reachable. A connected chat may COMMAND the account, which is a larger grant than the notification channel of the same name and is stored separately for exactly that reason (supabase/migrations/20261031000001_telegram_link.sql). The bot token itself is TELEGRAM_BOT_TOKEN in Vercel, not this switch, and with no token the section says so instead of offering a code nobody could use.",
  "iowork-tool": "iowork, the app that works on your own computer (the owner's 'IOWORK: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ', 2026-10-25, Φάση 1): connect a computer to the account with an eight-character code, see the computers that are connected, disconnect one. The desktop app itself is not written yet — this switch opens only the web half (docs/IOWORK-TECH.md). It stays at «staff» longer than the others on the owner's own instruction: iowork goes onto customers' machines, so the tile's «Σύντομα» comes off only after an independent security review, after Φάση 3 — never by widening this switch alone.",
  "export-all": "Export everything: Settings' «Εξαγωγή όλων» downloads one .zip with the account's data, every stored file, every site as files that open outside Ionexa and every game, instead of the data alone as JSON (MASTER 18 §2.4, ACCEPTANCE Α49)",
  "finance-sales": "Finances: write «πλήρωσα 50 ευρώ ρεύμα» and it is recorded, read by code; Sales: move a contact from stage to stage with a reminder that arrives in the bell (MASTER 16, package 18). Needs migration 20261023000000_lead_stages.sql",
  "meeting-goal": "Meetings: the actions you tick become the steps of a goal, inside a project you choose or make there (MASTER 16, package 17)",
  "posts-images": "Posts with a picture: your own photo, or one from Unsplash, on every post at its platform's own size (LinkedIn 1200x627, X 1600x900, Instagram and Threads 1080x1350, Facebook 1200x630), each downloadable (MASTER 16, package 15)",
  "slides-charts": "Slides from your own file: a spreadsheet given to Slides with «+» becomes a deck with a real chart of its numbers, computed from the file and drawn as a chart PowerPoint can edit (MASTER 16, package 13)",
  "chat-work-area": "Chat: the work area beside the conversation, and the card that reopens it (ΣΥΣΤΗΜΑ DESIGN §5, Δ.2)",
  "chat-attachments": "Chat reads what you give it: PDFs and images attached to a message, asked about, and under the answer the remembered facts it used (MASTER 16, package 9)",
  "chat-charts": "Chat draws a chart under its answer when a data-type attachment is on the message: line, bars or pie, in the design's own colours, with a card underneath saying which file and which arithmetic produced it (the owner's «30. CHAT: ΓΡΑΦΗΜΑΤΑ, ΔΙΑΓΡΑΜΜΑΤΑ ΚΑΙ ΚΑΡΤΕΣ ΜΕΣΑ ΣΤΗΝ ΑΠΑΝΤΗΣΗ», 2026-10-31, Κομμάτι 1). The chart is picked and computed by code from the attached data_analyses row, after the model has already answered — the model never sees a row and never returns a number that gets drawn (the same rule lib/presentations/deck-charts.ts already holds Slides to).",
  "deferred-deletion": "GDPR Art. 17 deferred deletion (directive 39 Κομμάτι 3): when the user confirms account deletion, the account is SCHEDULED for deletion 30 days later instead of being erased immediately. During the window the user can cancel via a link emailed at scheduling time. A daily cron (api/cron/execute-deletions) picks up rows past their delete_after and runs the existing erase sequence. The old immediate path stays as the fallback when this switch is off. Needs migration 20261108000000_pending_deletions.sql, and 20261112000000_pending_deletions_one_open.sql for one schedule per account and a record kept after the deletion runs.",
  "help-tool-articles": "Help centre per-tool articles (directive 41 Κομμάτι 1): one short article per All Tools tile, in English and Greek, describing what the tool does today — not promises. Chat also matches these articles via knowledge-base.ts triggers. Behind this switch the 'tools' category on /help shows the new articles; without it, only the original categories appear. Needs migration 20261109000000_help_articles_tools.sql.",
  "agents-automations-pro": "Agents and Automations on two levels (the owner's «55. AGENTS ΚΑΙ AUTOMATIONS: SIMPLE ΚΑΙ PRO», 2026-11-04): a «Simple | Pro» switch in the work bar — Simple is the steps as a list in plain words, Pro is the whole mechanism in boxes and lines with every box configurable. The SAME automation either way, so nothing a person made in one level is unreachable from the other and nothing is stored per level. Built piece by piece behind this switch; with it off, Automations draws exactly the boxes it drew before, with no switch above them, so a half-built level is never reachable by a customer and nobody loses the configurator they already had. Κομμάτι 1 is the switch and Simple's list for Automations only (components/shell/tool-shell.tsx's ShellModeSwitch, components/automations/flow-boxes.tsx's FlowSteps); Agent Pro on a canvas, the 11 fields, teams, the pre-activation tests, the three phases and the Approval Center are Κομμάτια 2-10, each behind this same switch. Also behind it since 2026-11-05 (the owner, after the automation videos): Simple labels every step with its part of the sentence «Όταν → Αν → Κάνε» (lib/automations/boxes.ts SENTENCE_PART), and Pro's lines light up with moving dots while a run is going, read from the run's own steps, with the box a run failed at marked and the reason in words (lib/automations/run-progress.ts).",
  "automation-templates": "Ready-made automations (the owner, 2026-11-05, after the automation videos): a gallery in Automations where one press makes a whole automation the person can then change like any other — the finance assistant's daily summary (every day at 08:30, this week's finances → an AI summary → Telegram) and weekly analysis (every Monday, this month's finances → an AI analysis → Telegram). Making one calls no model and costs nothing; each run costs its AI box, said on the card before the press. The two the product cannot do yet are drawn with «Σύντομα» and the reason, and cannot be pressed: recording an expense by writing to the Telegram bot (needs Telegram's incoming messages, TG1 Κομμάτι 2) and Instagram → Telegram (needs an Instagram connection). lib/automations/templates.ts, api/automations/templates.",
  "automation-time-saved": "Time saved, measured (the owner, 2026-11-05): an automation can carry «how many minutes this used to take you», typed by the person, and then shows «Σου γλίτωσε ~X ώρες» = its finished runs (trials excluded) × those minutes, with both factors printed beside it. No minutes, no number — nothing is estimated. Needs migration 20261114000000_automation_minutes_saved.sql; until it is pasted the field and the figure are not drawn, for anyone, and nothing else on the screen changes. lib/automations/time-saved.ts.",
  "editor-shell": "Every tool in the owner-approved editor layout (the 26 approved screens, docs/design/approved/README.md, approved 2026-11-04): the work takes the whole width under a 56px bar — history, «Tool / title», one status tag, the tool's outlined buttons and exactly ONE white primary — with an optional 288px settings panel on the right and the field floating bottom-centre over the work, carrying the selected piece as a chip, the price and the last answer on one line above it (its «Chat» opens the whole conversation). On a phone the work is Chat | Result, with the primary full-width above the field. One switch for all ~20 tools at once, because they all draw components/shell/tool-shell.tsx, which hands over to components/shell/editor-shell.tsx when this is on; with it off every tool draws exactly the conversation-left / work-right shell it drew before. Read once per request in app/dashboard/layout.tsx and passed down through components/shell/editor-shell-context.tsx, so no page reads it.",
  "discord-bot": "Ionexa in Discord (the owner's Discord directive, 2026-11-05): connect a server the person created with the bot invite (never Administrator), describe the server in words and get a plan as boxes — roles, categories, channels, welcome, rules, AutoMod — change it with words, make it in Discord with one press, and undo exactly what was made; plus `/ionexa ask` in a connected server, charged like Chat. src/app/dashboard/discord/page.tsx is notFound() for anyone it is not open to, and every api/discord route refuses with 404 the same way, so a half-built piece is never reachable by a customer. With any of DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY missing the screen names it and offers no connect button. Needs migration 20261119000000_discord_bot.sql.",
  "admin-dashboard": "Admin dashboard (directive 42):a single page at /dashboard/admin for the owner only, behind mandatory 2FA when ΑΣ2-1.1 lands. Users, credits, cost per provider, revenue, feature flags, reports, suspensions — every admin action logged to admin_audit_log. Needs migration 20261110000000_admin_audit_log.sql.",
  "business-contact-memory": "The business's own network, remembered (the 2026-11-07 market round, docs/QUEUE.md «ΤΟ MOAT»): every customer, supplier and partner named in a chat becomes its own row in business_contacts, with a mention count that grows and a first-seen date — a structured memory that compounds with use, unlike the free-prose chat_memory it sits beside. With this switch on, the second extraction call chat already makes after a reply (lib/chat/memory.ts) also asks for named contacts, written through business_contact_record(); with it off, extraction asks only what it always asked and nothing is written to the table. The panel on /dashboard/ai-memory (components/memory/business-contacts-list.tsx) and the read route src/app/api/memory/contacts/route.ts both check this same switch, so a half-open feature never shows an empty list to someone extraction was never recording for. Needs migration 20261121000000_business_contacts.sql.",
  "voice-live": "Live voice conversation with the Ionexa globe (the owner's «33. ΦΩΝΗΤΙΚΗ ΣΥΝΟΜΙΛΙΑ ΜΕ ΤΗ ΓΗ ΤΟΥ IONEXA», FS1): «Μίλα» in Chat opens a full-screen globe and one realtime call to the speech provider instead of the record-transcribe-answer-read loop — no press to talk, speaking over the answer stops it, the same remembered facts and conduct as the written Chat, and when it closes the whole conversation is in the thread as text; no audio is stored anywhere. Charged by the minute, the price on the screen before the call starts, each minute paid before it is used (lib/voice/live-session.ts), at most 15 minutes a call. Needs OPENAI_API_KEY (already used for transcription) and migration 20261124000000_voice_live_sessions.sql; without the table a start answers «not ready» and charges nothing. With this switch off, «Μίλα» opens the hands-free loop it always opened (components/voice/voice-conversation.tsx).",
  "cinematic-sites": "Cinematic sites (docs/v6-cinematic-sites-2026-10-03.md): the Website Builder gains a style library beyond today's static pages — a looping subject hero, a scroll-driven build sequence, a 360° product turn, parallax — staged by our own shipped script (public/ionexa-players.js, the one path website-html-security-scan.ts's ALLOWED_OWN_SCRIPT_SRCS lets a generated page reference) rather than any JavaScript the model writes. Built piece by piece behind this switch, Phase 1a first: the player script and the scanner/CSP allowlist that lets a page use it at all, with no style wired into generation yet — a half-built phase changes nothing a customer sees until the next piece lands. Real AI media (Nano Banana Pro images, Veo 3.1 clips, both over the Gemini API) needs GEMINI_API_KEY, which is not set; until it is, any wired style ships with a storyboard placeholder and says so, the same shape as the existing `photosDropped` generation note for a missing UNSPLASH_ACCESS_KEY.",
} as const;
// REMOVED (the owner's critical message, 2026-10-23, "χωρίς διακόπτες"):
// "coding-github" — GitHub in Coding is controlled entirely by whether the
// four env vars are set (githubAppConfigured(), lib/github/auth.ts).
// REMOVED, UNCONDITIONAL FOR EVERYONE SINCE 2026-10-22 (the owner's
// critical message — each was verified end-to-end with no open
// blocker, and a flag that could hide a screen from its own owner,
// as all-tools-tiles could, should not exist at all):
// "first-task" (src/app/onboarding/page.tsx), "chat-opens-tools"
// (src/app/dashboard/chat/page.tsx), "file-pages"
// (src/app/api/files/[id]/view/route.ts, src/app/dashboard/files/page.tsx),
// "brand-memory" (src/app/api/websites/generate/process/route.ts,
// src/lib/flows/page-data.ts, src/app/api/chat/route.ts), "library"
// (src/app/dashboard/timeline/page.tsx, src/app/dashboard/favorites/page.tsx),
// "all-tools-tiles" (src/app/dashboard/tools/page.tsx).

export type FlagKey = keyof typeof FLAGS;

export const DEFAULT_AUDIENCE: FlagAudience = "staff";

/** The switches that start somewhere other than DEFAULT_AUDIENCE, and
 *  read so when the table has no row or cannot be read (see above).
 *  Empty since 2026-10-22 — the one entry it ever held, `all-tools-tiles`,
 *  is gone (see the doc comment above). */
export const FIRST_AUDIENCE: Partial<Record<FlagKey, FlagAudience>> = {};

export function defaultAudienceOf(key: FlagKey): FlagAudience {
  return FIRST_AUDIENCE[key] ?? DEFAULT_AUDIENCE;
}

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
  const out = Object.fromEntries((Object.keys(FLAGS) as FlagKey[]).map((k) => [k, defaultAudienceOf(k)])) as Record<FlagKey, FlagAudience>;
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
