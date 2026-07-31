"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ModuleConfig } from "@/lib/modules";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";

function emptyFormFor(module: ModuleConfig): Record<string, string> {
  return Object.fromEntries(module.fields.map((f) => [f.key, ""]));
}

// Modules with a creditCost, minPlanSlug, or countCapCapability set (see
// lib/modules.ts / lib/build-modules.ts) go through the gated
// /api/modules/create endpoint instead of inserting directly — that's the
// only way a credit deduction or a plan/count check can be trusted, since
// a direct client insert can't be. Every other module keeps the original
// direct-insert path below unchanged.
function isGatedModule(module: ModuleConfig): boolean {
  return Boolean(module.creditCost || module.minPlanSlug || module.countCapCapability);
}

export function GenericAddForm({ module }: { module: ModuleConfig }) {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => emptyFormFor(module));
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUpgradeRequired(false);
    setLoading(true);

    if (isGatedModule(module)) {
      try {
        const res = await fetch("/api/modules/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleSlug: module.slug, fields: form }),
        });
        const data = await res.json();

        setLoading(false);

        if (!res.ok || !data.ok) {
          const message = data.error ?? "Something went wrong.";
          setError(message);
          setUpgradeRequired(Boolean(data.upgradeRequired || data.insufficientCredits));
          addToast(`✗ ${message}`, "error");
          return;
        }

        setForm(emptyFormFor(module));
        setOpen(false);
        addToast("✓ created");
        void refreshCredits();
        router.refresh();
      } catch {
        setLoading(false);
        setError("Network error — please try again.");
      }
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("not authenticated");
      setLoading(false);
      return;
    }

    const payload: Record<string, string | number | null> = { user_id: user.id };
    for (const field of module.fields) {
      const raw = form[field.key];
      if (field.type === "number") {
        payload[field.key] = raw === "" ? null : Number(raw);
      } else {
        payload[field.key] = raw === "" ? null : raw;
      }
    }

    const { error } = await supabase.from(module.table).insert(payload);

    setLoading(false);

    if (error) {
      setError(error.message);
      addToast(`✗ error: ${error.message}`, "error");
      return;
    }

    setForm(emptyFormFor(module));
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
        <Plus className="h-4 w-4" /> New {module.title}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-border bg-panel p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">New {module.title}</h2>
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
        {module.fields.map((field) => (
          <label
            key={field.key}
            className={`block text-xs text-muted ${field.full ? "sm:col-span-2" : ""}`}
          >
            <span className="mb-1 block">
              {field.label}
              {field.required && <span className="text-red-400"> *</span>}
            </span>
            {field.type === "textarea" ? (
              <textarea
                required={field.required}
                value={form[field.key]}
                onChange={update(field.key)}
                className="input min-h-16"
                placeholder={field.placeholder}
              />
            ) : field.type === "select" ? (
              <select
                required={field.required}
                value={form[field.key]}
                onChange={update(field.key)}
                className="input"
              >
                <option value="" disabled>
                  select...
                </option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                required={field.required}
                value={form[field.key]}
                onChange={update(field.key)}
                className="input"
                placeholder={field.placeholder}
              />
            )}
          </label>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          error: {error}
          {upgradeRequired && (
            <>
              {" "}
              <Link href="/pricing" className="underline underline-offset-2">
                View plans
              </Link>
            </>
          )}
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
