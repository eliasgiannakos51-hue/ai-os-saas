#!/usr/bin/env node
/*
 * THE PRICING PAGE SAYS ONLY WHAT HAPPENS TODAY.
 *
 * The owner's decision, NEEDS 31 (2026-10-05): «Έως N βοηθούς»,
 * «συνεργασία ομάδας» and «Automation Builder» are written as they really
 * are, or removed; nothing a customer has is taken away; no price or
 * credit changes. So the limits in lib/billing/plans.ts are untouched and
 * only the sentences move. What each sentence was, and what the code does:
 *
 *   agents      a scheduled agent that searches the web and emails the
 *               result (lib/agents), out of the menu — never "AI agents
 *               & teams"
 *   team        a member gets the owner's TIER on their own account
 *               (api/team/invite); nothing in the workspace is shared
 *   automation  one sentence that runs once a day; no builder exists
 *   modules     13 record lists, every one still reachable from My records
 *               (lib/modules.ts NAV_ITEMS) — the count is read from there
 *
 * Run: node scripts/tests/pricing-promises.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

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

const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const msgs = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const strings = (node) =>
  typeof node === "string" ? [node] : node && typeof node === "object" ? Object.values(node).flatMap(strings) : [];

console.log("== 0. the population ==");
check(`the locales scan found ${LOCALES.length}`, LOCALES.length >= 10);
const en = msgs.en.pricing;
const agentKeys = Object.keys(en.features).filter((k) => /^upTo\d+AiAgents/.test(k));
check(`the agent feature lines were found (${agentKeys.length})`, agentKeys.length >= 5, agentKeys.join(", "));

console.log("\n== 1. agents: what they are, in every locale ==");
check(
  "in English every agent line says what an agent does: a scheduled web search",
  agentKeys.every((k) => /scheduled web-research agents/.test(en.features[k])),
  agentKeys.map((k) => en.features[k]).join(" | "),
);
const teamsClaim = LOCALES.flatMap((l) => agentKeys.filter((k) => /&/.test(msgs[l].pricing.features[k])).map((k) => `${l}:${k}`));
check("no locale sells agent \"teams\" that do not exist", teamsClaim.length === 0, teamsClaim.join(", "));
check("the comparison row is named the same way", /web-research/.test(en.rows.aiAgents), en.rows.aiAgents);

console.log("\n== 2. no Automation Builder, anywhere on the page ==");
const builder = LOCALES.flatMap((l) => strings(msgs[l].pricing).filter((s) => /Automation Builder/.test(s)).map(() => l));
check("no locale's pricing text names an Automation Builder", builder.length === 0, [...new Set(builder)].join(", "));
check("the plan line says what automation is", /automations that run once a day/.test(en.features.websiteAutomationBuilderAccess));

console.log("\n== 3. team: the plan, on their own account, and nothing shared ==");
for (const k of ["teamBannerBody", "businessExplanation", "businessCardDescription", "businessFeatureFullAccess"]) {
  check(`${k} says each member is on their own account`, /own account/.test(en[k]), en[k]);
}
for (const k of ["teamBannerBody", "businessExplanation"]) {
  check(`${k} says work is not shared yet`, /not shared/.test(en[k]), en[k]);
}
const workspace = strings(en).filter((s) => /inside your workspace|full access/i.test(s));
check("no English pricing text promises access inside the owner's workspace", workspace.length === 0, workspace.join(" | "));
check("the Greek banner says the same", /στον δικό του λογαριασμό/.test(msgs.el.pricing.teamBannerBody) && !/μέσα στον χώρο εργασίας/.test(msgs.el.pricing.teamBannerBody));
check("the team card no longer says any plan can be a team's base", !/any plan/.test(en.businessCardDescription), en.businessCardDescription);

console.log("\n== 4. the record lists are counted from the code ==");
const modules = readFileSync("src/lib/modules.ts", "utf8");
const modBlock = modules.slice(modules.indexOf("export const MODULES"), modules.indexOf("export function getModule"));
const navBlock = modules.slice(modules.indexOf("export const NAV_ITEMS"), modules.indexOf("export const CREATE_NAV_ITEM"));
const moduleCount = (modBlock.match(/^\s{4}slug: "/gm) ?? []).length;
const extraNav = (navBlock.match(/\{ href: "/g) ?? []).length;
check("MODULES and the extra hub entries were read", moduleCount >= 10 && extraNav >= 1, `${moduleCount} + ${extraNav}`);
const listCount = moduleCount + (navBlock.includes("...MODULES.map") ? extraNav : 0);
const wrongCount = LOCALES.filter((l) => !String(msgs[l].roadmap.items.modules.title).includes(String(listCount)));
check(`every locale's roadmap names ${listCount} record lists, the number the hub serves`, wrongCount.length === 0, wrongCount.join(", "));

console.log("\n== 5. Create Studio is named for what it does ==");
check("the comparison row no longer says \"anything\"", !/anything/i.test(en.rows.createStudio), en.rows.createStudio);
check("...in Greek either", !/Φτιάξε κάτι/.test(msgs.el.pricing.rows.createStudio), msgs.el.pricing.rows.createStudio);

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
