// "The agent builder accepts requests it CANNOT execute, charges credits,
//  and then the agent replies 'I don't produce executable source code in
//  this context'."
//
// Reported: an agent asked to "build an MVP, run tests, fix errors" was
// designed, charged for, created, and failed.
//
// Every layer behaved as written. Nothing was asking whether the request
// was possible:
//   - the builder's `unsupported` field was free text with no effect —
//     `parseBuiltAgent` returned ok:true regardless of what was in it;
//   - the create screen said nothing about what an agent can do;
//   - validateAgentOutput passed the refusal (over the length floor, no
//     fencing markers, not NO_RESULT), so the run was a SUCCESS that
//     emailed a refusal and billed for it.
//
// This file pins all three, plus the ordering property that makes the fix
// free: the capability gate runs BEFORE the reservation, so a refused
// request costs nothing.
//
// Run: node scripts/tests/agent-capability.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const cap = await loadTs("src/lib/agents/agent-capability.ts");
const {
  classifyAgentRequest,
  detectCapabilityRefusal,
  AGENT_BLOCKED_CATEGORIES,
  AGENT_CAN_IDS,
  AGENT_CANNOT_IDS,
  AGENT_CANNOT_COMPLETE_MARKER,
} = cap;
const { parseBuiltAgent } = await loadTs("src/lib/agents/agent-builder-parse.ts");

const routeSrc = readFileSync("src/app/api/agents/build/route.ts", "utf8");
const handlerSrc = readFileSync("src/lib/jobs/handlers/agent-build.ts", "utf8");
const runnerSrc = readFileSync("src/lib/agents/agent-runner.ts", "utf8");
const executeSrc = readFileSync("src/lib/agents/execute-agent.ts", "utf8");
const workspaceSrc = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
const builderSrc = readFileSync("src/lib/agents/agent-builder.ts", "utf8");

// ---------------------------------------------------------------------------
console.log("== 1. THE FIVE REQUESTS ==");
// Requirement 5, verbatim: 2 feasible, 2 impossible, 1 partial. What each
// one answers, and whether it can reach a charge.
//
// "Charged?" is decided by ONE fact and this test asserts it separately
// in section 2: the classifier runs before reserveCredits, so anything
// that is not "supported" cannot have cost anything by the time the user
// sees the answer.
const FIVE = [
  {
    label: "IMPOSSIBLE — the reported request",
    text: "Θέλω agent που φτιάχνει MVP, τρέχει tests, διορθώνει errors",
    expect: "unsupported",
    expectCategory: "code",
  },
  {
    label: "IMPOSSIBLE",
    text: "Every Monday, call my customers and ask how they are doing",
    expect: "unsupported",
    expectCategory: "phone",
  },
  {
    label: "PARTIAL",
    text: "Κάθε πρωί στείλε μου τα νέα για τη Nvidia και φτιάξε μου ένα script που τα αποθηκεύει",
    expect: "partial",
    expectCategory: "code",
  },
  {
    label: "FEASIBLE",
    text: "Κάθε πρωί στείλε μου τα νέα για τη Nvidia",
    expect: "supported",
    expectCategory: null,
  },
  {
    label: "FEASIBLE",
    text: "Every Monday summarise the latest AI research papers and email me a report",
    expect: "supported",
    expectCategory: null,
  },
];

for (const c of FIVE) {
  const v = classifyAgentRequest(c.text);
  const charged = v.verdict === "supported" ? "yes (the work runs)" : "NO — refused before the reservation";
  console.log(
    `\n        request : ${c.text}\n` +
      `        verdict : ${v.verdict}\n` +
      `        blocked : ${v.blocked.join(", ") || "-"}\n` +
      `        evidence: ${v.evidence.map((e) => e.matched).join(" | ") || "-"}\n` +
      `        will do : ${v.doableParts.join(" | ") || "-"}\n` +
      `        charged : ${charged}`
  );
  check(`${c.label}: verdict is "${c.expect}"`, v.verdict === c.expect, `got "${v.verdict}"`);
  if (c.expectCategory) {
    check(`${c.label}: blocked as "${c.expectCategory}"`, v.blocked.includes(c.expectCategory));
  } else {
    check(`${c.label}: nothing blocked`, v.blocked.length === 0);
  }
}
// The partial case must be able to state a counter-offer, or requirement
// 1γ ("the agent will do Y instead") has nothing to put in Y.
const partial = classifyAgentRequest(FIVE[2].text);
check(
  "the partial case names what the agent WOULD do",
  partial.doableParts.length > 0 && /nvidia/.test(partial.doableParts.join(" ")),
  JSON.stringify(partial.doableParts)
);

