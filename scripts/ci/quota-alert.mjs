#!/usr/bin/env node
// THE 80%-OF-QUOTA ALERT the owner asked for in Βήμα 2 (CI for a private
// repository, 2026-10-21): once the repo is private, GitHub Actions
// minutes are a CAPPED, PAID resource, and a measurement taken BY HAND
// that day against the run history (docs/PROGRESS.md, 2026-10-21 —
// dated rather than re-derivable, because it reads GitHub's run list
// over a trailing window, not something this repository's own code
// produces) found roughly 28,500 minutes burned in the trailing month
// against a free quota of 2,000 — about 14x over, driven mainly by
// `push` and `pull_request` both re-running the same hour-long job for
// the same commit (the fast/heavy split below this file's comment
// points at is the fix for that specific waste). This script is the
// STANDING version of that question: it asks GitHub's own billing
// endpoint on a schedule, not a one-off count by hand.
//
// WHY THIS NEEDS A SEPARATE SECRET. The GITHUB_TOKEN every job already
// gets is scoped to the repository and cannot read account billing —
// GitHub's billing endpoints
// (/users/{username}/settings/billing/actions,
// /orgs/{org}/settings/billing/actions) take a personal access token
// belonging to the ACCOUNT, full stop. There is no narrower token that
// works. ACTIONS_BILLING_PAT is a classic PAT the owner creates once,
// under Settings -> Developer settings -> Personal access tokens, and
// stores as a repository secret — it needs no extra scope beyond being
// authenticated as that account.
//
// A MISSING SECRET FAILS LOUDLY, the same choice bot-on-deploy made for
// BOT_EMAIL/BOT_PASSWORD: a job that quietly skips because a secret is
// absent produces a green tick that says nothing was measured, which
// looks exactly like "usage is fine". Red until it is set is the honest
// state, and this job runs only on the nightly schedule — never on a
// push — so a missing secret costs one red item in the existing ci-red
// issue, not a blocked deploy.
//
// Run: node scripts/ci/quota-alert.mjs
// Env: ACTIONS_BILLING_PAT (required), GITHUB_REPOSITORY_OWNER (set by
//      Actions automatically), QUOTA_ALERT_THRESHOLD_PCT (default 80)

const PAT = process.env.ACTIONS_BILLING_PAT || "";
const OWNER = process.env.GITHUB_REPOSITORY_OWNER || "";
const THRESHOLD = Number(process.env.QUOTA_ALERT_THRESHOLD_PCT || "80");
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY;

async function writeSummary(lines) {
  const text = lines.join("\n") + "\n";
  console.log(text);
  if (SUMMARY_PATH) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(SUMMARY_PATH, text);
  }
}

// THE PURE PART, SPLIT OUT SO A TEST CAN DRIVE IT WITHOUT A NETWORK CALL
// OR A REAL PAT. `accountType`/`billing` below are the only two functions
// that reach the network; everything they decide reduces to this one
// comparison, which scripts/tests/quota-alert.test.mjs exercises directly
// at both sides of the threshold.
export function quotaVerdict(used, included, threshold) {
  if (!Number.isFinite(used) || !Number.isFinite(included)) {
    throw new Error(`the billing response did not have the fields expected: used=${used} included=${included}`);
  }
  if (included === 0) return { pct: null, over: false, uncapped: true };
  const pct = (used / included) * 100;
  return { pct, over: pct >= threshold, uncapped: false };
}

export async function accountType(owner) {
  // Unauthenticated and public on purpose: this call needs no token, and
  // keeping it that way means a bad PAT cannot break the ONE step that
  // tells the rest of this script which billing endpoint to call.
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(owner)}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "quota-alert-script" },
  });
  if (!res.ok) throw new Error(`could not look up account type for ${owner}: HTTP ${res.status}`);
  const body = await res.json();
  return body.type === "Organization" ? "orgs" : "users";
}

export async function billing(kind, owner, pat) {
  const res = await fetch(`https://api.github.com/${kind}/${encodeURIComponent(owner)}/settings/billing/actions`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "User-Agent": "quota-alert-script",
    },
  });
  if (!res.ok) {
    throw new Error(
      `GitHub's billing API returned HTTP ${res.status} for ${kind}/${owner} — ` +
        `ACTIONS_BILLING_PAT may be missing, expired, or belong to an account other than the repository owner`
    );
  }
  return res.json();
}

async function main() {
  if (!OWNER) throw new Error("GITHUB_REPOSITORY_OWNER is not set — this script is meant to run inside a GitHub Actions job");

  if (!PAT) {
    await writeSummary([
      "### The GitHub Actions quota was NOT checked",
      "",
      "`ACTIONS_BILLING_PAT` is not set as a repository secret, so this job cannot read account billing — the repo-scoped `GITHUB_TOKEN` every job gets has no access to it.",
      "",
      "Settings -> Secrets and variables -> Actions. Create a classic personal access token for this account (no extra scopes needed — billing endpoints just require it to belong to the account) and add it as `ACTIONS_BILLING_PAT`.",
      "",
      "This is not a result about actual usage. Red until the secret exists is the honest state — the alternative is a green tick that looks like usage is fine when nothing was measured.",
    ]);
    process.exitCode = 1;
    return;
  }

  const kind = await accountType(OWNER);
  const data = await billing(kind, OWNER, PAT);
  const used = Number(data.total_minutes_used ?? NaN);
  const included = Number(data.included_minutes ?? NaN);
  const verdict = quotaVerdict(used, included, THRESHOLD);

  if (verdict.uncapped) {
    await writeSummary([
      "### GitHub Actions usage",
      "",
      `- minutes used this cycle: **${used}**`,
      "- included minutes: 0 (this plan reports no cap, or GitHub is not reporting one)",
      "",
      "Nothing to alert on — there is no quota to measure against.",
    ]);
    return;
  }

  await writeSummary([
    "### GitHub Actions usage vs. the free quota",
    "",
    `- minutes used this cycle: **${used}** of **${included}** (**${verdict.pct.toFixed(1)}%**)`,
    `- alert threshold: ${THRESHOLD}%`,
    "",
    verdict.over
      ? `**Over the ${THRESHOLD}% threshold.** The redundant push+pull_request double run was the dominant cost the last time this was measured by hand (docs/PROGRESS.md, 2026-10-21) — check whether it has crept back before buying extra minutes.`
      : "Under the threshold. Nothing to do.",
  ]);
  if (verdict.over) process.exitCode = 1;
}

// ONLY WHEN RUN DIRECTLY. scripts/tests/quota-alert.test.mjs imports this
// file for quotaVerdict/accountType/billing, and a module that calls
// main() on import would fail that import outside a real Actions job —
// there is no GITHUB_REPOSITORY_OWNER in a test process — and silently
// set the TEST's own exit code in the process.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    await writeSummary(["### The GitHub Actions quota check failed", "", String(err && err.message ? err.message : err)]);
    process.exitCode = 1;
  });
}
