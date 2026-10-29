"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCredits } from "@/components/credits/credits-context";
import { Bell, Mic, ShieldAlert, Square, Target, Trash2, Upload } from "lucide-react";
import {
  checkMeetingUpload,
  isMeetingAudioType,
  meetingCostCredits,
  secondsFromBytes,
  type MeetingLimits,
  type MeetingPrice,
} from "@/lib/meetings/meeting-limits";
import type { DiarizedLine, ProposedAction } from "@/lib/meetings/meeting-analysis";
import { useRecorder } from "@/components/voice/use-recorder";

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
  /** The person's own pick of when to be reminded (Κομμάτι 4, "Remind
   *  me") — never parsed from when_text, unlike due_date's own promise. */
  remind_at: string | null;
  /** Set once api/cron/meeting-action-reminders has sent it. */
  reminded_at: string | null;
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
  goals = null,
}: {
  limits: MeetingLimits;
  price: MeetingPrice;
  minutes: { usedSeconds: number; limitMinutes: number };
  meetings: MeetingRow[];
  keptActions: KeptAction[];
  /** The switch "meeting-goal" (package 17): the person's active projects
   *  to put a goal made from this meeting in. Null when the switch is off. */
  goals?: { projects: { id: string; name: string }[] } | null;
}) {
  const t = useTranslations("dashboard.meetings");
  // The out-of-credits sentence already exists, in ten languages, and is
  // the one every other feature shows. A second copy under this
  // namespace would be a second copy to keep in step.
  const tCredits = useTranslations("credits");
  const locale = useLocale();
  // SAME FORMAT SALES ALREADY SHOWS A REMINDER IN (sales-stages.tsx) —
  // one date style for "a reminder is set on this day", not two.
  const remindDateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
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
  const [busy, setBusy] = useState<"idle" | "transcribing" | "analysing">(
    "idle",
  );
  const [openId, setOpenId] = useState<string | null>(meetings[0]?.id ?? null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [goalWords, setGoalWords] = useState("");
  const [projectChoice, setProjectChoice] = useState<string>(
    goals?.projects[0]?.id ?? "new",
  );
  const [newProjectName, setNewProjectName] = useState("");
  const [goalMade, setGoalMade] = useState<{
    projectId: string;
    steps: number;
  } | null>(null);
  const [goalBusy, setGoalBusy] = useState(false);
  // THE DATE PICKER'S OWN DRAFT, PER ACTION — present only while that
  // action's "Remind me" is open; absent once saved, cancelled, or never
  // opened. Keyed by meeting_actions.id, same as `kept` itself.
  const [remindEdit, setRemindEdit] = useState<Record<string, string>>({});
  const [remindBusy, setRemindBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * THE PLAYER, WITHOUT A SECOND COPY OF THE AUDIO.
   *
   * `src/app/api/meetings/transcribe/route.ts` still keeps none of it —
   * "no bucket, no column, no path" (see that file's own header) is
   * unchanged by this screen. `playerUrl` is a client-only
   * `URL.createObjectURL` of the File the browser already holds in this
   * tab, the exact same File `readDuration` above already opens to read
   * its length. It plays the clip just transcribed, in this tab, for as
   * long as this tab stays open — which is also the honest answer to
   * "keeps the audio only as long as the user wants": closing or
   * reloading the tab is the user not wanting it kept, and it is gone,
   * same as it always was.
   *
   * A meeting opened from the picker chips days later has no File behind
   * it — the audio was never stored — so `playerMeetingId` will not match
   * and the zone says so instead of showing a dead player.
   */
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [playerMeetingId, setPlayerMeetingId] = useState<string | null>(null);
  const playerUrlRef = useRef<string | null>(null);
  useEffect(() => {
    playerUrlRef.current = playerUrl;
  }, [playerUrl]);
  useEffect(() => {
    return () => {
      if (playerUrlRef.current) URL.revokeObjectURL(playerUrlRef.current);
    };
  }, []);

  /**
   * MEETINGS Κομμάτι 5: CLICK A LINE, THE AUDIO SEEKS THERE.
   *
   * `playerLines` lives and dies with `playerUrl` above, for the same
   * reason: these are per-segment START times from the provider's own
   * diarized reply, never written to a column, never reachable for a
   * meeting opened from the list days later — that meeting already has
   * no player (playerMeetingId will not match), so it has nothing to
   * seek either, and the transcript renders as the plain block it always
   * has rather than offering a click that could not do anything.
   */
  const [playerLines, setPlayerLines] = useState<DiarizedLine[] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  function seekTo(startSeconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = startSeconds;
  }

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

  /**
   * CAN THIS BROWSER RECORD. Starts false and only turns true after
   * mount — the server render has no `navigator`, and a check made
   * inline during render would answer "no" there and "yes" on the
   * client's first paint, which is the hydration mismatch
   * scripts/tests/voice.test.mjs's own availability comment warns
   * against ("flickers from absent to live" is the SAFE direction;
   * this never even shows the unsafe one). No account/plan gate here —
   * recording and uploading both end at the exact same
   * /api/meetings/transcribe, so the existing plan/minutes wall applies
   * identically to both.
   */
  const [canRecord, setCanRecord] = useState(false);
  useEffect(() => {
    setCanRecord(
      typeof MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  // THE SAME NOTICE, NOW A GATE. audioNoticeTitle/audioNotice already
  // say "make sure the people speaking know" — recording asks the exact
  // same thing a room full of OTHER people never typed into a file
  // picker, so this reuses that sentence rather than inventing a second
  // one, and ΔΕΝ ΚΑΝΕΙ ("recording without the notice") becomes a real
  // gate: start() below is never called before this confirms, once.
  const [recordConfirm, setRecordConfirm] = useState(false);
  const recordExplainedRef = useRef(false);

  /**
   * THE RECORDING'S OWN CEILING, SHORTER THAN THE SERVER'S WHEN THE
   * BYTES SAY SO. `limits.maxSeconds` alone is not enough: Whisper and
   * the function budget bound TIME, but api/meetings/transcribe's own
   * 4MB body cap bounds BYTES, and a live recording at the recorder's
   * fixed bitrate (use-recorder.ts's `audioBitsPerSecond: 32_000`, the
   * same ASSUMED_VOICE_KBPS secondsFromBytes already prices uploads at)
   * fills those bytes in well under an hour. Stopping here, at whichever
   * ceiling binds first, means a recording is never cut off AND never
   * refused for being one second over what it was allowed to make.
   */
  const recordingCeilingSeconds = Math.min(
    limits.maxSeconds,
    secondsFromBytes(limits.maxBytes),
  );

  function acceptRecording({
    blob,
    seconds: recordedSeconds,
  }: {
    blob: Blob;
    seconds: number;
    mimeType: string;
  }) {
    setProblem(null);
    const recorded = new File([blob], "meeting-recording", {
      type: blob.type,
    });
    const verdict = checkMeetingUpload(
      { bytes: recorded.size, seconds: recordedSeconds },
      limits,
    );
    if (!verdict.ok) {
      setProblem(
        verdict.reason === "too_large"
          ? t("tooLarge", {
              actual: mb(verdict.actualBytes),
              allowed: mb(verdict.allowedBytes),
            })
          : verdict.reason === "too_long"
            ? t("tooLong", {
                actual: mins(verdict.actualSeconds),
                allowed: mins(verdict.allowedSeconds),
              })
            : t("notAudio"),
      );
      return;
    }
    setPlayerUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(recorded);
    });
    setPlayerMeetingId(null);
    setPlayerLines(null);
    setFile(recorded);
    setSeconds(recordedSeconds);
    // EXACT, NOT ESTIMATED: the recorder measured wall-clock time itself
    // (performance.now() in use-recorder.ts), which is the real number
    // readDuration's <audio>-metadata guess exists to approximate for an
    // uploaded file. No guess to flag as a guess.
    setDurationRead(true);
  }

  function recordError(reason: "denied" | "unsupported" | "no_speech" | "failed") {
    // Routed through errorText()/ERROR_TEXT below, the SAME lookup the
    // server's own error codes use — these four are the browser's codes
    // instead of the server's, but the rule that keeps every t(...) call
    // site a literal (not a template) is the same one.
    const code =
      reason === "denied"
        ? "record_denied"
        : reason === "unsupported"
          ? "record_unsupported"
          : reason === "no_speech"
            ? "record_empty"
            : "record_failed";
    setProblem(errorText(code, 0));
  }

  const recorder = useRecorder({
    maxSeconds: recordingCeilingSeconds,
    onResult: acceptRecording,
    onError: recordError,
  });

  function pressRecord() {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    if (!recordExplainedRef.current) {
      setRecordConfirm(true);
      return;
    }
    void recorder.start();
  }

  const choose = useCallback(
    (chosen: File | null) => {
      setProblem(null);
      setFile(null);
      setSeconds(0);
      setDurationRead(true);
      setPlayerUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPlayerMeetingId(null);
      setPlayerLines(null);
      if (!chosen) return;
      if (!isMeetingAudioType(chosen.type)) {
        setProblem(t("notAudio"));
        return;
      }
      // Bytes are known immediately and are the exact ceiling; the
      // duration check runs again once the metadata arrives.
      const byteVerdict = checkMeetingUpload(
        { bytes: chosen.size, seconds: 0 },
        limits,
      );
      if (!byteVerdict.ok && byteVerdict.reason === "too_large") {
        setProblem(
          t("tooLarge", {
            actual: mb(byteVerdict.actualBytes),
            allowed: mb(byteVerdict.allowedBytes),
          }),
        );
        return;
      }
      setFile(chosen);
      setPlayerUrl(URL.createObjectURL(chosen));
      readDuration(chosen);
    },
    [limits, readDuration, t],
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
      const res = await fetch("/api/meetings/transcribe", {
        method: "POST",
        body,
      });
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
        setPlayerMeetingId(data.meeting.id);
        // Κομμάτι 5: the per-line start times the provider's diarized
        // reply carried, for exactly as long as playerUrl above lives —
        // never sent anywhere else, never stored.
        setPlayerLines(Array.isArray(data.lines) ? (data.lines as DiarizedLine[]) : null);
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
      const res = await fetch(`/api/meetings/${meetingId}/analyse`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const code = data?.code ?? "failed";
        setRows((prev) =>
          prev.map((m) =>
            m.id === meetingId ? { ...m, analysis_error: code } : m,
          ),
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
            : m,
        ),
      );
      setTicked(new Set());
    } catch {
      setRows((prev) =>
        prev.map((m) =>
          m.id === meetingId ? { ...m, analysis_error: "failed" } : m,
        ),
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

  /**
   * THE TICKED ACTIONS BECOME A GOAL'S STEPS, IN A PROJECT (package 17).
   * A new project is made first through api/projects — where the plan's
   * project cap lives — and the goal then through api/meetings/[id]/goal,
   * which re-reads the actions by index. Only the indexes are sent.
   */
  async function makeGoal(meetingId: string) {
    if (ticked.size === 0 || goalBusy) return;
    setGoalBusy(true);
    setProblem(null);
    try {
      let projectId = projectChoice;
      if (projectChoice === "new") {
        const made = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newProjectName.trim(),
            goal: goalWords.trim(),
          }),
        });
        const madeBody = await made.json().catch(() => null);
        if (!made.ok || !madeBody?.project?.id) {
          setProblem(
            madeBody?.error === "project_limit_reached"
              ? t("goal.projectLimit")
              : madeBody?.error === "too_short" ||
                  madeBody?.error === "too_long"
                ? t("goal.projectName")
                : t("errors.failed"),
          );
          return;
        }
        projectId = String(madeBody.project.id);
      }
      const res = await fetch(`/api/meetings/${meetingId}/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep: [...ticked], goal: goalWords.trim(), projectId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setProblem(
          data?.code === "project_full"
            ? t("goal.projectFull")
            : errorText(data?.code, res.status),
        );
        return;
      }
      setGoalMade({
        projectId: String(data.projectId),
        steps: Number(data.steps),
      });
      setTicked(new Set());
      setGoalWords("");
    } finally {
      setGoalBusy(false);
    }
  }

  const DAY_MS = 86_400_000;
  /** The date input's own format, in the person's time zone — the same
   *  shape sales-stages.tsx's own dateInput() is, not exported from
   *  there, so repeated here rather than reached across tools for a
   *  four-line date helper. */
  function dateInput(d: Date): string {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }

  function openRemind(action: KeptAction) {
    setRemindEdit((prev) => ({
      ...prev,
      [action.id]: action.remind_at && !action.reminded_at ? dateInput(new Date(action.remind_at)) : dateInput(new Date(Date.now() + DAY_MS)),
    }));
  }

  function closeRemind(actionId: string) {
    setRemindEdit((prev) => {
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  }

  /**
   * THE SAME REMINDER SALES ALREADY SETS (sales-stages.tsx's own move()):
   * a day, fixed at nine in the morning in the person's own time zone,
   * sent to a route that re-validates it with the SAME `readReminder`
   * (lib/sales/stages.ts) the Sales route itself calls — one rule for
   * "is this a reminder", not a second copy that could drift from it.
   */
  async function saveRemind(action: KeptAction) {
    const day = remindEdit[action.id];
    if (!day || remindBusy) return;
    setRemindBusy(action.id);
    setProblem(null);
    try {
      const remindAt = new Date(`${day}T09:00:00`).toISOString();
      const res = await fetch(`/api/meetings/${action.meeting_id}/actions/${action.id}/remind`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindAt }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setProblem(data?.code === "bad_reminder" ? t("remind.bad") : errorText(data?.code, res.status));
        return;
      }
      setKept((prev) =>
        prev.map((a) => (a.id === action.id ? { ...a, remind_at: data.action.remind_at, reminded_at: data.action.reminded_at } : a)),
      );
      closeRemind(action.id);
    } finally {
      setRemindBusy(null);
    }
  }

  async function cancelRemind(action: KeptAction) {
    if (remindBusy) return;
    setRemindBusy(action.id);
    setProblem(null);
    try {
      const res = await fetch(`/api/meetings/${action.meeting_id}/actions/${action.id}/remind`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindAt: null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setProblem(errorText(data?.code, res.status));
        return;
      }
      setKept((prev) => prev.map((a) => (a.id === action.id ? { ...a, remind_at: null, reminded_at: null } : a)));
    } finally {
      setRemindBusy(null);
    }
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
    if (playerMeetingId === meetingId) {
      setPlayerUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPlayerMeetingId(null);
      setPlayerLines(null);
    }
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
    // The browser's own recorder codes (use-recorder.ts's onError
    // reasons), not the server's — same map, same lookup, so a reader
    // of errorText() below does not need to know which side a failure
    // came from to find its sentence.
    record_denied: () => t("errors.record_denied"),
    record_unsupported: () => t("errors.record_unsupported"),
    record_empty: () => t("errors.record_empty"),
    record_failed: () => t("errors.record_failed"),
  };

  function errorText(code: unknown, status: number): string {
    if (typeof code === "string" && ERROR_TEXT[code]) {
      return ERROR_TEXT[code]();
    }
    if (status === 402) return tCredits("outOfCredits.detail");
    if (status === 413) {
      return t("tooLarge", {
        actual: file ? mb(file.size) : "?",
        allowed: mb(limits.maxBytes),
      });
    }
    return t("errors.failed");
  }

  const open = rows.find((m) => m.id === openId) ?? null;
  const proposals: ProposedAction[] = Array.isArray(open?.proposed_actions)
    ? open!.proposed_actions
    : [];
  const keptForOpen = kept.filter((a) => a.meeting_id === open?.id);
  const keptIndexes = new Set(
    keptForOpen
      .map((a) => a.source_index)
      .filter((n): n is number => typeof n === "number"),
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
          aria-label={t("pick")}
          data-testid="meeting-file"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== "idle" || recorder.recording}
            className="btn-outline"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {t("pick")}
          </button>
          {/* NOT DRAWN WHEN IT CANNOT RECORD — same rule as the mic in
              Chat (components/voice/voice-input.tsx): a control that
              would only ever fail reads as broken, not as off. */}
          {canRecord && (
            <button
              type="button"
              onClick={pressRecord}
              disabled={
                (busy !== "idle" && !recorder.recording) ||
                recorder.state === "requesting"
              }
              aria-pressed={recorder.recording}
              data-testid="meeting-record"
              className={`btn-outline ${recorder.recording ? "border-foreground/60 text-foreground" : ""}`}
            >
              {recorder.recording ? (
                <Square className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Mic className="h-4 w-4" aria-hidden="true" />
              )}
              {recorder.recording ? t("stopRecording") : t("record")}
            </button>
          )}
        </div>
        {recorder.recording && (
          <p
            data-testid="meeting-recording-indicator"
            role="status"
            className="text-xs text-foreground"
          >
            {t("recording")}
          </p>
        )}
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
            <p className="text-sm font-semibold text-foreground">
              {t("costTitle")}
            </p>
            {/* BOTH COSTS, BEFORE THE UPLOAD. Transcription is priced per
                minute and the summary per token, and showing only one of
                them is how a person is surprised by the other. */}
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li>{t("costTranscribe", { minutes: mins(seconds) })}</li>
              <li>{t("costSummary")}</li>
            </ul>
            <p
              data-testid="meeting-cost-total"
              className="mt-2 text-sm text-foreground"
            >
              {t("costTotal", { credits: meetingCostCredits(price, seconds) })}
            </p>
            {!durationRead && (
              <p className="mt-2 text-xs text-muted">{t("costUnknown")}</p>
            )}
            {tooLong && (
              <p
                data-testid="meeting-too-long"
                className="mt-2 text-xs text-warning"
              >
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
          <p
            data-testid="meeting-problem"
            role="status"
            className="notice-warning px-3 py-2 text-xs leading-relaxed"
          >
            {problem}
          </p>
        )}
      </section>

      {/* THE GATE, BEFORE THE BROWSER'S OWN PROMPT. Same shape as the
          mic confirm in components/voice/voice-input.tsx: a `fixed
          inset-0` overlay is its own surface for
          scripts/tests/one-primary-action.test.mjs (section 3), so its
          filled "allow" button is not a second primary action on this
          page — `meeting-keep` stays the one. */}
      {recordConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setRecordConfirm(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("audioNoticeTitle")}
            data-testid="meeting-record-confirm"
            className="relative w-full max-w-sm surface"
          >
            <p className="text-sm font-semibold text-foreground">
              {t("audioNoticeTitle")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {t("audioNotice")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="meeting-record-confirm-allow"
                onClick={() => {
                  recordExplainedRef.current = true;
                  setRecordConfirm(false);
                  void recorder.start();
                }}
                className="min-h-[44px] rounded-item bg-button px-4 text-xs font-semibold text-button-ink transition-opacity hover:opacity-90"
              >
                {t("recordConfirmAllow")}
              </button>
              <button
                type="button"
                data-testid="meeting-record-confirm-cancel"
                onClick={() => setRecordConfirm(false)}
                className="min-h-[44px] rounded-item border border-border px-4 text-xs text-muted transition-colors hover:text-foreground"
              >
                {t("recordConfirmCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <p className="surface text-center text-sm text-muted">{t("empty")}</p>
      )}

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
              className={`min-h-[44px] rounded-card border px-3 text-start text-xs transition-colors duration-150 ${
                m.id === openId
                  ? "border-foreground/60 bg-panel text-foreground"
                  : "border-border bg-panel/60 text-muted hover:border-foreground/40"
              }`}
            >
              <span className="block max-w-[16rem] break-words">
                {m.title || t("title")}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <section className="surface space-y-4" data-testid="meeting-detail">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {open.title || t("title")}
              </h2>
              {open.language && (
                <p className="mt-0.5 text-xs text-muted">
                  {t("detectedLanguage", {
                    language: languageLabel(open.language),
                  })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(open.id)}
              aria-label={t("delete")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-item border border-border text-muted transition-colors duration-150 hover:border-danger/60 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* THE PLAYER, ON TOP. Only the clip just transcribed in this
              tab has anything to play — see the note on playerUrl above
              for why a meeting opened from the list days later shows the
              explanation instead. */}
          <div data-testid="meeting-player-zone">
            {playerUrl && playerMeetingId === open.id ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- a
              // meeting recording has no track to caption against.
              <audio
                ref={audioRef}
                controls
                data-testid="meeting-player"
                className="w-full"
                src={playerUrl}
              />
            ) : (
              <p
                data-testid="meeting-player-unavailable"
                className="text-xs text-muted"
              >
                {t("playerUnavailable")}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4" data-testid="meeting-summary-column">
              {open.summary ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {t("summaryTitle")}
                  </h3>
                  <p
                    data-testid="meeting-summary"
                    className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                  >
                    {open.summary}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {open.analysis_error && (
                    <p
                      data-testid="meeting-analysis-error"
                      role="status"
                      className="notice-warning px-3 py-2 text-xs leading-relaxed"
                    >
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
                  <p
                    data-testid="meeting-proposed-hint"
                    className="mt-1 text-xs text-muted"
                  >
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
                                  <span className="block text-sm text-foreground">
                                    {action.what}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-muted">
                                    {action.who ?? t("unassigned")} ·{" "}
                                    {action.when ?? t("noDate")}
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
                        className="mt-3 inline-flex min-h-[44px] items-center rounded-card bg-button px-4 text-sm font-semibold text-button-ink transition-colors duration-150 hover:bg-button disabled:opacity-50"
                      >
                        {ticked.size === 0
                          ? t("keepNone")
                          : t("keepSelected", { count: ticked.size })}
                      </button>
                      {goals && ticked.size > 0 ? (
                        <div data-testid="meeting-goal" className="mt-3 space-y-2 rounded-card bg-panel p-3">
                          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Target
                              className="h-4 w-4 text-muted"
                              aria-hidden="true"
                            />
                            {t("goal.title", { count: ticked.size })}
                          </p>
                          <label className="block text-xs text-muted">
                            {t("goal.goalLabel")}
                            <input
                              data-testid="meeting-goal-text"
                              value={goalWords}
                              onChange={(e) => setGoalWords(e.target.value)}
                              placeholder={open.title}
                              maxLength={500}
                              className="input mt-1 w-full"
                            />
                          </label>
                          <label className="block text-xs text-muted">
                            {t("goal.projectLabel")}
                            <select
                              data-testid="meeting-goal-project"
                              value={projectChoice}
                              onChange={(e) => setProjectChoice(e.target.value)}
                              className="input mt-1 w-full"
                            >
                              {goals.projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                              <option value="new">
                                {t("goal.newProject")}
                              </option>
                            </select>
                          </label>
                          {projectChoice === "new" ? (
                            <label className="block text-xs text-muted">
                              {t("goal.newProjectName")}
                              <input
                                data-testid="meeting-goal-new-project"
                                value={newProjectName}
                                onChange={(e) =>
                                  setNewProjectName(e.target.value)
                                }
                                maxLength={120}
                                className="input mt-1 w-full"
                              />
                            </label>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => makeGoal(open.id)}
                            disabled={
                              goalBusy ||
                              (projectChoice === "new" &&
                                newProjectName.trim().length < 2)
                            }
                            data-testid="meeting-goal-make"
                            className="inline-flex min-h-[44px] items-center rounded-card bg-panel-hover px-4 text-sm font-semibold text-foreground disabled:opacity-50"
                          >
                            {t("goal.make", { count: ticked.size })}
                          </button>
                        </div>
                      ) : null}
                      {goalMade ? (
                        <p
                          data-testid="meeting-goal-done"
                          role="status"
                          className="mt-3 text-sm text-foreground"
                        >
                          {t("goal.done", { count: goalMade.steps })}{" "}
                          <a
                            href={`/dashboard/projects/${goalMade.projectId}`}
                            data-testid="meeting-goal-open-project"
                            className="underline"
                          >
                            {t("goal.openProject")}
                          </a>
                          {" · "}
                          <a href="/dashboard/mission" className="underline">
                            {t("goal.openGoals")}
                          </a>
                        </p>
                      ) : null}
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
                        <span className="block text-sm text-foreground">
                          {a.what}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {a.who ?? t("unassigned")} ·{" "}
                          {a.when_text ?? t("noDate")}
                        </span>
                        {a.remind_at && !a.reminded_at ? (
                          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                            <span data-testid="meeting-remind-pending">
                              {t("remind.pending", {
                                date: remindDateFormat.format(new Date(a.remind_at)),
                              })}
                            </span>
                            <button
                              type="button"
                              data-testid="meeting-remind-cancel"
                              onClick={() => cancelRemind(a)}
                              disabled={remindBusy === a.id}
                              className="inline-flex min-h-[44px] items-center font-semibold text-foreground underline disabled:opacity-50"
                            >
                              {t("remind.cancel")}
                            </button>
                          </span>
                        ) : remindEdit[a.id] !== undefined ? (
                          <span className="mt-1.5 flex flex-wrap items-center gap-2">
                            <label className="text-xs text-muted">
                              {t("remind.label")}
                              <input
                                type="date"
                                data-testid="meeting-remind-date"
                                value={remindEdit[a.id]}
                                min={dateInput(new Date())}
                                onChange={(e) =>
                                  setRemindEdit((prev) => ({ ...prev, [a.id]: e.target.value }))
                                }
                                className="input ms-2 mt-0 inline-block h-11 w-auto py-0"
                              />
                            </label>
                            <button
                              type="button"
                              data-testid="meeting-remind-save"
                              onClick={() => saveRemind(a)}
                              disabled={remindBusy === a.id}
                              className="min-h-[44px] rounded-card bg-panel-hover px-2.5 text-xs font-semibold text-foreground disabled:opacity-50"
                            >
                              {t("remind.save")}
                            </button>
                            <button
                              type="button"
                              data-testid="meeting-remind-dismiss"
                              onClick={() => closeRemind(a.id)}
                              className="inline-flex min-h-[44px] items-center text-xs text-muted underline"
                            >
                              {t("recordConfirmCancel")}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-testid="meeting-remind-open"
                            onClick={() => openRemind(a)}
                            className="mt-1.5 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-foreground underline"
                          >
                            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("remind.button")}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* THE TRANSCRIPT, ON THE RIGHT. Always open — it had been a
                collapsed <details> when it was the last thing on a single
                column; given its own column, collapsing it by default
                would be hiding the one thing this side of the screen is
                for. */}
            <div data-testid="meeting-transcript-column">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
                {t("transcriptTitle")}
              </h3>
              {/* Κομμάτι 5: a line is only ever clickable for the clip
                  just transcribed IN THIS TAB — playerLines lives and
                  dies with playerUrl, so a meeting opened from the list
                  (no player, see meeting-player-unavailable above) falls
                  straight to the plain block below, same text either
                  way, just not a click target that could not seek
                  anything. */}
              {playerLines && playerMeetingId === open.id && playerLines.length > 0 ? (
                <div
                  data-testid="meeting-transcript"
                  className="mt-2 space-y-1 text-sm leading-relaxed text-muted"
                >
                  {playerLines.map((line, i) => (
                    <button
                      key={i}
                      type="button"
                      data-testid="meeting-transcript-line"
                      data-start={line.start}
                      onClick={() => seekTo(line.start)}
                      className="block min-h-[44px] w-full rounded-item text-left transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                    >
                      <span className="font-semibold text-foreground">{line.speaker}:</span> {line.text}
                    </button>
                  ))}
                </div>
              ) : (
                <p
                  data-testid="meeting-transcript"
                  className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted"
                >
                  {open.transcript}
                </p>
              )}
            </div>
          </div>
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
    return (
      new Intl.DisplayNames(undefined, { type: "language" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}
