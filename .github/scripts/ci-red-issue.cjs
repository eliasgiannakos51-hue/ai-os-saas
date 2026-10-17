"use strict";

/**
 * THE ALARM THAT NEVER RESET.
 *
 * The alert job in .github/workflows/verify.yml opened an issue when CI
 * went red, and the comment above its lookup said "ONE OPEN ISSUE AT A
 * TIME. A new issue per failing push turns the tracker into a log and
 * teaches people to close them unread." That is exactly what happened,
 * through the one line underneath it.
 *
 * TWO FAULTS, AND THEY FED EACH OTHER.
 *
 *   1. The lookup asked for `per_page: 10`. Once more than ten ci-red
 *      issues were open, an older one with the same title was off the
 *      first page, `find` did not see it, and a DUPLICATE was opened.
 *      Measured 2026-10-16 with 33 open: #280 and #302 are both titled
 *      "CI red on main", #270 and #301 are both titled "CI red on ".
 *   2. Nothing ever closed one. The job was `if: failure()` and had no
 *      counterpart, so the pile only grew — which is what filled the
 *      ten-row window in (1).
 *
 * And a third, smaller, visible in those titles: `context.ref` is only
 * `refs/heads/<branch>` for a push. For a pull_request it is
 * `refs/pull/N/merge`, and for a deployment report it is neither, which
 * is how two issues came to be named after nothing at all.
 *
 * WHY THIS IS A FILE AND NOT TWO `script:` BLOCKS. The red path and the
 * green path have to agree on the title and on the lookup or they do
 * not pair up, and two copies in YAML agree only while somebody
 * remembers. One module, two modes, and
 * scripts/tests/ci-coverage.test.mjs section 6 RUNS it against a fake
 * client rather than matching text in the workflow — including the
 * thirty-open-issues case, which is the one the old code got wrong.
 */

/**
 * The branch a run is about, in a form that is never empty.
 *
 * The order is most-specific first: a pull_request event knows its own
 * head branch, which is more useful than `refs/pull/N/merge`.
 */
function refName(context) {
  const head = context.payload && context.payload.pull_request && context.payload.pull_request.head
    ? context.payload.pull_request.head.ref
    : "";
  if (head) return String(head);
  const ref = String((context && context.ref) || "");
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  if (ref) return ref;
  const deployed = context.payload && context.payload.deployment ? context.payload.deployment.ref : "";
  if (deployed) return String(deployed);
  const sha = String((context && context.sha) || "").slice(0, 7);
  return sha || "an unnamed ref";
}

/** One title per ref, and the two modes derive it from the same place. */
function titleFor(context) {
  return `CI red on ${refName(context)}`;
}

/**
 * EVERY OPEN ci-red ISSUE, not the first page of them. `github.paginate`
 * walks the pages; `per_page: 100` keeps that to one request in the
 * normal case. This is the line the old code got wrong.
 */
async function openCiRedIssues(github, context) {
  return github.paginate(github.rest.issues.listForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: "open",
    labels: "ci-red",
    per_page: 100,
  });
}

function runUrlFor(context) {
  return `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
}

/**
 * mode "red"   — comment on the open issue for this ref, or open one.
 * mode "green" — close EVERY open issue for this ref.
 *
 * Green closes all matches rather than the first, because that is what
 * clears the duplicates the ten-row window already made: two issues
 * named "CI red on main" both get closed by the first green run on
 * main, without anybody tidying up by hand.
 */
async function run({ github, context, mode }) {
  if (mode !== "red" && mode !== "green") throw new Error(`unknown mode ${JSON.stringify(mode)}`);
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const title = titleFor(context);
  const sha = String(context.sha || "").slice(0, 7);
  const matching = (await openCiRedIssues(github, context)).filter((i) => i.title === title);

  if (mode === "red") {
    const body = [
      `**${context.workflow}** failed.`,
      ``,
      `- run: ${runUrlFor(context)}`,
      `- commit: \`${sha}\``,
      `- branch: \`${refName(context)}\``,
      ``,
      `Reported automatically. The first twenty commits of this branch went into a red CI because nothing said so.`,
    ].join("\n");
    if (matching.length > 0) {
      await github.rest.issues.createComment({ owner, repo, issue_number: matching[0].number, body });
      return { commented: 1, opened: 0, closed: 0 };
    }
    await github.rest.issues.create({ owner, repo, title, body, labels: ["ci-red"] });
    return { commented: 0, opened: 1, closed: 0 };
  }

  const body = [
    `**${context.workflow}** is green again.`,
    ``,
    `- run: ${runUrlFor(context)}`,
    `- commit: \`${sha}\``,
    `- branch: \`${refName(context)}\``,
    ``,
    `Closed automatically. An alarm that never resets is an alarm nobody reads.`,
  ].join("\n");
  // COUNTED IN THE LOOP, NOT FROM `matching.length`. The first draft
  // returned the length of the list it meant to close, which is a
  // number the caller cannot use: a loop that closed one of two still
  // reported two, and ci-coverage's mutation suite proved it by
  // changing the loop and watching the count stay right.
  let closed = 0;
  for (const issue of matching) {
    await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body });
    await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: "closed", state_reason: "completed" });
    closed += 1;
  }
  return { commented: 0, opened: 0, closed };
}

module.exports = { run, titleFor, refName, openCiRedIssues };
