"use client";

import { ApiError } from "@/lib/errors/api-error";
import { useErrorText } from "@/lib/errors/use-error-text";
import { useState } from "react";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

const LEVELS = [1, 2, 3, 4, 5] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NOTE_LENGTH = 200;

type CheckIn = { energyLevel: number; note: string | null; createdAt: string };

// "AI Life Context" needs a "recent energy check-in" input (see
// lib/user-context.ts / lib/energy-checkins.ts) — this widget is the only
// way one gets created. No credit cost (a personal log entry, not an AI
// call), same reasoning as Knowledge Graph links being free.
export function EnergyCheckinWidget({
  initialCheckIn,
  // THE MARGIN IS THE CALLER'S, NOT THIS COMPONENT'S. It was baked in as
  // `mt-6`, which is right for a stacked column and wrong inside a grid
  // row — a grid cell that carries its own top margin sits lower than
  // its neighbour and the row grows by exactly that margin. The Home now
  // places this beside Recent Entries, so it passes "".
  className = "mt-6",
}: {
  initialCheckIn: CheckIn | null;
  className?: string;
}) {
  const describe = useErrorText();
  const t = useTranslations("dashboard.energyCheckIn");
  const supabase = createClient();
  const { addToast } = useToast();
  const [checkIn, setCheckIn] = useState<CheckIn | null>(initialCheckIn);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const checkedInToday = Boolean(checkIn) && Date.now() - new Date(checkIn!.createdAt).getTime() < DAY_MS;

  async function submit(level: number) {
    if (submitting) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_energy_checkins")
      .insert({ user_id: user.id, energy_level: level, note: note.trim() || null })
      .select("energy_level, note, created_at")
      .single();

    setSubmitting(false);

    if (error) {
      addToast(`✗ ${describe(new ApiError(500, { error: error.message })).what}`, "error");
      return;
    }

    setCheckIn({ energyLevel: data.energy_level, note: data.note, createdAt: data.created_at });
    setNote("");
    setShowForm(false);
    addToast(t("logged"));
  }

  return (
    <div className={`rounded-2xl border border-border bg-panel p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
          <Zap className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          {checkedInToday && !showForm ? (
            <p className="mt-0.5 text-xs text-muted">
              {t("checkedInToday", { level: checkIn!.energyLevel })}{" "}
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="min-h-[44px] text-orange-400 hover:underline"
              >
                {t("change")}
              </button>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">{t("prompt")}</p>
          )}
          {/* WHAT IONEXA DOES WITH IT — V4.6 #10. A question with no
              stated purpose is a question people stop answering, and this
              one has a real purpose: lib/mission-energy.ts picks which of
              the open plan steps to suggest from the answer (light work
              when the number is low, demanding work when it is not), and
              it also goes into the AI context. None of that was written
              anywhere the person answering could see it. */}
          <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("whatItDoes")}</p>
        </div>
      </div>

      {(!checkedInToday || showForm) && (
        <div className="mt-3">
          <div className="flex gap-1.5">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => submit(level)}
                disabled={submitting}
                aria-label={t("levelLabel", { level })}
                className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm font-semibold text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {level}
              </button>
            ))}
          </div>
          {/* THE ENDS OF THE SCALE, NAMED — V4.6 #10. Five bare buttons
              are a scale whose direction the reader has to guess, and
              half of them will guess that 1 is best. aria-label already
              carried the number; what it did not carry is which end is
              which, so the ends are now text and not only a label. */}
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{t("scaleLow")}</span>
            <span>{t("scaleHigh")}</span>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            placeholder={t("notePlaceholder")}
            disabled={submitting}
            className="input mt-2 w-full text-xs"
          />
        </div>
      )}
    </div>
  );
}
