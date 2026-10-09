#!/usr/bin/env node
/*
 * CAN games.test.mjs SEE A GAME THAT IS NOT SEALED, A PLAN THAT LOST A
 * BOX, A CHARGE FOR NOTHING, OR A GAME ANYBODY COULD READ?
 *
 * The seal put after <head> again (where a script before it, or a
 * <header>, escapes it), the frame given the account's origin, the
 * policy opened to the network, storage and outside scripts let through,
 * a plan with a box missing, a box change that rewrites the others,
 * versions kept forever, the description sent unfenced, a provider
 * failure that keeps the hold, an unusable answer charged as nothing,
 * a cut-off game kept, a change before there is a game, the system
 * prompt left out of a price, the switch never asked, the download
 * ungated, a game read without its owner, the frame unsandboxed or fed
 * the unsealed game, the plan left over the field on a phone, and the
 * table writable by the account.
 *
 * Run: node scripts/tests/games.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/games.test.mjs";
const PLAN = "src/lib/games/game-plan.ts";
const HTML = "src/lib/games/game-html.ts";
const CALL = "src/lib/games/game-call.ts";
const CHARGE = "src/lib/games/charge.ts";
const ACCESS = "src/lib/games/game-access.ts";
const ONE = "src/app/api/games/[id]/route.ts";
const DL = "src/app/api/games/[id]/download/route.ts";
const SHELL = "src/components/games/games-shell.tsx";
const SQL = "supabase/migrations/20261024000000_user_games.sql";

const MUTANTS = [
  {
    name: "the seal goes after <head>, as it first did",
    file: HTML,
    from: '  const doctype = /^\\s*<!doctype[^>]*>/i.exec(html);\n  return doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`;',
    to: '  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => `${head}${meta}`);\n  return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${meta}</head>`);',
    expect: "the seal is the first element of the document",
  },
  {
    name: "the frame is given the account's origin",
    file: HTML,
    from: 'export const GAME_SANDBOX = "allow-scripts";',
    to: 'export const GAME_SANDBOX = "allow-scripts allow-same-origin";',
    expect: "played with scripts and nothing else",
  },
  {
    name: "the policy lets the game reach the network",
    file: HTML,
    from: "connect-src 'none';",
    to: "connect-src *;",
    expect: "the policy: nothing from anywhere, nothing to anywhere",
  },
  {
    name: "storage is let through",
    file: HTML,
    from: '  { pattern: /\\b(?:localStorage|sessionStorage|indexedDB)\\b|document\\.cookie/, what: "storage" },\n',
    to: "",
    expect: "refused, storage: localStorage",
  },
  {
    name: "a script from another address is let through",
    file: HTML,
    from: '  { pattern: /<\\s*(?:script|link|img|audio|video|source)\\b[^>]*\\b(?:src|href)\\s*=\\s*["\']?\\s*(?:https?:)?\\/\\//i, what: "outside files" },\n',
    to: "",
    expect: 'refused, outside files: <script src="https://cdn.example/x.js">',
  },
  {
    name: "a plan with a box missing is taken",
    file: PLAN,
    from: '    if (!text) return { ok: false, reason: `the ${kind} box is missing or empty` };',
    to: "    if (!text) continue;",
    expect: "a plan without the rules box",
  },
  {
    name: "a box change rewrites every box",
    file: PLAN,
    from: "b.kind === kind && next ? { kind, text: next } : b",
    to: "next ? { kind: b.kind, text: next } : b",
    expect: "...and the other four, and the title, are exactly as they were",
  },
  {
    name: "every version is kept forever",
    file: HTML,
    from: "  return [version, ...list].slice(0, MAX_GAME_VERSIONS);",
    to: "  return [version, ...list];",
    expect: "only the last ten are kept",
  },
  {
    name: "the description reaches the model unfenced",
    file: PLAN,
    from: '    "",\n    fence(description),',
    to: '    "",\n    description,',
    expect: "what the person writes reaches the model fenced as data",
  },
  {
    name: "a provider failure keeps the hold",
    file: CHARGE,
    from: '  if (!outcome.ok && (outcome.kind === "aborted" || outcome.kind === "provider")) {\n    await releaseReservation(user.id, reservationId);',
    to: '  if (!outcome.ok && (outcome.kind === "aborted" || outcome.kind === "provider")) {',
    expect: "a stop or a provider failure releases the hold",
  },
  {
    name: "an unusable answer is released as if nothing was spent",
    file: CHARGE,
    from: 'if (!outcome.ok && (outcome.kind === "aborted" || outcome.kind === "provider")) {',
    to: "if (!outcome.ok) {",
    expect: "a stop or a provider failure releases the hold",
  },
  {
    name: "a game cut at the output ceiling is kept",
    file: CALL,
    from: '  if (response.stop_reason === "max_tokens") return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };\n',
    to: "",
    expect: "a game cut at the output ceiling is not a game",
  },
  {
    name: "a change is asked of a game never written",
    file: ONE,
    from: '    if (!html) return NextResponse.json({ ok: false, code: "not_built" }, { status: 409 });\n',
    to: "",
    expect: "a change needs a written game first",
  },
  {
    name: "a box change is priced without the system prompt",
    file: ONE,
    from: '        user, gate, action: "gameBoxEdit", feature: "game_edit",\n        inputChars: gameSystemPrompt().length + message.length,',
    to: '        user, gate, action: "gameBoxEdit", feature: "game_edit",\n        inputChars: message.length,',
    expect: "...and so is every step after it",
  },
  {
    name: "the switch is never asked",
    file: ACCESS,
    from: '  if (!(await isFeatureOn("games", user))) return { ok: false, code: "not_enabled" };\n',
    to: "",
    expect: 'the switch "games" first',
  },
  {
    name: "the download skips the switch and the plan",
    file: DL,
    from: "  const gate = await gameGate(user);\n  if (!gate.ok) return NextResponse.json({ ok: false, code: gate.code }, { status: 403 });\n",
    to: "",
    expect: "the download: signed in, then the switch and the plan",
  },
  {
    name: "a game is read by id alone",
    file: ONE,
    from: '      .select("id, title, plan, html, versions, locale")\n      .eq("id", params.id)\n      .eq("user_id", user.id)',
    to: '      .select("id, title, plan, html, versions, locale")\n      .eq("id", params.id)',
    expect: "a game is read by id AND owner",
  },
  {
    name: "the frame has no sandbox",
    file: SHELL,
    from: "                      sandbox={GAME_SANDBOX}\n",
    to: "",
    expect: "the game is played sealed",
  },
  {
    name: "the frame plays the unsealed game",
    file: SHELL,
    from: "srcDoc={sealed}",
    to: 'srcDoc={open.html ?? ""}',
    expect: "the game is played sealed",
  },
  {
    name: "on a phone the plan stays over the field after a box is pressed",
    file: SHELL,
    from: "                              if (!workIsBeside()) setPane(null);\n",
    to: "",
    expect: "on a phone, pressing a box closes the plan that covers the field",
  },
  {
    name: "the account can write games itself",
    file: SQL,
    from: "revoke insert, update on public.user_games from anon, authenticated;",
    to: "grant insert, update on public.user_games to authenticated;",
    expect: "the account reads and deletes its own games and cannot write one",
  },
];

runMutations({ name: "games", gate: GATE, targets: [PLAN, HTML, CALL, CHARGE, ACCESS, ONE, DL, SHELL, SQL], mutants: MUTANTS });
