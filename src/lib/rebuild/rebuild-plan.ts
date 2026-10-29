import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from "@/lib/agents/agent-config";
import { languageNameFor } from "@/lib/text/language-name";
import { featuresContextBlock } from "@/lib/rebuild/rebuild-features";

/**
 * REBUILD — «build your own version of any app» (the owner's final grid,
 * 2026-10-23), the half with no SDK in it: scripts/tests/rebuild.test.mjs
 * executes it. The same shape as Games (lib/games/game-plan.ts): the app is
 * PLANNED in boxes before it is written, each box can be changed with words
 * on its own, and only then is the app written as ONE HTML file that
 * lib/rebuild/rebuild-html.ts checks and seals before it is shown.
 *
 * WHAT THE PERSON POINTED AT IS DATA, AND INSPIRATION ONLY. A page they
 * name is read for its structure (lib/rebuild/structure.ts) and arrives
 * here already rendered and bounded, between the untrusted markers; the
 * rules below and the system prompt (lib/rebuild/rebuild-system.ts) say the
 * result is an ORIGINAL app of their own — never the other app's name,
 * words, pictures or code.
 *
 * Client-safe on purpose: the screen prices the next press from these same
 * messages, so nothing server-only is imported here.
 */
export const REBUILD_MODEL = "claude-sonnet-4-6";

export const REBUILD_BOX_KINDS = ["screens", "data", "actions", "look"] as const;
export type RebuildBoxKind = (typeof REBUILD_BOX_KINDS)[number];
export type RebuildBox = { kind: RebuildBoxKind; text: string };
export type RebuildPlan = { title: string; boxes: RebuildBox[] };

export const MAX_DESCRIPTION_CHARS = 3_000;
export const MAX_BOX_CHARS = 700;
export const MAX_TITLE_CHARS = 80;
export const MAX_INSTRUCTION_CHARS = 700;
/** The plan's call: a title and four short boxes. */
export const PLAN_MAX_TOKENS = 1_800;
/** The app's call: a working single-file app is 15-40 thousand characters. */
export const APP_MAX_TOKENS = 14_000;

export function isRebuildBoxKind(v: unknown): v is RebuildBoxKind {
  return typeof v === "string" && (REBUILD_BOX_KINDS as readonly string[]).includes(v);
}

const clipPlan = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** The plan the model returned, or why it is not one: every box once, none empty. */
export function parsePlan(input: unknown, fallbackTitle: string): { ok: true; plan: RebuildPlan } | { ok: false; reason: string } {
  const raw = (input ?? {}) as { title?: unknown; boxes?: unknown };
  if (!Array.isArray(raw.boxes)) return { ok: false, reason: "no boxes" };
  const boxes: RebuildBox[] = [];
  for (const kind of REBUILD_BOX_KINDS) {
    const found = raw.boxes.find((b) => (b as { kind?: unknown })?.kind === kind) as { text?: unknown } | undefined;
    const text = typeof found?.text === "string" ? clipPlan(found.text, MAX_BOX_CHARS) : "";
    if (!text) return { ok: false, reason: `the ${kind} box is missing or empty` };
    boxes.push({ kind, text });
  }
  const title = typeof raw.title === "string" && raw.title.trim() ? clipPlan(raw.title, MAX_TITLE_CHARS) : clipPlan(fallbackTitle, MAX_TITLE_CHARS) || "App";
  return { ok: true, plan: { title, boxes } };
}

/** A stored plan read back, never trusted to be whole. */
export function readPlan(value: unknown): RebuildPlan | null {
  const parsed = parsePlan(value, "");
  return parsed.ok ? parsed.plan : null;
}

/** One box replaced, every other box exactly as it was. */
export function withBox(plan: RebuildPlan, kind: RebuildBoxKind, text: string): RebuildPlan {
  const next = clipPlan(text, MAX_BOX_CHARS);
  return { ...plan, boxes: plan.boxes.map((b) => (b.kind === kind && next ? { kind, text: next } : b)) };
}

const fencePlan = (s: string) => `${UNTRUSTED_OPEN}\n${s}\n${UNTRUSTED_CLOSE}`;