// ---------------------------------------------------------------------------
console.log("\n== 2. THE ORDERING: the gate runs BEFORE anything costs money ==");
// The whole value of the fix. A capability check placed after the
// reservation is just a politer way of charging for a refusal.
const gateAt = routeSrc.indexOf("classifyAgentRequest(userRequest)");
const estimateAt = routeSrc.indexOf("estimateForAction(");
const startJobAt = routeSrc.indexOf("startJob({");
const creditsAt = routeSrc.indexOf("hasEnoughCredits(");
check("the route calls the capability gate", gateAt > 0);
check("…before estimateForAction", gateAt < estimateAt, `${gateAt} vs ${estimateAt}`);
check("…before hasEnoughCredits", gateAt < creditsAt, `${gateAt} vs ${creditsAt}`);
check("…before startJob (which reserves)", gateAt < startJobAt, `${gateAt} vs ${startJobAt}`);
check(
  "an unsupported verdict returns without a jobId",
  /capabilityBlocked: true[\s\S]{0,200}\}\);\n\s*\}/.test(routeSrc) &&
    !/capabilityBlocked: true[\s\S]{0,200}jobId/.test(routeSrc)
);
check(
  "a partial verdict also returns without a jobId, unless acknowledged",
  /capability\.verdict === "partial" && !acknowledgedLimits/.test(routeSrc)
);
check(
  "and acknowledging it is an explicit client flag, not a default",
  /acknowledgedLimits = body\?\.acknowledgedLimits === true/.test(routeSrc)
);
check(
  "the gate runs on resubmissions too, not only the first submission",
  // i.e. it is NOT wrapped in `if (!skipClarification)`.
  !/if \(!skipClarification\)[\s\S]{0,400}classifyAgentRequest/.test(routeSrc)
);
check(
  "the refusal carries category IDS, not English prose",
  /blocked: capability\.blocked/.test(routeSrc) && !/error: "An agent (?:can|cannot)/.test(routeSrc)
);

// ---------------------------------------------------------------------------
console.log("\n== 3. LAYER 2: the builder's own verdict now decides the return type ==");
const BASE = {
  name: "Nvidia Daily News",
  description: "Daily news",
  taskPrompt: "Summarise the latest Nvidia news.",
  scheduleCron: "0 8 * * *",
  needsWebSearch: true,
  outputFormat: "summary",
  language: "el",
  understood: "Θα σου στέλνει τα νέα της Nvidia κάθε πρωί.",
  unsupported: "",
};
const ctx = { timezone: "Europe/Athens", deliveryTarget: "user@example.com" };

