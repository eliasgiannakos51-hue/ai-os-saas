"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp, CheckCircle2, AlertCircle, XCircle, Paperclip, X } from "lucide-react";
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

export function CreateChat({ showHeading = true }: { showHeading?: boolean }) {
  const t = useTranslations("dashboard.createAnything");
  const { submit, loading } = useCreateAnything();
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = useSmartSuggestions(input);
  const supabase = createClient();
  const { addToast } = useToast();

  // Optional attached image(s) — real vision context for the classifier
  // (see lib/create-attachment-image.ts, api/create/route.ts), e.g. a
  // photo of a product alongside "log this as a new idea". Uploaded right
  // before submit, same pattern as Website Builder's reference images.
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
    // silently dropped here — the request would still submit, just
    // without the image, with no indication anything went wrong. Still
    // proceeds best-effort with whatever DID upload (a request with a
    // partial set of images is still useful), but now actually tells the
    // user which image(s) failed and why, instead of a silent gap.
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
    function handleKeyDown(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isModK) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Kept separately from `input` (which is cleared right after
  // submitting) so a needsClarification follow-up still has the original
  // message to append answers to.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;

    setResult(null);
    const imagePaths = await uploadAttachedImages();
    const outcome = await submit(message, false, imagePaths);
    setResult(outcome);
    if (outcome.type === "needsClarification") {
      setPendingMessage(message);
    }
    if (outcome.type !== "error") {
      setInput("");
      setImageFiles([]);
    }
  }

  async function handleClarificationAnswer(questions: string[], answers: string[]) {
    if (!pendingMessage) return;
    const enriched = appendClarificationAnswers(pendingMessage, questions, answers);
    const outcome = await submit(enriched, true);
    setResult(outcome);
    setPendingMessage(null);
  }

  async function handleClarificationSkip() {
    if (!pendingMessage) return;
    const outcome = await submit(pendingMessage, true);
    setResult(outcome);
    setPendingMessage(null);
  }

  return (
    <div className="w-full">
      {showHeading && (
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Create Anything</h1>
          <p className="mt-2 text-sm text-muted">
            Describe anything — a product idea, a trade, feedback from a user,
            a metric — and it lands in the right module automatically.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
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
        {/* `data-active` drives the animated rim in globals.css: the
            gradient speeds up and the halo brightens while the user is
            actually engaged with the box (focused OR mid-sentence), so it
            reacts to real intent rather than pulsing at full strength all
            the time. */}
        <div className="prompt-glow relative" data-active={focused || input.trim().length > 0}>
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
            placeholder={t("describePlaceholder")}
            rows={4}
            maxLength={20000}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="relative z-[1] min-h-32 max-h-[60vh] w-full resize-y rounded-2xl border-0 bg-panel/85 px-4 py-4 pr-28 text-base text-foreground outline-none backdrop-blur-sm transition-all duration-200 placeholder:text-muted"
            autoFocus
          />
          {imageFiles.length < MAX_ATTACHMENT_IMAGES && (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label={t("attachImage")}
              title={t("attachImage")}
              className="absolute bottom-3 right-16 z-[2] flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label={t("send")}
            className="absolute bottom-3 right-3 z-[2] flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#fcd34d_0%,#f97316_60%,#dc4a04_100%)] text-black shadow-[0_4px_18px_-4px_rgba(249,115,22,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_6px_26px_-4px_rgba(249,115,22,0.9)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>

      <SmartSuggestions
        modules={suggestions.modules}
        visible={suggestions.visible}
        onPick={applySuggestion}
      />

      {result && (
        <div className="mt-4">
          {result.type === "needsClarification" && (
            <ClarificationQuestions
              questions={result.questions}
              onAnswer={(answers) => handleClarificationAnswer(result.questions, answers)}
              onSkip={handleClarificationSkip}
              submitting={loading}
              title={t("clarifyTitle")}
              skipLabel={t("clarifySkip")}
              continueLabel={t("clarifyContinue")}
              answerPlaceholder={t("clarifyAnswerPlaceholder")}
            />
          )}

          {result.type === "matched" && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-900/60 bg-emerald-500/5 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="text-emerald-400">
                  Logged to:{" "}
                  <span className="font-semibold">{result.moduleTitle}</span>
                </p>
                <p className="mt-1 text-foreground/90">{result.message}</p>
                <Link
                  href={result.href}
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-emerald-900/60 px-3 py-1.5 text-xs text-emerald-400 transition-colors duration-150 hover:border-emerald-500"
                >
                  View {result.moduleTitle.toLowerCase()} →
                </Link>
                <NextStepSuggestion sourceHref={result.href} />
              </div>
            </div>
          )}

          {result.type === "outOfCredits" && <OutOfCreditsNotice className="mt-3" />}

          {result.type === "unmatched" && (
            <div className="flex items-start gap-3 rounded-2xl border border-orange-900/50 bg-orange-500/5 p-4 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
              <div className="min-w-0">
                <p className="text-foreground/90">{result.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-3 py-1 text-xs text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:px-2.5"
                    >
                      {item.label.toLowerCase()}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result.type === "error" && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-900/60 bg-red-500/5 p-4 text-sm text-red-400">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{result.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