export const PLAN_TOOL = {
  name: "plan_app",
  description: "The app's plan: a title of its own and exactly four boxes — screens, data, actions, look.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      boxes: {
        type: "array",
        items: {
          type: "object",
          properties: { kind: { type: "string", enum: [...REBUILD_BOX_KINDS] }, text: { type: "string" } },
          required: ["kind", "text"],
        },
      },
    },
    required: ["title", "boxes"],
  },
};

export const BOX_TOOL = {
  name: "rewrite_box",
  description: "The one box, rewritten as asked.",
  inputSchema: { type: "object" as const, properties: { text: { type: "string" } }, required: ["text"] },
};

export const APP_TOOL = {
  name: "write_app",
  description: "The whole app as ONE complete HTML document.",
  inputSchema: { type: "object" as const, properties: { html: { type: "string" } }, required: ["html"] },
};

/** The reference, rendered by lib/rebuild/structure.ts, fenced as data. */
const referenceBlock = (reference: string | null | undefined) =>
  reference ? ["", "A PAGE OF AN APP THE PERSON LIKES, read for its structure only (the idea to build something OF THEIR OWN from, never to copy):", fencePlan(reference)] : [];

/**
 * Κομμάτι 4 (2026-10-29): the Brand Kit's own narrow source today — a
 * business name and a colour, remembered from earlier chats
 * (lib/memory/brand.ts), the SAME two facts Flows already reuses
 * (lib/flows/page-data.ts's brandColour). No logo and no font: neither
 * exists anywhere in the product yet (docs/MASTER.md:709), and saying so
 * here is the honest version of "design from the Brand Kit" rather than
 * a claim this file cannot back. A LOCAL shape, not an import from
 * lib/memory/brand.ts — that file pulls in lib/website-design-brief.ts,
 * and this one stays free of anything not plain and client-safe, same
 * reason AppDefinition is restated locally above.
 */
export type RebuildBrandHint = { name: string | null; colourHex: string | null };

const brandBlock = (brand: RebuildBrandHint | null | undefined): string[] => {
  if (!brand || (!brand.name && !brand.colourHex)) return [];
  const lines = [brand.name ? `Business: ${brand.name}` : null, brand.colourHex ? `Colour: ${brand.colourHex}` : null].filter((l): l is string => l !== null);
  return ["", "THE PERSON'S OWN BUSINESS, remembered from earlier chats — a hint for the look box only (use the colour if it fits; never take the app's own name from this, never the business's actual logo or wording):", fencePlan(lines.join("\n"))];
};

export function planMessage(description: string, locale: string, reference?: string | null, features?: readonly string[], brand?: RebuildBrandHint | null): string {
  return [
    `Plan this app. Write the title and every box in ${languageNameFor(locale)}. Give it a NEW name of its own — never the name of the app it resembles.`,
    "Boxes: screens (each screen and what the person does on it), data (what the app remembers and in what fields), actions (what the buttons and gestures do), look (colours, mood, layout — original, not the look of another product).",
    `Each box at most ${MAX_BOX_CHARS} characters, concrete enough to build from.`,
    "",
    fencePlan(description),
    ...featuresContextBlock(features ?? []),
    ...referenceBlock(reference),
    ...brandBlock(brand),
  ].join("\n");
}

/** The plan as the model reads it back — also what the «App logic» phase plans FROM (lib/rebuild/rebuild-call.ts's planAppLogic). */
export const planText = (plan: RebuildPlan) => [`TITLE: ${plan.title}`, ...plan.boxes.map((b) => `${b.kind.toUpperCase()}: ${b.text}`)].join("\n");

export function boxMessage(plan: RebuildPlan, kind: RebuildBoxKind, instruction: string, locale: string): string {
  return [
    `Here is the whole plan, for context. Rewrite ONLY the ${kind} box as asked, in ${languageNameFor(locale)}, at most ${MAX_BOX_CHARS} characters. Every other box stays as it is.`,
    "",
    planText(plan),
    "",
    "What to change:",
    fencePlan(instruction),
  ].join("\n");
}

