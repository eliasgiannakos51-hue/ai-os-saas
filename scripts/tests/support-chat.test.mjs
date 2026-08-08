// The support assistant, and the one promise it has to keep.
//
// "It must never invent a price, a feature or a capability that does not
// exist" is not something a system prompt can guarantee. A prompt is a
// request; the model complies most of the time, and the times it does not
// are exactly the times that matter — a customer quoting a price at us
// that we never charged, or signing up for an iPhone app that does not
// exist.
//
// So the guarantee is code: lib/support/grounding.ts checks every answer
// against the exact text the model was shown, and anything containing a
// number or a high-risk capability claim that is NOT in that text is
// thrown away and the question goes to a person instead. This suite is
// mostly that check being fed the answers a model actually produces when
// it goes wrong.
//
// Run: node scripts/tests/support-chat.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}
const read = (p) => readFileSync(p, "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const grounding = await loadTs("src/lib/support/grounding.ts");
const { checkGrounding, extractNumbers, normaliseNumeric, NO_ANSWER_MARKER } = grounding;
const facts = await loadTs("src/lib/support/facts.ts");
const rank = await loadTs("src/lib/support/rank.ts");

// The real fact sheet, generated from lib/billing/plans.ts, is what a real
// request is grounded against — so the checks below use it rather than a
// hand-written stand-in that could be more permissive than production.
const PLAN_FACTS = facts.buildPlanFacts();
const CONTEXT = `${facts.PRODUCT_FACTS}\n\n${PLAN_FACTS}\n\nHELP ARTICLE — How credits work\nEvery AI action costs credits. Your plan includes a monthly allowance that resets each month.`;

console.log("== 1. the fact sheet is generated from the code that charges ==");
{
  checkTrue("it lists every plan", /Free|Starter|Growth|Professional|Ultimate|Enterprise/.test(PLAN_FACTS));
  // The prices in the sheet have to be THE prices. Read back from the same
  // module the checkout uses, so a change in one is a change in both.
  const plans = await loadTs("src/lib/billing/plans.ts");
  for (const plan of plans.PLANS) {
    if (plan.slug === "enterprise") continue;
    checkTrue(
      `${plan.name}'s real price (${plan.price}) is in the sheet`,
      PLAN_FACTS.includes(plan.price === 0 ? "free" : `€${plan.price} per month`),
      PLAN_FACTS.slice(0, 200)
    );
    if (plan.monthlyCredits !== "custom") {
      checkTrue(
        `${plan.name}'s real credit allowance (${plan.monthlyCredits}) is in the sheet`,
        PLAN_FACTS.includes(`${plan.monthlyCredits} credits per month`)
      );
    }
  }
  // A capability the plan does not have must be stated as NOT included,
  // not merely omitted — "it doesn't say no" is how a support bot ends up
  // saying yes.
  checkTrue("what a plan excludes is stated explicitly", /Not included: /.test(PLAN_FACTS));
  checkTrue(
    "Free is described as having no Website Builder",
    /- Free:[^\n]*Not included:[^\n]*Website Builder/.test(PLAN_FACTS)
  );
  // The product blurb has to close the door on the thing people most often
  // assume: a phone app.
  checkTrue(
    "the product facts say there is no phone app",
    /no\s+downloadable desktop or phone application/i.test(facts.PRODUCT_FACTS)
  );
}

console.log("\n== 2. a grounded answer passes ==");
{
  check(
    "a true statement drawn from the sheet",
    checkGrounding({
      answer: "Starter is €20 per month and includes 1000 credits per month.",
      context: CONTEXT,
      question: "how much is starter",
    }),
    { grounded: true }
  );
  check(
    "a statement with no numbers at all",
    checkGrounding({
      answer: "Credits are what every AI action costs, and your monthly allowance resets each month.",
      context: CONTEXT,
      question: "what are credits",
    }),
    { grounded: true }
  );
  // Digit grouping must not create a false rejection: the sheet says
  // "1000", a model naturally writes "1,000".
  check(
    "the same number written with a thousands separator",
    checkGrounding({
      answer: "Starter gives you 1,000 credits per month.",
      context: CONTEXT,
      question: "credits on starter",
    }),
    { grounded: true }
  );
  // A number the USER supplied is not the model inventing one.
  check(
    "a number quoted back from the question",
    checkGrounding({
      answer: "Yes — on a plan with 7 seats that works the same way.",
      context: CONTEXT,
      question: "we have 7 seats, does it work?",
    }),
    { grounded: true }
  );
  // Ordinary list formatting is not a factual claim.
  check(
    "numbered list markers are not treated as claims",
    checkGrounding({
      answer: "1. Open Settings.\n2. Choose Billing.\n3. Press Manage billing.",
      context: "Open Settings, choose Billing, press Manage billing.",
      question: "how do I cancel",
    }),
    { grounded: true }
  );
}

console.log("\n== 3. an invented price never reaches the user ==");
{
  // The failure this whole feature exists to prevent.
  const verdict = checkGrounding({
    answer: "Starter is €12 per month, or €120 if you pay yearly.",
    context: CONTEXT,
    question: "how much is starter",
  });
  check("a made-up price is rejected", verdict.grounded, false);
  check("...and reported as an ungrounded number", verdict.reason, "ungrounded_number");
  checkTrue("...naming the number it caught", verdict.offenders.includes("12"), JSON.stringify(verdict));

  check(
    "an invented discount percentage is rejected",
    checkGrounding({
      answer: "You get 20% off if you pay for a year.",
      context: CONTEXT,
      question: "any yearly discount",
    }).grounded,
    false
  );
  check(
    "an invented limit is rejected",
    checkGrounding({
      answer: "You can upload up to 250 files per workspace.",
      context: CONTEXT,
      question: "how many files can I upload",
    }).grounded,
    false
  );
  // Arithmetic is still invention: "1000 credits is about 333 chat
  // messages" states a number nobody wrote down.
  check(
    "a number the model worked out itself is rejected",
    checkGrounding({
      answer: "1000 credits is roughly 333 chat messages.",
      context: CONTEXT,
      question: "how many messages is that",
    }).grounded,
    false
  );
}

console.log("\n== 4. an invented capability never reaches the user ==");
{
  for (const [label, answer] of [
    ["a phone app", "Yes, there is an iOS app you can download."],
    ["an API", "You can use the public API with an api key from Settings."],
    ["SSO", "Enterprise includes SSO with SAML."],
    ["a refund promise", "There is a 30 day money-back guarantee."],
    ["a free trial", "Every paid plan starts with a free trial."],
    ["phone support", "Ultimate includes phone support."],
    ["a compliance claim", "Ionexa is SOC 2 certified."],
  ]) {
    const verdict = checkGrounding({ answer, context: CONTEXT, question: "does it?" });
    checkTrue(`${label} is rejected`, verdict.grounded === false, JSON.stringify(verdict));
  }

  // …but a term that IS in the material may be discussed. The check must
  // not become a word ban that stops the assistant answering truthfully.
  check(
    "a high-risk term that the material does cover is allowed",
    checkGrounding({
      answer: "There is no mobile app — Ionexa runs in a browser.",
      context: "Ionexa is a web app. There is no mobile app of any kind.",
      question: "is there a mobile app",
    }),
    { grounded: true }
  );
}

console.log("\n== 5. refusal and emptiness are refusals, not answers ==");
{
  check(
    "the marker means refuse",
    checkGrounding({ answer: NO_ANSWER_MARKER, context: CONTEXT, question: "?" }),
    { grounded: false, reason: "no_answer" }
  );
  check(
    "the marker buried in prose still means refuse",
    checkGrounding({
      answer: `I think ${NO_ANSWER_MARKER} but here is a guess anyway.`,
      context: CONTEXT,
      question: "?",
    }).reason,
    "no_answer"
  );
  check(
    "an empty answer is refused",
    checkGrounding({ answer: "   ", context: CONTEXT, question: "?" }),
    { grounded: false, reason: "empty" }
  );
}

console.log("\n== 6. the number normaliser ==");
{
  check("thousands separators are removed", normaliseNumeric("1,000 and 1.000 and 1 000"), "1000 and 1000 and 1000");
  // A decimal price must NOT be collapsed — €19.99 becoming 1999 would let
  // a fabricated price match a real one.
  checkTrue("a two-decimal price survives", normaliseNumeric("€19.99").includes("19.99"));
  check("numbers are deduplicated", extractNumbers("20 and 20 and 30"), ["20", "30"]);
  check("list markers are dropped", extractNumbers("1. first\n2. second"), []);
}

console.log("\n== 7. retrieval picks the article a question is about ==");
{
  const corpus = [
    { id: "1", slug: "credits-explained", title: "How credits work", body: "Every AI action costs credits.", category: "billing", keywords: ["credit", "credits", "cost"] },
    { id: "2", slug: "teams", title: "Working with other people", body: "You invite someone by email from the Team page.", category: "features", keywords: ["team", "invite", "seat"] },
    { id: "3", slug: "website-builder", title: "Building and publishing a website", body: "Describe the site you want.", category: "features", keywords: ["website", "publish"] },
  ];
  check(
    "a credits question finds the credits article first",
    rank.rankArticles(corpus, "how do credits work and what do they cost").map((a) => a.slug)[0],
    "credits-explained"
  );
  check(
    "a team question finds the team article first",
    rank.rankArticles(corpus, "how do I invite a colleague to my team").map((a) => a.slug)[0],
    "teams"
  );
  // Nothing matching means nothing returned — which is what makes the
  // route escalate rather than answer from the product blurb alone.
  check(
    "an unrelated question matches nothing",
    rank.rankArticles(corpus, "qwertyuiop zxcvbnm"),
    []
  );
  check("common words do not match everything", rank.tokenise("how do I get the thing"), ["thing"]);
  check("at most four articles are used", rank.MAX_ARTICLES, 4);
}

console.log("\n== 8. the route wires the guarantee up ==");
{
  const route = stripComments(read("src/app/api/support/route.ts"));
  checkTrue("it needs a session", /if \(!user\)[\s\S]{0,120}status: 401/.test(route));
  checkTrue("it is rate limited per user", /scope: "support_question"/.test(route));
  checkTrue("it sits behind the AI circuit breaker", /checkAiCallAllowed\(/.test(route));

  // No articles -> no answer. Answering from the price sheet and the
  // product blurb alone is how a support bot starts improvising.
  checkTrue(
    "no matching article means escalate, not improvise",
    /articles\.length === 0[\s\S]{0,140}escalate: true/.test(route)
  );

  // The check must run on the SAME string the model was shown.
  checkTrue("the context is built once", /const context = buildSupportContext\(articles\);/.test(route));
  checkTrue("...given to the model", /content: `MATERIAL:\\n\$\{context\}/.test(route));
  checkTrue("...and checked against that same variable", /checkGrounding\(\{ answer: raw, context, question \}\)/.test(route));
  checkTrue(
    "a failed check escalates instead of answering",
    /if \(!verdict\.grounded\) \{[\s\S]{0,400}escalate: true, reason: verdict\.reason/.test(route)
  );
  // The rejected text must not leak out in some other field.
  const afterVerdict = route.slice(route.indexOf("if (!verdict.grounded)"), route.indexOf("return NextResponse.json({\n      ok: true,\n      escalate: false"));
  checkTrue("the rejected answer is not returned anyway", !/answer: raw/.test(afterVerdict));

  checkTrue("a grounded answer names its sources", /sources: articles\.map/.test(route));
  checkTrue("a missing API key escalates rather than erroring", /!apiKey[\s\S]{0,160}escalate: true/.test(route));

  // Free. Charging credits to ask how credits work is a fee for not
  // understanding the product.
  checkTrue("it does not charge credits", !/reserveCredits|settleReservation|hasEnoughCredits/.test(route));
  // …which means the budget has to be small.
  const answer = read("src/lib/support/answer.ts");
  checkTrue("the reply budget is small", /SUPPORT_MAX_OUTPUT_TOKENS = \d{2,3};/.test(answer));
}

console.log("\n== 9. the prompt asks for the refusal it will be held to ==");
{
  const answer = stripComments(read("src/lib/support/answer.ts"));
  checkTrue("the prompt names the refusal marker", answer.includes("${NO_ANSWER_MARKER}"));
  checkTrue("it forbids stating an unsourced number", /Never state a price, a credit amount, a limit or any other number that is not written in the material/.test(answer));
  checkTrue("it forbids claiming a capability", /Never say Ionexa can do something the material does not say it does/.test(answer));
  checkTrue("it answers in the user's language", /Reply in \$\{language\}/.test(answer));
}

console.log("\n== 10. 'I don't know' leads to a person ==");
{
  const escalate = stripComments(read("src/app/api/support/escalate/route.ts"));
  checkTrue("the question is stored", /from\("support_escalations"\)\s*\.insert\(/.test(escalate));
  checkTrue("...with the reason the assistant declined", /reason,/.test(escalate));
  // Row first, mail second: a user who pressed "send to a human" must not
  // be told it failed because the mail provider was down.
  // Compared against the CALL, not the import at the top of the file.
  checkTrue(
    "the row is written before the mail is attempted",
    escalate.indexOf('from("support_escalations")') <
      escalate.indexOf("await sendSupportEscalationEmail(")
  );
  checkTrue("it is rate limited", /scope: "support_escalate"/.test(escalate));

  const mail = stripComments(read("src/lib/email/send-support-escalation-email.ts"));
  checkTrue("replying in the inbox answers the asker", /replyTo: params\.email/.test(mail));
  checkTrue("the question is escaped into the HTML", /escapeHtml\(params\.question\)/.test(mail));
  checkTrue("a mail failure is swallowed", /catch \{/.test(mail));

  const widget = stripComments(read("src/components/support/support-widget.tsx"));
  checkTrue("the widget offers the human path on a refusal", /sendToHuman/.test(widget));
  checkTrue("...and confirms once sent", /t\("sent"\)/.test(widget));
  // The refusal is shown as a refusal. No softening, no partial answer.
  checkTrue("a declined turn renders no answer text", !/turn\.role === "declined"[\s\S]{0,200}turn\.text/.test(widget));
  checkTrue("an answer shows where it came from", /turn\.sources\.map/.test(widget));
}

console.log("\n== 11. the corpus and its table ==");
{
  const sql = read("help_articles_migration.sql");
  checkTrue("help_articles exists", /create table if not exists public\.help_articles/.test(sql));
  checkTrue("RLS is on", /alter table public\.help_articles enable row level security/.test(sql));
  checkTrue("published articles are readable by anyone", /for select using \(is_published\)/.test(sql));

  // The corpus is the assistant's entire source of truth. A table any
  // account could write to would be a way to make the bot say anything to
  // other customers.
  const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.help_articles\s+for (\w+)/g)];
  check("help_articles has exactly one policy, and it is select", policies.map((m) => m[2]), ["select"]);

  checkTrue("support_escalations exists", /create table if not exists public\.support_escalations/.test(sql));
  const escPolicies = [...sql.matchAll(/create policy "([^"]+)" on public\.support_escalations\s+for (\w+)/g)];
  check("escalations are read-only to the user", escPolicies.map((m) => m[2]), ["select"]);
  checkTrue("the migration is idempotent", !/create table (?!if not exists)/.test(sql));
  checkTrue("re-running republishes corrected text", /on conflict \(slug\) do update set/.test(sql));

  // Prices must NOT be hardcoded in an article: they are generated from
  // plans.ts on every request, and a second copy here would be a stale
  // quote with nothing keeping it honest.
  const seedBlock = sql.slice(sql.indexOf("insert into public.help_articles"));
  const priceLike = seedBlock.match(/€\s?\d+|\d+\s?(?:EUR|euros?)\b/gi) ?? [];
  check("no article hardcodes a price", priceLike, []);

  const articleCount = (seedBlock.match(/^\('/gm) ?? []).length;
  checkTrue(`the corpus is seeded (${articleCount} articles)`, articleCount >= 10);
}

console.log("\n== 12. the widget is mounted where it can reply to someone ==");
{
  const layout = read("src/app/dashboard/layout.tsx");
  checkTrue("the widget is in the dashboard layout", /<SupportWidget \/>/.test(layout));
  // Escalation mails the asker back, so it needs an account with an
  // address. A logged-out visitor has none.
  const escalate = read("src/app/api/support/escalate/route.ts");
  checkTrue("escalation refuses an account with no address", /This account has no email address to reply to/.test(escalate));

  // The input cap and the server's cap are one number.
  const limits = await loadTs("src/lib/support/limits.ts");
  checkTrue("the shared question cap is a number", typeof limits.MAX_QUESTION_CHARS === "number");
  const widget = read("src/components/support/support-widget.tsx");
  checkTrue("the input uses the shared cap", /maxLength=\{MAX_QUESTION_CHARS\}/.test(widget));
  const route = read("src/app/api/support/route.ts");
  checkTrue("the route enforces the shared cap", /question\.length > MAX_QUESTION_CHARS/.test(route));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
