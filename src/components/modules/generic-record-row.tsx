"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { DeleteButton } from "@/components/delete-button";
import { useToast } from "@/components/toast/toast-context";
import { formatRelativeTime } from "@/lib/format-time";

function formStateFor(module: ModuleConfig, record: ModuleRecord): Record<string, string> {
  return Object.fromEntries(
    module.fields.map((f) => {
      const value = record[f.key];
      return [f.key, value === null || value === undefined ? "" : String(value)];
    })
  );
}

export function GenericRecordRow({
  module,
  record,
}: {
  module: ModuleConfig;
  record: ModuleRecord;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() =>
    formStateFor(module, record)
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function startEditing() {
    setForm(formStateFor(module, record));
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setForm(formStateFor(module, record));
    setError(null);
    setIsEditing(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload: Record<string, string | number | null> = {};
    for (const field of module.fields) {
      const raw = form[field.key];
      if (field.type === "number") {
        payload[field.key] = raw === "" ? null : Number(raw);
      } else {
        payload[field.key] = raw === "" ? null : raw;
      }
    }

    const { error } = await supabase
      .from(module.table)
      .update(payload)
      .eq("id", record.id);

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
          <h2 className="text-sm text-amber-500">$ {module.table}.update()</h2>
          <button
            type="button"
            onClick={cancelEditing}
            className="inline-flex min-h-[44px] items-center px-2 text-xs text-muted hover:text-foreground sm:min-h-0 sm:px-0"
          >
            cancel()
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {module.fields.map((field) => (
            <label
              key={field.key}
              className={`block text-xs text-muted ${field.full ? "sm:col-span-2" : ""}`}
            >
              <span className="mb-1 block">
                <span className="text-amber-500">$</span> {field.label}
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
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-0 sm:w-auto"
        >
          {loading ? "saving..." : "save()"}
        </button>
      </form>
    );
  }

  const badgeFields = module.fields.filter((f) => f.badge);
  const bodyFields = module.fields.filter(
    (f) => f.key !== module.headlineKey && !f.badge
  );
  const headline = String(record[module.headlineKey] ?? "untitled");

  return (
    <div className="rounded-md border border-border bg-panel p-4 transition-colors hover:border-amber-900/50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          {record[module.headlineKey] ?? "untitled"}
        </h3>
        {badgeFields.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {badgeFields.map((field) => {
              const value = record[field.key];
              if (value === null || value === undefined || value === "") {
                return null;
              }
              return (
                <span
                  key={field.key}
                  className="rounded border border-border bg-black/30 px-2 py-0.5 text-xs text-foreground"
                >
                  {field.label}: {value}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {bodyFields.map((field) => {
        const value = record[field.key];
        if (value === null || value === undefined || value === "") {
          return null;
        }
        return (
          <p key={field.key} className="mt-1 text-sm text-foreground/90">
            <span className="text-amber-500">{field.label}:</span> {value}
          </p>
        );
      })}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-xs text-muted"
          title={new Date(record.created_at).toLocaleString()}
          suppressHydrationWarning
        >
          logged {formatRelativeTime(record.created_at)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startEditing}
            aria-label={`Edit ${module.title.toLowerCase()}: ${headline}`}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-border px-3 py-0.5 text-[11px] text-muted transition-colors hover:border-amber-500 hover:text-amber-400 sm:min-h-0 sm:px-2"
          >
            edit()
          </button>
          <DeleteButton
            table={module.table}
            id={record.id}
            label={module.title.toLowerCase()}
            itemName={headline}
          />
        </div>
      </div>
    </div>
  );
}
