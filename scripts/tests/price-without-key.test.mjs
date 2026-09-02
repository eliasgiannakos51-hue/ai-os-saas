#!/usr/bin/env node
/*
 * DO WE QUOTE A PRICE, OR PROMISE A DELIVERY, FOR SOMETHING THAT CANNOT RUN?
 *
 * The sweep this comes from was prompted by one finding and named its
 * shape exactly: an `||` over two independent provider keys, or a price
 * rendered before availability was checked.
 *
 * WHAT STARTED IT. voice-settings.tsx computed
 *
 *     const configured = v.transcribeAvailable || v.speakAvailable || v.included;
 *
 * over two keys that have nothing to do with each other —
 * OPENAI_API_KEY drives transcription, ELEVENLABS_API_KEY drives speech.
 * An OR can only answer "is ANY of this on?", so a deployment with the
 * first and not the second showed
 *
 *     Having it read to you        25 credits a minute
 *
 * for a feature that could not read anything. Charging-shaped, and worse
 * than silence: silence is at least not a claim.
 *
 * WHAT THE SWEEP THEN FOUND, which was worse because it takes money.
 * An agent's DEFAULT delivery is email. The picker promised "your result
 * arrives at <address>"; the run charged credits; the send left from
 * Resend's shared test sender, which reaches the Resend account owner
 * and refuses everybody else; and the reader was told "The result was
 * not emailed (check your email settings)" — settings containing nothing
 * able to fix a missing environment variable.
 *
 * ------------------------------------------------------------------
 * WHY A REGISTRY, AND WHAT IT DOES NOT COVER
 * ------------------------------------------------------------------
 *
 * "Is this price gated on that key" is not decidable by pattern: the
 * gating happens through a context, a route field and a prop, and the
 * price is JSX several lines away. What IS checkable is that each
 * surface still consults the predicate that tells it the truth — so the
 * audit is written down, capability by capability, and goes red when a
 * surface stops asking.
 *
 * The list is the audit's result, not a guess: every entry below was
 * read. Entries marked with a `finding` were broken when this was
 * written; the rest were already right and are here so they stay that
 * way.
 *
 * NOT COVERED, and worth saying rather than implying otherwise: a NEW
 * capability nobody adds to this list is not checked by it. Section 3
 * is the backstop for the specific pattern that caused both findings.
 *
 * Run: node scripts/tests/price-without-key.test.mjs
 */
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const read = (f) => (existsSync(f) ? stripComments(readFileSync(f, "utf8")) : null);

