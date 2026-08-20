import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { FILE_ASK_MODEL } from "@/lib/files/file-models";
import { loadReadableFiles } from "@/lib/files/store";
import {
  askSystemPrompt,
  synthesisSystemPrompt,
  planContext,
  verifyCitations,
  isNotInDocuments,
  stripNotInDocuments,
  NOT_IN_DOCUMENTS,
} from "@/lib/files/ask";
import { wrapUntrusted } from "@/lib/agents/agent-config";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { JobContext, JobHandler, JobHandlerResult } from "@/lib/jobs/run-job";

/**
 * Room for the answer.
 *
 * WAS 2,000, alongside a system prompt that ended "be concise". Both are
 * gone. 2,000 tokens is about 1,500 words, which is generous for "when
 * does this contract end" and a hard wall for "list every payment
 * obligation in these twelve documents" — and the wall is invisible: the
 * answer simply stops, mid-list, looking finished.
 *
 * 8,000 is not a target. Output is billed on what the model actually
 * writes, so a one-line answer costs a one-line answer whatever this
 * says; raising it changes nothing except that a long answer is now
 * allowed to finish.
 */
const MAX_OUTPUT_TOKENS = 8000;

/**
 * Room for one PART's answer, when the corpus took several passes.
 *
 * Smaller than the final answer on purpose: a partial answer is raw
 * material for the synthesis, and five 8,000-token partials would both
 * cost five times as much and overflow the call that has to read them
 * all. 4,000 each still leaves any one part able to list what it found.
 */
const MAX_PART_TOKENS = 4000;

/**
 * Answering a question from the user's documents, in the background.
 *
 * The route declared maxDuration = 60 while sending an entire document
 * set — up to the context ceiling — through one model call. A large PDF
 * plus a real question is exactly the request most likely to exceed that,
 * and a platform kill runs no catch block: the answer is lost and the
 * credit hold stands against it.
 *
 * THE FILES ARE RE-READ HERE rather than carried in the job input. Two
 * reasons, and the second is the important one: a document set can be
 * megabytes, and putting it in a jsonb column would be storing the user's
 * whole contract twice; and a file deleted between the press and the run
 * must not still be answerable from a copy we kept.
 *
 * Ownership is not re-derived — loadReadableFiles is scoped to the job's
 * own user_id, which is the same filter the route applied through RLS
 * before the job existed.
 */
