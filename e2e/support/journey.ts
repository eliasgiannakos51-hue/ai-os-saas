import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

/**
 * Shared machinery for the three end-to-end journeys.
 *
 * WHY THESE DRIVE THE API AND NOT THE DOM.
 *
 * Two of the three journeys have no stable selectors to drive: the agents
 * and website-builder surfaces carry no data-testid at all, and clicking
 * through them would mean writing selectors against class names and label
 * text that change with every copy edit. A test that breaks when a
 * sentence is reworded teaches people to delete tests.
 *
 * What these do instead is exercise the same HTTP routes the browser
 * calls, through a REAL logged-in session against a REAL deployment, with
 * real model calls and real credits. Nothing is stubbed. The one place
 * the browser genuinely is the subject — a published website that has to
 * answer on its own URL and render its own content — uses a real page.
 *
 * WHAT "REAL" COSTS. Every run of the three specs spends credits and
 * makes Anthropic calls. See e2e/README.md for the measured figures and
 * how to keep the account topped up.
 */

/** How long each journey may take before it is called a failure rather
 *  than a slow day. Website generation is the long one — minutes, not
 *  seconds — and a timeout below reality produces a red suite that
 *  everybody learns to re-run. */
export const TIMEOUTS = {
  upload: 60_000,
  extraction: 120_000,
  fileAsk: 240_000,
  agentBuild: 240_000,
  agentRun: 300_000,
  websiteGenerate: 600_000,
  publish: 120_000,
};

export type Job = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  step?: number | null;
  step_label?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  creditsCharged?: number | null;
};

/**
 * Sign in for real.
 *
 * Uses the app's own /api/auth/login, which calls
 * supabase.auth.signInWithPassword and sets the session cookies on the
 * response — so the context that made this call is a logged-in browser
 * from then on. No token is minted by the test, and no service key is
 * used for anything a user does.
 */
export async function signIn(api: APIRequestContext): Promise<void> {
  const email = requireEnv("E2E_EMAIL");
  const password = requireEnv("E2E_PASSWORD");
  const res = await api.post("/api/auth/login", { data: { email, password } });
  const body = await safeJson(res);
  expect(
    res.ok() && body?.ok === true,
    `SIGN-IN FAILED (${res.status()}). The rest of this spec cannot run.\n` +
      `  email: ${email}\n` +
      `  response: ${JSON.stringify(body)?.slice(0, 300)}\n` +
      `  If this says "Invalid login credentials", the account in E2E_EMAIL does not\n` +
      `  exist on this deployment — see e2e/README.md, "Setting up the account".`
  ).toBeTruthy();
}

/** Fail with the variable's NAME, not "undefined". */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `MISSING ENV: ${name} is not set. These specs talk to a real deployment and cannot ` +
        `guess it. See e2e/README.md for the full list.`
    );
  }
  return value;
}

export async function safeJson(res: APIResponse): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Wait for a background job, reporting WHERE it is while it waits.
 *
 * Every AI action in this app becomes a row in ai_jobs and is polled at
 * /api/jobs/[id]. The step label is printed as it changes, so a spec that
 * times out says which step it died on rather than "timed out after four
 * minutes".
 */
