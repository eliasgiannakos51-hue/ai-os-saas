import { LIBRARY_SOURCES, textOfHtml, textOfFile, type LibraryKind } from "@/lib/library/sources";
import { getFavoritableByTable } from "@/lib/favoritable";

/**
 * «ΤΑ ΔΙΚΑ ΜΟΥ» — EVERY TABLE THIS ACCOUNT HAS EVER WRITTEN TO, READ AT
 * REQUEST TIME (the owner's message, 2026-10-22, item 3 — the AI-answer
 * half; the Finances/Sales/Trading REMOVAL that message also asks for is
 * a separate, fenced-off round and nothing here does it: those three
 * tools, their routes, their tables and their rows are untouched by this
 * file and by the whole of this tool).
 *
 * NO NEW TABLE FOR THE DATA, AND NOTHING MOVES — the exact shape
 * lib/library/sources.ts already proved for seven of these twelve kinds.
 * This file does not re-describe those seven; it takes LIBRARY_SOURCES as
 * given (one definition, read twice — by the Library and by this tool —
 * so the two can never list a table's columns differently) and adds the
 * five more a "my own data" question needs to search but the Library
 * never had to: the user's own conversations, coding sessions, and the
 * three classifier trackers (Finance, Sales, Trading) the owner's message
 * names by hand as what must still be found here once they leave their
 * own grid square.
 *
 * KΟΜΜΑΤΙ 3 ADDS THREE MORE (2026-10-28, filters: All/Documents/Images/
 * Data/More[...]/Project/Sort) — `images` (generated_images, the real
 * Image tool's own table, already shipped), `meetings` (meetings, also
 * shipped), and `apps` (user_apps, the Apps tool, still behind the
 * `apps-tool` flag — see that source's own comment below for why it needs
 * no flag check written HERE). None of the three had a My Stuff entry
 * before this round; see docs/PROGRESS.md's Κομμάτι 3 entry for the
 * per-kind bucket mapping this unlocks.
 *
 * `MyStuffKind` is deliberately its OWN union rather than an extension of
 * `LibraryKind` — the Library's own gate (scripts/tests/library.test.mjs)
 * holds `LibraryKind` to exactly the seven kinds it lists, and widening
 * that type to please a different tool would widen what the Library
 * claims to cover.
 */

export type MyStuffKind = LibraryKind | "chat" | "coding" | "finance" | "sales" | "trading" | "images" | "meetings" | "apps";

export type MyStuffSource = {
  kind: MyStuffKind;
  table: string;
  /** The columns the list and the AI-ask step both need. Always `id` and the time column. */
  columns: string;
  /** Columns only a search or the AI step reads — the body, not the headline. "" when there is none worth reading (see `chat` below). */
  contentColumns: string;
  titleOf: (row: Record<string, unknown>) => string;
  timeColumn: string;
  /** A row that failed to be made, or that this tool must not surface. */
  keep: (row: Record<string, unknown>) => boolean;
  hrefFor: (id: string) => string;
};

const myStuffText = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The real per-record address, from the ONE registry this app already
 * keeps for "which table, which id, which address" (lib/favoritable.ts) —
 * reused rather than re-invented, so a citation opens the exact row the
 * answer was read from and not merely the tool's list page. Falls back to
 * the tool's own address for the one kind that registry does not cover.
 */
function favoriteHref(table: string, fallback: string): (id: string) => string {
  const favoritable = getFavoritableByTable(table);
  return (id: string) => (favoritable ? favoritable.hrefFor(id) : fallback);
}

// THE SEVEN THE LIBRARY ALREADY READS, taken as-is — same table, same
// columns, same keep(), same href. `kind` widens for free: MyStuffKind is
// a superset of LibraryKind, so no cast is needed at the value level, only
// at the type level (TS infers `LibraryKind` from the array literal
// unless told the wider target, hence the explicit annotation below).
const FROM_LIBRARY: readonly MyStuffSource[] = LIBRARY_SOURCES;

// THE FIVE MORE THIS TOOL NEEDS.
const chat: MyStuffSource = {
  kind: "chat",
  table: "chat_conversations",
  columns: "id, title, created_at",
  // NOTHING, ON PURPOSE. A conversation's words live in chat_messages,
  // one row per turn, not on this row — reading them here would mean a
  // second query per conversation for a search this tool bounds at 60
  // rows per kind already. The AI-ask step (ask-store.ts) reads
  // chat_messages directly, with its own bound, for the kinds a question
  // actually turns out to need; the browse/search step searches titles
  // only, the same limit api/conversations/search/route.ts documents for
  // the Chats page itself.
  contentColumns: "",
  titleOf: (row) => myStuffText(row.title),
  timeColumn: "created_at",
  keep: () => true,
  hrefFor: favoriteHref("chat_conversations", "/dashboard/chat"),
};

const coding: MyStuffSource = {
  kind: "coding",
  table: "code_sessions",
  columns: "id, title, operation, created_at",
  contentColumns: "input,output",
  titleOf: (row) => myStuffText(row.title),
  timeColumn: "created_at",
  // A failed turn produced no output; a 'note' row is an import from the
  // old ai_coding_requests tracker and was never run (same two reasons
  // library/sources.ts's own `site`/`posts`/`slides` entries filter).
  keep: (row) => row.status === "done",
  // Coding has no per-session address of its own — each row is one turn
  // of a conversation the tool keeps client-side, not a page with an id
  // in its URL — so the citation opens the tool itself.
  hrefFor: favoriteHref("code_sessions", "/dashboard/coding"),
};

