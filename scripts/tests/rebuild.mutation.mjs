#!/usr/bin/env node
/*
 * CAN rebuild.test.mjs SEE AN APP THAT REACHES OUT, A PAGE READ THAT
 * SHOULD NOT BE, A CHARGE FOR NOTHING, OR AN APP ANYBODY COULD READ?
 *
 * The check missing a rule (the network, an outside address), the seal
 * after the app's own code, the frame given the account's origin, a page
 * read without the Connect guard or with redirects unbounded, a script
 * kept in what is read from a page, the description sent unfenced, a
 * failed build that keeps the hold or charges, a cut-off app kept, the
 * app count read after a page is fetched, an app read without its owner,
 * a download that is not sealed, a Free plan with two apps, a switch that
 * comes back, a table the account can write, and a language missing a
 * word.
 *
 * Run: node scripts/tests/rebuild.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/rebuild.test.mjs";
const PLAN = "src/lib/rebuild/rebuild-plan.ts";
const HTML = "src/lib/rebuild/rebuild-html.ts";
const STRUCTURE = "src/lib/rebuild/structure.ts";
const REFERENCE = "src/lib/rebuild/reference.ts";
const CALL = "src/lib/rebuild/rebuild-call.ts";
const CHARGE = "src/lib/rebuild/charge.ts";
const LIMITS = "src/lib/rebuild/limits.ts";
const CREATE = "src/app/api/rebuild/route.ts";
const ONE = "src/app/api/rebuild/[id]/route.ts";
const DL = "src/app/api/rebuild/[id]/download/route.ts";
const PAGE = "src/app/dashboard/rebuild/page.tsx";
const SHELL = "src/components/rebuild/rebuild-shell.tsx";
const SQL = "supabase/migrations/20261027000000_rebuild_projects.sql";
const EN = "messages/en.json";

const MUTANTS = [
  {
    name: "the check stops refusing the network",
    file: HTML,
    from: '  { pattern: /\\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\\s*\\(/, what: "network" },\n',
    to: "",
    expect: "refused: fetch",
  },
  {
    name: "the check stops refusing an address written in the code",
    file: HTML,
    from: '  { pattern: /\\bhttps?:\\/\\/(?!www\\.w3\\.org\\/(?:2000\\/svg|1999\\/xhtml|1999\\/xlink)\\b)/i, what: "outside files" },\n',
    to: "",
    expect: "refused: http localhost in code",
  },
  {
    name: "the check stops refusing dynamic code",
    file: HTML,
    from: '  { pattern: /\\beval\\s*\\(|\\bnew\\s+Function\\s*\\(|\\bFunction\\s*\\(\\s*["\'`]/, what: "dynamic code" },\n',
    to: "",
    expect: "refused: eval",
  },
  {
    name: "the seal goes after the app's own code",
    file: HTML,
    from: "  return doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`;",
    to: "  return html.replace(/<\\/body>/i, `${meta}</body>`);",
    expect: "the seal is the FIRST element after the doctype",
  },
  {
    name: "the frame is given the account's origin",
    file: HTML,
    from: 'export const APP_SANDBOX = "allow-scripts";',
    to: 'export const APP_SANDBOX = "allow-scripts allow-same-origin";',
    expect: "the frame is scripts and nothing else",
  },
  {
    name: "the screen opens the frame to the account's origin",
    file: SHELL,
    from: "sandbox={APP_SANDBOX}",
    to: 'sandbox={APP_SANDBOX + " allow-same-origin"}',
    expect: "the app is shown in a frame with scripts and nothing else, sealed",
  },
  {
    name: "versions are kept forever",
    file: HTML,
    from: "return [version, ...list].slice(0, MAX_APP_VERSIONS);",
    to: "return [version, ...list];",
    expect: "versions: newest first, bounded",
  },
  {
    name: "a page is read through the socket's ordinary lookup, not the Connect guard",
    file: REFERENCE,
    from: "        lookup: guardedLookup as never,\n",
    to: "",
    expect: "the socket's own lookup is the guarded one",
  },
  {
    name: "redirects are followed without end",
    file: REFERENCE,
    from: "maxRedirects: 3",
    to: "maxRedirects: 3000",
    expect: "redirects are bounded, size and time are capped",
  },
  {
    name: "a page's script survives into what is read from it",
    file: STRUCTURE,
    from: "/<(script|style|noscript|template|svg|head)\\b[\\s\\S]*?<\\/\\1\\s*>/gi",
    to: "/<(style|noscript|template|svg|head)\\b[\\s\\S]*?<\\/\\1\\s*>/gi",
    expect: "nothing of «SCRIPT_BODY_MARKER» survives",
  },
  {
    name: "the person's description is sent unfenced",
    file: PLAN,
    from: "    fence(description),\n    ...referenceBlock(reference),\n  ].join(\"\\n\");\n}\n\nconst planText",
    to: "    description,\n    ...referenceBlock(reference),\n  ].join(\"\\n\");\n}\n\nconst planText",
    expect: "what the person wrote arrives between the untrusted markers",
  },
  {
    name: "what a page said is sent unfenced",
    file: PLAN,
    from: 'reference ? ["", "A PAGE OF AN APP THE PERSON LIKES, read for its structure only (the idea to build something OF THEIR OWN from, never to copy):", fence(reference)] : [];',
    to: 'reference ? ["", "A PAGE OF AN APP THE PERSON LIKES, read for its structure only (the idea to build something OF THEIR OWN from, never to copy):", reference] : [];',
    expect: "and so does what a page said",
  },
  {
    name: "the build rules stop asking for an original",
    file: PLAN,
    from: '  "ORIGINAL: its own name, its own words, its own colours and shapes. Never the name, logo, wording, pictures or code of any real product, even when asked; take only the idea and the kind of screens.",\n',
    to: "",
    expect: "the build rules say ORIGINAL, no network, and the storage helper",
  },
  {
    name: "a failed build keeps the hold",
    file: CHARGE,
    from: "  if (!outcome.ok) {\n    await releaseReservation(user.id, reservationId);\n",
    to: "  if (!outcome.ok) {\n",
    expect: "a stop, a provider failure AND an unusable answer all RELEASE the hold",
  },
  {
    name: "an unusable answer is charged",
    file: CHARGE,
    from: 'code: "unusable", creditsCharged: 0 }',
    to: 'code: "unusable", creditsCharged: 1 }',
    expect: "an unusable answer says so and charges nothing",
  },
  {
    name: "the model is called before the hold",
    file: CHARGE,
    from: '  let reservationId = "";\n  if (!bypass && plan) {',
    to: '  const early = await params.run(new CostAccumulator());\n  void early;\n  let reservationId = "";\n  if (!bypass && plan) {',
    expect: "breaker, ceiling, estimate, hold, model, charge",
  },
  {
    name: "an app cut at the output ceiling is kept",
    file: CALL,
    from: '  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };\n',
    to: "",
    expect: "an app cut at the output ceiling is not an app",
  },
  {
    name: "a change comes back unchecked",
    file: CALL,
    from: "  return safe(checkAppHtml((out.value as { html?: unknown })?.html));\n}\n",
    to: "  return { ok: true, value: String((out.value as { html?: unknown })?.html ?? \"\") };\n}\n",
    expect: "an app is checked BEFORE it is returned",
  },
  {
    name: "the number of apps is no longer counted",
    file: CREATE,
    from: '    if ((count ?? 0) >= gate.cap) return NextResponse.json({ ok: false, code: "limit_reached", limit: gate.cap }, { status: 403 });\n',
    to: "",
    expect: "the cap on how many apps is read BEFORE a page is fetched",
  },
  {
    name: "a page that cannot be read is carried on without",
    file: CREATE,
    from: '      if (!read.ok) return NextResponse.json({ ok: false, code: "reference_failed", reason: read.reason }, { status: 422 });\n',
    to: "",
    expect: "a page that cannot be read is refused with its reason and charges nothing",
  },
  {
    name: "an app is read without its owner",
    file: ONE,
    from: '.eq("id", params.id).eq("user_id", user.id).maybeSingle();',
    to: '.eq("id", params.id).maybeSingle();',
    expect: "an app is read by id AND owner",
  },
  {
    name: "an app is written without its owner",
    file: ONE,
    from: '        .eq("id", params.id)\n        .eq("user_id", user.id)\n        .select(COLUMNS)\n        .single();',
    to: '        .eq("id", params.id)\n        .select(COLUMNS)\n        .single();',
    expect: "and written with the server's, scoped by id AND owner, once",
  },
  {
    name: "restoring a version calls the model",
    file: ONE,
    from: '      return answer({ html: chosen.html, versions: pushAppVersion(versions, { html: chosen.html, at: new Date().toISOString(), note: "restore" }) }, 0);\n    }\n',
    to: '      void 0;\n    }\n',
    expect: "restoring a version calls no model and charges nothing",
  },
  {
    name: "the download is not sealed",
    file: DL,
    from: "new NextResponse(sealApp(app.html),",
    to: "new NextResponse(app.html,",
    expect: "the download is the sealed app",
  },
  {
    name: "the download is open to anyone",
    file: DL,
    from: '  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });\n',
    to: "",
    expect: "the download: signed in before anything is read or spent",
  },
  {
    name: "the Free plan keeps two apps",
    file: LIMITS,
    from: "const CAPS: Record<string, number> = { free: 1,",
    to: "const CAPS: Record<string, number> = { free: 2,",
    expect: "the Free plan keeps ONE app",
  },
  {
    name: "a switch comes back on the page",
    file: PAGE,
    from: 'export const dynamic = "force-dynamic";',
    to: 'export const dynamic = "force-dynamic";\nconst WAS = "isFeatureOn";',
    expect: "Rebuild reads no switch",
  },
  {
    name: "the screen stops saying «your own version, not a copy» on the plan",
    file: SHELL,
    from: '                  <div className="flex items-start gap-2.5 rounded-card bg-panel-hover px-3 py-2.5">\n                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />\n                    <p className="text-xs text-foreground" data-testid="rebuild-original">{t("original")}</p>\n                  </div>\n                  <div>\n                    <p className="text-xs text-muted">{t("boxHint")}</p>',
    to: '                  <div>\n                    <p className="text-xs text-muted">{t("boxHint")}</p>',
    expect: "the screen says «your own version, not a copy» wherever the plan or the app is",
  },
  {
    name: "the account can write apps",
    file: SQL,
    from: "revoke insert, update on public.rebuild_projects from anon, authenticated;",
    to: "grant insert, update on public.rebuild_projects to authenticated;",
    expect: "the account reads and deletes its own apps and cannot write one",
  },
  {
    name: "the table forgets its owner's erasure",
    file: SQL,
    from: "references auth.users(id) on delete cascade",
    to: "references auth.users(id)",
    expect: "the table: one row per app, erased with the account",
  },
  {
    name: "a word goes missing from the English catalogue only",
    file: EN,
    from: '"first": "First build",\n      "restoreNote"',
    to: '"firstly": "First build",\n      "restoreNote"',
    expect: "el: every word is there, and nothing extra",
  },
];

runMutations({ name: "rebuild", gate: GATE, targets: [PLAN, HTML, STRUCTURE, REFERENCE, CALL, CHARGE, LIMITS, CREATE, ONE, DL, PAGE, SHELL, SQL, EN], mutants: MUTANTS });