export const fileAskHandler: JobHandler = async (ctx: JobContext): Promise<JobHandlerResult> => {
  const steps = JOB_STEPS.file_ask;
  const question = String(ctx.input.question ?? "").trim();
  const language = String(ctx.input.language ?? "en").slice(0, 12);
  const fileIds = Array.isArray(ctx.input.fileIds) ? (ctx.input.fileIds as string[]) : [];
  const admin = createAdminClient();

  await ctx.progress(1, steps[0]);

  const files = await loadReadableFiles(admin, ctx.userId, fileIds);
  if (files === null) throw new Error("Could not load your files.");
  if (files.length === 0) {
    // Nothing readable to answer FROM. No model call happened, so nothing
    // was spent — the hold goes back whole rather than settling to zero,
    // which would leave a pointless zero-cost row in the margin report.
    return {
      refund: true,
      result: { answered: false, reason: "no_readable_files" },
    };
  }

  const context = planContext(files);
  if (context.passes.length === 0) {
    return { refund: true, result: { answered: false, reason: "no_readable_files" } };
  }

  await ctx.progress(2, steps[1]);

  const anthropic = new Anthropic({ apiKey: ctx.apiKey });
  const filenames = files.map((f) => f.filename);

  function textOf(response: Anthropic.Message): string {
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }

  // ONE PASS IS STILL ONE CALL. Nearly every question is this, and it
  // goes down the same path it always did — no extra call, no extra
  // token, nothing to pay for a mechanism it does not need.
  let answer: string;
  if (context.passes.length === 1) {
    const response = await anthropic.messages.create({
      model: FILE_ASK_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: askSystemPrompt({ language, filenames, truncated: context.truncated }),
      messages: [{ role: "user", content: `${context.passes[0].text}\n\nQuestion: ${question}` }],
    });
    ctx.costs.record("generation", response.usage, response.model || FILE_ASK_MODEL);
    answer = textOf(response);
  } else {
    // MORE TEXT THAN FITS IN ONE CALL. It used to be dropped: the first
    // 260k characters were answered from and the rest was reported as
    // "too long to include". Now every part is read, and the parts that
    // found nothing drop out before the synthesis rather than diluting
    // it.
    const partials: string[] = [];
    for (const [index, pass] of context.passes.entries()) {
      const response = await anthropic.messages.create({
        model: FILE_ASK_MODEL,
        max_tokens: MAX_PART_TOKENS,
        system: askSystemPrompt({
          language,
          filenames,
          truncated: context.truncated,
          part: { index: index + 1, total: context.passes.length },
        }),
        messages: [{ role: "user", content: `${pass.text}\n\nQuestion: ${question}` }],
      });
      ctx.costs.record("generation", response.usage, response.model || FILE_ASK_MODEL);
      const partial = textOf(response);
      if (partial && !isNotInDocuments(partial)) {
        partials.push(`--- PART ${index + 1} OF ${context.passes.length} ---\n${partial}`);
      }
      // Written after each part, so a nine-part question shows movement
      // rather than sitting on one label for two minutes.
      await ctx.progress(2, steps[1]);
    }

    if (partials.length === 0) {
      // Every part read, none of them had it. That is a real answer, and
      // it is the one the UI already knows how to render — reached
      // without a synthesis call nobody needs to pay for.
      answer = `${NOT_IN_DOCUMENTS} The documents were read in ${context.passes.length} parts and none of them contains this.`;
    } else if (partials.length === 1) {
      // One part answered. Combining one thing is a call that can only
      // lose information, so it is skipped.
      answer = partials[0].replace(/^--- PART \d+ OF \d+ ---\n/, "");
    } else {
      await ctx.progress(3, steps[2]);
      const response = await anthropic.messages.create({
        model: FILE_ASK_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: synthesisSystemPrompt({
          language,
          parts: partials.length,
          truncated: context.truncated,
        }),
        messages: [
          {
            role: "user",
            content: `${wrapUntrusted(partials.join("\n\n"))}\n\nQuestion: ${question}`,
          },
        ],
      });
      ctx.costs.record("generation", response.usage, response.model || FILE_ASK_MODEL);
      answer = textOf(response);
    }
  }

  await ctx.progress(4, steps[3]);

  if (!answer) {
    // The call happened and consumed tokens, so this settles rather than
    // refunds — it is a completed job whose answer is "nothing came back",
    // not free work.
    return { result: { answered: false, reason: "empty_answer" } };
  }

  // The citations are checked against what the model was actually shown.
  // One that names a page we never sent is removed — a fabricated
  // reference looks checkable, which makes it worse than no reference.
  const notFound = isNotInDocuments(answer);
  const checked = verifyCitations(notFound ? stripNotInDocuments(answer) : answer, context.allowed);

  return {
    result: {
      answered: true,
      answer: checked.answer,
      answeredFromDocuments: !notFound,
      citations: checked.verified,
      // Reported, not hidden: if the model invented references, the user is
      // entitled to know its answer was less grounded than it looked.
      removedCitations: checked.fabricated.length,
      // A from-the-documents answer with NO verifiable page reference is a
      // weaker answer than it looks, and the UI must say so instead of
      // rendering it like any other. (The citation contract makes this
      // rare; when it happens, honesty beats silence.)
      uncited: !notFound && checked.verified.length === 0,
      skippedFiles: context.skipped,
      truncated: context.truncated,
      // How many passes the documents took. Reported because it is the
      // difference between "read in full" and "read in five parts and
      // combined", and the second is a weaker guarantee: a fact that
      // only makes sense across two parts can be missed by both.
      parts: context.passes.length,
      disclosure: aiGeneratedNotice(language),
    },
  };
};
