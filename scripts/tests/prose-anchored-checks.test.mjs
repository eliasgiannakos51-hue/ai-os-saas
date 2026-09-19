// A CHECK WHOSE ONLY EVIDENCE IS A COMMENT.
//
// On 2026-09-19 the sidebar's gates all read src/lib/sidebar-nav.ts, the
// file the sidebar is built from, and all of them were green while the
// Run group showed a heading over nothing. The owner named the shape:
// "a gate that reads the same file as the feature checks nothing — it
// confirms that the file equals itself."
//
// scripts/scan-self-confirming-gates.mjs answers the general question in
// two halves. The census half is a heuristic and its own output says so
// (precision 0 of 8, recall 0 of 1). The half that is EXACT is this one:
// a regex tested against a source file, whose only match in that file is
// inside a COMMENT. There is no judgement in it. The check is being
// satisfied by prose today.
//
// Six were found that way and every one was settled by MUTATION, never
// by reading:
//
//   agent-depth           "a fill failure still creates the agent" was
//                         /NOT FATAL[\s\S]{0,300}logApiError/. Adding
//                         `throw err;` one line below that logApiError
//                         left it green. Now reads the catch block.
//   user-photos           "...and fails open" was the words "fails open"
//                         inside the catch. A `return;` beside them left
//                         it green. Now requires the block to be empty.
//   context-optimization  "...and judges blind" was the sentence about
//                         the judge. Now checks the three facts: the arms
//                         are swapped, the prompt names neither, the
//                         verdict is decoded back through the swap.
//   job-consumption x2    anchored on "THE MOMENT THE USER SEES IT" and
//                         "Explicit discard" as LOCATORS. The code half
//                         was real, so these were not vacuous — but
//                         rewording either comment reddened a gate about
//                         behaviour. Now anchored on the JSX and a testid.
//   research-reliability  the @function-limit marker is machine-read, not
//                         prose, so the anchor was legitimate — but it
//                         held a second copy of the build step's regex.
//                         Now runs applyToSource itself.
//
// And two were reports, not findings: gdpr-coverage and
// clarification-verdict both strip their source before testing it, and
// the scan was reading the raw file. It models both now.
//
// WHAT IS LEFT, AND WHY IT IS ALLOWED. One. A check may legitimately
// assert that a comment SAYS something — that is what comment-claims and
// roadmap-hidden are for. The rule here is that it must say so in its
// name, so nobody reads it as a guarantee about behaviour.
//
// Run: node scripts/tests/prose-anchored-checks.test.mjs
import { proseAnchoredPairs } from "../scan-self-confirming-gates.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

/** Each entry is a check that reads a comment ON PURPOSE, and the reason.
 *  A gate added to this list must name itself a documentation check, so
 *  that its output cannot be mistaken for a statement about behaviour. */
const ALLOWED = [
  {
    file: "context-optimization.test.mjs",
    target: "src/lib/ai/module-relevance.ts",
    body: "DEFAULT_SELECTION_CONFIG\\.enabled\\s*\\n \\* is false\\.",
    why:
      "labelled 'DOC, not behaviour' in its own check name. The guarantee it " +
      "describes — the selector is off by default — is proved by execution in " +
      "section 3 of the same gate, which calls resolveSelectionConfig() with the " +
      "flag unset, with 'true' and with 'on'.",
  },
];

const pairs = proseAnchoredPairs();
const codeShaped = pairs.filter((p) => p.proseOnly && p.codeish);

console.log(`== ${pairs.length} /regex/.test(fileSource) pairs across scripts/tests ==\n`);

ok("the scan still finds pairs at all",
  pairs.length > 800,
  `only ${pairs.length} — a resolver that resolves nothing would pass every check below`);
ok("...and still finds matches that are NOT prose-only",
  pairs.filter((p) => !p.proseOnly).length > 800);

console.log("\n== every code-shaped check anchored on a comment is a known one ==");
const key = (p) => `${p.file} :: ${p.target} :: ${p.body}`;
const allowedKeys = new Set(ALLOWED.map((a) => `${a.file} :: ${a.target} :: ${a.body}`));

for (const p of codeShaped) {
  ok(`${p.file} -> ${p.target}`, allowedKeys.has(key(p)),
    `/${p.body}/ matches ${p.target} only inside a comment. Settle it by MUTATION:\n` +
    "        break the thing the check claims to protect and require it to go red.\n" +
    "        If it stays green, re-anchor it on the code. If it is a documentation\n" +
    "        check on purpose, say so in its name and add it to ALLOWED here.");
}

console.log("\n== and every entry in ALLOWED is still there, so the list cannot go stale ==");
const foundKeys = new Set(codeShaped.map(key));
for (const a of ALLOWED) {
  const k = `${a.file} :: ${a.target} :: ${a.body}`;
  ok(`still allowed: ${a.file}`, foundKeys.has(k),
    "this entry no longer matches anything. The check was fixed or removed — delete the entry.");
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
