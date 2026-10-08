import { validateAgentOutput } from "@/lib/agents/agent-config";
import { truncationNotice, type ModelText } from "@/lib/verification/truncation";
import { escapeHtml } from "@/lib/html-escape";
import { readBox, readFlow, type Box, type ReadBox } from "@/lib/automations/boxes";
import { readSteps, type RunStep } from "@/lib/automations/run-steps";

/**
 * WHAT A MODEL SAID, AND WHAT A RUN KEPT, READ WITHOUT A MODEL (MASTER 16,
 * package 30). Pure, so scripts/tests/automations.test.mjs holds every
 * line of it in the build gate: lib/automations/builder.ts and runner.ts
 * call the model and the database and hand what came back to these.
 */

export type BuildOutcome =
  | { ok: true; name: string; boxes: Box[]; unsupported: string }
  | { ok: false; kind: "question"; question: string }
  | { ok: false; kind: "unusable" | "provider"; detail: string };

/** Reads the builder's answer. Pure, so it is held without a model. */
export function readBuilt(input: Record<string, unknown> | null): BuildOutcome {
  if (!input) return { ok: false, kind: "unusable", detail: "no tool call" };
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (question) return { ok: false, kind: "question", question: question.slice(0, 300) };
  const flow = readFlow(input.boxes);
  if (!flow.ok) return { ok: false, kind: "unusable", detail: flow.reason };
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : "Αυτοματισμός";
  const unsupported = typeof input.unsupported === "string" ? input.unsupported.trim().slice(0, 300) : "";
  return { ok: true, name, boxes: flow.boxes, unsupported };
}

export type ChangeOutcome = { ok: true; box: Box } | { ok: false; kind: "unusable" | "provider"; detail: string };

/** Reads one changed box: it must still be a box, and the row must still be a row with it. */
export function readChanged(input: Record<string, unknown> | null, boxes: Box[], id: string): ChangeOutcome {
  const box = readBox(input?.box, id);
  if (!box) return { ok: false, kind: "unusable", detail: "not a box" };
  const next = boxes.map((b) => (b.id === id ? { ...box, id } : b));
  const flow = readFlow(next);
  if (!flow.ok) return { ok: false, kind: "unusable", detail: flow.reason };
  return { ok: true, box: { ...box, id } };
}

export function periodFor(source: ReadBox["source"], timeZone: string, now = new Date()): { from: string; to: string } {
  const day = (offset: number) => {
    const d = new Date(now.getTime() + offset * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  };
  if (source === "calendar_tomorrow") return { from: day(1), to: day(1) };
  if (source === "calendar_week") return { from: day(0), to: day(6) };
  return { from: day(0), to: day(0) };
}

export type AiOutcome = { kind: "ok"; text: string } | { kind: "provider"; answered: boolean } | { kind: "unsafe" };

/**
 * What one AI box made, read as the Assistants read theirs
 * (lib/agents/agent-config.ts validateAgentOutput): our own fencing
 * echoed back means the framing broke or the material talked the model
 * round, and the text is not sent anywhere. A reply cut at its token
 * ceiling is kept and SAYS it was cut, in the person's language
 * (lib/verification/truncation.ts), rather than arriving as if finished.
 * Pure, so it is held without a model.
 */
export function readAiAnswer(answer: ModelText, locale: string): AiOutcome | null {
  const checked = validateAgentOutput(answer.text);
  if (!checked.ok) return checked.reason === "leaked_instructions" ? { kind: "unsafe" } : null;
  return { kind: "ok", text: answer.truncated ? `${checked.output}\n\n— ${truncationNotice(locale)}` : checked.output };
}

/** Plain text as the Documents editor stores it: one paragraph per block, nothing that runs. */
export function textToDocumentHtml(title: string, text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return `<h1>${escapeHtml(title)}</h1>${blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br>")}</p>`).join("")}`;
}

/** Where a waiting run goes on from: the box after its approval, and what it had. */
export type Resume = { at: number; text: string; credits: number; steps: RunStep[] };

/** The steps a waiting run kept, to go on from. */
export function resumeFrom(state: unknown, steps: unknown): Resume | null {
  if (!state || typeof state !== "object") return null;
  const s = state as Record<string, unknown>;
  const at = Number(s.at);
  if (!Number.isInteger(at) || at < 1) return null;
  return { at, text: typeof s.text === "string" ? s.text : "", credits: Number(s.credits) || 0, steps: readSteps(steps).map((st) => (st.status === "waiting" ? { ...st, status: "ok", note: "approval_given" } : st)) };
}
