/*
 * THE MUTATIONS THAT CHANGE ONLY PROSE, AND WHY EACH IS ALLOWED TO.
 *
 * A mutation suite exists to prove a gate is load-bearing: it puts a real
 * defect back and requires the gate to name it. A mutation that edits
 * only a comment usually proves nothing — the code is untouched, so a
 * gate going red on it is a gate reading prose.
 *
 * USUALLY. Some gates in this repository have prose as their SUBJECT, on
 * purpose: self-claims holds comment claims at zero, roadmap-hidden
 * requires the sentence that says why a route is not in the nav,
 * untrusted-boundaries reads a `// BOUNDARY-FORMAT:` declaration. For
 * those, a prose mutation is the only mutation there is.
 *
 * So the rule is not "no prose anchors". It is: a prose anchor is
 * declared here with its reason, or it does not exist — and
 * mutation-anchors.test.mjs checks the table both ways, so an entry
 * whose mutation has become a code change is as loud as an undeclared
 * prose mutation.
 *
 * `changed` is a fragment of the text the mutation actually alters, not
 * the whole anchor: the anchors are long and the fragments are what makes
 * an entry readable. It is matched as a substring, and the gate requires
 * at least eight characters so an entry cannot become a wildcard.
 */
export const PROSE_ANCHORS = {
  "context-optimization.mutation.mjs": {
    reason:
      "The measurement's header states what it did NOT measure — production traffic — and the " +
      "gate requires that sentence to survive. A measurement that quietly stops saying what it " +
      "left out is the shape CLAUDE.md records for i18n-coverage.",
    anchors: [{ file: "scripts/measure-context.mjs", changed: "NOT MEASURED:" }],
  },
  "count-claims.mutation.mjs": {
    reason:
      "A count claim IS prose — that is the whole problem it names — so a mutation restoring one " +
      "can only be a comment edit. Both here are the sentences the gate was written for: 'the 13 " +
      "business modules + ideas', which counted Ideas twice, and 'all 39 pages', which was true " +
      "when it was typed and is not now.",
    anchors: [
      { file: "src/app/api/create/top-modules/route.ts", changed: "Scoped to CLASSIFIER_MODULES only" },
      { file: "src/app/dashboard/layout.tsx", changed: "pages instead of 8, and the four components below" },
    ],
  },
  "help-tips.mutation.mjs": {
    reason:
      "The mutant inserts a COMMENTED-OUT <PageHeader /> as a cheap stand-in for a new page " +
      "gaining a header. That works because the gate's rule is textual — a page whose source " +
      "mentions PageHeader must carry a tip — and it is worth saying plainly that this proves " +
      "the rule fires, not that a real new page would be caught.",
    anchors: [{ file: "src/app/dashboard/chat/page.tsx", changed: "<PageHeader title=" }],
  },
  "message-slices.mutation.mjs": {
    reason:
      "The root layout carries the explanation of why its message catalogue cannot be trimmed " +
      "here. Delete the explanation and the next person redoes the optimisation that broke it; " +
      "the gate requires the sentence, so the mutation is the sentence.",
    anchors: [{ file: "src/app/layout.tsx", changed: "rendered once and REUSED" }],
  },
  "money-races.mutation.mjs": {
    reason:
      "Stripe's idempotency cache lasts 24 hours, and the checkout route writes that limitation " +
      "down beside the key. The gate's own words: a limit nobody wrote down is a limit somebody " +
      "rediscovers in production.",
    anchors: [{ file: "src/app/api/checkout/route.ts", changed: "silently no-op a customer" }],
  },
  "roadmap-hidden.mutation.mjs": {
    reason:
      "The roadmap link is out of the footer until V7.5 and the comment says so in Greek. A " +
      "gate that only checked the absence would go green on a deletion that nobody meant, so " +
      "it requires the sentence too — which makes the sentence mutable.",
    anchors: [{ file: "src/lib/footer-links.ts", changed: "Κρυμμένο μέχρι" }],
  },
  "rtl.mutation.mjs": {
    reason:
      "src/i18n/constants.ts used to say Arabic shipped without RTL layout. It does not any " +
      "more, and the gate requires the old denial to stay gone — a comment that outlived the " +
      "state it described is the exact defect this repository keeps finding.",
    anchors: [{ file: "src/i18n/constants.ts", changed: "ships text-only Arabic" }],
  },
  "self-claims.mutation.mjs": {
    reason:
      "Comments ARE this gate's subject. Every mutant here breaks a claim a comment makes — a " +
      "module that does not exist, a Run: header naming another suite, an allowlist entry that " +
      "outlived the comment it excused — so every anchor is prose by construction.",
    anchors: [
      { file: "src/lib/timeline.ts", changed: "truncateWithEllipsis, not slice" },
      { file: "scripts/tests/truncate.test.mjs", changed: "node scripts/tests/truncate.test.mjs" },
      { file: "scripts/tests/gate-vacuity.test.mjs", changed: "lib/admin.ts" },
      { file: "src/lib/module-icons.ts", changed: "/dashboard/business" },
    ],
  },
  "shape-names.mutation.mjs": {
    reason:
      "The same, for the shape catalogue: a comment naming a shape docs/shapes.md does not " +
      "define, and a SHAPE: header that stops matching its entry. Both are prose because both " +
      "are claims written in prose.",
    anchors: [
      { file: "scripts/tests/language-extremes.test.mjs", changed: "SHAPE: a technically-true" },
      { file: "src/lib/i18n/message-slices.ts", changed: "is how a number becomes comfortable" },
    ],
  },
  "untrusted-boundaries.mutation.mjs": {
    reason:
      "`// BOUNDARY-FORMAT: html` is a DECLARATION the gate reads — V5 #11's whole mechanism is " +
      "that a regex applied to model or user text must be declared in a comment at the top of " +
      "its file. Mutating the declaration is mutating the thing under test.",
    anchors: [{ file: "src/lib/seo/head.ts", changed: "BOUNDARY-FORMAT" }],
  },
};
