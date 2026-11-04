#!/usr/bin/env node
/*
 * CAN apps-tool.test.mjs SEE A PLAN THAT POINTS AT NOTHING, A BOX CHANGE
 * THAT EMPTIES THE APP, OR A HOLD THAT IS NEVER GIVEN BACK?
 *
 * The definition is the whole safety story of this tool — a screen that
 * names a collection which is not there is the empty screen the owner's
 * ΚΡΙΤΗΡΙΑ ΠΟΙΟΤΗΤΑΣ forbid, and nothing downstream would catch it
 * (docs/APPS-ISOLATION.md §1). So most of these mutants attack the
 * parser and the splice rather than the wiring around them.
 *
 * Run: node scripts/tests/apps-tool.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/apps-tool.test.mjs";
const PLAN = "src/lib/apps/app-plan.ts";
const CHARGE = "src/lib/apps/charge.ts";
const ROUTE = "src/app/api/apps/route.ts";
const ONE = "src/app/api/apps/[id]/route.ts";
const SQL = "supabase/migrations/20261030000000_user_apps.sql";

const MUTANTS = [
  {
    name: "a screen may point at a collection that is not there",
    file: PLAN,
    from: "  const known = new Set(collections.map((c) => c.key));",
    to: "  const known = { has: () => true };",
    expect: "a screen naming a collection that does not exist is dropped, not drawn empty",
  },
  {
    name: "a plan whose every screen dangles is stored anyway",
    file: PLAN,
    from: '  if (screens.length === 0) return { ok: false, reason: "no screen that points at a collection that exists" };',
    to: "",
    expect: "a plan whose every screen dangles is refused, not stored empty",
  },
  {
    name: "a collection with no field is kept",
    file: PLAN,
    from: "  if (fields.length === 0) return null;",
    to: "",
    expect: "a collection with no field is not a collection",
  },
  {
    name: "a choice with nothing to choose stays a dropdown nobody can answer",
    file: PLAN,
    from: '    if (options.length === 0) return { key, label, type: "text", required: field.required };',
    to: "",
    expect: "a choice with nothing to choose becomes a text field, not an empty dropdown",
  },
  {
    name: "a box change may empty the app",
    file: PLAN,
    from: "  if (screens.length === 0) return { definition, dropped: [] };",
    to: "",
    expect: "a change that would leave no screen at all is not applied",
  },
  {
    name: "a screen taken by a box change goes silently",
    file: PLAN,
    from: "    dropped.push(s.label);",
    to: "",
    expect: "...and SAYS which ones, by name",
  },
  {
    // The first version of this mutant tried to invent a collection from
    // an unknown key and could not: the splice maps over the collections
    // that exist, so a stray key is never read. A change to the access
    // box taking a FIELD with it is the defect that can really happen.
    name: "a change to who sees what quietly drops a field",
    file: PLAN,
    from: "      collections: definition.collections.map((c) => ({ ...c, visibility: byCollection.get(c.key) ?? c.visibility })),",
    to: "      collections: definition.collections.map((c) => ({ ...c, fields: c.fields.slice(0, 1), visibility: byCollection.get(c.key) ?? c.visibility })),",
    expect: "...leaving every field exactly as it was",
  },
  {
    name: "the switch never gates the planning route",
    file: ROUTE,
    from: '  if (!(await isFeatureOn("apps-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });',
    to: "",
    expect: "src/app/api/apps/route.ts: the switch gates it",
  },
  {
    name: "the switch never gates the box-change route",
    file: ONE,
    from: '  if (!(await isFeatureOn("apps-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });',
    to: "",
    expect: "src/app/api/apps/[id]/route.ts: the switch gates it",
  },
  {
    name: "a hold is never given back when the model never answered",
    file: CHARGE,
    from: "    await releaseReservation(user.id, reservationId);",
    to: "",
    expect: "...gives the hold back when the model never answered",
  },
  {
    name: "the account may write the apps table itself",
    file: SQL,
    from: "revoke insert, update on public.user_apps from anon, authenticated;",
    to: "",
    expect: "and cannot write the table at all",
  },
];

runMutations({ name: "apps-tool", gate: GATE, targets: [PLAN, CHARGE, ROUTE, ONE, SQL], mutants: MUTANTS });
