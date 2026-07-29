"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ModuleConfig } from "@/lib/modules";
import { useToast } from "@/components/toast/toast-context";

function emptyFormFor(module: ModuleConfig): Record<string, string> {
  return Object.fromEntries(module.fields.map((f) => [f.key, ""]));
}

export function GenericAddForm({ module }: { module: ModuleConfig }) {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => emptyFormFor(module));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
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
        className="inline-flex min-h-[44px] items-center justify-center rounded border border-amber-800 bg-amber-950/20 px-4 py-2 text-sm text-amber-400 transition-colors hover:border-amber-500 sm:min-h-0"
      >
        + new_{module.slug}()
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-border bg-panel p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-amber-500">{module.table}.insert()</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-[44px] items-center px-2 text-xs text-muted hover:text-foreground sm:min-h-0 sm:px-0"
        >
          cancel
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
        <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          error: {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(245,158,11,0.35)] disabled:opacity-50 sm:min-h-0 sm:w-auto"
      >
        {loading ? "saving..." : `save_${module.slug}()`}
      </button>
    </form>
  );
}
