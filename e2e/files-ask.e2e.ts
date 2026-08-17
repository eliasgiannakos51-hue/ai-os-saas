import { test, expect } from "@playwright/test";
import {
  signIn,
  waitForJob,
  creditSnapshot,
  expectChargedOnce,
  makeTestPdf,
  safeJson,
  Litter,
  TIMEOUTS,
} from "./support/journey";

/**
 * JOURNEY ONE: upload a PDF, ask about it, get an answer with citations.
 *
 * This is the one the whole File Workspace exists for, and until now
 * nothing checked it end to end. The unit suite proves the chunking
 * planner splits pages correctly and that the prompt asks for citations;
 * it cannot prove that a PDF uploaded through the real route is extracted
 * by the real extractor, sent to a real model, and comes back with
 * citations that point at pages that exist.
 *
 * THE CITATION ASSERTION IS THE POINT. An answer is easy; an answer whose
 * every source resolves to a real page of a real file is the product's
 * actual claim. verifyCitations strips anything it cannot resolve, so a
 * fabricated reference would arrive as a missing one — which is exactly
 * what the last check here looks for.
 */
test.describe("files: upload, ask, cite", () => {
  test("a PDF becomes an answer with citations, charged once", async ({ request }) => {
    test.setTimeout(TIMEOUTS.upload + TIMEOUTS.extraction + TIMEOUTS.fileAsk + 60_000);
    const litter = new Litter();
    await signIn(request);

    // A sentence the model cannot know any other way. If it comes back in
    // the answer, the answer came from the document.
    const marker = `The quarterly ceiling for Contoso is ${Math.floor(Math.random() * 9000) + 1000} units.`;
    const filename = `e2e-${Date.now()}.pdf`;

    await test.step("the file uploads", async () => {
      const res = await request.post("/api/files/upload", {
        multipart: {
          file: { name: filename, mimeType: "application/pdf", buffer: makeTestPdf(marker) },
        },
        timeout: TIMEOUTS.upload,
      });
      const body = await safeJson(res);
      expect(
        res.ok() && body?.ok === true,
        `BROKE AT: upload. POST /api/files/upload -> ${res.status()}\n` +
          `  ${JSON.stringify(body)?.slice(0, 300)}\n` +
          `  A 402 here means the account is out of credits; a 413 means the storage cap.`
      ).toBeTruthy();
      const file = body!.file as { id: string };
      expect(file?.id, "BROKE AT: upload. The response had no file id.").toBeTruthy();
      litter.add("uploaded file", `/api/files/${file.id}`);
      test.info().annotations.push({ type: "fileId", description: file.id });
    });

    const fileId = test.info().annotations.find((a) => a.type === "fileId")!.description!;

    await test.step("its text is extracted", async () => {
      // Extraction is synchronous inside the upload route today, but
      // polling costs nothing and makes this survive it becoming a job.
      const deadline = Date.now() + TIMEOUTS.extraction;
      let status = "";
      while (Date.now() < deadline) {
        const res = await request.get(`/api/files/${fileId}`);
        const body = await safeJson(res);
        if (res.ok() && body?.ok === true && String(body.text ?? "").trim()) {
          expect(
            String(body.text).includes("Contoso"),
            `BROKE AT: extraction. The file was read but the text does not contain the marker.\n` +
              `  got: ${String(body.text).slice(0, 200)}\n` +
              `  This means the PDF extractor produced something other than the page's words.`
          ).toBeTruthy();
          return;
        }
        status = String(body?.code ?? res.status());
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(
        `BROKE AT: extraction. ${fileId} still had no readable text after ` +
          `${TIMEOUTS.extraction / 1000}s (last: ${status}). A scanned or image-only PDF is refused ` +
          `by design — this one is generated text, so a refusal here is a real failure.`
      );
    });

    const before = await creditSnapshot(request);
    let job: Awaited<ReturnType<typeof waitForJob>>;

    await test.step("the question is answered", async () => {
      const res = await request.post("/api/files/ask", {
        data: { question: "What is the quarterly ceiling for Contoso? Cite the page.", fileIds: [fileId], language: "en" },
      });
      const body = await safeJson(res);
      expect(
        res.status() === 202 && body?.ok === true && body?.jobId,
        `BROKE AT: ask. POST /api/files/ask -> ${res.status()}\n` +
          `  ${JSON.stringify(body)?.slice(0, 300)}\n` +
          `  A 402 means no credits. A 400 with "Questions can be up to" means the length cap.`
      ).toBeTruthy();
      job = await waitForJob(request, String(body!.jobId), "file ask", TIMEOUTS.fileAsk);
    });

    await test.step("the answer is grounded and its citations resolve", async () => {
      const result = job!.result as Record<string, unknown>;
      expect(
        result?.answered === true,
        `BROKE AT: answer. The job finished but answered = ${result?.answered} ` +
          `(reason: ${result?.reason ?? "none"}).`
      ).toBeTruthy();

      const answer = String(result.answer ?? "");
      expect(answer.length > 0, "BROKE AT: answer. The job returned an empty answer.").toBeTruthy();
      expect(
        result.answeredFromDocuments === true,
        `BROKE AT: grounding. The model replied NOT_IN_DOCUMENTS for a fact that is on page 1 ` +
          `of the file it was given.\n  answer: ${answer.slice(0, 200)}`
      ).toBeTruthy();

      const citations = (result.citations ?? []) as { filename: string; label: string }[];
      expect(
        citations.length > 0,
        `BROKE AT: citations. The answer has none.\n  answer: ${answer.slice(0, 300)}\n` +
          `  Either the model cited nothing, or verifyCitations stripped everything it cited — ` +
          `which means it invented page labels.`
      ).toBeTruthy();
      // Every surviving citation has been checked server-side against the
      // pages actually sent. What this adds is that they name THIS file.
      for (const c of citations) {
        expect(
          c.filename,
          `BROKE AT: citations. A citation has no filename: ${JSON.stringify(c)}`
        ).toBeTruthy();
        expect(
          c.filename === filename,
          `BROKE AT: citations. A citation names "${c.filename}" but the only file in the ` +
            `question was "${filename}".`
        ).toBeTruthy();
        expect(
          /page|σελ|seite|página/i.test(c.label),
          `BROKE AT: citations. "${c.label}" does not look like a page label.`
        ).toBeTruthy();
      }
      expect(
        Number(result.removedCitations ?? 0),
        `BROKE AT: citations. ${result.removedCitations} citation(s) were STRIPPED as ` +
          `unverifiable — the model named pages that were never sent to it. That is the ` +
          `failure this feature exists to prevent.`
      ).toBe(0);
      // One page in, one pass expected. More would mean the chunker split
      // a single-page PDF.
      expect(
        Number(result.parts ?? 1),
        `BROKE AT: chunking. A one-page PDF was read in ${result.parts} parts.`
      ).toBe(1);
    });

    await test.step("and it was charged exactly once", async () => {
      const after = await creditSnapshot(request);
      expectChargedOnce(before, after, "file ask", job!.creditsCharged);
    });

    await litter.sweep(request);
  });
});
