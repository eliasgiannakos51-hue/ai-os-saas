"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp, CheckCircle2, AlertCircle, XCircle, Sparkles, Paperclip, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/modules";
import { useCreateAnything, type CreateResult } from "@/lib/use-create-anything";
import { OutOfCreditsNotice } from "@/components/credits/out-of-credits-notice";
import { useSmartSuggestions } from "@/lib/use-smart-suggestions";
import { SmartSuggestions } from "@/components/create/smart-suggestions";
import { NextStepSuggestion } from "@/components/create/next-step-suggestion";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { appendClarificationAnswers } from "@/lib/clarification-client";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { useToast } from "@/components/toast/toast-context";
import {
  ACCEPTED_ATTACHMENT_IMAGE_TYPES,
  buildAttachmentImagePath,
  CREATE_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_IMAGES,
} from "@/lib/create-attachment-image";

type Turn = { id: number; userMessage: string; result: CreateResult };

let turnIdCounter = 0;

// Full chat-thread UI for the dedicated /dashboard/create page. Each
// submission accumulates as a turn in local state — there's no backend
// conversation history to restore (create_requests only logs a timestamp
// for rate-limiting, not message content), so the thread is scoped to the
// current visit, same as the underlying feature always worked.
export function AssistantChat({ userInitial }: { userInitial: string }) {
  const t = useTranslations("dashboard.createAnything");
  const { submit, loading } = useCreateAnything();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = useSmartSuggestions(input);
  const supabase = createClient();
  const { addToast } = useToast();

  // Optional attached image(s) — same mechanism as create-chat.tsx (see
  // lib/create-attachment-image.ts).
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    setImageFiles((prev) => {
      const remainingSlots = MAX_ATTACHMENT_IMAGES - prev.length;
      const accepted = selected
        .filter((f) => ACCEPTED_ATTACHMENT_IMAGE_TYPES.includes(f.type as (typeof ACCEPTED_ATTACHMENT_IMAGE_TYPES)[number]))
        .slice(0, remainingSlots);
      return accepted.length > 0 ? [...prev, ...accepted] : prev;
    });
  }

  function removeImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadAttachedImages(): Promise<string[]> {
    if (imageFiles.length === 0) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const results = await Promise.all(
      imageFiles.map(async (file) => {
        const path = buildAttachmentImagePath(user.id, file.name);
        const { error } = await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type });
        return { path, error };
      })
    );
    // A failed upload (e.g. Supabase Storage quota exceeded) used to be
    // silently dropped here — see create-chat.tsx's identical fix for why.
    const failures = results.filter((r) => r.error);
    if (failures.length > 0) {
      addToast(`✗ ${getErrorMessage(failures[0].error, t("uploadError"))}`, "error");
    }
    return results.filter((r) => !r.error).map((r) => r.path);
  }

  // Prefixes rather than replaces — the suggestion only ever appears once
  // there's already text in the box, so overwriting it would destroy what
  // the user typed.
  function applySuggestion(phrase: string) {
    setInput((prev) => (prev.startsWith(phrase) ? prev : phrase + prev));
    textareaRef.current?.focus();
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isModK) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setInput("");
    const imagePaths = await uploadAttachedImages();
    setImageFiles([]);
    const result = await submit(message, false, imagePaths);
    turnIdCounter += 1;
    setTurns((t) => [...t, { id: turnIdCounter, userMessage: message, result }]);
  }

  // Answering (or skipping) a "needsClarification" turn resubmits the
  // SAME turn in place — updating its result — rather than appending a
  // new one, since it's a continuation of that one request, not a fresh
  // message. skipClarification: true always, since the check already ran
  // once for this turn's original message.
  async function handleClarificationAnswer(turnId: number, originalMessage: string, questions: string[], answers: string[]) {
    const enriched = appendClarificationAnswers(originalMessage, questions, answers);
    const result = await submit(enriched, true);
    setTurns((t) => t.map((turn) => (turn.id === turnId ? { ...turn, result } : turn)));
  }

  async function handleClarificationSkip(turnId: number, originalMessage: string) {
    const result = await submit(originalMessage, true);
    setTurns((t) => t.map((turn) => (turn.id === turnId ? { ...turn, result } : turn)));
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {turns.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-xl font-bold text-foreground">Create Anything</h1>
            <p className="mt-2 text-sm text-muted">
              Describe anything — a product idea, a trade, feedback from a
              user, a metric — and it lands in the right module
              automatically.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-3">
                <div className="flex items-start justify-end gap-2">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-orange-500 px-4 py-2.5 text-sm text-black">
                    {turn.userMessage}
                  </div>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-semibold text-muted"
                    aria-hidden="true"
                  >
                    {userInitial}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-400"
                    aria-hidden="true"
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <ResultBubble
                    result={turn.result}
                    loading={loading}
                    onAnswerClarification={(questions, answers) =>
                      handleClarificationAnswer(turn.id, turn.userMessage, questions, answers)
                    }
                    onSkipClarification={() => handleClarificationSkip(turn.id, turn.userMessage)}
                  />
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          {imageFiles.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {imageFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-input px-2 py-1 text-xs text-foreground"
                >
                  <span className="max-w-[140px] truncate">{file.name}</span>
                  <button type="button" onClick={() => removeImage(index)} aria-label={t("removeImage")} className="text-muted hover:text-foreground">
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative">
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept={ACCEPTED_ATTACHMENT_IMAGE_TYPES.join(",")}
              onChange={handleImageChange}
              className="hidden"
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={t("askPlaceholder")}
              rows={1}
              className="max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-border bg-panel px-4 py-3.5 pr-24 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted focus:border-orange-500/60"
              autoFocus
            />
            {imageFiles.length < MAX_ATTACHMENT_IMAGES && (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                aria-label={t("attachImage")}
                title={t("attachImage")}
                className="absolute bottom-2 right-12 flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label={t("send")}
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
          <SmartSuggestions
            modules={suggestions.modules}
            visible={suggestions.visible}
            onPick={applySuggestion}
          />
        </form>
      </div>
    </div>
  );
}

function ResultBubble({
  result,
  loading,
  onAnswerClarification,
  onSkipClarification,
}: {
  result: CreateResult;
  loading: boolean;
  onAnswerClarification: (questions: string[], answers: string[]) => void;
  onSkipClarification: () => void;
}) {
  const t = useTranslations("dashboard.createAnything");

  if (result.type === "needsClarification") {
    return (
      <div className="max-w-[80%]">
        <ClarificationQuestions
          questions={result.questions}
          onAnswer={(answers) => onAnswerClarification(result.questions, answers)}
          onSkip={onSkipClarification}
          submitting={loading}
          title={t("clarifyTitle")}
          skipLabel={t("clarifySkip")}
          continueLabel={t("clarifyContinue")}
          answerPlaceholder={t("clarifyAnswerPlaceholder")}
        />
      </div>
    );
  }

  if (result.type === "matched") {
    return (
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-emerald-900/60 bg-emerald-500/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Logged to{" "}
          {result.moduleTitle}
        </p>
        <p className="mt-1 text-foreground/90">{result.message}</p>
        <Link
          href={result.href}
          className="mt-2 inline-block text-xs text-emerald-400 underline underline-offset-2"
        >
          View {result.moduleTitle.toLowerCase()} →
        </Link>
        <NextStepSuggestion sourceHref={result.href} />
      </div>
    );
  }

  if (result.type === "outOfCredits") {
    return <OutOfCreditsNotice />;
  }

  if (result.type === "unmatched") {
    return (
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-orange-900/50 bg-orange-500/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-1.5 text-orange-400">
          <AlertCircle className="h-4 w-4 shrink-0" /> Not sure
        </p>
        <p className="mt-1 text-foreground/90">{result.message}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              {item.label.toLowerCase()}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-red-900/60 bg-red-500/5 px-4 py-3 text-sm text-red-400">
      <p className="flex items-center gap-1.5">
        <XCircle className="h-4 w-4 shrink-0" /> {result.message}
      </p>
    </div>
  );
}
