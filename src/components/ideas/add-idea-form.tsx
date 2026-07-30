"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

const EMPTY_FORM = {
  name: "",
  problem: "",
  customer: "",
  competitors: "",
  market_size: "",
  mvp: "",
  score: "",
  verdict: "",
};

export function AddIdeaForm() {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("not authenticated");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("ideas").insert({
      user_id: user.id,
      name: form.name,
      problem: form.problem || null,
      customer: form.customer || null,
      competitors: form.competitors || null,
      market_size: form.market_size || null,
      mvp: form.mvp || null,
      score: form.score === "" ? null : Number(form.score),
      verdict: form.verdict || null,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      addToast(`✗ error: ${error.message}`, "error");
      return;
    }

    setForm(EMPTY_FORM);
    setOpen(false);
    addToast("✓ created");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] sm:min-h-0"
      >
        <Plus className="h-4 w-4" /> New Idea
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-panel p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">New Idea</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input
            required
            value={form.name}
            onChange={update("name")}
            className="input"
            placeholder="idea name"
          />
        </Field>

        <Field label="Customer">
          <input
            value={form.customer}
            onChange={update("customer")}
            className="input"
            placeholder="target customer"
          />
        </Field>

        <Field label="Problem" full>
          <textarea
            value={form.problem}
            onChange={update("problem")}
            className="input min-h-16"
            placeholder="what problem does this solve?"
          />
        </Field>

        <Field label="Competitors" full>
          <textarea
            value={form.competitors}
            onChange={update("competitors")}
            className="input min-h-16"
            placeholder="known competitors"
          />
        </Field>

        <Field label="Market Size">
          <input
            value={form.market_size}
            onChange={update("market_size")}
            className="input"
            placeholder="e.g. $2B TAM"
          />
        </Field>

        <Field label="Score (0-100)">
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

        <Field label="MVP" full>
          <textarea
            value={form.mvp}
            onChange={update("mvp")}
            className="input min-h-16"
            placeholder="what does the MVP look like?"
          />
        </Field>

        <Field label="Verdict" full>
          <input
            value={form.verdict}
            onChange={update("verdict")}
            className="input"
            placeholder="e.g. pursue / kill / watch"
          />
        </Field>
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          error: {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50 sm:min-h-0 sm:w-auto"
      >
        {loading ? "Saving..." : "Save"}
      </button>
    </form>
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