const finance: MyStuffSource = {
  kind: "finance",
  table: "finance_entries",
  columns: "id, description, type, amount, created_at",
  contentColumns: "description",
  titleOf: (row) => myStuffText(row.description),
  timeColumn: "created_at",
  keep: () => true,
  hrefFor: favoriteHref("finance_entries", "/dashboard/finance"),
};

const sales: MyStuffSource = {
  kind: "sales",
  table: "leads",
  columns: "id, lead_name, score, created_at",
  contentColumns: "lead_name",
  titleOf: (row) => myStuffText(row.lead_name),
  timeColumn: "created_at",
  keep: () => true,
  hrefFor: favoriteHref("leads", "/dashboard/sales"),
};

const trading: MyStuffSource = {
  kind: "trading",
  table: "trades",
  columns: "id, symbol, direction, result, pnl, notes, created_at",
  contentColumns: "notes",
  titleOf: (row) => myStuffText(row.symbol),
  timeColumn: "created_at",
  keep: () => true,
  hrefFor: favoriteHref("trades", "/dashboard/trading"),
};

// THE THREE KΟΜΜΑΤΙ 3 ADDS. generated_images and meetings are real,
// shipped tables with rows today; user_apps is real too, but the ONLY
// screen that can write one (app-builder/page.tsx) renders nothing for an
// account without the `apps-tool` flag (lib/flags/flags.ts) — so an
// account that never had the flag never has a row here either, and no
// extra gate is needed in THIS file for that to be true.
const images: MyStuffSource = {
  kind: "images",
  table: "generated_images",
  columns: "id, prompt, created_at",
  // No separate body column — the prompt IS the whole record, same as
  // `sales`'s lead_name below.
  contentColumns: "",
  titleOf: (row) => myStuffText(row.prompt),
  timeColumn: "created_at",
  keep: (row) => row.status !== "failed",
  hrefFor: favoriteHref("generated_images", "/dashboard/images"),
};

const meetings: MyStuffSource = {
  kind: "meetings",
  table: "meetings",
  columns: "id, title, created_at",
  contentColumns: "transcript",
  titleOf: (row) => myStuffText(row.title),
  timeColumn: "created_at",
  keep: () => true,
  // No favoritable.ts entry and no per-meeting dashboard route exists yet
  // (src/components/meetings/meetings-workspace.tsx keeps the open one in
  // client state, not a URL) — the same situation `coding` is already in
  // above, same fallback shape.
  hrefFor: favoriteHref("meetings", "/dashboard/meetings"),
};

const apps: MyStuffSource = {
  kind: "apps",
  table: "user_apps",
  columns: "id, title, created_at",
  contentColumns: "description",
  titleOf: (row) => myStuffText(row.title),
  timeColumn: "created_at",
  keep: () => true,
  hrefFor: favoriteHref("user_apps", "/dashboard/app-builder"),
};

export const MY_STUFF_SOURCES: readonly MyStuffSource[] = [
  ...FROM_LIBRARY,
  chat,
  coding,
  finance,
  sales,
  trading,
  images,
  meetings,
  apps,
];

export const MY_STUFF_KINDS: readonly MyStuffKind[] = MY_STUFF_SOURCES.map((s) => s.kind);

export function isMyStuffKind(value: unknown): value is MyStuffKind {
  return typeof value === "string" && (MY_STUFF_KINDS as readonly string[]).includes(value);
}

export function sourceForKind(kind: MyStuffKind): MyStuffSource | undefined {
  return MY_STUFF_SOURCES.find((s) => s.kind === kind);
}

/** Every string inside a JSON value, in order — reused from the Library
 *  rather than re-written, since `slides`/`posts`/`research` store their
 *  body as JSON and this is the same walk library/sources.ts needs.
 *  Named distinctly from that file's own private helper of the same
 *  shape: scripts/tests/load-ts.mjs bundles both into one flat scope
 *  whenever a caller needs both (classify.ts does, transitively), and two
 *  top-level declarations of the same name cannot coexist in it. */
function myStuffStringsIn(value: unknown, out: string[], depth = 0): void {
  if (depth > 12) return;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) myStuffStringsIn(v, out, depth + 1);
  else if (value && typeof value === "object") for (const v of Object.values(value)) myStuffStringsIn(v, out, depth + 1);
}

/** What a search — or the AI-ask step's context — reads for one row: its title and everything it says. */
export function myStuffSearchableText(source: MyStuffSource, row: Record<string, unknown>): string {
  const parts: string[] = [source.titleOf(row)];
  for (const column of source.contentColumns.split(",").map((c) => c.trim()).filter(Boolean)) {
    const value = row[column];
    if (column === "html_content") parts.push(textOfHtml(myStuffText(value)));
    else if (column === "extracted_text") parts.push(textOfFile(myStuffText(value)));
    else myStuffStringsIn(value, parts);
  }
  return parts.join(" \n ");
}
