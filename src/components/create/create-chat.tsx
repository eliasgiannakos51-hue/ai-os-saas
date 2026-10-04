"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp, CheckCircle2, AlertCircle, MessageCircle, XCircle, Paperclip, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/modules";
import { useCreateAnything, type CreateResult } from "@/lib/use-create-anything";
import { OutOfCreditsNotice } from "@/components/credits/out-of-credits-notice";
import { useSmartSuggestions } from "@/lib/use-smart-suggestions";
import { SmartSuggestions } from "@/components/create/smart-suggestions";
import { NextStepSuggestion } from "@/components/create/next-step-suggestion";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { appendClarificationAnswers, alignSuggestions } from "@/lib/clarification-client";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { useToast } from "@/components/toast/toast-context";
import {
  ACCEPTED_ATTACHMENT_IMAGE_TYPES,
  buildAttachmentImagePath,
  CREATE_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_IMAGES,
} from "@/lib/create-attachment-image";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { producerHref, PRODUCER_SPECS, type ProducerKey } from "@/lib/create-studio/producer-routes";
import { preflight, voiceStep, VOICE_IDLE, type VoiceState } from "@/lib/voice/voice-command";
import { GoalPreview, GoalQuestion, RouteLine, VoiceSendConfirm } from "@/components/create/goal-preview";
import { useCommandPalette } from "@/components/dashboard/command-palette-context";
import { useCostEstimate } from "@/components/credits/use-cost-estimate";
import { useRouter } from "next/navigation";
import { VoiceInput } from "@/components/voice/voice-input";