// ---------------------------------------------------------------------
// THE AUDIT, capability by capability.
// ---------------------------------------------------------------------
const AUDIT = [
  {
    capability: "Voice — speaking to it (transcription)",
    envVar: "OPENAI_API_KEY",
    finding: "priced whenever EITHER voice key was present",
    surfaces: [
      { file: "src/components/settings/voice-settings.tsx", must: /v\.configured\.transcribe\s*\n?\s*\?\s*t\("perMinute"/ },
      { file: "src/components/voice/voice-input.tsx", must: /transcribeAvailable/ },
    ],
  },
  {
    capability: "Voice — having it read to you (speech)",
    envVar: "ELEVENLABS_API_KEY",
    finding: "the same, and this is the half that is off on this deployment",
    surfaces: [
      { file: "src/components/settings/voice-settings.tsx", must: /v\.configured\.speak\s*\n?\s*\?\s*t\("perMinute"/ },
      { file: "src/components/voice/voice-player.tsx", must: /speakAvailable/ },
    ],
  },
  {
    capability: "Agent results by email",
    envVar: "RESEND_FROM_EMAIL",
    finding: "promised delivery to an address it could not reach, and the run charged",
    surfaces: [
      { file: "src/app/api/delivery-channels/route.ts", must: /emailAvailable:\s*emailIsDeliverable\(\)/ },
      { file: "src/components/agents/delivery-picker.tsx", must: /emailAvailable\s*\?/ },
      { file: "src/lib/email/send-agent-emails.ts", must: /if \(!emailIsDeliverable\(\)\) return \{ sent: false, reason: "not_configured" \}/ },
      { file: "src/lib/agents/deliver.ts", must: /case "not_configured":/ },
    ],
  },
  {
    capability: "Notification emails",
    envVar: "RESEND_FROM_EMAIL",
    finding: null, // already right before the sweep
    surfaces: [
      { file: "src/app/api/notifications/channels/route.ts", must: /emailAvailable:\s*emailIsDeliverable\(\)/ },
      { file: "src/components/settings/notification-settings.tsx", must: /!emailAvailable && \(/ },
    ],
  },
  {
    capability: "Web push",
    envVar: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    finding: null,
    surfaces: [{ file: "src/components/settings/push-notification-settings.tsx", must: /t\("notConfigured"\)/ }],
  },
  {
    capability: "Paid add-ons",
    envVar: "STRIPE_PRICE_* (per add-on)",
    finding: null,
    // The best-shaped one in the app: it names the missing variable
    // rather than only withholding the price.
    surfaces: [{ file: "src/components/settings/addons-settings.tsx", must: /!addon\.available && addon\.notConfiguredVar/ }],
  },
];

console.log("== 1. every audited capability still consults its own availability ==");
let surfaceCount = 0;
for (const entry of AUDIT) {
  for (const s of entry.surfaces) {
    surfaceCount++;
    const src = read(s.file);
    check(
      `${entry.capability} — ${s.file.replace("src/", "")}`,
      src !== null && s.must.test(src),
      src === null ? "file is gone" : `no longer matches ${s.must}`
    );
  }
}
check(`the audit is not empty (${AUDIT.length} capabilities, ${surfaceCount} surfaces)`, AUDIT.length >= 6 && surfaceCount >= 10);

// ---------------------------------------------------------------------
console.log("\n== 2. the two capabilities with NO price, and no promise either ==");
// ---------------------------------------------------------------------
// Checked in the sweep and clean, recorded so a future change that
// starts charging for them has to come past this.
//
//   UNSPLASH_ACCESS_KEY — photos in generated sites. Nothing quotes a
//   photo price; without the key website-image-resolver.ts REMOVES the
//   placeholders rather than filling them with something unrelated, and
//   the website estimate's `imageCount` is the user's OWN uploaded
//   reference images, which cost tokens to read whether or not Unsplash
//   is configured.
//
//   Web search — priced from response.usage.server_tool_use
//   .web_search_requests, which is searches that ACTUALLY RAN. There is
//   no pre-quoted web-search charge to be wrong about.
const allTsx = ["src/components/website-builder/website-builder-workspace.tsx", "src/components/credits/cost-estimate.tsx"];
for (const f of allTsx) {
  const src = read(f) ?? "";
  check(`${f.replace("src/", "")} quotes no photo price`, !/unsplash/i.test(src));
}
const pricing = read("src/lib/billing/model-pricing.ts") ?? "";
check(
  "web searches are charged from measured usage, not a forecast",
  /server_tool_use\?\.web_search_requests/.test(pricing),
  "a pre-quoted search count would be a price for calls that may never happen"
);

// ---------------------------------------------------------------------
console.log("\n== 3. the pattern itself: an OR over two independent keys ==");
// ---------------------------------------------------------------------
// The backstop for capabilities nobody adds to the list above. It cannot
// tell which side of an OR is which key, so it does the checkable half:
// find every place two availability flags are collapsed into one, and
// require that the collapsed value is NOT what gates a price.
const ORED = [];
for (const f of [
  "src/components/settings/voice-settings.tsx",
  "src/components/settings/notification-settings.tsx",
  "src/components/settings/addons-settings.tsx",
  "src/components/agents/delivery-picker.tsx",
]) {
  const src = read(f);
  if (src === null) continue;
  for (const m of src.matchAll(/const (\w+) = ([^;\n]*(?:Available|onfigured)[^;\n]*\|\|[^;\n]*)/g)) {
    ORED.push({ file: f, name: m[1], expr: m[2].trim() });
  }
}
// voice-settings keeps ONE, deliberately: the "none of this is on at
// all" banner is a coarse question and an OR is the right answer to it.
// What it may not do is decide a price, which section 1 pins separately.
check(
  `the OR-over-keys pattern is where the audit says it is (${ORED.length})`,
  ORED.length === 1 && ORED[0].file.endsWith("voice-settings.tsx"),
  ORED.map((o) => `${o.file}: const ${o.name} = ${o.expr}`).join("\n        ")
);
if (ORED.length === 1) {
  const src = read(ORED[0].file) ?? "";
  const name = ORED[0].name;
  // The collapsed flag may gate the "nothing at all" message. It may not
  // appear in the same expression as a price.
  const gatesAPrice = new RegExp(`${name}[^\\n]{0,80}\\?[^\\n]{0,120}perMinute`).test(src);
  check(
    `the collapsed flag (\`${name}\`) does not gate a price`,
    !gatesAPrice,
    "this is precisely the bug: an OR over two keys deciding whether to quote a rate"
  );
}

console.log(`\n${failures.length === 0 ? "OK" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
