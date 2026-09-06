// A BUTTON THAT GOES SOMEWHERE, INSTEAD OF A SENTENCE TELLING YOU TO GO.
//
// When an answer says "for that, use the Code tool", the user is left to
// find the Code tool in a sidebar that is deliberately short. This holds
// the thing that closes that gap, and every clause here exists because
// the same feature can fail in a way that looks fine:
//
//   · A DESTINATION THAT IS NOT A PAGE. The whole safety model is that
//     the href comes from a closed list rather than from any text, so
//     every entry in that list has to be a route that exists AND a row
//     somebody could also have found by hand.
//   · A DETECTOR THAT FIRES ON EVERYTHING. "Here is the code you asked
//     for" is not an instruction to go anywhere. Precision is checked
//     with negatives, not asserted.
//   · A DETECTOR THAT FIRES ON NOTHING. A scan that finds no match
//     reports the same clean line whether the reader works or is broken,
//     so the positives are checked in six scripts — including the three
//     where a word boundary does not exist.
//   · A LABEL NOBODY TRANSLATED. The button is words; a key that
//     resolves in English only is an English button in ten languages,
//     which is the exact defect this round fixed in
//     lib/next-step-suggestions.ts.
//
// Run: node scripts/tests/transition-buttons.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const resolve = (locale, key) => key.split(".").reduce((o, p) => (o == null ? o : o[p]), messages[locale]);

// The real module, executed. A gate that read this file as text could not
// tell a working detector from a broken one.
const {
  TRANSITION_DESTINATIONS,
  TRANSITION_IDS,
  detectTransition,
  destinationById,
  hasActionCue,
  worthPaidDetection,
} = await loadTs(
  "src/lib/transitions/destinations.ts"
);

console.log("transition-buttons");

// ---------------------------------------------------------------------
console.log("\n== 1. every destination is a real, reachable page ==");
check(`the registry has destinations (${TRANSITION_DESTINATIONS.length})`, TRANSITION_DESTINATIONS.length >= 5);

