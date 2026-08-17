import { test, expect } from "@playwright/test";
import { signIn, waitForJob, creditSnapshot, safeJson, Litter, TIMEOUTS } from "./support/journey";

/**
 * JOURNEY THREE: generate a website, publish it, open the live URL.
 *
 * THE ONLY ONE THAT NEEDS A BROWSER, and it needs one for a specific
 * reason: everything up to publish can be checked over HTTP, but "the
 * site is live" means a stranger with no session gets the page. So the
 * last step uses a context with NO cookies — if the published page only
 * renders for the logged-in author, this fails, and it should.
 *
 * Generation is the most expensive action in the product and the slowest.
 * The timeout is ten minutes because that is what a real generation can
 * take; a shorter one produces a red suite that people re-run until it
 * goes green, which is worse than no suite.
 */
test.describe("websites: generate, publish, serve", () => {
  test("a generated site publishes and answers on its own URL", async ({ request, browser }) => {
    test.setTimeout(TIMEOUTS.websiteGenerate + TIMEOUTS.publish + 180_000);
    const litter = new Litter();
    await signIn(request);

    // A phrase that can only be on the page if OUR generation produced it.
    const marker = `Kestrel Analytics ${Date.now().toString(36).toUpperCase()}`;
    const name = `e2e-${Date.now()}`;
    const before = await creditSnapshot(request);
    let websiteId = "";

    await test.step("generation starts", async () => {
      const res = await request.post("/api/websites/generate", {
        data: {
          name,
          description: `A one-page site for a consultancy called ${marker}. Put the words "${marker}" in the main heading. Keep it to one section.`,
          skipClarification: true,
        },
        timeout: 120_000,
      });
      const body = await safeJson(res);
      expect(
        res.ok() && body?.ok === true,
        `BROKE AT: generate. POST /api/websites/generate -> ${res.status()}\n` +
          `  ${JSON.stringify(body)?.slice(0, 300)}`
      ).toBeTruthy();
      expect(
        body?.rateLimited !== true,
        `BROKE AT: generate. The circuit breaker refused: ${body?.message}\n` +
          `  This is the daily AI spend cap or the per-user rate limit, not a bug.`
      ).toBeTruthy();
      expect(
        body?.needsClarification !== true,
        `BROKE AT: generate. The model asked clarifying questions despite ` +
          `skipClarification: true — that flag is not being honoured.`
      ).toBeTruthy();

      const record = (body?.record ?? body?.website ?? {}) as Record<string, unknown>;
      websiteId = String(record?.id ?? body?.websiteId ?? "");
      expect(
        websiteId,
        `BROKE AT: generate. No website id came back.\n  ${JSON.stringify(body)?.slice(0, 300)}`
      ).toBeTruthy();
      litter.add("generated website", `/api/websites/${websiteId}`);
      if (body?.jobId) {
        await waitForJob(request, String(body.jobId), "website generation", TIMEOUTS.websiteGenerate);
      }
    });

    await test.step("the HTML is finished", async () => {
      // Generation continues in a background route; the row's status is
      // the authority on whether it is done.
      const deadline = Date.now() + TIMEOUTS.websiteGenerate;
      let last = "";
      while (Date.now() < deadline) {
        const res = await request.get(`/api/websites/status?ids=${websiteId}`);
        const body = await safeJson(res);
        const rows = (body?.websites ?? body?.rows ?? []) as Record<string, unknown>[];
        const row = Array.isArray(rows) ? rows.find((r) => String(r.id) === websiteId) : undefined;
        last = String(row?.status ?? res.status());
        if (last === "ready" || last === "complete" || last === "completed") return;
        if (last === "failed") {
          throw new Error(
            `BROKE AT: generation. The website row says status="failed".\n` +
              `  error: ${row?.error ?? "(none recorded)"}`
          );
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      throw new Error(
        `BROKE AT: generation. Still "${last}" after ${TIMEOUTS.websiteGenerate / 1000}s. ` +
          `A row stuck at "pending" means the process route never ran.`
      );
    });

    let liveUrl = "";

    await test.step("it publishes", async () => {
      const res = await request.post(`/api/websites/${websiteId}/publish`, { data: {} });
      const body = await safeJson(res);
      expect(
        res.ok() && body?.ok === true,
        `BROKE AT: publish. POST -> ${res.status()}\n  ${JSON.stringify(body)?.slice(0, 400)}\n` +
          `  A refusal mentioning the security scan means the generated HTML tripped the ` +
          `pre-publish check — that is the check working, and worth reading rather than retrying.`
      ).toBeTruthy();
      liveUrl = String(body!.url ?? "");
      expect(liveUrl, "BROKE AT: publish. The response carried no URL.").toBeTruthy();
      litter.add("published site", `/api/websites/${websiteId}/publish`);
      console.log(`    live at ${liveUrl}`);
    });

    await test.step("and a stranger can open it", async () => {
      // NO storage state: a fresh context with no session. "Published"
      // has to mean public, not "visible to the person who made it".
      const anonymous = await browser.newContext();
      const page = await anonymous.newPage();
      const response = await page.goto(liveUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      expect(
        response?.status(),
        `BROKE AT: serving. ${liveUrl} answered ${response?.status()} to a logged-out visitor.\n` +
          `  404 usually means PUBLISHED_SITE_DOMAIN is unset on this deployment and the URL ` +
          `is path-based — check e2e/README.md.`
      ).toBe(200);

      const body = await page.textContent("body");
      expect(
        body?.includes(marker),
        `BROKE AT: content. The page loaded but does not contain "${marker}".\n` +
          `  first 300 chars: ${body?.slice(0, 300)}\n` +
          `  A page that serves but shows someone else's content is worse than a 404.`
      ).toBeTruthy();
      await anonymous.close();
    });

    await test.step("and generation was charged", async () => {
      const after = await creditSnapshot(request);
      expect(
        after.balance < before.balance,
        `BROKE AT: billing. Generating a website did not move the balance ` +
          `(${before.balance} -> ${after.balance}). Website generation is the most expensive ` +
          `action in the product; unbilled, it is the most expensive hole.`
      ).toBeTruthy();
      // Deliberately NOT "exactly one transaction": generation settles the
      // clarification pre-check separately from the generation itself, so
      // one journey legitimately produces more than one row. Asserting one
      // here would be asserting a thing that is not true.
      expect(
        after.transactions > before.transactions,
        `BROKE AT: billing. No credit transaction was written for the generation.`
      ).toBeTruthy();
    });

    await litter.sweep(request);
  });
});
