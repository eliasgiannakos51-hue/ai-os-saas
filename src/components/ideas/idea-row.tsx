"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/errors/api-error";
import { useErrorText } from "@/lib/errors/use-error-text";
import { Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Idea } from "@/types/ideas";
import { DeleteButton } from "@/components/delete-button";
import { AskAiButton } from "@/components/records/ask-ai-button";
import { LinkToButton } from "@/components/entity-links/link-to-button";
import { LinkedEntities } from "@/components/entity-links/linked-entities";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { TextActionsTextarea } from "@/components/text-actions/text-actions-textarea";
import { useToast } from "@/components/toast/toast-context";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import type { LinkedEntity } from "@/lib/entity-links";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTime } from "@/lib/format-number";

function verdictClasses(verdict: string | null) {
  const v = (verdict ?? "").toLowerCase();
  if (v.includes("pursue") || v.includes("go") || v.includes("build")) {
    return "border-emerald-800 bg-emerald-950/30 text-emerald-400";
  }
  if (v.includes("kill") || v.includes("no")) {
    return "border-red-900 bg-red-950/30 text-red-400";
  }
  if (v) return "border-orange-800 bg-orange-950/30 text-orange-400";
  return "border-border bg-input text-muted";
}

type FormState = {
  name: string;
  problem: string;
  customer: string;
  competitors: string;
  market_size: string;
  mvp: string;
  score: string;
  verdict: string;
};

function toFormState(idea: Idea): FormState {
  return {
    name: idea.name ?? "",
    problem: idea.problem ?? "",
    customer: idea.customer ?? "",
    competitors: idea.competitors ?? "",
    market_size: idea.market_size ?? "",
    mvp: idea.mvp ?? "",
    score: idea.score === null || idea.score === undefined ? "" : String(idea.score),
    verdict: idea.verdict ?? "",
  };
}