const nav = stripComments(readFileSync("src/lib/sidebar-nav.ts", "utf8"));
// DRAWN, NOT MERELY PRESENT. Pointing at a page the sidebar hides is a
// button that teaches somebody nothing about where things live — they
// would never find it again on their own.
const drawnHrefs = new Set(
  [...nav.matchAll(/\{[^{}]*href:\s*"([^"]+)"[^{}]*\}/gs)]
    .filter((m) => !/hidden:\s*true/.test(m[0]))
    .map((m) => m[1])
);
check(`the sidebar's drawn rows were read (${drawnHrefs.size})`, drawnHrefs.size >= 15, [...drawnHrefs].join(", "));
const unreachable = TRANSITION_DESTINATIONS.filter((d) => !drawnHrefs.has(d.href));
check(
  "every destination is a row the sidebar actually draws",
  unreachable.length === 0,
  unreachable.map((d) => `${d.id} -> ${d.href}`).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. the label on every button is translated ==");
const missing = [];
for (const d of TRANSITION_DESTINATIONS) {
  if (!/^[a-z][\w]*(\.[\w]+)+$/.test(d.labelKey)) missing.push(`${d.id}: labelKey is not a dotted key`);
  for (const locale of LOCALES) {
    const value = resolve(locale, d.labelKey);
    if (typeof value !== "string" || value.length === 0) missing.push(`${locale}: ${d.labelKey}`);
  }
}
check(`every label resolves in all ten locales (${TRANSITION_DESTINATIONS.length} buttons)`, missing.length === 0, missing.join("\n        "));
// AND NOT THE ENGLISH ONE NINE TIMES. A key that exists in ten files with
// the English string in nine of them satisfies the check above and is the
// failure V5 item 5 names.
const untranslated = [];
for (const d of TRANSITION_DESTINATIONS) {
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    if (resolve(locale, d.labelKey) === resolve("en", d.labelKey)) untranslated.push(`${locale}: ${d.labelKey}`);
  }
}
check("...and none of them is the English string copied", untranslated.length === 0, untranslated.join(", "));

// ---------------------------------------------------------------------
console.log("\n== 3. it fires on a real suggestion, in six scripts ==");
// EVERY LANGUAGE FAMILY THE APP SHIPS, and the three at the end are the
// reason this section exists rather than one English case: a word
// boundary does not exist in Japanese or Chinese, and Arabic writes its
// article onto the noun. All three returned null on the first draft.
const POSITIVE = [
  ["en", "You can open the Code tool for that snippet.", "coding"],
  ["el", "Μπορείς να το κάνεις στον Κώδικα.", "coding"],
  ["de", "Du kannst den Website-Builder dafür nutzen.", "websiteBuilder"],
  ["fr", "Vous pouvez créer un agent pour cela.", "agents"],
  ["es", "Puedes usar el sitio web para eso.", "websiteBuilder"],
  ["ja", "コードはこちらで開けます。", "coding"],
  ["zh", "你可以打开代码工具试试。", "coding"],
  ["ar", "يمكنك استخدام أداة الشفرة لذلك.", "coding"],
];
const wrong = POSITIVE.filter(([, text, want]) => (detectTransition(text)?.id ?? null) !== want);
check(
  `a pointing sentence is placed in all ${POSITIVE.length} of them`,
  wrong.length === 0,
  wrong.map(([l, t, want]) => `${l}: wanted ${want}, got ${detectTransition(t)?.id ?? "null"} — ${t}`).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 4. and NOT on an answer that merely mentions the word ==");
// THE TWO-CUE RULE, WHICH IS THE ONLY THING KEEPING THIS QUIET. A topic
// word alone is not a suggestion; every negative below contains one.
const NEGATIVE = [
  "Here is the code you asked for: const x = 1;",
  "The research shows revenue grew 12% last quarter.",
  "Ο κώδικας που ζήτησες είναι παρακάτω.",
  "这是你要的代码。",
  "",
  "code",
];
const noisy = NEGATIVE.filter((t) => detectTransition(t) !== null);
check(
  `no button under an answer that only mentions the topic (${NEGATIVE.length} cases)`,
  noisy.length === 0,
  noisy.map((t) => `${t} -> ${detectTransition(t)?.id}`).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 5. the id can only ever come from the closed list ==");
check("an unknown id resolves to nothing", destinationById("../../etc/passwd") === null);
check("...and so does an empty one", destinationById("") === null);
check(
  `every id in the list resolves to itself (${TRANSITION_IDS.length})`,
  TRANSITION_IDS.length > 0 && TRANSITION_IDS.every((id) => destinationById(id)?.id === id)
);
// NO HREF IS EVER BUILT FROM TEXT. The safety model is one line, so it is
// checked as one line rather than described.
const src = stripComments(readFileSync("src/lib/transitions/destinations.ts", "utf8"));
check(
  "no href in the detector is assembled at runtime",
  !/href:\s*`/.test(src) && !/href:\s*[\w.]+\s*\+/.test(src),
  "a template or a concatenation here would be a destination the closed list never approved"
);

// ---------------------------------------------------------------------
console.log("\n== 6. one button, and it navigates ==");
const button = stripComments(readFileSync("src/components/transitions/transition-button.tsx", "utf8"));
check("the component renders at most one destination", !/\.map\(/.test(button));
// A LINK, AND THE ONLY REQUEST IT MAY MAKE IS THE ONE THAT COUNTS IT.
//
// This clause was `!/fetch\(/` — no request of any kind — which was right
// while the button did nothing but navigate and wrong the moment it
// started recording what happened to it. The rule it was reaching for is
// that the button must not DO the destination's work: it opens a page,
// it does not create, send or spend. So the ban is on every endpoint
// except the recorder, which is stricter in the way that matters and
// does not have to be relaxed again the next time telemetry moves.
const ALLOWED_ENDPOINTS = ["/api/transitions/record", "/api/transitions/detect"];
const fetched = [...button.matchAll(/fetch\(\s*"([^"]+)"/g)].map((m) => m[1]);
// A FLOOR FIRST, because `.every()` over an empty list is true. A button
// that stopped calling anything would satisfy "calls only its own two
// endpoints" perfectly — and would also have stopped recording that it
// was shown, which is the measurement half of this whole feature.
// gate-vacuity.test.mjs named this exact line.
// COUNTED, NOT `.every()`-ED, and gate-vacuity is the reason: `.every()`
// over an empty list is true, so a button that stopped calling anything
// at all would satisfy "calls only its own two endpoints" perfectly —
// and would also have stopped recording that it was shown, which is the
// measurement half of this whole feature.
const missingEndpoints = ALLOWED_ENDPOINTS.filter((url) => !fetched.includes(url));
const foreignEndpoints = fetched.filter((url) => !ALLOWED_ENDPOINTS.includes(url));
// THE FLOOR ON THE SOURCE, NOT ONLY ON THE RESULT. `missingEndpoints` is
// derived from ALLOWED_ENDPOINTS, so emptying THAT list would make this
// check pass while the button called nothing anyone had approved — the
// floor belongs where the list comes from, and gate-vacuity.test.mjs
// traced it there rather than accepting the one on `fetched`.
check(
  `it calls both of its own endpoints (${fetched.length} found: ${fetched.join(", ") || "none"})`,
  ALLOWED_ENDPOINTS.length >= 2 && fetched.length >= 2 && missingEndpoints.length === 0,
  `missing: ${missingEndpoints.join(", ") || "none"}`
);
check(
  "...and nothing else — it is a Link, not a form and not a client for anything",
  /<Link\b/.test(button) && !/<form/.test(button) && fetched.length >= 2 && foreignEndpoints.length === 0,
  foreignEndpoints.join(", ")
);
check("the label goes through a translator", /\{t\(destination\.labelKey\)\}/.test(button));
check(
  "it can be dismissed",
  /setDismissed\(true\)/.test(button) && /dismissed\) return null/.test(button)
);
// THE THREE EVENTS, AND THE GUARD ON THE DENOMINATOR. `dismissed / shown`
// is only a rate if `shown` counts BUTTONS. React re-renders this
// component on every parent state change, so an unguarded record() in a
// render would count keystrokes and make the dismissal rate look tiny for
// a reason that has nothing to do with any user.
for (const outcome of ["shown", "taken", "dismissed"]) {
  check(
    `it records "${outcome}", with the source that produced it`,
    new RegExp(`record\\(destination\\.id, source, "${outcome}"\\)`).test(button)
  );
}
check(
  "...and `shown` is recorded once per destination, not once per render",
  /recordedFor\.current === destination\.id/.test(button) && /recordedFor\.current = destination\.id/.test(button),
  "without the guard the denominator counts renders"
);
check(
  "...with keepalive, because `taken` fires on a click that navigates away",
  /keepalive: true/.test(button)
);
check(
  "...and recording never blocks the button",
  /\.catch\(\(\) => \{\}\)/.test(button),
  "a suggestion that fails to render because telemetry is slow is a worse feature than one nobody can measure"
);

// AND IT IS WIRED. A perfect component nobody renders is the same as no
// component, and this project has shipped exactly that before.
const workspace = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check(
  "the chat renders it on the finished answer",
  /<TransitionButton text=\{msg\.content\}/.test(workspace),
  "not wired into chat-workspace.tsx"
);
check(
  "...and never on the one still streaming",
  !/<TransitionButton text=\{streamingText\}/.test(workspace),
  "half a sentence points nowhere"
);

// ---------------------------------------------------------------------
console.log("\n== 7. the paid detector only runs when the free one failed ==");
// EVERY GUARD IS CHECKED, because each one on its own is the difference
// between a feature that costs a fraction of a credit occasionally and
// one that costs a credit on every answer in the product.
check(
  "it does not ask when the free reader already placed the answer",
  /if \(free \|\|/.test(button),
  "the free result must short-circuit the request"
);
// THE FLOOR IS SHARED WITH THE ROUTE AND IS SCRIPT-AWARE. It was a flat
// forty characters in the component, which is a short English sentence
// and a whole Japanese one — the same defect detectTransition's own floor
// had, one layer up, and it silently disabled the paid path in two
// languages. One exported function now, called by both.
check(
  "...nor for an answer too short to be worth a credit",
  /worthPaidDetection\(text\)/.test(button),
  "the floor must be the shared, script-aware one — not a character count in this file"
);
check(
  "...and the route applies the same floor rather than a second one",
  /worthPaidDetection\(answer\)/.test(stripComments(readFileSync("src/app/api/transitions/detect/route.ts", "utf8"))),
  "two floors are two floors that drift"
);
check(
  "...nor for an answer that points nowhere at all",
  /!hasActionCue\(text\)/.test(button),
  "an answer with no pointing cue has nothing for a model to find either"
);
check(
  "...and never twice for the same text",
  /askedFor\.current === text/.test(button) && /askedFor\.current = text/.test(button)
);
check(
  "the response is validated against the closed list on this side too",
  /destinationById\(data\.destination\)/.test(button),
  "a component that trusted a response body is one change from rendering a link the list never approved"
);

const route = stripComments(readFileSync("src/app/api/transitions/detect/route.ts", "utf8"));
// THE PRECONDITION IS ENFORCED SERVER-SIDE, NOT TRUSTED FROM THE CALLER.
check(
  "the route runs the free reader itself and charges nothing when it places the answer",
  /const free = detectTransition\(answer\);/.test(route) && /source: "offline"/.test(route),
  "a hand-written POST could otherwise make this cost money the free path would have saved"
);
// A CALL, NOT AN IMPORT — and this clause was written the wrong way
// first. `indexOf("reserveCredits")` finds the IMPORT at the top of the
// file, which is before everything, so the ordering check compared the
// free reader against line 20 and failed on a route that has the order
// right. sidebar-naming.test.mjs carries the same lesson about
// `runCompletion`: requiring the open paren is what distinguishes the
// call site from the name.
check(
  "...before any credit is reserved",
  route.indexOf("detectTransition(answer)") < route.indexOf("reserveCredits("),
  "the free check must come first in the file, not merely exist in it"
);
for (const [what, needle] of [
  ["it reserves", /reserveCredits\(/],
  ["it settles", /settleReservation\(/],
  ["it releases on failure", /releaseReservation\(/],
  ["it is behind the circuit breaker", /checkAiCallAllowed\(/],
  ["it is rate limited", /checkRateLimit\(/],
  ["it respects the bypass ceiling", /checkBypassCeiling\(/],
]) {
  check(`${what}`, needle.test(route));
}
// THE ENUM IS A REQUEST, NOT A GUARANTEE.
check(
  "the model's answer is put back through the closed list",
  /destinationById\(raw\.destination\)/.test(route)
);
check(
  "...and a hedged answer produces no button",
  /raw\.confident === true/.test(route),
  "a false button costs more than a missing one"
);

// NEITHER ROUTE MAY ANSWER WITH AN ENGLISH SENTENCE, and this clause is
// here because the first draft of both of them did. Six strings —
// "Unknown destination.", "Not authenticated.", "ANTHROPIC_API_KEY is not
// configured on the server." and three more — went in under comments that
// cited api/nav/track, which returns a bare status for exactly this case
// and writes out why. i18n-coverage.test.mjs caught all six (661 against a
// baseline of 655) and the fix was to delete them, not to raise the
// number: nothing renders either body. record()'s caller discards the
// response entirely; the detect effect reads `destination` and `source`.
//
// THE SAME REGEX i18n-coverage USES, on purpose. A near-miss copy here
// would pass on a shape that gate still counts, and then the ratchet is
// the thing that finds it — one gate later, with the reason lost.
const PROSE_IN_A_BODY = /error: "[A-Z][^"]{8,}"/g;
const transitionRoutes = ["src/app/api/transitions/detect/route.ts", "src/app/api/transitions/record/route.ts"];
const prose = transitionRoutes.flatMap((f) =>
  [...stripComments(readFileSync(f, "utf8")).matchAll(PROSE_IN_A_BODY)].map((m) => `${f}: ${m[0]}`)
);
check(
  `the two routes scanned for prose are both here (${transitionRoutes.length})`,
  transitionRoutes.length === 2 && transitionRoutes.every((f) => existsSync(f)),
  "a list that shrank to nothing would pass this silently"
);
check(
  `neither transition route answers with an English sentence (${prose.length} found)`,
  prose.length === 0,
  prose.join(" | ") || "codes, not prose: a body no reader ever sees"
);
// AND THE CODES ARE ACTUALLY THERE — the deletion could have left a bare
// `{ok:false}`, which loses the one thing a curl needed from the sentence:
// which of two 400s it hit.
//
// COUNTED PER REFUSAL, NOT AS A TOTAL, because the first version of this
// clause asked for "at least 4 distinct codes" while five existed — a
// floor set one below the number it was measuring, which is the shape
// CLAUDE.md records as "a check whose baseline is the size of the
// problem". Its own mutation walked straight through it: delete one code
// of five and four remain. What must hold is that EVERY non-200 says why,
// so that is what is asked.
const REFUSAL = /NextResponse\.json\(\s*(\{[^}]*\})\s*,\s*\{\s*status:\s*(\d{3})/g;
const refusals = transitionRoutes.flatMap((f) =>
  [...stripComments(readFileSync(f, "utf8")).matchAll(REFUSAL)].map((m) => ({
    file: f,
    body: m[1],
    status: Number(m[2]),
  }))
);
const silentRefusals = refusals.filter((r) => !/reason: "[a-z_]{4,}"/.test(r.body));
check(
  `every non-200 reply in the two routes was found (${refusals.length}) and none is a bare status`,
  refusals.length >= 5 && silentRefusals.length === 0,
  silentRefusals.map((r) => `${r.file} ${r.status}: ${r.body}`).join(" | ") ||
    "api/websites/edit's `reason` shape, which the client can branch on and no translator has to touch"
);
// AND DISTINCT, so two different refusals cannot answer with the same
// word — which would make the code as useless as the bare status.
const codes = refusals.map((r) => (r.body.match(/reason: "([a-z_]{4,})"/) ?? [])[1]).filter(Boolean);
const perFile = transitionRoutes.map(
  (f) => new Set(refusals.filter((r) => r.file === f && /reason:/.test(r.body)).map((r) => r.body.match(/reason: "([a-z_]+)"/)[1])).size
);
check(
  `...with a different code per refusal in each route (${perFile.join(" + ")} = ${codes.length})`,
  perFile.every((n, i) => n === refusals.filter((r) => r.file === transitionRoutes[i]).length),
  `codes: ${codes.join(", ")}`
);
// THE PROMPT SAYS THE JUDGEMENT IS LANGUAGE-INDEPENDENT, AND NAMES THE
// SCRIPTS. The free reader had to be fixed three times for exactly this,
// so a prompt that only ever demonstrated English would be the same
// defect one layer up.
const prompt = readFileSync("src/app/api/transitions/detect/route.ts", "utf8");
check(
  "the prompt tells the model the language does not matter",
  /THE LANGUAGE OF THE ANSWER DOES NOT MATTER/.test(prompt)
);
check(
  "...and names all ten, with an example in a script that has no word boundaries",
  ["English", "Greek", "Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese", "Arabic"].every(
    (l) => prompt.includes(l)
  ) && /コード/.test(prompt)
);

// ---------------------------------------------------------------------
console.log("\n== 8. how often the paid detector fires, as a number ==");
// THE QUESTION THAT WAS ASKED WHEN THE PAID HALF WAS APPROVED, answered
// here rather than in a document, so it is a number that MOVES when
// somebody widens a cue list rather than a sentence somebody has to
// remember to re-check.
//
// A CORPUS OF ANSWER SHAPES, in the proportions a chat product really
// produces and in the languages this app ships. Each row declares which
// of the three outcomes it must reach, so a change that quietly starts
// charging for plain factual answers fails on the row rather than on the
// ratio.
const CORPUS = [
  // Plain factual answers — the bulk of any chat. No cue, no request.
  ["silent", "Your revenue last quarter was 42,300 EUR, up 12% on the quarter before."],
  ["silent", "Τα έσοδα του τριμήνου ήταν 42.300 €, αυξημένα κατά 12%."],
  ["silent", "MRR is the recurring part of revenue: subscriptions, not one-off sales."],
  ["silent", "Il margine lordo è la differenza fra ricavi e costo del venduto."],
  ["silent", "上季度的收入是 42,300 欧元，同比增长 12%。"],
  ["silent", "先月の解約率は 3.2% でした。"],
  ["silent", "معدل التحويل هو نسبة الزوار الذين أتموا عملية شراء."],
  ["silent", "Here is the code you asked for:\n\nconst total = items.reduce((a, b) => a + b, 0);"],
  ["silent", "Der Deckungsbeitrag ist der Umsatz abzüglich der variablen Kosten."],
  ["silent", "No, this product does not connect to your bank account."],
  // THE ONE THAT GREW A BUTTON. "in the" was a pointing cue, and it is in
  // almost every English sentence ever written.
  ["silent", "The research shows that most churn happens in the first 30 days."],
  ["silent", "Το ποσοστό μετατροπής σου είναι 2,4% — κάτω από τον μέσο όρο του κλάδου."],
  // Pointing, and the free reader places it — this must stay free.
  ["free", "You can open the Code tool for that snippet."],
  ["free", "Μπορείς να το κάνεις στον Κώδικα."],
  ["free", "Try the Website Builder to make that landing page."],
  ["free", "Du kannst den Website-Builder dafür nutzen."],
  ["free", "Vous pouvez créer un agent pour cela."],
  ["free", "コードはこちらで開けます。"],
  ["free", "你可以打开代码工具试试。"],
  ["free", "يمكنك استخدام أداة الشفرة لذلك."],
  ["free", "Puedes usar el sitio web para eso."],
  // Paraphrased suggestions — the free reader cannot place them, and
  // this is exactly what the paid half was approved for. Four of these
  // five never reached the model until hasActionCue stopped being a copy
  // of pointsSomewhere.
  ["paid", "That sort of repeating job is better handled by something that runs on a schedule for you."],
  ["paid", "Αυτό θα το έκανε καλύτερα κάτι που τρέχει μόνο του κάθε εβδομάδα."],
  ["paid", "You might want a small worker that checks this every morning and mails you."],
  ["paid", "Für so etwas gibt es hier eine bessere Stelle als den Chat."],
  // 30 characters, and a flat 40-character floor threw it away.
  ["paid", "毎朝これを確認して知らせてくれる仕組みを用意できます。"],
  // Pointing somewhere this app has no destination for. The model is
  // asked and answers "none" — cheap, and the honest outcome.
  ["paid", "You should probably ring your accountant about that one."],
  ["paid", "Μπορείς να ρωτήσεις τον λογιστή σου γι' αυτό."],
  ["paid", "You can check that in your bank's own app."],
];
const outcomeOf = (text) => {
  if (detectTransition(text)) return "free";
  return hasActionCue(text) && worthPaidDetection(text) ? "paid" : "silent";
};
const misrouted = CORPUS.filter(([want, text]) => outcomeOf(text) !== want);
check(
  `every one of the ${CORPUS.length} answers reaches the outcome it declares`,
  misrouted.length === 0,
  misrouted.map(([want, text]) => `wanted ${want}, got ${outcomeOf(text)} — ${text.slice(0, 60)}`).join("\n        ")
);
const counts = { free: 0, paid: 0, silent: 0 };
for (const [, text] of CORPUS) counts[outcomeOf(text)]++;
const requests = counts.free + counts.paid;
console.log(
  `        free ${counts.free} · paid ${counts.paid} · silent ${counts.silent}  —  the paid detector is ${Math.round(
    (counts.paid / requests) * 100
  )}% of the ${requests} answers that place anything at all`
);
// NOT A CEILING ON THE RATIO — a floor under the two things that make it
// meaningful. A corpus that stopped producing paid cases would report a
// beautiful 0% and prove nothing, and one that stopped producing free
// cases would mean the free reader had died.
check(`the corpus still produces free placements (${counts.free})`, counts.free >= 8);
check(`...and paid ones (${counts.paid})`, counts.paid >= 5);
check(
  `...and most answers cost nothing at all (${counts.silent} of ${CORPUS.length} silent)`,
  counts.silent >= CORPUS.length / 3,
  "if a plain factual answer starts reaching the model, this feature costs a credit per message"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
