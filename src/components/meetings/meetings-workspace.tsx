"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCredits } from "@/components/credits/credits-context";
import { ShieldAlert, Trash2, Upload } from "lucide-react";
import {
  checkMeetingUpload,
  isMeetingAudioType,
  meetingCostCredits,
  secondsFromBytes,
  type MeetingLimits,
  type MeetingPrice,
} from "@/lib/meetings/meeting-limits";
import type { ProposedAction } from "@/lib/meetings/meeting-analysis";

export type MeetingRow = {
  id: string;
  title: string;
  language: string | null;
  transcript: string;
  summary: string | null;
  proposed_actions: ProposedAction[] | null;
  duration_seconds: number;
  credits_charged: number;
  analysis_error: string | null;
  analysed_at: string | null;
  created_at: string;
};

export type KeptAction = {
  id: string;
  meeting_id: string;
  who: string | null;
  what: string;
  when_text: string | null;
  due_date: string | null;
  done: boolean;
  source_index: number | null;
  created_at: string;
};

/**
 * THE SCREEN: choose a recording, read what it will cost, press once.
 *
 * ---------------------------------------------------------------------
 * THE NOTICE IS BEFORE THE FILE PICKER, NOT AFTER IT
 * ---------------------------------------------------------------------
 *
 * «Ο ήχος διαγράφεται μόλις απομαγνητοφωνηθεί. Βεβαιώσου ότι όσοι μιλούν
 * το γνωρίζουν.» — in all ten languages, above the button rather than in
 * a tooltip or a settings page. The people in a recording are the only
 * ones in this transaction who cannot consent to it, and the person
 * holding the file is the only one who can tell them. A sentence they
 * read AFTER uploading is a sentence about something that already
 * happened.
 *
 * ---------------------------------------------------------------------
 * THE LIMITS ARE PROPS
 * ---------------------------------------------------------------------
 *
 * Never derived here: `process.env.MAX_FUNCTION_DURATION` is undefined in
 * a browser, so a client computing its own ceiling would offer the 800s
 * default on a 60s deployment and have the server refuse what it invited.
 * The page computes them; this component is told.
 *
 * The check it runs is the SAME function the route runs
 * (`checkMeetingUpload`) — not a second implementation of the same rule,
 * which is how the two drift apart and the message stops matching the
 * refusal. The route's copy is the one that decides; this one exists so
 * the user reads a sentence with both numbers in it before spending a
 * minute uploading.
 */