export const BUILD_RULES = [
  "ONE complete HTML document: <!DOCTYPE html>, <html>, <head> with <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">, <body>. All CSS in one <style>, all code in one inline <script> — no file, library, font, image, icon set or sound from anywhere else: draw with CSS, inline SVG, emoji or <canvas>.",
  "No network of any kind (no fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, no URL starting http:// or https:// anywhere, no <form>, <iframe>, link or navigation). It runs sealed off from everything else.",
  "It must WORK: real screens the person moves between, real forms made of inputs and buttons handled in code, lists that can be added to, edited and removed. Keep what the person enters with this small helper, so it works both inside the sealed preview (where the browser refuses storage) and as a downloaded file: try { localStorage } and fall back to an in-memory object when that throws.",
  "It fills the space it is given, works with the keyboard AND with large touch targets on a phone, and says plainly when a list is empty.",
  "ORIGINAL: its own name, its own words, its own colours and shapes. Never the name, logo, wording, pictures or code of any real product, even when asked; take only the idea and the kind of screens.",
  "Put the numbers and texts that tune the app (labels, colours, limits) together at the top of the script as named constants, so a change asked in words changes them in one place.",
  "Under 40,000 characters. The visible words in the language you are told.",
];

/**
 * Κομμάτι 3 (2026-10-29): Apps' own structured definition (lib/apps/
 * app-plan.ts, called as a library — see lib/rebuild/rebuild-call.ts's
 * planAppLogic), when the «App logic» phase has run. Rendered here rather
 * than importing app-plan.ts's own definitionText, and typed here with a
 * LOCAL restatement of its shape rather than importing AppDefinition —
 * even `import type` makes load-ts.mjs's flat bundle collect app-plan.ts's
 * top-level names for its collision check (it recurses into every local
 * import before it can know which were type-only), and that file declares
 * several this one already uses for something else (boxMessage,
 * planMessage, PLAN_TOOL, BOX_TOOL, PLAN_MAX_TOKENS). Structural typing
 * makes the restatement safe: the real AppDefinition satisfies this shape
 * exactly, nothing narrowed or re-validated. Fenced the same as every
 * other block here: field and screen LABELS are still words, even though
 * parseDefinition already bounds their shape.
 */
export type RebuildAppDefinitionView = {
  title: string;
  collections: { key: string; label: string; visibility: string; fields: { key: string; label: string; type: string; required: boolean; options?: string[] }[] }[];
  screens: { key: string; label: string; kind: string; collection: string; role: string }[];
  notifications: { key: string; label: string; collection: string; to: string }[];
};

function renderAppDefinition(definition: RebuildAppDefinitionView): string {
  const lines = [`TITLE: ${definition.title}`, "COLLECTIONS:"];
  for (const c of definition.collections) {
    lines.push(`- ${c.key} "${c.label}" (visibility: ${c.visibility})`);
    for (const f of c.fields) lines.push(`    ${f.key} "${f.label}" ${f.type}${f.required ? " required" : ""}${f.options ? ` [${f.options.join(", ")}]` : ""}`);
  }
  lines.push("SCREENS:");
  for (const s of definition.screens) lines.push(`- ${s.key} "${s.label}" ${s.kind} of ${s.collection}, for the ${s.role}`);
  if (definition.notifications.length > 0) {
    lines.push("NOTIFICATIONS:");
    for (const n of definition.notifications) lines.push(`- ${n.key} "${n.label}" on a new ${n.collection}, to the ${n.to}`);
  }
  return lines.join("\n");
}

function appDefinitionBlock(definition: RebuildAppDefinitionView | null | undefined): string[] {
  return definition ? ["", "THE APP'S DATA AND SCREENS, decided in the App logic phase — build exactly this (in your own words and design, never copying the wording as-is):", fencePlan(renderAppDefinition(definition))] : [];
}

export function buildMessage(plan: RebuildPlan, locale: string, reference?: string | null, appDefinition?: RebuildAppDefinitionView | null): string {
  return [
    `Write this app. Visible words in ${languageNameFor(locale)}.`,
    ...BUILD_RULES.map((r) => `- ${r}`),
    "",
    "THE PLAN:",
    fencePlan(planText(plan)),
    ...appDefinitionBlock(appDefinition),
    ...referenceBlock(reference),
  ].join("\n");
}

export function changeMessage(html: string, instruction: string, locale: string): string {
  return [
    `Change this app as asked and return the WHOLE changed document. Change only what is asked; everything else stays exactly as it is. Visible words in ${languageNameFor(locale)}.`,
    ...BUILD_RULES.map((r) => `- ${r}`),
    "",
    "THE APP:",
    fencePlan(html),
    "",
    "WHAT TO CHANGE:",
    fencePlan(instruction),
  ].join("\n");
}
