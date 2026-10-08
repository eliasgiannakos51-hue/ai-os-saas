#!/usr/bin/env node
/*
 * CAN translate.test.mjs SEE A TRANSLATION THAT CHANGED THE FORM, A PIECE
 * PUT BACK WRONG, OR A PRICE THAT IS NOT THE HOLD?
 *
 * Code inside a page sent to be translated, a translate="no" ignored, a
 * mark dropped or doubled and accepted, a translation written as markup,
 * an untouched piece rewritten, a short list accepted, a site's pages lost,
 * the switch never asked, a document read without its owner, the hold
 * after the model, the original overwritten, the screen pressing before
 * the price.
 *
 * Run: node scripts/tests/translate.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/translate.test.mjs";
const SEG = "src/lib/translate/segments.ts";
const SOURCES = "src/lib/translate/sources.ts";
const ROUTE = "src/app/api/translate/route.ts";
const CALL = "src/lib/translate/translate-call.ts";
const BUTTON = "src/components/translate/translate-button.tsx";

const MUTANTS = [
  {
    name: "code inside a page is sent to be translated",
    file: SEG,
    from: 'const SKIP = new Set(["script", "style", "code", "pre", "kbd", "samp", "svg", "math", "textarea", "template", "noscript"]);',
    to: 'const SKIP = new Set(["script", "style", "svg", "math", "textarea", "template", "noscript"]);',
    expect: "nothing that is not prose is sent",
  },
  {
    name: 'translate="no" is ignored',
    file: SEG,
    from: '  if (attrOf(tok, "translate")?.value.toLowerCase() === "no") return true;',
    to: "",
    expect: "nothing that is not prose is sent",
  },
  {
    name: "a dropped or doubled mark is accepted",
    file: SEG,
    from: "  if (sent.length !== back.length || sent.some((w, k) => w !== back[k])) return null;",
    to: "",
    expect: "a mark dropped is no answer",
  },
  {
    name: "marks closed out of order are accepted",
    file: SEG,
    from: "      if (stack.pop() !== n || closers[n] === undefined) return null;",
    to: "      stack.pop();",
    expect: "marks crossed — one pair closed inside the other — are no answer",
  },
  {
    name: "a translation is written as markup",
    file: SEG,
    from: '  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");',
    to: "  return value;",
    expect: "a translation is text: what it says cannot become markup",
  },
  {
    name: "an attribute's translation is written raw",
    file: SEG,
    from: '        raw = raw.slice(0, attr.start) + `${attr.name}="${escapeHtml(v.trim())}"` + raw.slice(attr.end);',
    to: '        raw = raw.slice(0, attr.start) + `${attr.name}="${v.trim()}"` + raw.slice(attr.end);',
    expect: "a translation is text: what it says cannot become markup",
  },
  {
    name: "an untouched piece is rewritten from its decoded text",
    file: SEG,
    from: "  const same = (seg: number, v: string) => v.trim() === pieces[seg - offset]?.text;",
    to: "  const same = (_seg: number, _v: string) => false;",
    expect: "the page with every piece answered as itself is the page, byte for byte",
  },
  {
    name: "a list of the wrong length is read",
    file: SEG,
    from: "  if (!Array.isArray(list) || list.length !== expected) return null;",
    to: "  if (!Array.isArray(list)) return null;",
    expect: "the model's list is read only when it is the length that was sent",
  },
  {
    name: "a site's other pages are dropped",
    file: SOURCES,
    from: "pages: pages.length > 0 ? outPages : null, kept };",
    to: "pages: null, kept };",
    expect: "the copy has all five pages, the same slugs, translated labels",
  },
  {
    name: "the switch is never asked",
    file: ROUTE,
    from: '  if (!(await isFeatureOn("translate", user))) return { ok: false, response: NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 }) };',
    to: "",
    expect: "the switch is asked before anything is read",
  },
  {
    name: "a document is read without its owner",
    file: ROUTE,
    from: '.from("user_documents").select("id, title, content").eq("id", id).eq("user_id", user.id).maybeSingle();',
    to: '.from("user_documents").select("id, title, content").eq("id", id).maybeSingle();',
    expect: "the thing is read by id AND owner, sites and documents alike",
  },
  {
    name: "the original site is overwritten",
    file: ROUTE,
    from: '        .insert({ user_id: user.id, name: site.name, description: loaded.row.description, html_content: site.html_content, pages: site.pages, status: "completed" })',
    to: '        .update({ name: site.name, html_content: site.html_content, pages: site.pages }).eq("id", loaded.row.id)',
    expect: "the original is never written",
  },
  {
    name: "a failed translation keeps the hold",
    file: ROUTE,
    from: "    if (!outcome.ok) {\n      await releaseReservation(user.id, reservationId);",
    to: "    if (!outcome.ok) {",
    expect: "the hold comes before the model, and a failure or a stop releases it",
  },
  {
    name: "a wrong list is never asked again",
    file: CALL,
    from: "      if (result.ok && result.list === null) result = await callBatch(anthropic, system, message, indexes.length, params.costs, signal);",
    to: "",
    expect: "the calls: usage recorded before the list is read, a wrong list asked once more",
  },
  {
    name: "the screen lets it run before the price",
    file: BUTTON,
    from: 'disabled={price.state !== "priced" || run.state === "running"}',
    to: 'disabled={run.state === "running"}',
    expect: "the price is asked of the same route and shown before the button can be pressed",
  },
];

runMutations({ name: "translate", gate: GATE, targets: [SEG, SOURCES, ROUTE, CALL, BUTTON], mutants: MUTANTS });