export function MeetingsWorkspace({
  limits,
  price,
  minutes,
  meetings,
  keptActions,
}: {
  limits: MeetingLimits;
  price: MeetingPrice;
  minutes: { usedSeconds: number; limitMinutes: number };
  meetings: MeetingRow[];
  keptActions: KeptAction[];
}) {
  const t = useTranslations("dashboard.meetings");
  // The out-of-credits sentence already exists, in ten languages, and is
  // the one every other feature shows. A second copy under this
  // namespace would be a second copy to keep in step.
  const tCredits = useTranslations("credits");
  // WHAT IT COST, SAID OUT LOUD. Both routes return a receipt built
  // from the SETTLED figure, and a client that calls refresh() instead
  // of reporting it leaves the user to work out the difference from a
  // balance that moved — the failure scripts/tests/credit-visibility.test.mjs
  // found on four routes at once.
  const { reportUsage } = useCredits();

  const [rows, setRows] = useState<MeetingRow[]>(meetings);
  const [kept, setKept] = useState<KeptAction[]>(keptActions);
  const [file, setFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [durationRead, setDurationRead] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "transcribing" | "analysing">("idle");
  const [openId, setOpenId] = useState<string | null>(meetings[0]?.id ?? null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
  const mins = (s: number) => Math.max(1, Math.round(s / 60));

  /**
   * THE DURATION, WITHOUT DECODING THE FILE.
   *
   * An <audio> element reads the container's metadata; decodeAudioData
   * would decode the whole thing to Float32 — four bytes per sample per
   * channel, which is 110MB of live memory for thirty minutes and is
   * what a phone does not have. The duration is the only thing needed
   * here, and the cheap way gets it.
   *
   * It can fail, and a failure is REPORTED rather than absorbed: a
   * variable-bitrate file from some recorders has no duration in its
   * header, and the price is then estimated from the bytes. The screen
   * says which of the two it did.
   */
  const readDuration = useCallback((chosen: File) => {
    const url = URL.createObjectURL(chosen);
    const audio = new Audio();
    const done = (value: number, read: boolean) => {
      URL.revokeObjectURL(url);
      setSeconds(value);
      setDurationRead(read);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0) done(Math.ceil(d), true);
      else done(secondsFromBytes(chosen.size), false);
    };
    audio.onerror = () => done(secondsFromBytes(chosen.size), false);
    audio.src = url;
  }, []);

  const choose = useCallback(
    (chosen: File | null) => {
      setProblem(null);
      setFile(null);
      setSeconds(0);
      setDurationRead(true);
      if (!chosen) return;
      if (!isMeetingAudioType(chosen.type)) {
        setProblem(t("notAudio"));
        return;
      }
      // Bytes are known immediately and are the exact ceiling; the
      // duration check runs again once the metadata arrives.
      const byteVerdict = checkMeetingUpload({ bytes: chosen.size, seconds: 0 }, limits);
      if (!byteVerdict.ok && byteVerdict.reason === "too_large") {
        setProblem(
          t("tooLarge", { actual: mb(byteVerdict.actualBytes), allowed: mb(byteVerdict.allowedBytes) })
        );
        return;
      }
      setFile(chosen);
      readDuration(chosen);
    },
    [limits, readDuration, t]
  );

  const tooLong = useMemo(() => {
    if (!file || seconds <= 0) return null;
    const verdict = checkMeetingUpload({ bytes: file.size, seconds }, limits);
    if (verdict.ok || verdict.reason !== "too_long") return null;
    return t("tooLong", {
      actual: mins(verdict.actualSeconds),
      allowed: mins(verdict.allowedSeconds),
    });
  }, [file, seconds, limits, t]);

  async function transcribe() {
    if (!file || tooLong) return;
    setBusy("transcribing");
    setProblem(null);
    try {
      const body = new FormData();
      body.append("audio", file);
      body.append("seconds", String(seconds));
      const res = await fetch("/api/meetings/transcribe", { method: "POST", body });
      // A NON-JSON REPLY IS THE HOST'S 413, not ours: a body over the
      // platform's cap never reaches the route, and the answer is HTML.
      // Reading it as JSON would throw and the catch would say
      // "something went wrong", which is the least useful true sentence
      // available.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setProblem(errorText(data?.code, res.status));
        return;
      }
      void reportUsage(data);
      if (data.meeting) {
        setRows((prev) => [data.meeting as MeetingRow, ...prev]);
        setOpenId(data.meeting.id);
        void analyse(data.meeting.id);
      } else {
        // Transcribed and paid for, but the row did not write. The text
        // is still shown, with the warning that it is not saved.
        setProblem(t("savedWarning"));
      }
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setProblem(errorText("failed", 500));
    } finally {
      setBusy("idle");
    }
  }

  async function analyse(meetingId: string) {
    setBusy("analysing");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/analyse`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const code = data?.code ?? "failed";
        setRows((prev) =>
          prev.map((m) => (m.id === meetingId ? { ...m, analysis_error: code } : m))
        );
        return;
      }
      void reportUsage(data);
      setRows((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                summary: data.meeting.summary,
                proposed_actions: data.meeting.proposed_actions,
                analysis_error: null,
                analysed_at: data.meeting.analysed_at,
              }
            : m
        )
      );
      setTicked(new Set());
    } catch {
      setRows((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, analysis_error: "failed" } : m))
      );
    } finally {
      setBusy("idle");
    }
  }

  async function keep(meetingId: string) {
    if (ticked.size === 0) return;
    const res = await fetch(`/api/meetings/${meetingId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ONLY THE INDEXES. The text is re-read from the row by the route,
      // so this cannot become a way to write any sentence into an action
      // list and have it look as though a meeting produced it.
      body: JSON.stringify({ keep: [...ticked] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setProblem(errorText(data?.code, res.status));
      return;
    }
    setKept((prev) => [...(data.actions as KeptAction[]), ...prev]);
    setTicked(new Set());
  }

  async function remove(meetingId: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
    if (!res.ok) {
      setProblem(errorText("failed", res.status));
      return;
    }
    setRows((prev) => prev.filter((m) => m.id !== meetingId));
    setKept((prev) => prev.filter((a) => a.meeting_id !== meetingId));
  }

  /**
   * A CODE becomes a sentence HERE, in the reader's language. The server
   * stores and returns codes precisely so this file owns the wording.
   *
   * EVERY KEY IS WRITTEN OUT, and `t(`errors.${code}`)` is what it
   * replaced. A template-literal key is invisible to two things that
   * matter: scripts/tests/i18n-coverage.test.mjs, which checks that every
   * key the code uses exists in all ten locales and cannot resolve a
   * key it cannot see; and scripts/tests/message-slices.test.mjs, which
   * counts a component with one as UNBOUNDED — it has to ship the whole
   * catalogue to the browser because nothing can prove which keys it
   * reads. Nine literals cost nine lines and buy both.
   */
  const ERROR_TEXT: Record<string, () => string> = {
    ai_unavailable: () => t("errors.ai_unavailable"),
    unusable: () => t("errors.unusable"),
    too_short: () => t("errors.too_short"),
    not_included: () => t("errors.not_included"),
    out_of_minutes: () => t("errors.out_of_minutes"),
    unsupported_type: () => t("errors.unsupported_type"),
    rate_limited: () => t("errors.rate_limited"),
    empty: () => t("errors.empty"),
    failed: () => t("errors.failed"),
  };

  function errorText(code: unknown, status: number): string {
    if (typeof code === "string" && ERROR_TEXT[code]) {
      return ERROR_TEXT[code]();
    }
    if (status === 402) return tCredits("outOfCredits.detail");
    if (status === 413) {
      return t("tooLarge", { actual: file ? mb(file.size) : "?", allowed: mb(limits.maxBytes) });
    }
    return t("errors.failed");
  }

  const open = rows.find((m) => m.id === openId) ?? null;
  const proposals: ProposedAction[] = Array.isArray(open?.proposed_actions)
    ? open!.proposed_actions
    : [];
  const keptForOpen = kept.filter((a) => a.meeting_id === open?.id);
  const keptIndexes = new Set(
    keptForOpen.map((a) => a.source_index).filter((n): n is number => typeof n === "number")
  );

  return (
    <div className="space-y-6">
      {/* THE NOTICE, ABOVE THE BUTTON. */}
      <section
        data-testid="meeting-audio-notice"
        className="notice-warning flex items-start gap-3 px-4 py-3 text-sm leading-relaxed"
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t("audioNoticeTitle")}</p>
          <p className="mt-0.5">{t("audioNotice")}</p>
        </div>
      </section>

      <section className="surface space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="sr-only"
          data-testid="meeting-file"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== "idle"}
          className="btn-outline"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t("pick")}
        </button>
        <p className="text-xs text-muted">{t("dropHint")}</p>
        <p data-testid="meeting-minutes-left" className="text-xs text-muted">
          {t("minutesLeft", {
            used: Math.round(minutes.usedSeconds / 60),
            limit: minutes.limitMinutes,
          })}
        </p>
        <p className="text-xs text-muted">
          {t("limitHint", {
            mb: mb(limits.maxBytes),
            minutes: mins(secondsFromBytes(limits.maxBytes)),
          })}
        </p>

        {file && (
          <div data-testid="meeting-cost" className="surface-tight">
            <p className="text-sm font-semibold text-foreground">{t("costTitle")}</p>
            {/* BOTH COSTS, BEFORE THE UPLOAD. Transcription is priced per
                minute and the summary per token, and showing only one of
                them is how a person is surprised by the other. */}
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li>{t("costTranscribe", { minutes: mins(seconds) })}</li>
              <li>{t("costSummary")}</li>
            </ul>
            <p data-testid="meeting-cost-total" className="mt-2 text-sm text-foreground">
              {t("costTotal", { credits: meetingCostCredits(price, seconds) })}
            </p>
            {!durationRead && <p className="mt-2 text-xs text-muted">{t("costUnknown")}</p>}
            {tooLong && (
              <p data-testid="meeting-too-long" className="mt-2 text-xs text-amber-300">
                {tooLong}
              </p>
            )}
            <button
              type="button"
              onClick={transcribe}
              disabled={busy !== "idle" || Boolean(tooLong)}
              data-testid="meeting-start"
              /* OUTLINE, NOT FILLED, and the page's one filled control is
                 Keep. By the time somebody reaches this button they have
                 already chosen a file — the decision was the file picker,
                 and this panel confirms what it will cost. Keep is the
                 action this feature exists for and the only one that
                 writes something they will see tomorrow, so it is the one
                 that gets the accent. scripts/tests/one-primary-action.test.mjs
                 holds the page at one. */
              className="btn-outline mt-3"
            >
              {busy === "transcribing" ? t("transcribing") : t("start")}
            </button>
          </div>
        )}

        {problem && (
          <p data-testid="meeting-problem" role="status" className="notice-warning px-3 py-2 text-xs leading-relaxed">
            {problem}
          </p>
        )}
      </section>

      {rows.length === 0 && <p className="surface text-center text-sm text-muted">{t("empty")}</p>}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rows.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setOpenId(m.id);
                setTicked(new Set());
              }}
              aria-pressed={m.id === openId}
              className={`min-h-[44px] rounded-xl border px-3 text-start text-xs transition-colors duration-150 ${
                m.id === openId
                  ? "border-orange-500/60 bg-panel text-foreground"
                  : "border-border bg-panel/60 text-muted hover:border-orange-500/40"
              }`}
            >
              <span className="block max-w-[16rem] truncate">{m.title || t("title")}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <section className="surface space-y-4" data-testid="meeting-detail">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{open.title || t("title")}</h2>
              {open.language && (
                <p className="mt-0.5 text-xs text-muted">
                  {t("detectedLanguage", { language: languageLabel(open.language) })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(open.id)}
              aria-label={t("delete")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors duration-150 hover:border-red-500/60 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {open.summary ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
                {t("summaryTitle")}
              </h3>
              <p data-testid="meeting-summary" className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {open.summary}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {open.analysis_error && (
                <p data-testid="meeting-analysis-error" role="status" className="notice-warning px-3 py-2 text-xs leading-relaxed">
                  {errorText(open.analysis_error, 502)}
                </p>
              )}
              <button
                type="button"
                onClick={() => analyse(open.id)}
                disabled={busy !== "idle"}
                data-testid="meeting-analyse"
                className="btn-outline"
              >
                {busy === "analysing"
                  ? t("analysing")
                  : open.analysis_error
                    ? t("retryAnalysis")
                    : t("analyse")}
              </button>
            </div>
          )}

          {open.analysed_at && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
                {t("proposedTitle")}
              </h3>
              {/* SAID ON THE SCREEN, not left to the word "proposed". */}
              <p data-testid="meeting-proposed-hint" className="mt-1 text-xs text-muted">
                {t("proposedHint")}
              </p>
              {proposals.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("noActions")}</p>
              ) : (
                <>
                  <ul className="row-list mt-2">
                    {proposals.map((action, index) => {
                      const already = keptIndexes.has(index);
                      return (
                        <li key={index}>
                          <label
                            className={`flex min-h-[44px] items-start gap-3 px-3 py-2.5 ${already ? "opacity-60" : ""}`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0"
                              data-testid={`meeting-proposal-${index}`}
                              checked={already || ticked.has(index)}
                              disabled={already}
                              onChange={(e) =>
                                setTicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(index);
                                  else next.delete(index);
                                  return next;
                                })
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm text-foreground">{action.what}</span>
                              <span className="mt-0.5 block text-xs text-muted">
                                {action.who ?? t("unassigned")} · {action.when ?? t("noDate")}
                                {already ? ` · ${t("alreadyKept")}` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => keep(open.id)}
                    disabled={ticked.size === 0}
                    data-testid="meeting-keep"
                    className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-black transition-colors duration-150 hover:bg-orange-400 disabled:opacity-50"
                  >
                    {ticked.size === 0 ? t("keepNone") : t("keepSelected", { count: ticked.size })}
                  </button>
                </>
              )}
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
              {t("keptTitle")}
            </h3>
            {keptForOpen.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted">{t("keptEmpty")}</p>
            ) : (
              <ul data-testid="meeting-kept" className="row-list mt-1.5">
                {keptForOpen.map((a) => (
                  <li key={a.id} className="px-3 py-2.5">
                    <span className="block text-sm text-foreground">{a.what}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {a.who ?? t("unassigned")} · {a.when_text ?? t("noDate")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-muted">
              {t("transcriptTitle")}
            </summary>
            <p data-testid="meeting-transcript" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {open.transcript}
            </p>
          </details>
        </section>
      )}
    </div>
  );
}

/**
 * The detected language, named in the reader's own language.
 *
 * `Intl.DisplayNames` with no locale argument follows the browser, which
 * is the right default here: this string sits in the reader's interface,
 * unlike the summary, which is in the meeting's language on purpose.
 */
function languageLabel(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
