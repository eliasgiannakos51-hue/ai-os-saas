"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Inbox,
  Mail,
  MailWarning,
  Trash2,
  Download,
  ShieldCheck,
  ShieldAlert,
  SearchX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { matchesSearch } from "@/lib/text/search-match";
import { toCSV, downloadCSV, todayForFilename } from "@/lib/download/table-csv";
import {
  FORM_TYPES,
  submissionHeadline,
  submissionsToCsv,
  type SubmissionForExport,
} from "@/lib/websites/form-types";
import { isDeliveryFault, type FormEmailStatus } from "@/lib/websites/form-delivery";

export type SubmissionRow = {
  id: string;
  website_id: string;
  website_name: string;
  fields: Record<string, string>;
  classification: string | null;
  form_type: string;
  consent: boolean;
  consent_text: string | null;
  email_status: string;
  email_detail: string | null;
  read_at: string | null;
  created_at: string;
};

export function FormSubmissionsList({
  submissions,
  deliveryFault,
  deliveryFaultCount,
  deliveryFaultDetail,
}: {
  submissions: SubmissionRow[];
  deliveryFault: FormEmailStatus | null;
  deliveryFaultCount: number;
  deliveryFaultDetail: string | null;
}) {
  const t = useTranslations("dashboard.formSubmissions");
  const locale = useLocale();
  const { addToast } = useToast();
  const [rows, setRows] = useState(submissions);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sites = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) if (!seen.has(row.website_id)) seen.set(row.website_id, row.website_name);
    return [...seen.entries()];
  }, [rows]);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter && row.form_type !== typeFilter) return false;
      if (siteFilter && row.website_id !== siteFilter) return false;
      if (!search.trim()) return true;
      // Searched over the VALUES the visitor typed as well as the site
      // name — "which enquiry mentioned the roof" is the question this
      // list gets asked, and a search over headings alone cannot answer
      // it. matchesSearch folds accents; see lib/text/search-match.ts.
      const haystack = [row.website_name, row.form_type, ...Object.values(row.fields)].join(" ");
      return matchesSearch(haystack, search);
    });
  }, [rows, search, typeFilter, siteFilter]);

  async function markRead(row: SubmissionRow) {
    if (row.read_at) return;
    const supabase = createClient();
    const readAt = new Date().toISOString();
    // Optimistic, then reverted on failure — the alternative is a row
    // that stays bold after you have plainly read it.
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, read_at: readAt } : r)));
    const { error } = await supabase
      .from("website_form_submissions")
      .update({ read_at: readAt })
      .eq("id", row.id);
    if (error) {
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, read_at: null } : r)));
      addToast(getErrorMessage(error, t("markReadFailed")), "error");
    }
  }

  async function remove(row: SubmissionRow) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.from("website_form_submissions").delete().eq("id", row.id);
    setBusyId(null);
    if (error) {
      addToast(getErrorMessage(error, t("deleteFailed")), "error");
      return;
    }
    setRows((current) => current.filter((r) => r.id !== row.id));
    addToast(t("deleted"), "success");
  }

  function exportCsv() {
    // EXPORTS WHAT IS ON SCREEN, not everything. A filtered list and a
    // file that ignores the filter is the sort of mismatch somebody
    // discovers after emailing it to a client.
    const forExport: SubmissionForExport[] = visible.map((row) => ({
      createdAt: row.created_at,
      websiteName: row.website_name,
      formType: row.form_type,
      consent: row.consent,
      consentText: row.consent_text,
      emailStatus: row.email_status,
      classification: row.classification,
      fields: row.fields,
    }));
    const { headers, values } = submissionsToCsv(forExport);
    downloadCSV(`form-submissions-${todayForFilename()}.csv`, toCSV(headers, values));
  }

  // form_type is CHECK-constrained in the database, so an unknown value
  // cannot normally arrive — but a row written before that constraint,
  // or a value added to FORM_TYPES without a translation, would make
  // next-intl throw inside a render rather than show an odd word. The
  // raw slug is the better failure.
  function formTypeLabel(type: string): string {
    return (FORM_TYPES as readonly string[]).includes(type) ? t(`types.${type}`) : type;
  }

  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="space-y-4">
      {deliveryFault && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-300">
            <MailWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`delivery.${deliveryFault}`)}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {t("delivery.affected", { count: deliveryFaultCount })}
          </p>
          {/* THE PROVIDER'S OWN SENTENCE. Ours says what happened; this
              says what to change, and paraphrasing it would lose the
              domain name it usually contains. */}
          {deliveryFaultDetail && (
            <p className="mt-2 break-words rounded-lg bg-black/20 p-2 font-mono text-[11px] text-muted">
              {deliveryFaultDetail}
            </p>
          )}
        </div>
      )}

      <ListLayout
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("searchPlaceholder")}
        searchId="form-submissions-search"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label={t("filterType")}
              className="min-h-[36px] rounded-lg border border-border bg-panel px-2 text-xs text-foreground"
            >
              <option value="">{t("allTypes")}</option>
              {FORM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
            {sites.length > 1 && (
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                aria-label={t("filterSite")}
                className="min-h-[36px] max-w-[200px] rounded-lg border border-border bg-panel px-2 text-xs text-foreground"
              >
                <option value="">{t("allSites")}</option>
                {sites.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
        meta={
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{t("countMeta", { shown: visible.length, unread })}</span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={visible.length === 0}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-panel-hover disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t("exportCsv")}
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title={t("empty.title")}>
            {t("empty.body")}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon={SearchX} title={t("noMatches")}>
            {t("noMatchesBody")}
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) => {
              const open = openId === row.id;
              const headline = submissionHeadline(row.fields);
              return (
                <li
                  key={row.id}
                  className={`rounded-xl border p-3 transition-colors ${
                    row.read_at ? "border-border bg-panel/50" : "border-orange-500/30 bg-panel"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(open ? null : row.id);
                      if (!open) void markRead(row);
                    }}
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {headline ?? t("noName")}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          {formTypeLabel(row.form_type)}
                        </span>
                        {!row.read_at && (
                          <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] text-orange-300">
                            {t("new")}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted">
                        {row.website_name} · {formatDateTime(row.created_at, locale)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {/* Per row, because delivery is per row: an owner
                          who fixed their domain last week needs to see
                          which of these actually reached them and which
                          did not. */}
                      {isDeliveryFault(row.email_status) ? (
                        <MailWarning
                          className="h-4 w-4 text-amber-400"
                          aria-label={t(`delivery.${row.email_status}` as never)}
                        />
                      ) : row.email_status === "sent" ? (
                        <Mail className="h-4 w-4 text-emerald-400/70" aria-label={t("delivery.sent")} />
                      ) : null}
                      {row.consent ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-400/70" aria-label={t("consentGiven")} />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-muted" aria-label={t("consentMissing")} />
                      )}
                    </span>
                  </button>

                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <dl className="space-y-1.5">
                        {Object.entries(row.fields).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 text-xs">
                            <dt className="truncate text-muted">{key}</dt>
                            <dd className="whitespace-pre-wrap break-words text-foreground">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      <p className="text-[11px] text-muted">
                        {row.consent
                          ? t("consentRecorded", { text: row.consent_text ?? t("consentNoText") })
                          : t("consentMissingBody")}
                      </p>

                      {row.email_detail && (
                        <p className="break-words rounded-lg bg-black/20 p-2 font-mono text-[11px] text-muted">
                          {row.email_detail}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => void remove(row)}
                        disabled={busyId === row.id}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("delete")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ListLayout>
    </div>
  );
}
