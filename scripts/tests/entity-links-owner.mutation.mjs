#!/usr/bin/env node
/*
 * CAN entity-links-owner.test.mjs SEE A SHARED PROJECT SHOW ANOTHER
 * ACCOUNT'S ROW?
 *
 * One mutant per fence (2026-11-05 review, A3): each of the loader's two
 * owner filters, the far-end read in lib/entity-links.ts, and the
 * trigger's ends, quoting and timing. The behaviour against a real
 * Postgres is entity-links-owner.dbtest.mjs, which goes red without the
 * migration.
 *
 * Run: node scripts/tests/entity-links-owner.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/entity-links-owner.test.mjs";
const LOADER = "src/lib/projects/load-project-detail.ts";
const LINKS = "src/lib/entity-links.ts";
const MIG = "supabase/migrations/20261115000002_entity_links_same_owner.sql";

const MUTANTS = [
  {
    name: "the share page reads another account's link rows",
    file: LOADER,
    from: '    .eq("user_id", ownerId)\n    .eq("relationship_type", IN_PROJECT)',
    to: '    .eq("relationship_type", IN_PROJECT)',
    expect: '.from("entity_links") is filtered to the owner',
  },
  {
    name: "the share page reads another account's member rows",
    file: LOADER,
    from: '      .eq("user_id", ownerId)\n      .in("id", ids)',
    to: '      .in("id", ids)',
    expect: ".from(table) is filtered to the owner",
  },
  {
    name: "a link's far end is read without the caller's filter",
    file: LINKS,
    from: '        .eq("user_id", userId)\n        .in("id", [...otherIds]);',
    to: '        .in("id", [...otherIds]);',
    expect: "loadLinkedEntities reads the far end as the caller's own rows",
  },
  {
    name: "the trigger checks only one end",
    file: MIG,
    from: "    select new.source_table as tbl, new.source_id as row_id\n    union all\n    select new.target_table, new.target_id\n",
    to: "    select new.source_table as tbl, new.source_id as row_id\n",
    expect: "...checks BOTH ends",
  },
  {
    name: "the table name is spliced unquoted",
    file: MIG,
    from: "from public.%I where id = $1 and user_id = $2)', side.tbl)",
    to: "from public.%s where id = $1 and user_id = $2)', side.tbl)",
    expect: "...names the table only through %I",
  },
  {
    name: "an update can move a link's end",
    file: MIG,
    from: "  before insert or update on public.entity_links",
    to: "  before insert on public.entity_links",
    expect: "the trigger runs before every insert AND update",
  },
];

runMutations({ name: "entity-links-owner", gate: GATE, targets: [LOADER, LINKS, MIG], mutants: MUTANTS });
