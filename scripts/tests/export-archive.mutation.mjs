#!/usr/bin/env node
/*
 * CAN export-archive.test.mjs SEE AN EXPORT THAT LEAVES SOMETHING OUT?
 *
 * A file Storage would not read dropped in silence, the size cap ignored,
 * an entry that climbs out of its folder, a second site of the same name
 * written over the first, a game handed back unsealed, the archive given
 * to everybody instead of behind the switch, the files read from a folder
 * the request names, what did not fit left out of the data file, and the
 * hourly limit said in English on every screen.
 *
 * Run: node scripts/tests/export-archive.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/export-archive.test.mjs";
const LIB = "src/lib/account/export-archive.ts";
const ROUTE = "src/app/api/account/export/route.ts";
const BUTTON = "src/components/settings/export-data-button.tsx";

const MUTANTS = [
  {
    name: "a file Storage would not read is dropped in silence",
    file: LIB,
    from: '      left.push({ ...file, reason: "unreadable" });',
    to: "      void file;",
    expect: "named with its reason, not dropped",
  },
  {
    name: "the size cap is not asked",
    file: LIB,
    from: "    if (bytes + body.length > limits.maxBytes) {",
    to: "    if (bytes + body.length < 0) {",
    expect: "in the archive up to the cap",
  },
  {
    name: "an entry may keep a «..» segment",
    file: LIB,
    from: '    .filter((s) => s !== "" && s !== "." && s !== "..");',
    to: '    .filter((s) => s !== "");',
    expect: "no entry can step outside the folder",
  },
  {
    name: "a second site of the same name takes the first one's place",
    file: LIB,
    from: "  const add = (name: string, data: Uint8Array) => entries.push({ name: unique(name, taken), data });",
    to: "  const add = (name: string, data: Uint8Array) => { void taken; const at = entries.findIndex((e) => e.name === name); if (at >= 0) entries.splice(at, 1); entries.push({ name, data }); };",
    expect: "two sites of one name are both there",
  },
  {
    name: "a game is handed back unsealed",
    file: LIB,
    from: "enc.encode(sealGame(game.html))",
    to: "enc.encode(game.html)",
    expect: "sealed as it is served",
  },
  {
    name: "the archive is built for everybody, not behind the switch",
    file: ROUTE,
    from: 'if (await isFeatureOn("export-all", user)) {',
    to: 'if (await isFeatureOn("export-all", user) || true) {',
    expect: "only behind the switch",
  },
  {
    name: "the files are read from the folder the request names",
    file: ROUTE,
    from: "collectExportFiles(createAdminClient().storage, user.id)",
    to: 'collectExportFiles(createAdminClient().storage, new URL(request.url).searchParams.get("user") ?? user.id)',
    expect: "never from the request",
  },
  {
    name: "what did not fit is left out of the data file",
    file: ROUTE,
    from: "                files_not_included: files.left,",
    to: "                files_not_included: [],",
    expect: "written into the data file",
  },
  {
    name: "the button puts the route's English sentence back in every toast",
    file: BUTTON,
    from: 'body?.code === "export_rate_limited" && typeof body.limit === "number" ? t("tooMany", { count: body.limit }) : t("exportFailed")',
    to: 'body?.error ?? t("exportFailed")',
    expect: "never shows the route's own sentence",
  },
  {
    name: "the route stops saying which refusal it is",
    file: ROUTE,
    from: '          code: "export_rate_limited",\n',
    to: "",
    expect: "the route sends that code",
  },
];

runMutations({ name: "export-archive", gate: GATE, targets: [LIB, ROUTE, BUTTON], mutants: MUTANTS });