export function IdeaRow({
  idea,
  linkedEntities = [],
  isFavorited = false,
}: {
  idea: Idea;
  linkedEntities?: LinkedEntity[];
  isFavorited?: boolean;
}) {
  const formatRelativeTime = useFormatRelativeTime();
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const tCommon = useTranslations("common");
  const t = useTranslations("dashboard.ideas");
  const tModule = useTranslations("module");
  const tSidebar = useTranslations("sidebar");
  const describe = useErrorText();
  const locale = useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(idea));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function updateValue(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEditing() {
    setForm(toFormState(idea));
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setForm(toFormState(idea));
    setError(null);
    setIsEditing(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase
      .from("ideas")
      .update({
        name: form.name,
        problem: form.problem || null,
        customer: form.customer || null,
        competitors: form.competitors || null,
        market_size: form.market_size || null,
        mvp: form.mvp || null,
        score: form.score === "" ? null : Number(form.score),
        verdict: form.verdict || null,
      })
      .eq("id", idea.id);

    setLoading(false);

    if (error) {
      setError(describe(new ApiError(500, { error: error.message })).text);
      addToast(`✗ ${describe(new ApiError(500, { error: error.message })).what}`, "error");
      return;
    }

    setIsEditing(false);
    addToast(tCommon("updated"));
    router.refresh();
  }

  if (isEditing) {
    return (
      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-2xl border border-border bg-panel p-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("edit")}</h2>
          <button
            type="button"
            onClick={cancelEditing}
            aria-label={tCommon("cancel")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("nameLabel")} required>
            <input
              required
              value={form.name}
              onChange={update("name")}
              className="input"
              placeholder={t("namePlaceholder")}
            />
          </Field>

          <Field label={t("customerLabel")}>
            <input
              value={form.customer}
              onChange={update("customer")}
              className="input"
              placeholder={t("customerPlaceholder")}
            />
          </Field>

          <Field label={t("problemLabel")} full>
            <TextActionsTextarea
              value={form.problem}
              onChange={(v) => updateValue("problem", v)}
              className="input min-h-32 resize-y"
              placeholder={t("problemPlaceholder")}
            />
          </Field>

          <Field label={t("competitorsLabel")} full>
            <TextActionsTextarea
              value={form.competitors}
              onChange={(v) => updateValue("competitors", v)}
              className="input min-h-32 resize-y"
              placeholder={t("competitorsPlaceholder")}
            />
          </Field>

          <Field label={t("marketSizeLabel")}>
            <input
              value={form.market_size}
              onChange={update("market_size")}
              className="input"
              placeholder={t("marketSizePlaceholder")}
            />
          </Field>

          <Field label={t("scoreLabel")}>
            <input
              type="number"
              min={0}
              max={100}
              value={form.score}
              onChange={update("score")}
              className="input"
              placeholder={t("scorePlaceholder")}
            />
          </Field>

          <Field label={t("mvpLabel")} full>
            <TextActionsTextarea
              value={form.mvp}
              onChange={(v) => updateValue("mvp", v)}
              className="input min-h-32 resize-y"
              placeholder={t("mvpPlaceholder")}
            />
          </Field>

          <Field label={t("verdictLabel")} full>
            <input
              value={form.verdict}
              onChange={update("verdict")}
              className="input"
              placeholder={t("verdictPlaceholder")}
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {tCommon("error")}: {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50 sm:w-auto"
        >
          {loading ? tModule("saving") : tModule("save")}
        </button>
      </form>
    );
  }

  return (
    <div className="card-lift card-lift-row relative rounded-2xl border border-border bg-[linear-gradient(160deg,var(--panel)_0%,var(--panel)_65%,rgba(249,115,22,0.035)_100%)] p-4">
      {/* Pinned to the card corner, not buried in the bottom
          action row — see favorite-button.tsx for what that
          position cost. The card root is `relative` for this. */}
      <FavoriteButton
        table="ideas"
        recordId={idea.id}
        headline={idea.name}
        initialFavorited={isFavorited}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
            {idea.name}
          </h3>
          {idea.customer && (
            <p className="text-xs text-muted">{t("cardFor", { customer: idea.customer })}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {idea.score !== null && (
            <span className="rounded-md border border-border bg-input px-2 py-0.5 text-xs text-foreground">
              {t("cardScore", { score: idea.score })}
            </span>
          )}
          {idea.verdict && (
            <span
              className={`rounded-md border px-2 py-0.5 text-xs ${verdictClasses(
                idea.verdict
              )}`}
            >
              {idea.verdict}
            </span>
          )}
        </div>
      </div>

      {idea.problem && (
        <p className="mt-3 text-sm text-foreground/90">
          <span className="text-orange-500">{t("cardProblem")}</span> {idea.problem}
        </p>
      )}
      {idea.competitors && (
        <p className="mt-1 text-sm text-foreground/90">
          <span className="text-orange-500">{t("cardCompetitors")}</span>{" "}
          {idea.competitors}
        </p>
      )}
      {idea.market_size && (
        <p className="mt-1 text-sm text-foreground/90">
          <span className="text-orange-500">{t("cardMarketSize")}</span>{" "}
          {idea.market_size}
        </p>
      )}
      {idea.mvp && (
        <p className="mt-1 text-sm text-foreground/90">
          <span className="text-orange-500">{t("cardMvp")}</span> {idea.mvp}
        </p>
      )}

      <LinkedEntities entities={linkedEntities} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-xs text-muted"
          title={formatDateTime(idea.created_at, locale)}
          suppressHydrationWarning
        >
          {tModule("loggedAt", { when: formatRelativeTime(idea.created_at) })}
        </p>
        <div className="flex items-center gap-1">
          <AskAiButton
            moduleSlug="ideas"
            moduleTitle={tSidebar("items.ideas")}
            recordId={idea.id}
            recordHeadline={idea.name}
          />
          <LinkToButton sourceTable="ideas" sourceId={idea.id} sourceHeadline={idea.name} />
          <button
            type="button"
            onClick={startEditing}
            aria-label={t("editAria", { name: idea.name })}
            title={tModule("edit")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-orange-500/10 hover:text-orange-400"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <DeleteButton
            table="ideas"
            id={idea.id}
            confirmMessage={t("deleteConfirm")}
            itemName={idea.name}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block text-xs text-muted ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}
