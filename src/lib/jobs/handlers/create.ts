import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { logApiError } from "@/lib/log-error";
import { checkNeedsClarification } from "@/lib/clarification";
import { getUserFullContext, buildUserContextPromptAdditionEnglish } from "@/lib/user-context";
import { downloadAttachmentImages } from "@/lib/attachment-image-server";
import {
  MODEL,
  ROUTE_ENTRY_TOOL,
  buildSystemPrompt,
  coerceFieldValue,
  type RouteEntryInput,
} from "@/lib/create-studio/route-entry";
import { getClassifierModule, moduleHref } from "@/lib/classifier-modules";
import { agentRoleSystemPromptAddition, isAgentRole, type AgentRole } from "@/lib/agent-roles";
import { buildOutputSummary, buildMissionContextSystemPromptAddition } from "@/lib/mission-context";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { JobContext, JobHandler, JobHandlerResult } from "@/lib/jobs/run-job";
import { enModuleTitle, enFieldLabel } from "@/lib/module-labels";

/**
 * Create Anything, in the background.
 *
 * The route awaited a vision-capable classification under a 120-second
 * ceiling — and vision is the slow case, because the images have to be
 * downloaded from Storage and sent with the message. A kill runs no catch
 * block, so the entry is never written and the hold is never released.
 *
 * THE ONE THING THAT IS NOT SIMPLY MOVED is the client used for the
 * insert. The route wrote through the user's own client so RLS decided
 * where the row could go; a worker has no session, so it uses the admin
 * client with the job's own user_id — and the payload's user_id is set
 * from ctx.userId rather than from anything in the job input, so a
 * tampered input cannot write into someone else's module.
 *
 * WHAT COUNTS AS CHARGEABLE is unchanged and is the subtle part: a
 * classification that matched no module is still a real answer the user
 * reads, so it settles. An insert that FAILS is not — nothing was saved,
 * so it refunds.
 */