export function CreateChat({
  showHeading = true,
  hero = false,
}: {
  showHeading?: boolean;
  /**
   * HOME'S FIELD, AND THE REASON IT IS A vh AND NOT A PIXEL COUNT.
   *
   * Redesign phase 1 asks the box to hold at least 40% of the first
   * screen at 1440 AND at 390 — two viewports whose heights differ by
   * sixty pixels and whose widths differ by a thousand. A fixed height
   * that satisfies one is wrong for the other, and both would drift the
   * next time the top bar grows a row. 46vh is the requirement itself,
   * written as the rule instead of as a number that happens to satisfy
   * it today: it clears 40% at every height, with room for the chrome
   * above the page body. scripts/tests/home-first-screen.prodtest.mjs
   * measures the rendered box rather than trusting this comment.
   */
  hero?: boolean;
}) {
  const t = useTranslations("dashboard.createAnything");
  const tKey = useTranslations();
  const tCreate = useTranslations("dashboard.create");
  // Only decides how much room the box leaves on the right: with no
  // transcription provider VoiceInput draws nothing, and padding for a
  // button that was never there is dead space.
  const { submit, loading } = useCreateAnything();
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = useSmartSuggestions(input);
  const router = useRouter();

  // THE FREE PRE-FLIGHT, IN THE ORDER THAT SPENDS NOTHING.
  //
  //   1. lib/ai/ambiguity.ts reads the text. "vague" asks, here, with no
  //      model call at all — paying a classifier to agree that "κάν' το"
  //      is thin would be waste, which is the whole argument that file
  //      makes for having three answers instead of two.
  //   2. lib/create-studio/producer-routes.ts looks for one of six
  //      producers. Two named in one sentence is a question, not a coin
  //      toss.
  //   3. Only if neither fired does the paid classifier run, exactly as
  //      it did before this round.
  //
  // AT MOST ONE QUESTION: step 1 returns before step 2 can ask, so the
  // two can never stack.
  const [goal, setGoal] = useState<
    | { kind: "preview"; producer: ProducerKey; brief: string }
    | { kind: "question"; choices: ProducerKey[]; brief: string }
    | null
  >(null);
  // Hooks cannot be called conditionally, so the estimate is always
  // computed and only ever SHOWN behind a preview. createAnything is the
  // stand-in profile when there is nothing to preview; its number is
  // never rendered.
  const goalProfile = goal?.kind === "preview" ? PRODUCER_SPECS[goal.producer].profile : null;
  const goalEstimate = useCostEstimate(goalProfile ?? "createAnything", {
    inputChars: goal?.kind === "preview" ? goal.brief.length : 0,
  });
  // THE MICROPHONE'S CARD. A transcript becomes "heard", shown with what it
  // would do, and nothing moves until the card is answered - see
  // lib/voice/voice-command.ts for why, and voice-command.test.mjs for the
  // run that holds it.
  const [voice, setVoice] = useState<VoiceState>(VOICE_IDLE);
  const heardPlan = voice.kind === "heard" ? voice.plan : null;
  const voiceEstimate = useCostEstimate(
    (heardPlan?.kind === "open" ? PRODUCER_SPECS[heardPlan.producer].profile : null) ?? "createAnything",
    { inputChars: heardPlan ? heardPlan.brief.length : 0 }
  );
  const supabase = createClient();
  const { addToast } = useToast();

  // Optional attached image(s) — real vision context for the classifier
  // (see lib/create-attachment-image.ts, api/create/route.ts), e.g. a
  // photo of a product alongside "log this as a new idea". Uploaded right
  // before submit, same pattern as Website Builder's reference images.
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  // THE ROUTING LINE under the field (components/create/goal-preview.tsx,
  // RouteLine). Read live from the same preflight() Send uses; with a photo
  // attached Send goes to the classifier, so the line says so too.
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const livePlan =
    input.trim() && voice.kind === "idle" && !goal && !loading
      ? imageFiles.length > 0
        ? ({ kind: "classify", brief: input.trim() } as const)
        : preflight(input)
      : null;
  const liveEstimate = useCostEstimate(
    (livePlan?.kind === "open" ? PRODUCER_SPECS[livePlan.producer].profile : null) ?? "createAnything",
    { inputChars: input.length, imageCount: imageFiles.length },
  );
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
  // The text as submitted, kept so "record it anyway" can send exactly
  // what the user wrote rather than whatever is in the box now.
  const [lastSubmitted, setLastSubmitted] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;

    setResult(null);
    setGoal(null);
    setVoice(VOICE_IDLE);

    // An attached image is evidence for the paid classifier ("log this
    // photo as an idea") and says nothing about which producer is meant,
    // so the free pre-flight is skipped whenever one is present rather
    // than being allowed to route on the text alone and drop the picture.
    // The pre-flight itself is lib/voice/voice-command.ts's, shared with
    // the microphone so typed and spoken text are read the same way.
    if (imageFiles.length === 0) {
      const plan = preflight(message);
      if (plan.kind === "question") {
        setGoal({ kind: "question", choices: plan.choices, brief: message });
        return;
      }
      if (plan.kind === "open") {
        setGoal({ kind: "preview", producer: plan.producer, brief: message });
        return;
      }
    }
    await sendToClassifier(message);
  }

  /** The paid path: /api/create reads the sentence and may answer it or
   *  file it. Reached by typed Send, or by "Yes" on the microphone's card -
   *  never by a transcript on its own. */
  async function sendToClassifier(message: string) {
    setLastSubmitted(message);
    const imagePaths = await uploadAttachedImages();
    const outcome = await submit(message, false, imagePaths);
    // THE BYTES ARE UNDONE WHEN THE REQUEST THEY WERE FOR FAILS.
    //
    // The photographs go to create-attachments before /api/create is
    // called, so a failed request leaves objects nothing points at.
    // website-references has a sweeper for exactly this
    // (/api/cron/website-storage-cleanup); this bucket has none, so the
    // undo has to happen where the upload did. Only on `error`: a
    // needsClarification outcome is a request still in flight and its
    // images are about to be used.
    if (outcome.type === "error" && imagePaths.length > 0) {
      try {
        await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).remove(imagePaths);
      } catch {
        /* the request already failed; a second message about cleanup helps nobody */
      }
    }
    setResult(outcome);
    if (outcome.type === "needsClarification") {
      setPendingMessage(message);
    }
    if (outcome.type !== "error") {
      setInput("");
      setImageFiles([]);
    }
  }

  /** Resubmit the same text, telling the classifier the user has already
   *  been asked and chose to file it. */
  async function submitText(message: string, recordAnyway = false) {
    if (!message.trim()) return;
    setResult(null);
    const outcome = await submit(recordAnyway ? `${message}\n\n[The user confirmed: record this, do not answer it.]` : message, true);
    setResult(outcome);
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
          <h1 className="text-2xl font-bold text-foreground">{tCreate("title")}</h1>
          <p className="mt-2 text-sm text-muted">{tCreate("subtitle")}</p>
        </div>
      )}

      {voice.kind === "heard" && voice.plan.kind === "open" && (
        <GoalPreview
          producer={voice.plan.producer}
          credits={voiceEstimate.credits}
          heard={voice.transcript}
          onConfirm={() => {
            if (voice.kind !== "heard" || voice.plan.kind !== "open") return;
            const href = producerHref(voice.plan.producer, voice.plan.brief);
            setVoice((v) => voiceStep(v, { type: "CONFIRM" }));
            setInput("");
            router.push(href);
          }}
          onChange={() => {
            setVoice((v) => voiceStep(v, { type: "EDIT" }));
            textareaRef.current?.focus();
          }}
        />
      )}
      {voice.kind === "heard" && voice.plan.kind === "question" && (
        <GoalQuestion
          choices={voice.plan.choices}
          heard={voice.transcript}
          onPick={(producer) => {
            if (voice.kind !== "heard") return;
            const href = producerHref(producer, voice.plan.brief);
            setVoice((v) => voiceStep(v, { type: "CONFIRM" }));
            setInput("");
            router.push(href);
          }}
          onDismiss={() => {
            setVoice((v) => voiceStep(v, { type: "EDIT" }));
            textareaRef.current?.focus();
          }}
        />
      )}
      {voice.kind === "heard" && voice.plan.kind === "classify" && (
        <VoiceSendConfirm
          heard={voice.transcript}
          credits={voiceEstimate.credits}
          onConfirm={() => {
            if (voice.kind !== "heard") return;
            const message = voice.plan.brief;
            setVoice((v) => voiceStep(v, { type: "CONFIRM" }));
            void sendToClassifier(message).finally(() => setVoice((v) => voiceStep(v, { type: "DONE" })));
          }}
          onFix={() => {
            setVoice((v) => voiceStep(v, { type: "EDIT" }));
            textareaRef.current?.focus();
          }}
          onCancel={() => {
            setVoice((v) => voiceStep(v, { type: "CANCEL" }));
            setInput("");
          }}
        />
      )}

      {goal?.kind === "preview" && (
        <GoalPreview
          producer={goal.producer}
          credits={goalEstimate.credits}
          onConfirm={() => {
            const href = producerHref(goal.producer, goal.brief);
            setGoal(null);
            setInput("");
            router.push(href);
          }}
          onChange={() => setGoal(null)}
        />
      )}
      {goal?.kind === "question" && (
        <GoalQuestion
          choices={goal.choices}
          onPick={(producer) => {
            const href = producerHref(producer, goal.brief);
            setGoal(null);
            setInput("");
            router.push(href);
          }}
          onDismiss={() => setGoal(null)}
        />
      )}

      <form onSubmit={handleSubmit}>
        {imageFiles.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {imageFiles.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-input px-2 py-1 text-xs text-foreground"
              >
                <span className="max-w-[140px] break-all">{file.name}</span>
                <button type="button" onClick={() => removeImage(index)} aria-label={t("removeImage")} className="text-muted hover:text-foreground">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* `data-active` marks the box as in use (focused OR
            mid-sentence); the rim itself is .prompt-glow in globals.css.
            Attach and voice sit bottom-left, Send bottom-right — the
            design's field (docs/CONTEXT.md, «ΑΡΧΙΚΗ»). */}
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
            onChange={(e) => {
              setInput(e.target.value);
              // Edited by hand, the card's reading is of words no longer in
              // the box; Send reads them afresh.
              if (voice.kind === "heard") setVoice((v) => voiceStep(v, { type: "EDIT" }));
            }}
            placeholder={hero ? t("accomplishPlaceholder") : t("describePlaceholder")}
            rows={4}
            maxLength={20000}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`relative z-[1] ${hero ? "min-h-36" : "min-h-32"} max-h-[60vh] w-full resize-y rounded-2xl border-0 bg-panel px-4 pb-16 pt-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted`}
            autoFocus
          />
          {/* THE MICROPHONE, BESIDE THE BOX. Its transcript lands in the
              textarea AND becomes the card above, which says what was
              heard and what would happen. It never sends and never
              navigates: Create spends real credits, and a mishearing that
              went straight through would cost money or file a record
              nobody asked for. Only the card's own buttons move on. */}
          <div className="absolute bottom-3 start-14 z-[2]">
            <VoiceInput
              compact
              review="card"
              disabled={loading}
              onTranscript={(text) => {
                const combined = input.trim() ? `${input.trim()} ${text}` : text;
                setInput(combined);
                setResult(null);
                setGoal(null);
                setVoice((v) => voiceStep(v, { type: "TRANSCRIBED", transcript: combined, withImages: imageFiles.length > 0 }));
              }}
            />
          </div>
          {imageFiles.length < MAX_ATTACHMENT_IMAGES && (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label={t("attachImage")}
              title={t("attachImage")}
              className="absolute bottom-3 start-3 z-[2] flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label={t("send")}
            className="absolute bottom-3 end-3 z-[2] flex h-11 w-11 items-center justify-center rounded-full bg-button text-button-ink transition-all duration-200 hover:brightness-110 hover: disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <ThinkingIndicator size="sm" tone="inherit" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>

      {/* A destination with no estimate profile shows no number — not the
          classifier's number under the destination's name. */}
      <RouteLine
        plan={livePlan}
        credits={livePlan?.kind === "open" && !PRODUCER_SPECS[livePlan.producer].profile ? 0 : liveEstimate.credits}
        onChange={() => setPaletteOpen(true)}
      />

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
              suggestions={alignSuggestions(result.questions, result.suggestions)}
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
            <div className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success/5 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="text-success">
                  {tCreate("loggedTo")}{" "}
                  <span className="font-semibold">{result.moduleTitle}</span>
                </p>
                <p className="mt-1 text-foreground/90">{result.message}</p>
                <Link
                  href={result.href}
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-success/40 px-3 py-1.5 text-xs text-success transition-colors duration-150 hover:border-success"
                >
                  {tCreate("viewModule", { module: result.moduleTitle })}
                </Link>
                <NextStepSuggestion sourceHref={result.href} />
              </div>
            </div>
          )}

          {/* A QUESTION, ANSWERED. Nothing was filed — the whole point.
              "τι ξέρεις για μένα" used to become a Document. */}
          {result.type === "answered" && (
            <div
              data-testid="create-answer"
              className="flex items-start gap-3 surface-tight text-sm"
            >
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="whitespace-pre-wrap text-foreground/90">{result.answer}</p>
                <p className="mt-2 text-[11px] text-muted">{tCreate("answeredNotFiled")}</p>
                <Link
                  href="/dashboard/chat"
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground"
                >
                  {tCreate("continueInChat")}
                </Link>
              </div>
            </div>
          )}

          {/* GENUINELY UNCLEAR — ask, do not guess. Guessing wrong is how
              a question became a document nobody asked for. */}
          {result.type === "ambiguous" && (
            <div
              data-testid="create-ambiguous"
              className="flex items-start gap-3 rounded-2xl border border-border bg-foreground/5 p-4 text-sm"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-foreground/90">{result.message || tCreate("looksLikeQuestion")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/chat"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-foreground/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-foreground/10"
                  >
                    {tCreate("answerItInstead")}
                  </Link>
                  <button
                    type="button"
                    data-testid="create-record-anyway"
                    onClick={() => void submitText(lastSubmitted, true)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:text-foreground"
                  >
                    {tCreate("recordItAnyway")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {result.type === "outOfCredits" && <OutOfCreditsNotice className="mt-3" />}

          {result.type === "unmatched" && (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-foreground/5 p-4 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
              <div className="min-w-0">
                <p className="text-foreground/90">{result.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-3 py-1 text-xs text-muted transition-colors duration-150 hover:border-foreground/40 hover:text-foreground sm:px-2.5"
                    >
                      {tKey(item.titleKey)}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result.type === "error" && (
            <div className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{result.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
