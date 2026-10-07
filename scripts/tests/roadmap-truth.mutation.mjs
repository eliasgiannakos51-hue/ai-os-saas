#!/usr/bin/env node
/*
 * CAN roadmap-truth.test.mjs TELL A ROUTER THAT RUNS FROM ONE THAT EXISTS?
 *
 * Until 2026-10-05 the router sat under "available" on the evidence that
 * lib/ai/routing/route.ts and registry.ts are files. They are, and no
 * request was ever served by them. §5 of the gate now counts route.ts's
 * callers instead, and checks four descriptions by the words they used to
 * sell more than the code does.
 *
 *   1. the router is filed under "available" again.
 *   2. a request path starts importing route.ts while the page still
 *      says "soon" — the other direction, so the page cannot lag behind
 *      a router that ships.
 *   3. the coding description goes back to "full app generation".
 *   4. the agent description goes back to "a working autonomous agent".
 *
 * Run: node scripts/tests/roadmap-truth.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/roadmap-truth.test.mjs";
const PAGE = "src/app/roadmap/page.tsx";
const CHAT = "src/app/api/chat/route.ts";
const EN = "messages/en.json";

const MUTANTS = [
  {
    name: "the router is filed under available again",
    file: PAGE,
    from: '      { icon: Store, key: "marketplace" },',
    to: '      { icon: Shuffle, key: "router" },\n      { icon: Store, key: "marketplace" },',
    expect: "nothing without evidence is filed under",
  },
  {
    name: "a request path calls the router while the page says soon",
    file: CHAT,
    from: 'import { NextResponse } from "next/server";',
    to: 'import { NextResponse } from "next/server";\nimport { DEFAULT_MIN_SUCCESS_RATE } from "@/lib/ai/routing/route";\nvoid DEFAULT_MIN_SUCCESS_RATE;',
    expect: "no request path calls it",
  },
  {
    name: "the coding description sells full app generation again",
    file: EN,
    from: '"description": "Writes code from a description, or explains',
    to: '"description": "Full app generation, not just snippets. Writes code from a description, or explains',
    expect: "coding no longer claims",
  },
  {
    name: "the agent description sells an autonomous agent again",
    file: EN,
    from: '"description": "Describe a goal and get an agent that searches the web',
    to: '"description": "Describe a goal and get a working autonomous agent that searches the web',
    expect: "agentBuilder no longer claims",
  },
];

runMutations({ name: "roadmap-truth", gate: GATE, targets: [PAGE, CHAT, EN], mutants: MUTANTS });
