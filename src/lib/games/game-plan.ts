import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from "@/lib/agents/agent-config";
import { languageNameFor } from "@/lib/text/language-name";

/**
 * A GAME FROM A DESCRIPTION (MASTER 16, package 26; BUILD-SPECS «4. GAMES»),
 * the half with no SDK in it — scripts/tests/games.test.mjs executes it.
 *
 * The game is planned before it is written, in the boxes the spec names:
 * rules, levels, characters, controls, how you win. Each box can be changed
 * with words on its own; only then is the game written, as one HTML file
 * that lib/games/game-html.ts checks and seals before it is played.
 *
 * Phase 1 of the spec: 2D, one player, computer and phone.
 *
 * Client-safe on purpose: the screen prices the next press from these
 * same messages. The system prompt carries the shared conduct block,
 * which is server-only, so it lives in lib/games/game-system.ts and the
 * page hands the screen its length.
 */
export const GAME_MODEL = "claude-sonnet-4-6";

export const GAME_BOX_KINDS = ["rules", "levels", "characters", "controls", "win"] as const;
export type GameBoxKind = (typeof GAME_BOX_KINDS)[number];
export type GameBox = { kind: GameBoxKind; text: string };
export type GamePlan = { title: string; boxes: GameBox[] };

export const MAX_GAME_DESCRIPTION_CHARS = 2_000;
export const MAX_BOX_CHARS = 600;
export const MAX_TITLE_CHARS = 80;
export const MAX_INSTRUCTION_CHARS = 600;
/** The plan's call: five short boxes. */
export const PLAN_MAX_TOKENS = 1_500;
/**
 * The game's call. A complete small 2D game in one file is 10-25 thousand
 * characters; 12,000 tokens covers the top of that with room, and keeps
 * the call inside the route's own time (a long answer at the output rate
 * of this model is about two minutes).
 */
export const GAME_MAX_TOKENS = 12_000;

export function isGameBoxKind(v: unknown): v is GameBoxKind {
  return typeof v === "string" && (GAME_BOX_KINDS as readonly string[]).includes(v);
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** The plan the model returned, or why it is not one: every box once, none empty. */
export function parsePlan(input: unknown, fallbackTitle: string): { ok: true; plan: GamePlan } | { ok: false; reason: string } {
  const raw = (input ?? {}) as { title?: unknown; boxes?: unknown };
  if (!Array.isArray(raw.boxes)) return { ok: false, reason: "no boxes" };
  const boxes: GameBox[] = [];
  for (const kind of GAME_BOX_KINDS) {
    const found = raw.boxes.find((b) => (b as { kind?: unknown })?.kind === kind) as { text?: unknown } | undefined;
    const text = typeof found?.text === "string" ? clip(found.text, MAX_BOX_CHARS) : "";
    if (!text) return { ok: false, reason: `the ${kind} box is missing or empty` };
    boxes.push({ kind, text });
  }
  const title = typeof raw.title === "string" && raw.title.trim() ? clip(raw.title, MAX_TITLE_CHARS) : clip(fallbackTitle, MAX_TITLE_CHARS) || "Game";
  return { ok: true, plan: { title, boxes } };
}

/** A stored plan read back, never trusted to be whole. */
export function readPlan(value: unknown): GamePlan | null {
  const parsed = parsePlan(value, "");
  return parsed.ok ? parsed.plan : null;
}

/** One box replaced, every other box exactly as it was. */
export function withBox(plan: GamePlan, kind: GameBoxKind, text: string): GamePlan {
  const next = clip(text, MAX_BOX_CHARS);
  return { ...plan, boxes: plan.boxes.map((b) => (b.kind === kind && next ? { kind, text: next } : b)) };
}

const fence = (s: string) => `${UNTRUSTED_OPEN}\n${s}\n${UNTRUSTED_CLOSE}`;

export const PLAN_TOOL = {
  name: "plan_game",
  description: "The game's plan: a title and exactly five boxes — rules, levels, characters, controls, win.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      boxes: {
        type: "array",
        items: {
          type: "object",
          properties: { kind: { type: "string", enum: [...GAME_BOX_KINDS] }, text: { type: "string" } },
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
  input_schema: { type: "object" as const, properties: { text: { type: "string" } }, required: ["text"] },
};

export const GAME_TOOL = {
  name: "write_game",
  description: "The whole game as ONE complete HTML document.",
  input_schema: { type: "object" as const, properties: { html: { type: "string" } }, required: ["html"] },
};

export function planMessage(description: string, locale: string): string {
  return [
    `Plan this game. Write the title and every box in ${languageNameFor(locale)}.`,
    "Boxes: rules (what happens), levels (how many and how they differ), characters (who is in it and what each does), controls (keyboard keys AND on-screen touch buttons), win (how you win and how you lose).",
    `Each box at most ${MAX_BOX_CHARS} characters, concrete enough to build from.`,
    "",
    fence(description),
  ].join("\n");
}

const planText = (plan: GamePlan) => [`TITLE: ${plan.title}`, ...plan.boxes.map((b) => `${b.kind.toUpperCase()}: ${b.text}`)].join("\n");

export function boxMessage(plan: GamePlan, kind: GameBoxKind, instruction: string, locale: string): string {
  return [
    `Here is the whole plan, for context. Rewrite ONLY the ${kind} box as asked, in ${languageNameFor(locale)}, at most ${MAX_BOX_CHARS} characters. Every other box stays as it is.`,
    "",
    planText(plan),
    "",
    "What to change:",
    fence(instruction),
  ].join("\n");
}

const BUILD_RULES = [
  "ONE complete HTML document: <!DOCTYPE html>, <html>, <head> with <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">, <body>. All CSS in one <style>, all code in inline <script> — no file, library, font, image or sound from anywhere else: draw with <canvas> or shapes, make sound with the Web Audio API if at all.",
  "No network of any kind (no fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon), no storage (no localStorage, sessionStorage, IndexedDB, cookies), no window.open, no forms, no iframes, no navigation. It runs sealed off from everything else.",
  "It fills the space it is given and resizes with it. It works with the keyboard AND with large on-screen touch buttons on a phone. It shows the score or progress, says when you win or lose, and has a restart.",
  "Put the numbers that tune the game (speeds, counts, sizes, time) together at the top of the script as named constants, so a change asked in words changes them in one place.",
  "Under 30,000 characters. The visible words in the language you are told.",
];

export function buildMessage(plan: GamePlan, locale: string): string {
  return [`Write this game. Visible words in ${languageNameFor(locale)}.`, ...BUILD_RULES.map((r) => `- ${r}`), "", "THE PLAN:", fence(planText(plan))].join("\n");
}

export function changeMessage(html: string, instruction: string, locale: string): string {
  return [
    `Change this game as asked and return the WHOLE changed document. Change only what is asked; everything else stays exactly as it is. Visible words in ${languageNameFor(locale)}.`,
    ...BUILD_RULES.map((r) => `- ${r}`),
    "",
    "THE GAME:",
    fence(html),
    "",
    "WHAT TO CHANGE:",
    fence(instruction),
  ].join("\n");
}
