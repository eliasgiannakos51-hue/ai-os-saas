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
const INVITE = "src/app/api/team/invite/route.ts";
const EXPORT = "src/app/api/data-analysis/[id]/export/route.ts";
const DOC_PDF = "src/app/api/documents/[id]/pdf/route.ts";

const MUTANTS = [
  {
    // THE ROUTE THE FIRST EXPORT SWEEP MISSED. It renders nothing, so
    // "renders a document" did not find it; it serialises every row of an
    // uploaded spreadsheet on each call, which is the same egress.
    name: "the spreadsheet export goes back to unbounded",
    file: EXPORT,
    from: "  if (!(await allowExport(user.id))) {",
    to: "  if (false) {",
    expect: "hands back a file is bounded",
  },
  {
    // The one file route that is bounded by the CHARGE rather than a
    // limiter. Stop reserving and it becomes a free unbounded renderer.
    name: "the document PDF stops reserving, so nothing bounds it at all",
    file: DOC_PDF,
    from: "      const reservation = await reserveCredits(",
    to: "      const reservation = await notReserveCredits(",
    expect: "hands back a file is bounded",
  },
  {
    // THE ONE A PRESENCE CHECK MISSED. Removing the limiter leaves
    // `seat_count` in the file, so the eight-kinds check still calls this
    // route bounded — and on Ultimate and Enterprise that cap is
    // POSITIVE_INFINITY and the seat branch is skipped outright. The
    // outbound section is what has to catch this.
    name: "team invitations go back to being bounded only by a cap that is Infinity",
    file: INVITE,
    from: '      scope: "team_invite",',
    to: "",
    expect: "sends outward is rate limited",
  },
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
  targets: [NAV, UPLOAD, SCHEDULE, DEVICE, FAVOURITES, INVITE, EXPORT, DOC_PDF],
  mutants: MUTANTS,
});
