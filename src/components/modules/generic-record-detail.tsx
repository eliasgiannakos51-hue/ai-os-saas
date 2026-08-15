"use client";

import { useEffect, useState, type FormEvent } from "react";
import { deleteConfirmKey, optionLabelKey } from "@/lib/modules";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { FileText, Link2, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { iconForSlug } from "@/lib/module-icons";
import { DetailPanel, type DetailTab } from "@/components/ui/detail-panel";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { AskAiButton } from "@/components/records/ask-ai-button";
import { LinkToButton } from "@/components/entity-links/link-to-button";
import { DeleteButton } from "@/components/delete-button";
import { LinkedEntities } from "@/components/entity-links/linked-entities";
import { TextActionsTextarea } from "@/components/text-actions/text-actions-textarea";
import { useToast } from "@/components/toast/toast-context";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { detailFieldsFor, headlineFor } from "@/lib/module-card-fields";
import type { LinkedEntity } from "@/lib/entity-links";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { formatDateTime } from "@/lib/format-number";

export type RecordDetailTab = "details" | "edit" | "links";

const MAX_TEXT_LENGTH = 500;
const MAX_TEXTAREA_LENGTH = 10000;

function formStateFor(module: ModuleConfig, record: ModuleRecord): Record<string, string> {
  return Object.fromEntries(
    module.fields.map((f) => {
      const value = record[f.key];
      return [f.key, value === null || value === undefined ? "" : String(value)];
    })
  );
}

/**
 * The detail view for a selected module record.
 *
 * Same three-part shape as every other detail panel in the app: tabs
 * across the top (Details / Edit / Links), the tab's content beneath, and
 * the action buttons last. The edit form's Save lives in that footer via
 * the `form` attribute rather than inside the form's own markup — the
 * whole point of the shared shape is that the button that commits a change
 * is always in the same place.
 */
export function GenericRecordDetail({
  module,
  record,
  linkedEntities = [],
  isFavorited = false,
  initialTab = "details",
  onClose,
}: {
  module: ModuleConfig;
  record: ModuleRecord;
  linkedEntities?: LinkedEntity[];
  isFavorited?: boolean;
  initialTab?: RecordDetailTab;
  onClose: () => void;
}) {
  const t = useTranslations("module");
  const tKey = useTranslations();
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const formatRelativeTime = useFormatRelativeTime();
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const [tab, setTab] = useState<RecordDetailTab>(initialTab);
  const [form, setForm] = useState<Record<string, string>>(() => formStateFor(module, record));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Selecting a different card (or re-opening this one on another tab)
  // reuses this component — reset both the tab and the draft so the panel
  // never shows one record's edits over another record's data.
  useEffect(() => {
    setTab(initialTab);
    setForm(formStateFor(module, record));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, initialTab]);

  const headline = headlineFor(module, record, t("untitled"));
  const formId = `record-edit-${record.id}`;

  function updateValue(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: Record<string, string | number | null> = {};
    for (const field of module.fields) {
      const raw = form[field.key];
      if (field.type === "number") {
        payload[field.key] = raw === "" ? null : Number(raw);
      } else {
        const max = field.type === "textarea" ? MAX_TEXTAREA_LENGTH : MAX_TEXT_LENGTH;
        payload[field.key] = raw === "" ? null : raw.slice(0, max);
      }
    }

    const { error: updateError } = await supabase
      .from(module.table)
      .update(payload)
      .eq("id", record.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      addToast(`✗ ${updateError.message}`, "error");
      return;
    }

    addToast(`✓ ${t("updated")}`);
    setTab("details");
    router.refresh();
  }

  const tabs: DetailTab[] = [
    { key: "details", label: t("tabDetails"), icon: FileText },
    { key: "edit", label: t("tabEdit"), icon: Pencil },
    { key: "links", label: t("tabLinks"), icon: Link2, badge: linkedEntities.length || undefined },
  ];

  const detailFields = detailFieldsFor(module, record);

  return (
    <DetailPanel
      icon={iconForSlug(module.slug)}
      accentSlug={module.slug}
      title={headline}
      subtitle={
        <span title={formatDateTime(record.created_at, locale)} suppressHydrationWarning>
          {t("loggedAt", { when: formatRelativeTime(record.created_at) })}
        </span>
      }
      corner={
        <>
          <FavoriteButton
            table={module.table}
            recordId={record.id}
            headline={headline}
            initialFavorited={isFavorited}
            variant="inline"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("cancel")}
            title={tCommon("cancel")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={(key) => setTab(key as RecordDetailTab)}
      actions={
        tab === "edit" ? (
          <>
            <button
              type="submit"
              form={formId}
              disabled={saving}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50 sm:min-h-0"
            >
              {saving ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(formStateFor(module, record));
                setTab("details");
              }}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
            >
              {tCommon("cancel")}
            </button>
          </>
        ) : (
          <>
            <AskAiButton
              variant="action"
              moduleSlug={module.slug}
              moduleTitle={tKey(module.titleKey)}
              recordId={record.id}
              recordHeadline={headline}
            />
            <LinkToButton
              variant="action"
              sourceTable={module.table}
              sourceId={record.id}
              sourceHeadline={headline}
            />
            <DeleteButton
              variant="action"
              onDeleted={onClose}
              table={module.table}
              id={record.id}
              confirmMessage={tKey(deleteConfirmKey(module.slug))}
              itemName={headline}
            />
          </>
        )
      }
    >
      {tab === "details" && (
        <dl className="space-y-3">
          {detailFields.length === 0 ? (
            <p className="text-sm text-muted">{t("noDetails")}</p>
          ) : (
            detailFields.map((field) => (
              <div key={field.key}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-orange-500/80">
                  {tKey(field.labelKey)}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90">
                  {String(record[field.key])}
                </dd>
              </div>
            ))
          )}
        </dl>
      )}

      {tab === "edit" && (
        <form id={formId} onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {module.fields.map((field) => (
              <label
                key={field.key}
                className={`block text-xs text-muted ${field.full ? "sm:col-span-2" : ""}`}
              >
                <span className="mb-1 block">
                  {tKey(field.labelKey)}
                  {field.required && <span className="text-red-400"> *</span>}
                </span>
                {field.type === "textarea" ? (
                  <TextActionsTextarea
                    required={field.required}
                    value={form[field.key]}
                    onChange={(v) => updateValue(field.key, v.slice(0, MAX_TEXTAREA_LENGTH))}
                    className="input min-h-32 resize-y"
                    placeholder={field.placeholderKey ? tKey(field.placeholderKey) : undefined}
                  />
                ) : field.type === "select" ? (
                  <select
                    required={field.required}
                    value={form[field.key]}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    className="input"
                  >
                    <option value="" disabled>
                      {t("selectPlaceholder")}
                    </option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {tKey(optionLabelKey(option))}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    required={field.required}
                    value={form[field.key]}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    className="input"
                    placeholder={field.placeholderKey ? tKey(field.placeholderKey) : undefined}
                    maxLength={field.type === "number" ? undefined : MAX_TEXT_LENGTH}
                  />
                )}
              </label>
            ))}
          </div>

          {error && (
            <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </form>
      )}

      {tab === "links" && (
        <div>
          {linkedEntities.length === 0 ? (
            <p className="text-sm text-muted">{t("noLinks")}</p>
          ) : (
            // LinkedEntities carries its own heading and separator; the
            // negative top margin absorbs the one it adds for card use.
            <div className="-mt-3 [&>div]:border-t-0 [&>div]:pt-0">
              <LinkedEntities entities={linkedEntities} />
            </div>
          )}
        </div>
      )}
    </DetailPanel>
  );
}
