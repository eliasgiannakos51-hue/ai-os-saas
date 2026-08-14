import "server-only";
import { contentLanguageFromCode } from "@/lib/content-language";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { FILE_ASK_MODEL } from "@/lib/files/file-models";
import { loadReadableFiles } from "@/lib/files/store";
import {
  askSystemPrompt,
  prepareContext,
  verifyCitations,
  isNotInDocuments,
  stripNotInDocuments,
} from "@/lib/files/ask";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { JobContext, JobHandler, JobHandlerResult } from "@/lib/jobs/run-job";

/** Unchanged from the route this moved out of. */
const MAX_OUTPUT_TOKENS = 2000;

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
  // The code the route resolved from the user's question when the job was
  // enqueued. Rebuilt rather than re-detected: the worker runs later and
  // the question is no longer the only text around.
  const language = contentLanguageFromCode(String(ctx.input.language ?? "en").slice(0, 12));
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

  const context = prepareContext(files);
  if (!context.text) {
    return { refund: true, result: { answered: false, reason: "no_readable_files" } };
  }

  await ctx.progress(2, steps[1]);

  const anthropic = new Anthropic({ apiKey: ctx.apiKey });
  const response = await anthropic.messages.create({
    model: FILE_ASK_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: askSystemPrompt({
      language,
      filenames: files.map((f) => f.filename),
      truncated: context.truncated,
    }),
    messages: [{ role: "user", content: `${context.text}\n\nQuestion: ${question}` }],
  });
  ctx.costs.record("generation", response.usage, response.model || FILE_ASK_MODEL);

  const answer = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  await ctx.progress(3, steps[2]);

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
      skippedFiles: context.skipped,
      truncated: context.truncated,
      disclosure: aiGeneratedNotice(language.code),
    },
  };
};
