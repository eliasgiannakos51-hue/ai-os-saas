"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ModuleConfig } from "@/lib/modules";
import { sidebarKeyForSlug } from "@/lib/favoritable";
import { useToast } from "@/components/toast/toast-context";
import { useCredits } from "@/components/credits/credits-context";
import { TextActionsTextarea } from "@/components/text-actions/text-actions-textarea";
import { SuggestedLinksPrompt } from "@/components/entity-links/suggested-links-prompt";
import { ApiError, isApiError, requestJson } from "@/lib/errors/api-error";
import { useErrorText } from "@/lib/errors/use-error-text";

function emptyFormFor(module: ModuleConfig): Record<string, string> {
  return Object.fromEntries(module.fields.map((f) => [f.key, ""]));
}

// Matches the caps enforced server-side for gated modules
// (api/modules/create/route.ts) — applied here too so direct-insert
// modules get the same basic guard against a single field writing an
// unbounded amount of text into a row.
const MAX_TEXT_LENGTH = 500;
const MAX_TEXTAREA_LENGTH = 10000;

// Modules with a creditCost or minPlanSlug set (see
// lib/modules.ts / lib/build-modules.ts) go through the gated
// /api/modules/create endpoint instead of inserting directly — that's the
// only way a credit deduction or a plan/count check can be trusted, since
// a direct client insert can't be. Every other module keeps the original
// direct-insert path below unchanged.
function isGatedModule(module: ModuleConfig): boolean {
  return Boolean(module.creditCost || module.minPlanSlug);
}

export function GenericAddForm({
  module,
  // Optional external control, so the empty state's "start from this
  // example" can open THIS form with the example already typed in. Without
  // it the example would have to be a second, parallel form, and the two
  // would drift the first time a field changed.
  openSignal = 0,
  prefill = null,
}: {
  module: ModuleConfig;
  /** Increment to open the form. A counter rather than a boolean so the
   *  same example can be picked twice in a row. */
  openSignal?: number;
  prefill?: Record<string, string> | null;
}) {
  const router = useRouter();
  const t = useTranslations("module");
  const tCommon = useTranslations("common");
  // `module.title` is the AUTHOR's English name for the module ("Finance",
  // "AI Coding"). Interpolating it into a translated template produced
  // "Νέο Finance" and "Νέο Marketing Campaigns" on every module page —
  // half-translated, and invisible to both i18n checks because the
  // template itself was translated perfectly. The sidebar has always had
  // the reader's name for these; this uses it.
  const moduleLabel = useTranslations("sidebar.items")(sidebarKeyForSlug(module.slug));
  const supabase = createClient();
  const { addToast } = useToast();
  const { refresh: refreshCredits } = useCredits();
  const describe = useErrorText();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => emptyFormFor(module));

  useEffect(() => {
    if (openSignal === 0) return;
    setForm({ ...emptyFormFor(module), ...(prefill ?? {}) });
    setOpen(true);
    // `module` and `prefill` are intentionally not dependencies: this fires
    // on the signal, and re-running it because a parent re-rendered a new
    // prefill object would re-open a form the user had just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  // Set right after a successful create so SuggestedLinksPrompt (Knowledge
  // Graph "Smart Search") can offer related-entry links for it — see
  // lib/entity-link-suggestions.ts. Never cleared afterward; a later
  // create just overwrites it and remounts the prompt via its key.
  const [newlyCreated, setNewlyCreated] = useState<{ table: string; id: string } | null>(null);

  function update(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function updateValue(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUpgradeRequired(false);
    setLoading(true);

    if (isGatedModule(module)) {
      try {
        const data = await requestJson<{
          record?: { id?: string };
        }>("/api/modules/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleSlug: module.slug, fields: form }),
        });

        setLoading(false);
        setForm(emptyFormFor(module));
        setOpen(false);
        addToast(tCommon("created"));
        void refreshCredits();
        router.refresh();
        if (data.record?.id) {
          setNewlyCreated({ table: module.table, id: String(data.record.id) });
        }
      } catch (err) {
        setLoading(false);
        // The route's own English sentence is no longer what the user
        // reads. `describe` turns the STATUS into three sentences in their
        // language — what happened, what to do, and whether it cost them
        // anything — which is the question this form used to answer with
        // "Something went wrong."
        const failure = describe(err);
        setError(failure.text);
        setUpgradeRequired(
          isApiError(err) && (err.code === "forbidden" || err.code === "insufficientCredits")
        );
        addToast(`✗ ${failure.what}`, "error");
      }
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError(tCommon("notAuthenticated"));
      setLoading(false);
      return;
    }

    const payload: Record<string, string | number | null> = { user_id: user.id };
    for (const field of module.fields) {
      const raw = form[field.key];
      if (field.type === "number") {
        payload[field.key] = raw === "" ? null : Number(raw);
      } else {
        const max = field.type === "textarea" ? MAX_TEXTAREA_LENGTH : MAX_TEXT_LENGTH;
        payload[field.key] = raw === "" ? null : raw.slice(0, max);
      }
    }

    const { data: inserted, error } = await supabase
      .from(module.table)
      .insert(payload)
      .select("id")
      .single();

    setLoading(false);

    if (error) {
      // Was `addToast("✗ error: " + error.message)`, which put a raw
      // PostgREST string ("new row violates row-level security policy for
      // table \"trades\"") in front of the user. It names internal tables,
      // it is English, and it tells them nothing they can act on.
      const failure = describe(new ApiError(500, { error: error.message }));
      setError(failure.text);
      addToast(`✗ ${failure.what}`, "error");
      return;
    }

    setForm(emptyFormFor(module));
    setOpen(false);
    addToast(tCommon("created"));
    router.refresh();
    if (inserted?.id) {
      setNewlyCreated({ table: module.table, id: String(inserted.id) });
    }
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
        >
          <Plus className="h-4 w-4" /> {t("new", { title: moduleLabel })}
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border bg-panel p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t("new", { title: moduleLabel })}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tCommon("cancel")}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
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
                  <TextActionsTextarea
                    required={field.required}
                    value={form[field.key]}
                    onChange={(v) => updateValue(field.key, v.slice(0, MAX_TEXTAREA_LENGTH))}
                    className="input min-h-32 resize-y"
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
                      {t("selectPlaceholder")}
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
                    maxLength={field.type === "number" ? undefined : MAX_TEXT_LENGTH}
                  />
                )}
              </label>
            ))}
          </div>

          {error && (
            <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {tCommon("error")}: {error}
              {upgradeRequired && (
                <>
                  {" "}
                  <Link href="/pricing" className="underline underline-offset-2">
                    {tCommon("viewPlans")}
                  </Link>
                </>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50 sm:w-auto"
          >
            {loading ? t("saving") : t("save")}
          </button>
        </form>
      )}
      {newlyCreated && (
        <SuggestedLinksPrompt
          key={`${newlyCreated.table}-${newlyCreated.id}`}
          sourceTable={newlyCreated.table}
          sourceId={newlyCreated.id}
        />
      )}
    </div>
  );
}
