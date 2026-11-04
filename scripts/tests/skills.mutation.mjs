#!/usr/bin/env node
/*
 * WOULD A STOP-GATE THAT WAS QUIETLY STEPPED OVER BE NOTICED?
 *
 * Skills Κομμάτι 1 is the owner's directive 29 («SKILLS: ΤΟ ΜΑΘΑΙΝΕΙΣ ΜΙΑ
 * ΦΟΡΑ», 2026-10-31) and it is a round defined as much by what it must
 * NOT do as by what it does. His own words end the piece: «ΜΟΝΟ ΕΔΩ:
 * στιγμιότυπο και σταματάς μέχρι να γράψω «εγκρίνω»». Κομμάτι 2 is the
 * first write path — making a skill — so every write in this round is a
 * promise broken, and none of them is visible in the screenshot he asked
 * for.
 *
 * SO THE FIRST FIVE MUTANTS ARE THE STOP-GATE ITSELF: a fetch in the
 * workspace, a field to type into, an `insert` policy in the migration,
 * the revoke line taken out, and the loader's own scoping dropped. Each
 * one is a few characters, each leaves the screen looking exactly as the
 * approved screenshot does, and each has to turn the gate red.
 *
 * THE ONE WORTH READING FIRST is "the loader stops scoping to the
 * caller". Removing `.eq("user_id", userId)` changes nothing a reader can
 * see — RLS still stands behind it, so the page keeps working and every
 * test of the screen keeps passing. What it removes is the SECOND lock on
 * a table that holds a person's own procedures, in a product where the
 * service-role client is one import away. It is the shape of defect that
 * is only ever found by a check that names it.
 *
 * AND ONE ABOUT THE 26th SQUARE, as Sheets' own suite has: the registry
 * mutant puts a Skills tile on the owner's twenty-five-square grid. He
 * placed this page «στις Ρυθμίσεις» and the grid is his decision, not a
 * tile added quietly in a round he has not approved yet.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/skills.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/skills.test.mjs";
const PAGE = "src/app/dashboard/skills/page.tsx";
const WORKSPACE = "src/components/skills/skills-workspace.tsx";
const LIST = "src/components/skills/skills-list.tsx";
const DETAILS = "src/components/skills/skills-details.tsx";
const LOAD = "src/lib/skills/load.ts";
const MIGRATION = "supabase/migrations/20261107000000_user_skills.sql";
const SETTINGS = "src/app/dashboard/settings/page.tsx";
const SIDEBAR = "src/lib/sidebar-nav.ts";
const REGISTRY = "src/lib/nav/all-tools.ts";
const GDPR = "src/lib/gdpr/user-data-registry.ts";
const CANARIES = "src/lib/health/schema-canaries.ts";
const EL = "messages/el.json";

const MUTANTS = [
  // ---- the stop-gate, which is the whole shape of this round ----------
  {
    name: "a write appears in the workspace, which is Κομμάτι 2's own piece",
    file: WORKSPACE,
    from: "  const [selected, setSelected] = useState<Skill | null>(null);",
    to:
      "  const [selected, setSelected] = useState<Skill | null>(null);\n" +
      '  const keep = (s: Skill) => fetch("/api/skills", { method: "POST", body: JSON.stringify(s) });\n' +
      "  void keep;",
    expect: "no file of this feature writes anything, or calls out to do it",
  },
  {
    name: "a field to type a skill's name into, before anything can save it",
    file: DETAILS,
    from: "      <h2 className=\"break-words text-lg font-semibold text-foreground\">{skill.name}</h2>",
    to: "      <input className=\"break-words text-lg font-semibold text-foreground\" defaultValue={skill.name} />",
    expect: "there is nothing to type into yet",
  },
  {
    name: "the migration grants an insert, so the table is no longer read-only",
    file: MIGRATION,
    from: 'create policy "select_own_user_skills"',
    to:
      'create policy "insert_own_user_skills"\n' +
      "  on public.user_skills for insert\n" +
      "  with check (auth.uid() = user_id);\n\n" +
      'create policy "select_own_user_skills"',
    expect: "no policy grants a write, because nothing in this piece writes",
  },
  {
    name: "the revoke line is dropped, so the grant is the default one",
    file: MIGRATION,
    from: "revoke insert, update, delete on public.user_skills from anon, authenticated;",
    to: "-- the three writes stay with whatever the default grant gives;",
    expect: "the three writes are revoked outright",
  },
  {
    name: "the loader stops scoping to the caller and leans on RLS alone",
    file: LOAD,
    from: '    .eq("user_id", userId)\n',
    to: "",
    expect: "the read is scoped to the caller",
  },

  // ---- the door: one switch, and no dead link to it -------------------
  {
    name: "the page forgets its switch, so an unfinished screen is public",
    file: PAGE,
    from: '  if (!(await isFeatureOn("skills-tool", user))) notFound();\n',
    to: "",
    expect: "it is behind the switch, and notFound() for everyone else",
  },
  {
    name: "the Settings card is drawn for everyone, over a page that 404s for them",
    file: SETTINGS,
    from: '        {(await isFeatureOn("skills-tool", user)) && (',
    to: "        {Boolean(user) && (",
    expect: "the Settings card renders only when the switch is on for the reader",
  },
  {
    name: "the hidden row becomes a drawn one, so every customer sees a link to a 404",
    file: SIDEBAR,
    from: '{ href: "/dashboard/skills", label: "Skills", icon: SKILLS_ICON, hintKey: "skills", hidden: true }',
    to: '{ href: "/dashboard/skills", label: "Skills", icon: SKILLS_ICON, hintKey: "skills" }',
    expect: "the sidebar carries a hidden row for it, the shape Affiliate already has",
  },
  {
    name: "a twenty-sixth square appears on the grid, which is the owner's own decision",
    file: REGISTRY,
    from: "export const ALL_TOOLS: readonly AllToolsEntry[] = [",
    to:
      "export const ALL_TOOLS: readonly AllToolsEntry[] = [\n" +
      '  { group: "make", href: "/dashboard/skills", name: "skills", ready: true },',
    expect: "it is NOT a tile on the All tools grid, which is his decision to make",
  },

  // ---- the mapping, which is what the screen actually sees ------------
  {
    name: "a step that is not text survives, and renders as a blank line",
    file: LOAD,
    from: '    steps: Array.isArray(row.steps) ? row.steps.filter((s): s is string => typeof s === "string") : [],',
    to: "    steps: Array.isArray(row.steps) ? (row.steps as string[]) : [],",
    expect: "a step that is not text is dropped, and the real ones keep their order",
  },
  {
    name: "a file with a name and no url is drawn anyway, as a link to nowhere",
    file: LOAD,
    from: '    typeof (value as Record<string, unknown>).name === "string" &&\n    typeof (value as Record<string, unknown>).url === "string"',
    to: '    typeof (value as Record<string, unknown>).name === "string"',
    expect: "a file with no url is dropped rather than drawn as a dead link",
  },
  {
    name: "the list is ordered oldest first, against what the page claims",
    file: LOAD,
    from: '    .order("created_at", { ascending: false });',
    to: '    .order("created_at", { ascending: true });',
    expect: "ordered newest first, which is the order the list claims",
  },

  // ---- the screen the owner approves in a screenshot ------------------
  {
    name: "a skill's name is cut with an ellipsis instead of wrapping",
    file: LIST,
    from: '<span className="break-words text-sm font-medium text-foreground">{skill.name}</span>',
    to: '<span className="truncate text-sm font-medium text-foreground">{skill.name}</span>',
    expect: "a skill's name wraps instead of being cut",
  },
  {
    name: "the steps lose their numbers, so a procedure reads as a pile of hints",
    file: DETAILS,
    from: '          <ol className="mt-2 space-y-2">',
    to: '          <ul className="mt-2 space-y-2">',
    expect: "the steps are an ORDERED list, because a procedure has an order",
  },
  {
    name: "a file link hands the person's own skill name to the site it opens",
    file: DETAILS,
    from: '                  rel="noreferrer"',
    to: '                  rel="opener"',
    expect: "opened in a new tab, with the referrer withheld",
  },
  {
    name: "the phone's back arrow is drawn on the computer too, beside a list that never left",
    file: WORKSPACE,
    from: 'className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground lg:hidden"',
    to: 'className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"',
    expect: "a back arrow brings it back, drawn only there",
  },

  // ---- what the rows owe once they exist ------------------------------
  {
    name: "the new table is left out of the export, so a person cannot take their skills with them",
    file: GDPR,
    from: '  { table: "user_skills", label: "user_skills", scope: "user_content" },\n',
    to: "",
    expect: "the table is classified for export and erasure",
  },
  {
    name: "the canary goes, so /api/health cannot say whether the migration ever ran",
    file: CANARIES,
    from: '    table: "user_skills",\n    migration: "20261107000000_user_skills.sql",',
    to: '    table: "user_skills",\n    migration: "20261024100000_my_stuff_sessions.sql",',
    expect: "a canary names the migration, so /api/health can say it ran",
  },

  // ---- and the Greek screen -------------------------------------------
  {
    name: "the Greek «what a skill is» sentence becomes a label",
    file: EL,
    from: '"why": "Μια δεξιότητα είναι μια διαδικασία που μαθαίνεις στο Ionexa μία φορά — το όνομά της, πώς εφαρμόζεται, τα βήματά της — και από εκεί και πέρα την ακολουθεί κάθε φορά. Δεν μπορείς να διδάξεις κάτι εδώ ακόμα· αυτή η οθόνη δείχνει μόνο όσα υπάρχουν ήδη."',
    to: '"why": "Δεξιότητες."',
    expect: "«what a skill is» is a sentence too",
  },
];

runMutations({
  name: "skills",
  gate: GATE,
  targets: [PAGE, WORKSPACE, LIST, DETAILS, LOAD, MIGRATION, SETTINGS, SIDEBAR, REGISTRY, GDPR, CANARIES, EL],
  mutants: MUTANTS,
});
