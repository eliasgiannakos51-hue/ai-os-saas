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
const FEATURES = "src/lib/rebuild/rebuild-features.ts";
const FEATURES_ROUTE = "src/app/api/rebuild/features/route.ts";
const CANARIES = "src/lib/health/schema-canaries.ts";

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
    name: "a dead button is no longer refused",
    file: HTML,
    from: "  const dead = findDeadButton(html);\n  if (dead) return { ok: false, reason: \"dead_button\", what: dead };\n",
    to: "",
    expect: "a button with no code attached anywhere is refused as a dead button",
  },
  {
    name: "the bulk querySelectorAll('button') exception wires every button, wired or not, including ones no rule reaches",
    file: HTML,
    from: '  const bulkWired = /document\\s*\\.\\s*querySelectorAll\\s*\\(\\s*["\']button["\']\\s*\\)[\\s\\S]{0,300}addEventListener\\s*\\(/i.test(html) || /getElementsByTagName\\s*\\(\\s*["\']button["\']\\s*\\)[\\s\\S]{0,300}addEventListener\\s*\\(/i.test(html);\n  if (bulkWired) return null;\n',
    to: "",
    expect: "a bulk `querySelectorAll('button')` + addEventListener wires every plain button at once",
  },
  {
    name: "an inline onclick no longer counts as wiring",
    file: HTML,
    from: '    if (onclick && onclick.trim()) continue;\n',
    to: "",
    expect: "an inline onclick wires it",
  },
  {
    name: "a direct .onclick assignment no longer counts as wiring, only addEventListener does",
    file: HTML,
    from: '/addEventListener\\s*\\(|\\.\\s*onclick\\s*=/i.test(html.slice(at, at + 300))',
    to: '/addEventListener\\s*\\(/i.test(html.slice(at, at + 300))',
    expect: "getElementById + a direct .onclick assignment wires it too",
  },
  {
    name: "a button's class is never checked, only its id",
    file: HTML,
    from: "    const className = attr(tag, \"class\");\n    if (className) selectors.push(...className.split(/\\s+/).filter(Boolean));\n",
    to: "",
    expect: "a class used with querySelectorAll + addEventListener wires every button sharing it (the dynamic-list pattern)",
  },
  {
    name: "<input type=button|submit> is no longer in the population the self-test checks",
    file: HTML,
    from: '    const type = (attr(t, "type") ?? "").toLowerCase();\n    return type === "button" || type === "submit";',
    to: "    return false;",
    expect: "<input type=button> and <input type=submit> are checked the same way as <button>",
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
    from: "    fencePlan(description),\n    ...featuresContextBlock(features ?? []),\n    ...referenceBlock(reference),\n    ...brandBlock(brand),\n  ].join(\"\\n\");\n}",
    to: "    description,\n    ...featuresContextBlock(features ?? []),\n    ...referenceBlock(reference),\n    ...brandBlock(brand),\n  ].join(\"\\n\");\n}",
    expect: "what the person wrote arrives between the untrusted markers",
  },
  {
    name: "what a page said is sent unfenced",
    file: PLAN,
    from: 'reference ? ["", "A PAGE OF AN APP THE PERSON LIKES, read for its structure only (the idea to build something OF THEIR OWN from, never to copy):", fencePlan(reference)] : [];',
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
    name: "the screen stops saying the self-test ran",
    file: SHELL,
    from: '                  <div className="flex items-start gap-2.5 rounded-card bg-panel-hover px-3 py-2.5">\n                    <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />\n                    <p className="text-xs text-foreground" data-testid="rebuild-self-test">{t("selfTest")}</p>\n                  </div>\n',
    to: "",
    expect: "the screen says the self-test ran, next to the written app",
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
  {
    name: "kept brand memory stops reaching the plan call",
    file: PLAN,
    from: "    ...referenceBlock(reference),\n    ...brandBlock(brand),",
    to: "    ...referenceBlock(reference),",
    expect: "a remembered name alone is folded in, fenced, labelled as a hint for the look box only — never the app's own name",
  },
  {
    name: "the plan call stops passing the remembered brand to the real model call",
    file: CALL,
    from: "planMessage(params.description, params.locale, params.reference, params.features, params.brand)",
    to: "planMessage(params.description, params.locale, params.reference, params.features)",
    expect: "the plan call passes the remembered brand through to the SAME planMessage every other call uses",
  },
  {
    name: "the route stops reading the remembered brand before pricing and calling the plan",
    file: CREATE,
    from: "const remembered = readBrand(memories);\n    const brand: RebuildBrandHint = { name: remembered.name, colourHex: remembered.colours.find((c) => c.hex)?.hex ?? null };\n    const message = planMessage(description, locale, reference?.rendered, features, brand);",
    to: "    const message = planMessage(description, locale, reference?.rendered, features);",
    expect: "the route reads the SAME remembered-brand source Flows already reuses (lib/memory/brand.ts, lib/memory/store.ts), never a second one, and folds it into both the priced message and the real call",
  },
  {
    name: "the self-test's own words claim the button was pressed, not checked",
    file: EN,
    from: '"selfTest": "Every button was checked that it is wired to code before this was shown to you.",',
    to: '"selfTest": "Every button was pressed before this was shown to you.",',
    expect: "the English words say CHECKED, never PRESSED — the self-test is static, not an interaction",
  },
  {
    name: "junk and duplicate capabilities are no longer dropped",
    file: FEATURES,
    from: 'const key = text.toLowerCase();\n    if (!text || seen.has(key)) continue;',
    to: "const key = text;",
    expect: "duplicates (even re-spaced) and blanks and non-strings are dropped, case kept from the first one seen",
  },
  {
    name: "the capabilities list is no longer bounded",
    file: FEATURES,
    from: "if (features.length >= MAX_FEATURES) break;",
    to: "// no cap",
    expect: `bounded at ${8}, however many the model returns`,
  },
  {
    name: "the rule against naming the real product is dropped from the capabilities call",
    file: FEATURES,
    from: "Never the name of any real product.",
    to: "",
    expect: "the call asks for CAPABILITIES in the model's own words, never a real product's name",
  },
  {
    name: "kept capabilities stop reaching the plan call",
    file: PLAN,
    from: "    ...featuresContextBlock(features ?? []),\n    ...referenceBlock(reference),",
    to: "    ...referenceBlock(reference),",
    expect: "the plan call folds kept features in as fenced context, and leaves the plan the same without any",
  },
  {
    name: "the capabilities route no longer checks who is signed in",
    file: FEATURES_ROUTE,
    from: 'if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });',
    to: "",
    expect: "features: signed in before anything is read or spent",
  },
  {
    name: "the capabilities call settles under a different feature than the plan it feeds",
    file: FEATURES_ROUTE,
    from: 'feature: "rebuild_generate",',
    to: 'feature: "rebuild_edit",',
    expect: "features: charged the same way every rebuild step is, under rebuild_generate",
  },
  {
    name: "the capabilities route starts writing a row before any project exists",
    file: FEATURES_ROUTE,
    from: "return NextResponse.json({ ok: true, features: step.value, reference, creditsCharged: step.creditsCharged });",
    to: 'await createAdminClient().from("rebuild_projects").insert({});\n    return NextResponse.json({ ok: true, features: step.value, reference, creditsCharged: step.creditsCharged });',
    expect: "features: nothing of it is ever written to a table — no project exists yet",
  },
  {
    name: "features kept from the capabilities step are no longer bounded when the plan is created",
    file: CREATE,
    from: ".slice(0, MAX_FEATURE_CHARS)).slice(0, MAX_FEATURES)",
    to: ".slice(0, MAX_FEATURE_CHARS))",
    expect: "the plan route reads kept features from the body, clipped and bounded, never trusted further than any box",
  },
  {
    name: "a Free account at its cap is still charged to see capabilities for an app it can never keep",
    file: FEATURES_ROUTE,
    from: "if ((count ?? 0) >= gate.cap) return NextResponse.json({ ok: false, code: \"limit_reached\", limit: gate.cap }, { status: 403 });",
    to: "",
    expect: "features: the app cap is read BEFORE anything is spent, same protection as the plan's own, so a Free account at its limit is never charged to see capabilities for an app it cannot keep",
  },
  {
    name: "a failed capabilities call silently falls through to the plan, with nothing reviewed",
    file: SHELL,
    from: "if (!open) {\n      await postFeatures(text);\n      return;\n    }",
    to: 'if (!open) {\n      const ok = await postFeatures(text);\n      if (!ok) await post("/api/rebuild", { description: text }, "plan");\n      return;\n    }',
    expect: "a failed capabilities call shows its error and stops there (chargedRebuildStep's own hold/release) — it never silently falls through to a plan with no review",
  },
  {
    name: "the build message stops folding in the App-logic phase's definition",
    file: PLAN,
    from: "    ...appDefinitionBlock(appDefinition),\n    ...referenceBlock(reference),\n  ].join(\"\\n\");\n}\n\nexport function changeMessage",
    to: "    ...referenceBlock(reference),\n  ].join(\"\\n\");\n}\n\nexport function changeMessage",
    expect: "the build call folds in the App-logic phase's definition when it ran, fenced like everything else",
  },
  {
    name: "the phase count is recomputed instead of fixed at plan time",
    file: CREATE,
    from: "const hasAppPhase = features.length > 0;",
    to: "const hasAppPhase = false;",
    expect: "the phase count is decided once, at plan time, from what Κομμάτι 2 kept — never recomputed later",
  },
  {
    name: "the App-logic phase can be charged for on a plan that never asked for one",
    file: ONE,
    from: '      if (!hasAppPhase) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });\n',
    to: "",
    expect: "a plan with no App-logic phase cannot be charged for one",
  },
  {
    name: "the App-logic phase's save also touches the app that build owns",
    file: ONE,
    from: "return answer({ app_definition: step.value }, step.creditsCharged);",
    to: 'return answer({ app_definition: step.value, html: "" }, step.creditsCharged);',
    expect: "the App-logic phase saves ONLY its own definition — a later, failed build phase can never touch what it already saved",
  },
  {
    name: "writing the app stops reading back the App-logic phase's definition",
    file: ONE,
    from: "run: (costs) => writeApp({ plan, locale, reference, appDefinition, costs, userId: user.id, signal: request.signal }),",
    to: "run: (costs) => writeApp({ plan, locale, reference, costs, userId: user.id, signal: request.signal }),",
    expect: "writing the app reads back whatever the App-logic phase saved, and folds it into the SAME build call the one-phase app always used",
  },
  {
    name: "the App-logic phase stops calling Apps' own planner",
    file: CALL,
    from: "  return planAppDefinition(params);\n}",
    to: '  return { ok: true, value: { title: "x", collections: [], screens: [], notifications: [] } };\n}',
    expect: "the App-logic phase calls Apps' OWN planner as a library, never creating an Apps project",
  },
  {
    name: "writing the app stops passing the App-logic phase's definition to the build message",
    file: CALL,
    from: "buildMessage(params.plan, params.locale, params.reference, params.appDefinition)",
    to: "buildMessage(params.plan, params.locale, params.reference)",
    expect: "writing the app passes the App-logic phase's definition through to the same build message",
  },
  {
    name: "the screen always shows «Build the app», even for a plan with an unapproved App-logic phase",
    file: SHELL,
    from: "open.has_app_phase && !appLogicDone ? (",
    to: "false ? (",
    expect: "the screen shows a real second phase only when the plan has one, with its own price and its own «Approve plan» gate",
  },
  {
    name: "«Approve plan» starts the build instead of the App-logic phase",
    file: SHELL,
    from: 'post(`/api/rebuild/${open.id}`, { action: "appLogic" }, "appLogic")',
    to: 'post(`/api/rebuild/${open.id}`, { action: "build" }, "appLogic")',
    expect: "approving starts the App-logic phase ONLY — the existing «Build the app» press is untouched for the one-phase app and for the second phase of a two-phase one",
  },
  {
    name: "the second phase's price stops accounting for the App-logic phase's definition",
    file: SHELL,
    from: "buildMessage(plan, locale, open?.reference?.rendered, appDefinition)",
    to: "buildMessage(plan, locale, open?.reference?.rendered)",
    expect: "the second phase's own price is the real build price, including the App-logic phase's definition once it ran",
  },
  {
    name: "the App-logic phase's status is tracked as separate state instead of read from the row",
    file: SHELL,
    from: "const appLogicDone = Boolean(appDefinition);",
    to: "const appLogicDone = false;",
    expect: "the App-logic phase's own status comes from the saved row, never a separate piece of state to drift from it",
  },
  {
    name: "the schema canary forgets the App-logic phase's own column",
    file: CANARIES,
    from: '  {\n    kind: "column",\n    table: "rebuild_projects",\n    column: "app_definition",\n    migration: "20261105000000_rebuild_app_phase.sql",\n    breaks: "Rebuild charges for the App-logic phase and then cannot save its result: the person pays and sees «it could not be saved», and the Write phase that follows never gets the structured definition it needs",\n  },\n',
    to: "",
    expect: "the table and the schema canary both know the two new columns, and how to undo them",
  },
];

runMutations({ name: "rebuild", gate: GATE, targets: [PLAN, HTML, STRUCTURE, REFERENCE, CALL, CHARGE, LIMITS, CREATE, ONE, DL, PAGE, SHELL, SQL, EN, FEATURES, FEATURES_ROUTE, CANARIES], mutants: MUTANTS });