export const createHandler: JobHandler = async (ctx: JobContext): Promise<JobHandlerResult> => {
  const steps = JOB_STEPS.create;
  const message = String(ctx.input.message ?? "");
  // Re-validated, not trusted. The job input is stored JSON and the role
  // selects a system-prompt addition — an unrecognised value must fall
  // back to "general" rather than reach the prompt builder.
  const rawRole = ctx.input.agentRole == null ? "" : String(ctx.input.agentRole);
  const agentRole: AgentRole = isAgentRole(rawRole) ? rawRole : "general";
  const imagePaths = Array.isArray(ctx.input.imagePaths) ? (ctx.input.imagePaths as string[]) : [];
  const priorStepsContext = ctx.input.priorStepsContext == null ? null : String(ctx.input.priorStepsContext);
  const skipClarification = ctx.input.skipClarification === true;
  const admin = createAdminClient();

  await ctx.progress(1, steps[0]);

  // The clarifying-questions pre-check — the shared one, kind "create". A
  // small forced-tool-use call before the real classification, on first
  // submission only. It moved here with the rest of the work: its cost
  // lands on the same accumulator, so a request that stops here is still
  // paid for, and stopping here is a SUCCESSFUL job carrying questions
  // rather than a failure.
  if (!skipClarification) {
    try {
      const clarification = await checkNeedsClarification(ctx.apiKey, "create", message, ctx.costs);
      if (clarification.needsClarification) {
        return {
          result: {
            matched: false,
            needsClarification: true,
            questions: clarification.questions,
            // Carried alongside the questions so the screen that renders
            // them can offer the tappable answers too. Without it the
            // user meets three empty boxes and skips.
            questionSuggestions: clarification.suggestions,
          },
          // Its own feature, for the reason spelled out in
          // handlers/agent-build.ts: a run that stops at the pre-check and
          // a run that classifies are different actions with an order of
          // magnitude between their costs, and the user's resubmission
          // makes one entry produce two rows. Averaged together they
          // describe neither.
          feature: "create_precheck",
        };
      }
    } catch (err) {
      // Best-effort: a hiccup in the pre-check must not block a real entry.
      logApiError("jobs:create", err, { stage: "clarification_check", jobId: ctx.jobId });
    }
  }

  // "AI Life Context" — the consolidated user picture, so classification
  // is not limited to the one message it was given. Best-effort, as before.
  let userContext = "";
  try {
    const fullContext = await getUserFullContext(admin, ctx.userId);
    userContext = buildUserContextPromptAdditionEnglish(fullContext);
  } catch (err) {
    logApiError("jobs:create", err, { stage: "user_full_context", jobId: ctx.jobId });
  }

  // Optional attached image(s) — real vision context, e.g. a photo of a
  // product alongside "log this as a new product idea". Independently
  // best-effort per image; a bad one is excluded rather than fatal.
  const attachmentImages =
    imagePaths.length > 0 ? await downloadAttachmentImages(admin, imagePaths, "jobs:create") : [];

  await ctx.progress(2, steps[1]);

  const anthropic = new Anthropic({ apiKey: ctx.apiKey });
  const userContent: Anthropic.MessageParam["content"] =
    attachmentImages.length > 0
      ? [
          ...attachmentImages.map(
            (image): Anthropic.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            })
          ),
          { type: "text", text: message },
        ]
      : message;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // buildSystemPrompt() is the Create Studio module catalogue — 11,022
    // characters (~2,756 tokens) generated from CLASSIFIER_MODULES, and
    // identical on every Create Anything call in the app. The three
    // additions after it are per-request and each starts with "\n\n" or
    // is empty, so the split is byte-exact. See lib/ai/cached-system.ts.
    system: buildCachedSystem({
      staticPrefix: buildSystemPrompt(),
      dynamicSuffix:
        agentRoleSystemPromptAddition(agentRole) +
        userContext +
        buildMissionContextSystemPromptAddition(priorStepsContext ?? ""),
      model: MODEL,
    }),
    messages: [{ role: "user", content: userContent }],
    tools: [ROUTE_ENTRY_TOOL],
    tool_choice: { type: "tool", name: "route_entry" },
  });
  ctx.costs.record("classification", response.usage, response.model || MODEL);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) throw new Error("The model did not return a classification.");
  const toolInput = toolUse.input as RouteEntryInput;

  await ctx.progress(3, steps[2]);

  // A QUESTION IS NOT A THING TO FILE. "what do you know about me" used to
  // come back as a Document, because the tool offered a module slug or
  // "none" and nothing else — the model was never asked what the message
  // WAS. It is now, and an answer is a first-class outcome: nothing is
  // written to any module, and the answer (built from the same account
  // context the classifier already had) is what the user gets.
  //
  // Still SETTLES rather than refunding: the model call happened and the
  // answer is the thing the user wanted. Charging for it is honest;
  // charging for a document they did not ask for was not.
  if (toolInput.intent === "question") {
    return {
      result: {
        matched: false,
        answered: true,
        answer: String(toolInput.answer ?? "").trim() || toolInput.message,
        message: toolInput.message,
      },
    };
  }

  // GENUINELY UNCLEAR — so ask, rather than guess. The user picks, and
  // the resubmission carries their choice (see api/create's askedIntent).
  if (toolInput.intent === "ambiguous") {
    return { result: { matched: false, ambiguous: true, message: toolInput.message } };
  }

  // A classification that matched nothing is still a real answer the user
  // reads, so it settles rather than refunding.
  if (!toolInput.module || toolInput.module === "none") {
    return { result: { matched: false, message: toolInput.message } };
  }
  const moduleConfig = getClassifierModule(toolInput.module);
  if (!moduleConfig) {
    return { result: { matched: false, message: toolInput.message } };
  }

  // user_id from the JOB, never from the input. A tampered input must not
  // be able to write a row into another account's module.
  const payload: Record<string, string | number | null> = { user_id: ctx.userId };
  for (const field of moduleConfig.fields) {
    payload[field.key] = coerceFieldValue(field, toolInput.fields?.[field.key]);
  }

  const missingRequired = moduleConfig.fields.find(
    (f) => f.required && (payload[f.key] === null || payload[f.key] === undefined)
  );
  if (missingRequired) {
    return {
      result: {
        matched: false,
        message: `I found this looked like a ${enModuleTitle(moduleConfig)} entry, but couldn't extract "${enFieldLabel(missingRequired)}", which is required. Could you add a bit more detail?`,
      },
    };
  }

  const { data: insertedRecord, error: insertError } = await admin
    .from(moduleConfig.table)
    .insert(payload)
    .select()
    .single();

  // Nothing was saved, so nothing is charged — the same "no credits were
  // charged" guarantee the route gave. Thrown rather than returned only
  // where a retry might genuinely help; here it is returned with refund
  // so the user is not billed for a row that does not exist.
  if (insertError) {
    logApiError("jobs:create", insertError, { stage: "insert", jobId: ctx.jobId });
    return { refund: true, result: { matched: false, insertFailed: true, message: "" } };
  }

  return {
    result: {
      matched: true,
      module: moduleConfig.slug,
      moduleTitleKey: moduleConfig.titleKey,
      href: moduleHref(moduleConfig.slug),
      message: toolInput.message,
      outputSummary: buildOutputSummary(
        moduleConfig,
        insertedRecord as Record<string, unknown>,
        toolInput.message
      ),
    },
  };
};
