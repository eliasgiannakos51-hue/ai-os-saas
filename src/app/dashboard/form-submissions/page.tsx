import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import {
  FormSubmissionsList,
  type SubmissionRow,
} from "@/components/websites/form-submissions-list";
import { isFormEmailStatus, worstDeliveryFault, type DeliveryCounts } from "@/lib/websites/form-delivery";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.formSubmissions");
}

/**
 * WHERE THE LEADS ACTUALLY ARRIVE.
 *
 * Until now there was no such page. A visitor filled in a form on a
 * published site, the row was written, an email was attempted, and if
 * that email did not arrive — no verified sending domain being the
 * ordinary reason — the submission existed in a table nothing in the
 * product could read. The owner's evidence that their website works was
 * an inbox that stayed empty.
 *
 * The delivery banner at the top is the other half of that: the page
 * that lists the leads is also the page that says whether the emails
 * about them are getting out, because those are the same question.
 */
const PAGE_SIZE = 200;

export default async function FormSubmissionsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.formSubmissions");

  // RLS scopes both reads to this owner; the explicit .eq("user_id") is
  // belt-and-braces in the same style as every other dashboard page here.
  const { data: submissions, error } = await supabase
    .from("website_form_submissions")
    .select(
      "id, website_id, fields, classification, form_type, consent, consent_text, email_status, email_detail, read_at, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = submissions ?? [];
  const websiteIds = [...new Set(rows.map((r) => r.website_id as string))];

  const { data: websites } =
    websiteIds.length > 0
      ? await supabase.from("user_websites").select("id, name").in("id", websiteIds)
      : { data: [] };
  const nameById = new Map((websites ?? []).map((w) => [w.id as string, w.name as string]));

  // Counted from the rows on screen rather than with a second aggregate
  // query: the banner is about what this list shows, and a count taken
  // over a different set than the one being displayed is a number the
  // user cannot check against anything.
  const counts: DeliveryCounts = {};
  for (const row of rows) {
    const status = row.email_status;
    if (!isFormEmailStatus(status)) continue;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const fault = worstDeliveryFault(counts);
  // The detail from the most recent failing row — the provider's own
  // sentence, which is what actually tells somebody what to change.
  const faultDetail =
    (rows.find((r) => r.email_status === fault)?.email_detail as string | null) ?? null;

  const list: SubmissionRow[] = rows.map((row) => ({
    id: row.id as string,
    website_id: row.website_id as string,
    website_name: nameById.get(row.website_id as string) ?? t("deletedWebsite"),
    fields: (row.fields ?? {}) as Record<string, string>,
    classification: (row.classification as string | null) ?? null,
    form_type: (row.form_type as string) ?? "contact",
    consent: row.consent === true,
    consent_text: (row.consent_text as string | null) ?? null,
    email_status: (row.email_status as string) ?? "pending",
    email_detail: (row.email_detail as string | null) ?? null,
    read_at: (row.read_at as string | null) ?? null,
    created_at: row.created_at as string,
  }));

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={Inbox}
          title={t("title")}
          description={t("description")}
          helpKey="help.formSubmissions"
        />

        {error && <ErrorMessage detail={`loading form submissions: ${error.message}`} />}

        <FormSubmissionsList
          submissions={list}
          deliveryFault={fault}
          deliveryFaultCount={fault ? (counts[fault] ?? 0) : 0}
          deliveryFaultDetail={faultDetail}
        />
      </div>
    </main>
  );
}
