#!/usr/bin/env node
/*
 * CAN route-write-bound.test.mjs SEE A TABLE GROW WITHOUT A CEILING?
 *
 * Every mutant below is a bound coming off a route that inserts rows. All
 * four of the real ones were in this state until 2026-09-16, and
 * rate-limits.test.mjs stayed green throughout — its population is the
 * routes that ALREADY call checkRateLimit, so a route that never did was
 * never asked.
 *
 * Run: node scripts/tests/route-write-bound.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/route-write-bound.test.mjs";
const NAV = "src/app/api/nav/track/route.ts";
const UPLOAD = "src/app/api/data-analysis/upload/route.ts";
const SCHEDULE = "src/app/api/mission/schedule-step/route.ts";
const DEVICE = "src/app/api/auth/device-check/route.ts";
const FAVOURITES = "supabase/migrations/20260804000001_baseline_gaps.sql";

const MUTANTS = [
  {
    name: "the highest-write route in the product loses its ceiling again",
    file: NAV,
    from: '      scope: "nav_track",',
    to: "",
    expect: "names what bounds it",
  },
  {
    name: "spreadsheet uploads stop being counted",
    file: UPLOAD,
    from: '      scope: "data_analysis_upload",',
    to: "",
    expect: "names what bounds it",
  },
  {
    name: "a mission step can be queued without limit again",
    file: SCHEDULE,
    from: '      scope: "mission_schedule_step",',
    to: "",
    expect: "names what bounds it",
  },
  {
    name: "the device check goes back to one row and one email per call",
    file: DEVICE,
    from: '      scope: "device_check",',
    to: "",
    expect: "names what bounds it",
  },
  {
    name: "the unique constraint that IS the favourites bound is dropped",
    file: FAVOURITES,
    from: "UNIQUE (user_id, table_name, record_id)",
    to: "CHECK (record_id is not null)",
    expect: "every declared bound is still true of the tree",
  },
];

runMutations({
  name: "route-write-bound",
  gate: GATE,
  targets: [NAV, UPLOAD, SCHEDULE, DEVICE, FAVOURITES],
  mutants: MUTANTS,
});