export async function waitForJob(
  api: APIRequestContext,
  jobId: string,
  what: string,
  timeoutMs: number
): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  let lastLabel = "";
  let polls = 0;

  while (Date.now() < deadline) {
    const res = await api.get(`/api/jobs/${jobId}`);
    const body = await safeJson(res);
    polls += 1;

    if (!res.ok() || body?.ok !== true) {
      throw new Error(
        `${what}: polling /api/jobs/${jobId} failed with ${res.status()} after ${polls} polls.\n` +
          `  ${JSON.stringify(body)?.slice(0, 300)}`
      );
    }
    const job = body.job as Job;
    if (job.step_label && job.step_label !== lastLabel) {
      lastLabel = job.step_label;
      console.log(`    ${what}: ${lastLabel} (step ${job.step ?? "?"})`);
    }
    if (job.status === "done") return job;
    if (job.status === "failed") {
      throw new Error(
        `${what}: THE JOB FAILED on the server.\n` +
          `  last step: ${job.step_label ?? "none"}\n` +
          `  error: ${job.error ?? "(none recorded)"}\n` +
          `  This is a real backend failure, not a flaky test — the same thing would have\n` +
          `  happened to a user pressing the same button.`
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `${what}: TIMED OUT after ${Math.round(timeoutMs / 1000)}s and ${polls} polls.\n` +
      `  last step reached: ${lastLabel || "(none — the job never reported a step)"}\n` +
      `  A job stuck at no step usually means the worker never picked it up.`
  );
}

/**
 * The credit ledger, before and after.
 *
 * `reserve → settle` has to leave EXACTLY ONE transaction per action. Two
 * is a double charge; zero is work given away. Reading the ledger through
 * the app's own endpoint keeps the test to the same view a customer has.
 */
export async function creditSnapshot(api: APIRequestContext): Promise<{ balance: number; transactions: number }> {
  const balanceRes = await api.get("/api/credits/balance");
  const balance = await safeJson(balanceRes);
  const txRes = await api.get("/api/credits/transactions");
  const tx = await safeJson(txRes);
  expect(
    balanceRes.ok(),
    `Could not read the credit balance (${balanceRes.status()}). Every assertion about ` +
      `charging depends on this endpoint.`
  ).toBeTruthy();
  const list = (tx?.transactions ?? tx?.rows ?? []) as unknown[];
  return {
    balance: Number(balance?.remaining ?? balance?.credits_remaining ?? balance?.balance ?? 0),
    transactions: Array.isArray(list) ? list.length : 0,
  };
}

/**
 * Assert an action charged, and charged once.
 *
 * The important half is the SECOND one. A settlement that runs twice
 * still looks like success from the outside: the answer arrives, the
 * page renders, and the customer is quietly billed twice.
 */
export function expectChargedOnce(
  before: { balance: number; transactions: number },
  after: { balance: number; transactions: number },
  what: string,
  jobCredits: number | null | undefined
) {
  expect(
    typeof jobCredits === "number" && jobCredits > 0,
    `${what}: the job finished but reported creditsCharged = ${jobCredits}. Work that ` +
      `called a model and charged nothing is a hole in the meter.`
  ).toBeTruthy();

  const spent = before.balance - after.balance;
  expect(
    spent > 0,
    `${what}: the balance did not move (${before.balance} -> ${after.balance}) even though the ` +
      `job reported ${jobCredits} credits. The settlement did not reach user_credits.`
  ).toBeTruthy();

  const newTransactions = after.transactions - before.transactions;
  expect(
    newTransactions,
    `${what}: expected exactly one credit transaction, found ${newTransactions}.\n` +
      `  more than one means the settlement ran twice — the customer was charged twice.\n` +
      `  zero means the charge never reached the ledger.`
  ).toBe(1);
}

/** A tiny, valid, single-page PDF with known text — built here rather
 *  than committed as a binary, so what the test uploads is visible in the
 *  diff and its page count is a fact this file states rather than a
 *  property of a blob nobody opens. */
export function makeTestPdf(sentence: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${sentence.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Everything this run created, so the account goes back to how it was.
 *  Cleanup is best-effort and NEVER fails the spec: a failed delete must
 *  not turn a passing journey red, and it must not hide one either — it
 *  prints what it could not remove. */
export class Litter {
  private readonly items: { what: string; url: string }[] = [];
  add(what: string, url: string) {
    this.items.push({ what, url });
  }
  async sweep(api: APIRequestContext) {
    for (const item of this.items.reverse()) {
      try {
        const res = await api.delete(item.url);
        if (!res.ok()) console.log(`    cleanup: ${item.what} left behind (${res.status()} ${item.url})`);
      } catch (err) {
        console.log(`    cleanup: ${item.what} left behind (${String(err).slice(0, 120)})`);
      }
    }
  }
}
