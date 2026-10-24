/*
 * THE APP BUILDER, HELD TO WHAT IT CLAIMS (the owner's "APPS:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-24).
 *
 * Run: node scripts/tests/apps-tool.test.mjs
 *
 * Section 1 runs the real parser and the real splice rather than reading
 * them: a definition's referential integrity is the whole safety story
 * of this tool (docs/APPS-ISOLATION.md §1), and a check that greps for
 * the word "collection" would pass over a parser that kept a screen
 * pointing at nothing.
 */
import { readFileSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const read = (p) => readFileSync(p, "utf8");
const plan = await loadTs("src/lib/apps/app-plan.ts");

console.log("== 1. the definition: a screen may not point at a collection that is not there ==");
{
  const whole = {
    title: "Κρατήσεις",
    collections: [
      { key: "bookings", label: "Ραντεβού", visibility: "own", fields: [{ key: "name", label: "Όνομα", type: "text", required: true }] },
      { key: "services", label: "Υπηρεσίες", visibility: "owner", fields: [{ key: "title", label: "Τίτλος", type: "text", required: true }] },
    ],
    screens: [
      { key: "book", label: "Κλείσε ραντεβού", kind: "form", collection: "bookings", role: "customer" },
      { key: "day", label: "Η μέρα μου", kind: "list", collection: "bookings", role: "owner" },
    ],
    notifications: [{ key: "new_booking", label: "Νέο ραντεβού", collection: "bookings", to: "owner" }],
  };
  const parsed = plan.parseDefinition(whole, "fallback");
  check("a whole plan parses", parsed.ok === true, parsed.ok ? "" : parsed.reason);
  check("...keeping both collections and both screens", parsed.ok && parsed.definition.collections.length === 2 && parsed.definition.screens.length === 2);

  const dangling = plan.parseDefinition({ ...whole, screens: [...whole.screens, { key: "ghost", label: "Φάντασμα", kind: "list", collection: "nothing_here", role: "owner" }] }, "f");
  check("a screen naming a collection that does not exist is dropped, not drawn empty", dangling.ok && dangling.definition.screens.every((s) => s.collection !== "nothing_here"));

  const noScreens = plan.parseDefinition({ ...whole, screens: [{ key: "ghost", label: "Φάντασμα", kind: "list", collection: "nope", role: "owner" }] }, "f");
  check("a plan whose every screen dangles is refused, not stored empty", noScreens.ok === false);

  // THE SCREEN HAS TO BE VALID, or this passes for the wrong reason.
  // With `screens: []` the parse refuses for having no screen, whatever
  // the collection does — apps-tool.mutation.mjs kept the empty
  // collection and the check stayed green.
  const noFields = plan.parseDefinition(
    { ...whole, collections: [{ key: "empty", label: "Άδειο", visibility: "owner", fields: [] }], screens: [{ key: "s", label: "Λίστα", kind: "list", collection: "empty", role: "owner" }] },
    "f"
  );
  check("a collection with no field is not a collection", noFields.ok === false);

  const emptyChoice = plan.parseDefinition(
    { ...whole, collections: [{ key: "bookings", label: "Ραντεβού", visibility: "own", fields: [{ key: "svc", label: "Υπηρεσία", type: "choice", required: true, options: [] }] }] },
    "f"
  );
  check("a choice with nothing to choose becomes a text field, not an empty dropdown", emptyChoice.ok && emptyChoice.definition.collections[0].fields[0].type === "text");

  const dupes = plan.parseDefinition(
    {
      ...whole,
      collections: [
        { key: "a", label: "Ίδιο", visibility: "owner", fields: [{ key: "f", label: "Πεδίο", type: "text", required: false }] },
        { key: "a", label: "Ίδιο", visibility: "owner", fields: [{ key: "f", label: "Πεδίο", type: "text", required: false }] },
      ],
      screens: [{ key: "s", label: "Λίστα", kind: "list", collection: "a", role: "owner" }],
    },
    "f"
  );
  check("two collections cannot share a key — the second is given its own", dupes.ok && new Set(dupes.definition.collections.map((c) => c.key)).size === dupes.definition.collections.length);

  const tooMany = plan.parseDefinition(
    {
      ...whole,
      collections: Array.from({ length: plan.MAX_COLLECTIONS + 4 }, (_, i) => ({ key: `c${i}`, label: `Σύνολο ${i}`, visibility: "owner", fields: [{ key: "f", label: "Πεδίο", type: "text", required: false }] })),
      screens: [{ key: "s", label: "Λίστα", kind: "list", collection: "c0", role: "owner" }],
    },
    "f"
  );
  check(`the cap holds (${plan.MAX_COLLECTIONS} collections)`, tooMany.ok && tooMany.definition.collections.length === plan.MAX_COLLECTIONS);

  const label = plan.parseDefinition({ ...whole, collections: [{ label: "Ώρα άφιξης", visibility: "owner", fields: [{ label: "Πότε", type: "time", required: true }] }], screens: [] }, "f");
  check("a Greek label becomes a key the rest of the system can use", label.ok === false || /^[a-z][a-z0-9_]*$/.test(label.definition.collections[0].key));
}

console.log("\n== 2. one box changed, the others byte-identical ==");
{
  const before = plan.parseDefinition(
    {
      title: "Κρατήσεις",
      collections: [
        // Two fields, not one, so a change that quietly drops a field
        // is visible to the access check below — with one field each,
        // `fields.slice(0, 1)` changes nothing and the mutant lived.
        {
          key: "bookings",
          label: "Ραντεβού",
          visibility: "own",
          fields: [
            { key: "name", label: "Όνομα", type: "text", required: true },
            { key: "when", label: "Πότε", type: "date", required: true },
          ],
        },
        { key: "services", label: "Υπηρεσίες", visibility: "owner", fields: [{ key: "title", label: "Τίτλος", type: "text", required: true }] },
      ],
      screens: [
        { key: "book", label: "Κλείσε ραντεβού", kind: "form", collection: "bookings", role: "customer" },
        { key: "day", label: "Η μέρα μου", kind: "list", collection: "bookings", role: "owner" },
      ],
      notifications: [{ key: "new_booking", label: "Νέο ραντεβού", collection: "bookings", to: "owner" }],
    },
    "f"
  ).definition;

  const notif = plan.spliceBox(before, "notifications", { notifications: [{ key: "new_booking", label: "Ήρθε ραντεβού", collection: "bookings", to: "owner" }] });
  check("the notifications box changed", notif.definition.notifications[0].label === "Ήρθε ραντεβού");
  check(
    "...and the data, screens and access boxes are byte-identical",
    JSON.stringify(notif.definition.collections) === JSON.stringify(before.collections) && JSON.stringify(notif.definition.screens) === JSON.stringify(before.screens)
  );

  const access = plan.spliceBox(before, "access", { collections: [{ key: "services", visibility: "own" }] });
  check("the access box changes only the visibility it names", access.definition.collections.find((c) => c.key === "services").visibility === "own");
  check("...leaving every field exactly as it was", JSON.stringify(access.definition.collections.map((c) => c.fields)) === JSON.stringify(before.collections.map((c) => c.fields)));
  check("...and inventing no collection from a key nobody has", plan.spliceBox(before, "access", { collections: [{ key: "ghost", visibility: "own" }] }).definition.collections.length === before.collections.length);

  // A collection is removed while another screen survives it — the case
  // where dropping is right. (Removing one that every screen uses is
  // refused outright, which the next check holds.)
  const withServicesScreen = plan.spliceBox(before, "screens", {
    screens: [...before.screens, { key: "price_list", label: "Τιμοκατάλογος", kind: "list", collection: "services", role: "owner" }],
  }).definition;
  const dropped = plan.spliceBox(withServicesScreen, "data", {
    collections: [{ key: "services", label: "Υπηρεσίες", visibility: "owner", fields: [{ key: "title", label: "Τίτλος", type: "text", required: true }] }],
  });
  check("removing a collection takes the screens that used it", dropped.definition.screens.every((s) => s.collection !== "bookings"));
  check("...and SAYS which ones, by name", dropped.dropped.includes("Κλείσε ραντεβού") && dropped.dropped.includes("Η μέρα μου"));
  check("...and the notification that used it goes too", dropped.definition.notifications.every((n) => n.collection !== "bookings"));
  check("...while the screen that did not use it stays", dropped.definition.screens.some((s) => s.key === "price_list"));

  const everything = plan.spliceBox(before, "data", {
    collections: [{ key: "other", label: "Άλλο", visibility: "owner", fields: [{ key: "f", label: "Πεδίο", type: "text", required: false }] }],
  });
  check("a change that would leave no screen at all is not applied", everything.definition === before);
  check("a slice with nothing usable changes nothing", plan.spliceBox(before, "screens", {}).definition === before);
}

console.log("\n== 3. the switch, and that it is not the tile's `ready` ==");
{
  const flags = read("src/lib/flags/flags.ts");
  check("the switch is declared", /"apps-tool":/.test(flags));
  const page = read("src/app/dashboard/app-builder/page.tsx");
  check("the page reads the switch", /isFeatureOn\("apps-tool"/.test(page));
  check("...and falls back to Coming Soon rather than nothing", /ComingSoonShell/.test(page));
  // THE CODE, NOT THE COMMENT. This used to be `!/all-tools/.test(page)`
  // and the page's own doc comment — which explains the rule — made it
  // red. What must be true is that the page IMPORTS nothing from
  // all-tools and reads no `ready`, which is what is asserted now.
  check("...independently of all-tools.ts's own `ready`", !/from "@\/lib\/nav\/all-tools"/.test(page) && !/\bready\b\s*[?:)]/.test(page));
  const allTools = read("src/lib/nav/all-tools.ts");
  check("the tile still says Σύντομα until every piece is done", /name: "apps".*\n?.*ready: false|href: "\/dashboard\/app-builder", ready: false/.test(allTools));

  for (const route of ["src/app/api/apps/route.ts", "src/app/api/apps/[id]/route.ts"]) {
    const src = read(route);
    check(`${route}: the switch gates it`, /isFeatureOn\("apps-tool"/.test(src));
    // The switch must be read BEFORE what was sent is judged, so a
    // half-built piece refuses before it parses a stranger's body.
    const flagAt = src.indexOf('isFeatureOn("apps-tool"');
    // THE USE, NOT THE IMPORT. The first mention of either name is the
    // import line at the top of the file, which is before everything
    // and would make this pass on any order at all.
    const validateAt = src.search(/\.length > MAX_APP_(?:DESCRIPTION|INSTRUCTION)_CHARS|if \(!isAppBoxKind\(/);
    check(`${route}: ...before what was sent is judged`, flagAt > 0 && validateAt > flagAt);
  }
}

console.log("\n== 4. the money: a price, a hold, a release, a settle — and approving costs nothing ==");
{
  const charge = read("src/lib/apps/charge.ts");
  check("one shared step prices before it holds", charge.indexOf("estimateForAction(") < charge.indexOf("reserveCredits("));
  check("...holds before it calls the model", charge.indexOf("reserveCredits(") < charge.indexOf("params.run("));
  check("...gives the hold back when the model never answered", /releaseReservation\(/.test(charge) && /kind === "aborted" \|\| outcome\.kind === "provider"/.test(charge));
  check("...and settles what was actually spent when it did", /settleReservation\(/.test(charge) && /feature,/.test(charge));
  check("the refusal when there are not enough credits comes before any hold", charge.indexOf("hasEnoughCredits(") < charge.indexOf("reserveCredits("));

  const one = read("src/app/api/apps/[id]/route.ts");
  const approveAt = one.indexOf('action === "approve"');
  const chargeAt = one.indexOf("chargedAppStep(");
  check("approving is answered before the paid path is reached", approveAt > 0 && chargeAt > approveAt);
  check("...and says so: nothing charged", /creditsCharged: 0/.test(one));

  const profiles = read("src/lib/billing/estimate.ts");
  check("both actions have their own profile", /appPlan: \{/.test(profiles) && /appBoxEdit: \{/.test(profiles));
  const margin = read("src/lib/billing/margin-policy.ts");
  check("both are mapped to a settlement feature", /appPlan: "app_generate"/.test(margin) && /appBoxEdit: "app_generate"/.test(margin));
  check("the router knows the feature's category", /app_generate:/.test(read("src/lib/ai/routing/categorize.ts")));
  check("...and its tier", /app_generate:/.test(read("src/lib/ai/routing/classify.ts")));
  check("no model name can reach the screen", !/claude-/.test(read("src/components/apps/apps-shell.tsx")));
}

console.log("\n== 5. the table, and everything that must know about it ==");
{
  const file = "supabase/migrations/20261030000000_user_apps.sql";
  check("the migration is there", existsSync(file));
  const sql = read(file);
  check("it says how to undo it", /--.*How to undo:/.test(sql));
  check("RLS is on", /enable row level security/.test(sql));
  check("the account reads only its own", /for select using \(auth\.uid\(\) = user_id\)/.test(sql));
  check("and cannot write the table at all", /revoke insert, update on public\.user_apps from anon, authenticated/.test(sql));
  check("a canary names this migration", read("src/lib/health/schema-canaries.ts").includes("20261030000000_user_apps.sql"));
  check("the GDPR registry carries the table", /table: "user_apps"/.test(read("src/lib/gdpr/user-data-registry.ts")));
  check("the catalogue claims both routes", /routes: \["apps", "apps\/\[id\]"\]/.test(read("src/lib/billing/feature-catalog.ts")));
}

console.log("\n== 6. the screen: four boxes, one field, and the plan approved before anything is built ==");
{
  const shell = read("src/components/apps/apps-shell.tsx");
  check("the four boxes are drawn from the one list, not written out again", /APP_BOX_KINDS\.map/.test(shell));
  check("pressing a box chooses it", /data-testid="app-box"/.test(shell) && /aria-pressed=\{box === kind\}/.test(shell));
  check("the chosen box is said under the field", /<ChosenBox/.test(shell));
  check("there is nothing to type into but the shell's own field", !/<textarea\b|<input\b/.test(shell));
  check("the approve button is there", /data-testid="app-approve"/.test(shell));
  check("...and goes away once approved", /data-testid="app-approved"/.test(shell));
  check("the price is shown before the press", /CostEstimateHint/.test(shell));
  check("...from the same two helpers the routes size their hold with", /boxInputChars\(/.test(shell) && /planInputChars\(/.test(shell));

  const messages = JSON.parse(read("messages/en.json"));
  const keys = ["empty.heading", "placeholder", "placeholderBox", "boxHint", "approve", "planned", "boxChanged", "boxChangedAndDropped", "errors.failed", "errors.notIncluded"];
  for (const locale of ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"]) {
    const m = JSON.parse(read(`messages/${locale}.json`));
    const at = (k) => k.split(".").reduce((o, part) => (o ?? {})[part], m.dashboard.appBuilder);
    check(`${locale}: the tool's own words are there`, keys.every((k) => typeof at(k) === "string" && at(k).length > 0));
    const boxes = m.dashboard.appBuilder.box;
    check(`${locale}: all four boxes are named`, ["data", "screens", "access", "notifications"].every((k) => typeof boxes?.[k] === "string" && boxes[k].length > 0));
  }
  check("the help tip says what it does NOT do", /payment|πληρωμ|Zahlung|pago|paiement|pagament|pagamento|款|支払|مدفوعات/i.test(messages.help.apps.doesNot));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
