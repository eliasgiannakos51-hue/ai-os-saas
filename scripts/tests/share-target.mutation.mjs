#!/usr/bin/env node
/*
 * CAN share-target.test.mjs SEE A REFUSAL'S TEXT COME BACK INTO THE NOTICE?
 *
 * One mutant per place the reason passes through (2026-11-05 review,
 * A12): the route that puts it in the address, the mapping that decides
 * what counts as a code, and the two screens that say it.
 *
 * Run: node scripts/tests/share-target.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/share-target.test.mjs";
const ROUTE = "src/app/share/route.ts";
const MAP = "src/lib/files/share-outcome.ts";
const FILES = "src/components/files/files-workspace.tsx";
const ANALYZE = "src/components/analyze/analyze-shell.tsx";

const MUTANTS = [
  {
    name: "the route sends the refusal's sentence again",
    file: ROUTE,
    from: "            if (!firstRefusal) firstRefusal = result.stage;",
    to: "            if (!firstRefusal) firstRefusal = result.error as IngestStage;",
    expect: "the share route sends the refusal's stage, not its sentence",
  },
  {
    name: "an unknown value is passed through as if it were a code",
    file: MAP,
    from: "    default:\n      return null;",
    to: "    default:\n      return raw as ShareReasonMessage;",
    expect: "free text is ignored",
  },
  {
    name: "the Files screen reads the address bar straight into the notice",
    file: FILES,
    from: '    const reason = shareReasonMessage(params.get("share_reason"));',
    to: '    const reason = params.get("share_reason") as ReturnType<typeof shareReasonMessage>;',
    expect: "src/components/files/files-workspace.tsx reads it only through shareReasonMessage",
  },
  {
    name: "the Analyze screen reads the address bar straight into the notice",
    file: ANALYZE,
    from: '    const reason = shareReasonMessage(params.get("share_reason"));',
    to: '    const reason = params.get("share_reason") as ReturnType<typeof shareReasonMessage>;',
    expect: "src/components/analyze/analyze-shell.tsx reads it only through shareReasonMessage",
  },
];

runMutations({ name: "share-target", gate: GATE, targets: [ROUTE, MAP, FILES, ANALYZE], mutants: MUTANTS });