check("feasibility 'full' builds", parseBuiltAgent({ ...BASE, feasibility: "full" }, ctx).ok === true);
check(
  "feasibility 'partial' still builds (the doable part)",
  parseBuiltAgent({ ...BASE, feasibility: "partial", unsupported: "Δεν μπορεί να γράψει κώδικα." }, ctx)
    .ok === true
);
const none = parseBuiltAgent(
  { ...BASE, feasibility: "none", unsupported: "Δεν μπορεί να φτιάξει MVP ούτε να τρέξει tests." },
  ctx
);
check("feasibility 'none' does NOT build", none.ok === false);
check("…with reason not_feasible", none.ok === false && none.reason === "not_feasible");
check(
  "…and carries the model's sentence, in the user's language",
  none.ok === false && none.detail === "Δεν μπορεί να φτιάξει MVP ούτε να τρέξει tests."
);
// The old behaviour, pinned as the thing that must never come back: a
// complete draft with a schedule, from a request the model itself said
// was impossible.
check(
  "a 'none' verdict cannot produce a draft, however complete the other fields are",
  none.ok === false && !("built" in none)
);
// Absent feasibility must not brick every build — the deterministic gate
// is what does not depend on the model.
check(
  "a missing feasibility defaults to buildable",
  parseBuiltAgent({ ...BASE }, ctx).ok === true
);
check(
  "the tool schema requires feasibility",
  /required: \[\s*"feasibility"/.test(builderSrc)
);
check(
  "and the prompt tells the model to decide it first",
  /FEASIBILITY — DECIDE THIS FIRST/.test(builderSrc)
);
check(
  "the prompt forbids reinterpreting an impossible task into an adjacent one",
  /Reinterpreting a request into something adjacent/.test(builderSrc)
);

console.log("\n   …and the job REFUNDS rather than charging for it:");
check(
  "the handler returns refund: true for not_feasible",
  /reason === "not_feasible"[\s\S]{0,1200}refund: true/.test(handlerSrc)
);
// Exactly one refund in the handler, and it is inside the not_feasible
// branch — an invalid schedule or a malformed response means the builder
// really did the work, so those still settle.
const notFeasibleAt = handlerSrc.indexOf('reason === "not_feasible"');
const refundAt = handlerSrc.indexOf("refund: true");
const invalidScheduleAt = handlerSrc.indexOf('"invalid_schedule"');
check(
  "there is exactly one refund in the handler",
  (handlerSrc.match(/refund: true/g) ?? []).length === 1
);
check(
  "…and it belongs to the not_feasible branch",
  notFeasibleAt > 0 && refundAt > notFeasibleAt && refundAt < invalidScheduleAt,
  `not_feasible@${notFeasibleAt} refund@${refundAt} invalid_schedule@${invalidScheduleAt}`
);

// ---------------------------------------------------------------------------
console.log("\n== 4. LAYER 3: a refusal at RUN time is not a successful run ==");
// The exact sentence from the incident, and the shapes around it.
const REFUSALS = [
  "I don't produce executable source code in this context.",
  "Δεν παράγω εκτελέσιμο πηγαίο κώδικα σε αυτό το πλαίσιο.",
  "I am unable to access your computer, so I cannot run the tests.",
  "As an AI, I cannot execute code or run a test suite.",
  `${AGENT_CANNOT_COMPLETE_MARKER}: Δεν μπορώ να τρέξω tests.`,
];
for (const text of REFUSALS) {
  check(`refusal detected: "${text.slice(0, 52)}…"`, detectCapabilityRefusal(text).refused);
}
const REAL_OUTPUTS = [
  "Nvidia announced its Q3 results yesterday. Revenue rose 22% year on year, driven by data-centre demand (Reuters). Analysts at Morgan Stanley raised their target price.",
  "Τα νέα της εβδομάδας: η Nvidia ανακοίνωσε νέα σειρά επεξεργαστών. Οι αναλυτές εκτιμούν ότι δεν μπορώ να πω με βεβαιότητα πώς θα κινηθεί η μετοχή.",
  "Three things changed this week. First, the EU published new guidance. Second, two competitors cut prices. Third, nothing else of note.",
];
for (const text of REAL_OUTPUTS) {
  check(
    `real output NOT flagged: "${text.slice(0, 52)}…"`,
    !detectCapabilityRefusal(text).refused,
    "a false positive here refunds and disables a working agent"
  );
}
check("empty output is not a refusal", !detectCapabilityRefusal("").refused);
check(
  "the marker's reason is extracted, not the whole string",
  detectCapabilityRefusal(`${AGENT_CANNOT_COMPLETE_MARKER}: Δεν μπορώ να τρέξω tests.`).reason ===
    "Δεν μπορώ να τρέξω tests."
);

console.log("\n   …wired into the runner and the run outcome:");
check(
  "the runner checks for a refusal BEFORE validateAgentOutput",
  runnerSrc.indexOf("detectCapabilityRefusal(text)") < runnerSrc.indexOf("validateAgentOutput(text)")
);
check(
  "…and returns kind cannot_complete",
  /kind: "cannot_complete"/.test(runnerSrc)
);
check(
  "the system prompt asks for the marker",
  runnerSrc.includes("${AGENT_CANNOT_COMPLETE_MARKER}") ||
    /AGENT_CANNOT_COMPLETE_MARKER\}: /.test(runnerSrc)
);
check(
  "a capability refusal is NOT retried (it fails identically every time)",
  /outcome\.failure\.kind === "api_error" \|\| outcome\.failure\.kind === "no_output"/.test(executeSrc)
);

