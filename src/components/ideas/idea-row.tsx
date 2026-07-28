"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Idea } from "@/types/ideas";
import { DeleteButton } from "@/components/delete-button";
import { useToast } from "@/components/toast/toast-context";
import { formatRelativeTime } from "@/lib/format-time";

function verdictClasses(verdict: string | null) {
  const v = (verdict ?? "").toLowerCase();
  if (v.includes("pursue") || v.includes("go") || v.includes("build")) {
    return "border-emerald-800 bg-emerald-950/30 text-emerald-400";
  }
  if (v.includes("kill") || v.includes("no")) {
    return "border-red-900 bg-red-950/30 text-red-400";
  }
  if (v) return "border-amber-800 bg-amber-950/30 text-amber-400";
  return "border-border bg-black/30 text-muted";
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

export function IdeaRow({ idea }: { idea: Idea }) {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(idea));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
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
      setError(error.message);
      addToast(`✗ error: ${error.message}`, "error");
      return;
    }

    setIsEditing(false);
    addToast("✓ updated");
    router.refresh();
  }

  if (isEditing) {
    return (
      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-md border border-border bg-panel p-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-amber-500">$ ideas.update()</h2>
          <button
            type="button"
            onClick={cancelEditing}
            className="inline-flex min-h-[44px] items-center px-2 text-xs text-muted hover:text-foreground sm:min-h-0 sm:px-0"
          >
            cancel()
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="name" required>
            <input
              required
              value={form.name}
              onChange={update("name")}
              className="input"
              placeholder="idea name"
            />
          </Field>

          <Field label="customer">
            <input
              value={form.customer}
              onChange={update("customer")}
              className="input"
              placeholder="target customer"
            />
          </Field>

          <Field label="problem" full>
            <textarea
              value={form.problem}
              onChange={update("problem")}
              className="input min-h-16"
              placeholder="what problem does this solve?"
            />
          </Field>

          <Field label="competitors" full>
            <textarea
              value={form.competitors}
              onChange={update("competitors")}
              className="input min-h-16"
              placeholder="known competitors"
            />
          </Field>

          <Field label="market_size">
            <input
              value={form.market_size}
              onChange={update("market_size")}
              className="input"
              placeholder="e.g. $2B TAM"
            />
          </Field>

          <Field label="score (0-100)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.score}
              onChange={update("score")}
              className="input"
              placeholder="score"
            />
          </Field>

          <Field label="mvp" full>
            <textarea
              value={form.mvp}
              onChange={update("mvp")}
              className="input min-h-16"
              placeholder="what does the MVP look like?"
            />
          </Field>

          <Field label="verdict" full>
            <input
              value={form.verdict}
              onChange={update("verdict")}
              className="input"
              placeholder="e.g. pursue / kill / watch"
            />
          </Field>
        </div>

        {error && (
          <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            error: {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0 sm:w-auto"
        >
          {loading ? "saving..." : "save()"}
        </button>
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border bg-panel p-4 transition-colors hover:border-amber-900/50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {idea.name}
          </h3>
          {idea.customer && (
            <p className="text-xs text-muted">for: {idea.customer}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {idea.score !== null && (
            <span className="rounded border border-border bg-black/30 px-2 py-0.5 text-xs text-foreground">
              score: {idea.score}
            </span>
          )}
          {idea.verdict && (
            <span
              className={`rounded border px-2 py-0.5 text-xs ${verdictClasses(
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
          <span className="text-amber-500">problem:</span> {idea.problem}
        </p>
      )}
      {idea.competitors && (
        <p className="mt-1 text-sm text-foreground/90">
          <span className="text-amber-500">competitors:</span>{" "}
          {idea.competitors}
        </p>
      )}
      {idea.market_size && (
        <p className="mt-1 text-sm text-foreground/90">
          <span className="text-amber-500">market_size:</span>{" "}
          {idea.market_size}
        </p>
      )}
      {idea.mvp && (
        <p className="mt-1 text-sm text-foreground/90">
          <span className="text-amber-500">mvp:</span> {idea.mvp}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-xs text-muted"
          title={new Date(idea.created_at).toLocaleString()}
          suppressHydrationWarning
        >
          logged {formatRelativeTime(idea.created_at)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-border px-3 py-0.5 text-[11px] text-muted transition-colors hover:border-amber-500 hover:text-amber-400 sm:min-h-0 sm:px-2"
          >
            edit()
          </button>
          <DeleteButton table="ideas" id={idea.id} label="idea" />
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
        <span className="text-amber-500">$</span> {label}
        {required && <span className="text-red-400"> *</span>}
      </span>
      {children}
    </label>
  );
}
