#!/usr/bin/env node
/*
 * HOW BIG DOES chat_memory GET, AND IS PRUNING PREMATURE?
 *
 * Asked directly, 2026-09-12, because "the table grows for ever" is true of
 * every table and says nothing about whether it matters. The answer decides
 * how much machinery the retention rule deserves.
 *
 * EVERY INPUT IS NAMED AND COMES FROM THE TREE where it can. The free-chat
 * allowances are lib/billing/free-chat.ts's own numbers, which are the
 * closest thing this repository has to a stated messages-per-month figure.
 * The extraction yield and the distinct-facts ceiling are estimates and are
 * labelled as such — they are the two numbers to argue with.
 *
 * Run: node scripts/estimate-chat-memory-growth.mjs
 */
import { readFileSync } from "node:fs";

const freeChat = readFileSync("src/lib/billing/free-chat.ts", "utf8");
const allowance = (slug) => Number(freeChat.match(new RegExp(`^\\s*${slug}: (\\d+),`, "m"))?.[1] ?? 0);

// MESSAGES PER MONTH. The free-chat allowance is a floor on how much a
// subscriber talks, not a ceiling — beyond it they pay in credits — so this
// UNDERSTATES a heavy user and is the honest lower bound for the busy case.
const PER_MONTH = { growth: allowance("growth"), ultimate: allowance("ultimate") };

// ESTIMATE, NOT MEASURED: how often the extraction returns something rather
// than NONE. The prompt is deliberately narrow (durable facts only), so most
// turns yield nothing.
const YIELD = 0.2;

// ESTIMATE, NOT MEASURED: how many DISTINCT durable facts one person has.
// This is the number that decides everything, because deduplication turns an
// unbounded row count into a saturating one.
const DISTINCT_FACTS_PER_PERSON = 300;

// Row cost. 3 uuids (48B) + 2 timestamptz (16B) + an int + the text, plus
// Postgres's 24B header and alignment, plus the two indexes.
const TEXT_BYTES = 90;
const ROW_BYTES = 24 + 48 + 16 + 4 + TEXT_BYTES + 24; // ~206
const INDEX_BYTES = 2 * 48;
const TOTAL_PER_ROW = ROW_BYTES + INDEX_BYTES;

const USERS = 1000;
const MONTHS = 12;

console.log("chat_memory growth, 1,000 paying users x 1 year\n");
console.log(`  inputs read from the tree: growth ${PER_MONTH.growth} msg/mo, ultimate ${PER_MONTH.ultimate} msg/mo`);
console.log(`  inputs ESTIMATED: extraction yield ${YIELD}, distinct facts per person ${DISTINCT_FACTS_PER_PERSON}`);
console.log(`  bytes per row incl. indexes: ${TOTAL_PER_ROW}\n`);

for (const [label, msgs] of Object.entries(PER_MONTH)) {
  const rowsPerUserPerYear = Math.round(msgs * MONTHS * YIELD);
  const noDedup = rowsPerUserPerYear * USERS;
  const withDedup = Math.min(rowsPerUserPerYear, DISTINCT_FACTS_PER_PERSON) * USERS;
  const mb = (n) => ((n * TOTAL_PER_ROW) / 1024 / 1024).toFixed(1);
  console.log(`  ${label.padEnd(9)} ${rowsPerUserPerYear} rows/user/year`);
  console.log(`            without dedup: ${noDedup.toLocaleString()} rows, ${mb(noDedup)} MB — and it does NOT saturate`);
  console.log(`            with dedup:    ${withDedup.toLocaleString()} rows, ${mb(withDedup)} MB — saturates at the person's distinct facts`);
}

console.log(`
  WHAT THIS SAYS. The growth is not in facts, it is in REPETITIONS: the same
  person saying their name in fifty conversations is fifty rows today and one
  row with times_seen = 50 after deduplication. Dedup is the fix; the
  retention rule is the tail it leaves behind — rows said once, six months
  ago, already outside the load window.

  So pruning by age alone would have been the wrong lever twice over: it
  removes the rows that cost nothing (a few hundred kilobytes) and leaves the
  ones that cost everything (the repetitions, which are also the knowledge).`);