// ---------------------------------------------------------------------------
console.log("\n== 5. REQUIREMENT 4: a run that cannot complete is not charged ==");
check(
  "cannot_complete settles as a bypass row — logged, charged nothing",
  /const cannotComplete = !outcome\.ok && outcome\.failure\.kind === "cannot_complete"/.test(executeSrc) &&
    /bypassCharge: bypassCredits \|\| !plan \|\| cannotComplete/.test(executeSrc)
);
check(
  "…the hold is released",
  /if \(cannotComplete\) \{[\s\S]{0,600}releaseReservation\(userId, reservationId\)/.test(executeSrc)
);
check(
  "…released AFTER settlement, so nothing charges against a freed hold",
  executeSrc.indexOf("const settlement = await settleReservation") <
    executeSrc.indexOf("await releaseReservation(userId, reservationId);\n  }")
);
check(
  "…the real cost is still logged, under its own feature name",
  /feature: cannotComplete \? "agent_run_cannot_complete" : "agent_run"/.test(executeSrc),
  "a refund that logs nothing hides what saying 'no' costs us"
);
check(
  "…the agent switches OFF on the first occurrence, not after five",
  /const shouldDisable = cannotComplete \|\| consecutiveFailures >= AGENT_MAX_CONSECUTIVE_FAILURES/.test(
    executeSrc
  )
);
check(
  "…even when triggered by a manual Run now",
  /if \(triggerSource === "schedule" \|\| cannotComplete\)/.test(executeSrc)
);
check(
  "…and the caller gets a distinct reason, not a generic run_failed",
  /reason: cannotComplete \? "cannot_complete" : "run_failed"/.test(executeSrc)
);

console.log("\n   …and a refunded JOB still records what it cost us:");
const runJobSrc = readFileSync("src/lib/jobs/run-job.ts", "utf8");
check(
  "the refund path settles as a bypass row instead of returning silently",
  /if \(handled\.refund\)[\s\S]{0,1600}settleReservation\(\{[\s\S]{0,300}bypassCharge: true/.test(runJobSrc),
  "found while fixing this: a refunded job spent real tokens and appeared in no cost log at all"
);
check(
  "…under a _refunded feature name, so it is one row in the margin report",
  /feature: `\$\{handled\.feature \?\? kind\}_refunded`/.test(runJobSrc)
);
check(
  "…and only when something was actually measured",
  /if \(costs\.callCount > 0\)/.test(runJobSrc)
);

// ---------------------------------------------------------------------------
console.log("\n== 6. REQUIREMENT 2 & 3: the user can SEE this before creating ==");
check(
  "the create screen renders the CAN list",
  /AGENT_CAN_IDS\.map/.test(workspaceSrc) && /capability\.canTitle/.test(workspaceSrc)
);
check(
  "…and the CANNOT list",
  /AGENT_CANNOT_IDS\.map/.test(workspaceSrc) && /capability\.cannotTitle/.test(workspaceSrc)
);
check(
  "…unconditionally, not behind a click or a tooltip",
  // Inside `creating &&`, before the refusal panels — no extra guard.
  !/showCapabilities|\[capabilitiesOpen/.test(workspaceSrc)
);
check(
  "the refusal panel says nothing was charged",
  /capability\.noCharge/.test(workspaceSrc)
);
check("the partial panel offers to continue", /capability\.partialContinue/.test(workspaceSrc));
check(
  "…and continuing passes acknowledgedLimits",
  /build\(requestText, true, true\)/.test(workspaceSrc)
);
check(
  "the preview spells out what the agent does each run",
  /capability\.previewWhatItDoes/.test(workspaceSrc) &&
    /capability\.stepSearch/.test(workspaceSrc) &&
    /capability\.stepWrite/.test(workspaceSrc) &&
    /capability\.stepDeliver/.test(workspaceSrc)
);
check(
  "…and distinguishes a searching agent from one that does not search",
  /needsWebSearch[\s\S]{0,120}capability\.stepSearch[\s\S]{0,80}capability\.stepNoSearch/.test(workspaceSrc)
);
check(
  "the preview labels the unsupported note rather than showing a bare sentence",
  /capability\.previewWillNotDo/.test(workspaceSrc)
);
check(
  "a cannot_complete run shows its own message, not 'the run failed'",
  /result\.reason === "cannot_complete"[\s\S]{0,300}runCannotComplete/.test(workspaceSrc)
);
check(
  "the builder's own refusal is shown as an explanation, not a retry error",
  /result\.reason === "not_feasible"[\s\S]{0,600}setCapability\(/.test(workspaceSrc)
);

// ---------------------------------------------------------------------------
console.log("\n== 7. every category id has a translation in every locale ==");
// The category ids travel from the SERVER to `t()` as a template key.
// scripts/tests/i18n-coverage.test.mjs only sees literal t("…") calls, so
// a missing key here would render the raw key path to the user with
// nothing failing. This is that gap, closed.
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
for (const locale of LOCALES) {
  const msgs = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const block = msgs?.dashboard?.agents?.capability;
  check(`${locale}: dashboard.agents.capability exists`, Boolean(block));
  if (!block) continue;
  for (const id of AGENT_BLOCKED_CATEGORIES) {
    check(`${locale}: capability.cannot.${id}`, typeof block.cannot?.[id] === "string" && block.cannot[id].length > 0);
  }
  for (const id of AGENT_CAN_IDS) {
    check(`${locale}: capability.can.${id}`, typeof block.can?.[id] === "string" && block.can[id].length > 0);
  }
  for (const key of [
    "canTitle",
    "cannotTitle",
    "refusedTitle",
    "refusedBody",
    "detectedIn",
    "noCharge",
    "noChargeYet",
    "tryInstead",
    "rephrase",
    "partialTitle",
    "partialWillDo",
    "partialContinue",
    "previewWhatItDoes",
    "previewWillNotDo",
    "stepSearch",
    "stepNoSearch",
    "stepWrite",
    "stepDeliver",
  ]) {
    check(`${locale}: capability.${key}`, typeof block[key] === "string" && block[key].length > 0);
  }
  check(
    `${locale}: runCannotComplete`,
    typeof msgs.dashboard.agents.runCannotComplete === "string"
  );
}
check("the CANNOT list is exactly the blocked categories", AGENT_CANNOT_IDS === AGENT_BLOCKED_CATEGORIES);
// Placeholders have to survive translation or next-intl throws at render.
for (const locale of LOCALES) {
  const block = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.agents.capability;
  check(`${locale}: detectedIn keeps {words}`, block.detectedIn.includes("{words}"));
  check(`${locale}: partialWillDo keeps {parts}`, block.partialWillDo.includes("{parts}"));
  check(
    `${locale}: stepDeliver keeps {target} and {when}`,
    block.stepDeliver.includes("{target}") && block.stepDeliver.includes("{when}")
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 8. FALSE POSITIVES: legitimate agents must still build ==");
// The cost of over-blocking is a user refused something the product can
// do, which no later layer can undo. Every one of these mentions a word
// the matchers care about.
const MUST_BUILD = [
  "Send me weekly news about Python and JavaScript releases",
  "Παρακολούθησε τις τιμές των μετοχών της Apple και στείλε μου αναφορά",
  "Track bug reports mentioned about my competitors in the news",
  "Write me a summary of the crypto market every Friday",
  "Γράψε μου μια εβδομαδιαία περίληψη για τον κλάδο του τουρισμού",
  "Compare my industry's best practices and email me a report",
  "Monitor what people say about my website on review sites",
  "Κάθε Δευτέρα ψάξε τι νέο υπάρχει στην αγορά ακινήτων στη Θεσσαλονίκη",
  "Summarise the top posts on Hacker News about developer tools",
  "Follow news about invoices and late payment regulation in the EU",
  "Every morning, check if any of my suppliers announced a price change",
  "Ερεύνησε τι κάνουν οι ανταγωνιστές μου στο marketing και στείλε μου σύνοψη",
];
let blockedWrongly = 0;
for (const text of MUST_BUILD) {
  const v = classifyAgentRequest(text);
  const ok = v.verdict === "supported";
  if (!ok) blockedWrongly++;
  check(
    `builds: "${text.slice(0, 58)}…"`,
    ok,
    `verdict ${v.verdict}, blocked by ${v.evidence.map((e) => `${e.category}[${e.matched}]`).join(", ")}`
  );
}
check(`0 of ${MUST_BUILD.length} legitimate requests were blocked`, blockedWrongly === 0);

console.log("\n== 8b. and the impossible ones are still caught ==");
const MUST_BLOCK = [
  ["build me a web app and deploy it", "code"],
  ["γράψε κώδικα σε python για μένα", "code"],
  ["fix the bugs in my repository every night", "code"],
  ["access my files on my computer and summarise them", "system_access"],
  ["συνδέσου στο λογαριασμό μου και κατέβασε τα δεδομένα", "system_access"],
  ["post a summary on LinkedIn every Friday", "other_platforms"],
  ["δημοσίευσε ένα σχόλιο στο Instagram κάθε μέρα", "other_platforms"],
  ["buy bitcoin when the price drops", "financial"],
  ["πλήρωσε τα τιμολόγιά μου κάθε μήνα", "financial"],
  ["call the clients who have not replied", "phone"],
  ["τηλεφώνησε στους πελάτες μου", "phone"],
  ["run the unit tests and tell me what failed", "code"],
];
let missed = 0;
for (const [text, expected] of MUST_BLOCK) {
  const v = classifyAgentRequest(text);
  const ok = v.verdict !== "supported" && v.blocked.includes(expected);
  if (!ok) missed++;
  check(`blocked as ${expected}: "${text.slice(0, 52)}…"`, ok, `got ${v.verdict} / ${v.blocked.join(",")}`);
}
check(`0 of ${MUST_BLOCK.length} impossible requests slipped through layer 1`, missed === 0);

// ---------------------------------------------------------------------------
console.log("\n== 9. the Greek matchers actually run ==");
// `\b` is ASCII-only in JavaScript: every Greek letter is a NON-word
// character, so `\bκωδικα\b` matches nothing, silently. Written that way,
// this classifier passed all its English cases and let every Greek one
// through — including the exact reported request. Pinned so it cannot
// regress into the same silence.
check(
  "no matcher in agent-capability.ts relies on \\b",
  !/\\b/.test(readFileSync("src/lib/agents/agent-capability.ts", "utf8").replace(/^\s*\/\/.*$/gm, "")),
  "use word() / stem(), which are built on \\p{L}"
);
check("a Greek-only impossible request is blocked", classifyAgentRequest("φτιάξε μου μια εφαρμογή").verdict !== "supported");
check(
  "accents do not matter",
  classifyAgentRequest("φτιαξε μου μια εφαρμογη").verdict ===
    classifyAgentRequest("φτιάξε μου μια εφαρμογή").verdict
);
check(
  "final sigma does not matter",
  cap.normaliseForMatching("κώδικας") === cap.normaliseForMatching("κωδικασ")
);
check(
  "Greek connectives split clauses",
  classifyAgentRequest("στείλε μου τα νέα και φτιάξε μια εφαρμογή").verdict === "partial"
);

// ---------------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
