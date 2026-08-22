import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyLeadMessage } from "@/lib/lead-classification";
import { sendWebsiteFormSubmissionEmail } from "@/lib/email/send-website-form-submission-email";
import { logApiError } from "@/lib/log-error";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { settleReservation } from "@/lib/billing/reservations";
import { hasEnoughCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { createNotification } from "@/lib/notifications/store";
import {
  MAX_CONSENT_TEXT_LENGTH,
  parseFormType,
  submissionHeadline,
} from "@/lib/websites/form-types";

// @service-role-justified public — this is the contact form on a PUBLISHED
// site, submitted by strangers who have no account. Scoped to the one
// website in the URL and rate-limited per website; see the caps below.

export const dynamic = "force-dynamic";

const MAX_FIELDS = 20;
const MAX_FIELD_LENGTH = 2000;
const MAX_KEY_LENGTH = 60;
// Per-website hourly cap — this endpoint is deliberately public/
// unauthenticated (a real site visitor submitting a contact form has no
// Ionexa AI account), so there's no per-user credit gate to fall back on
// the way every other AI-calling endpoint in this app has. This is the
// only thing standing between a scripted flood and an unbounded number
// of outbound emails + lead-classification AI calls charged to nobody.
const MAX_SUBMISSIONS_PER_HOUR = 30;
// Per-IP hourly cap, checked IN ADDITION to the per-website one above.
//
// WHY THE PER-WEBSITE CAP ALONE WAS NOT ENOUGH. It bounds one site at 30
// submissions an hour — 720 a day — and every one of them spends the site
// owner's credits on a lead-classification call that the owner never asked
// for and cannot see coming. One anonymous script, one published site, no
// account, no CAPTCHA: 720 billable AI calls a day against a stranger's
// balance. The honeypot only catches a bot that fills every field blindly,
// which is one line of code to avoid.
//
// A per-IP cap changes the shape of that attack: 720 calls a day now needs
// 144 distinct source addresses instead of one. It does not make the
// endpoint unattackable — nothing that is public and free can be — it makes
// the cheap version of the attack stop working, which is the whole job of a
// rate limit.
//
// FIVE, not thirty. A real visitor fills in a contact form once. Someone
// correcting a typo or asking a second question might do it two or three
// times. Five leaves room for that and for a small office behind one NAT
// address, while cutting the single-source ceiling by 6x.
const MAX_SUBMISSIONS_PER_IP_PER_HOUR = 5;
// The owner must hold at least this much before we spend anything on
// their behalf. The classification is a ~200-token forced-tool-use call,
// so one credit covers it many times over at any plan's rate — this is a
// solvency check, not the price. The real charge is settled from
// measured usage afterwards, like every other AI call.
const LEAD_CLASSIFICATION_MIN_CREDITS = 1;

// A generated website's HTML is meant to be downloaded and hosted
// anywhere (see lib/website-builder.ts) — this endpoint has to accept
// cross-origin requests from whatever domain that ends up being, so CORS
// is permissive by necessity. It's a narrow, write-only, rate-limited,
// honeypot-guarded endpoint (no data is ever read back), which keeps that
// an acceptable trade-off.
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// Public, unauthenticated endpoint — deliberately so: the caller is the
// generated static HTML's own inline <script> (see
// lib/website-builder.ts's FUNCTIONAL_ELEMENTS_SECTION), running in a
// visitor's browser who has no Ionexa AI account at all. Uses the
// service-role admin client throughout (see lib/supabase/admin.ts)
// specifically because there is no authenticated user context here — the
// same reasoning as api/cron/scheduled-runs, just triggered by a public
// visitor instead of a cron schedule.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const headers = corsHeaders();
  try {
    const websiteId = params.id;
    if (!websiteId) {
      return NextResponse.json({ ok: false, error: "Missing website id." }, { status: 400, headers });
    }

    let rawFields: Record<string, unknown>;
    let formType: string;
    let consent = false;
    let consentText: string | null = null;
    try {
      const body = await request.json();
      rawFields = typeof body?.fields === "object" && body.fields !== null ? body.fields : {};
      // VALIDATED, NOT TRUSTED. Everything in this request comes from a
      // page a stranger's browser is running, and the form type reaches
      // a CHECK constraint — an unrecognised value would fail the insert
      // and lose the submission, so it becomes 'contact' instead.
      formType = parseFormType(body?.formType);
      // BOTH PLACES. `consent` at the top level is what the prompt asks
      // for; `fields._consent` is where a checkbox ends up when the
      // generated script just serialises the form. Reading only the
      // first would record "no consent" for a visitor who ticked the
      // box, which is worse than useless as a record.
      const rawConsent =
        body?.consent ?? (typeof rawFields._consent === "string" ? rawFields._consent : undefined);
      consent = rawConsent === true || rawConsent === "true" || rawConsent === "on";
      consentText =
        typeof body?.consentText === "string" && body.consentText.trim()
          ? body.consentText.trim().slice(0, MAX_CONSENT_TEXT_LENGTH)
          : null;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400, headers });
    }

    // Honeypot: the generated form always includes a hidden "_hp" field a
    // real visitor never sees or fills in (see lib/website-builder.ts) —
    // a non-empty value here means a bot filled every field blindly.
    // Silently accept-and-drop rather than returning an error, so a bot
    // never learns it was caught.
    if (typeof rawFields._hp === "string" && rawFields._hp.trim() !== "") {
      return NextResponse.json({ ok: true, submitted: true }, { headers });
    }

    // The two underscore-prefixed inputs are MACHINERY, not answers: _hp
    // is the honeypot and _consent is the GDPR tick, and both are read
    // above. The prompt tells the model to keep them out of `fields`,
    // which is exactly the kind of instruction that holds until it does
    // not — so they are stripped here too. Without this, every
    // submission's stored data ends with a field called "_consent" whose
    // value is the string "on", and it lands in the owner's CSV export.
    const fields: Record<string, string> = {};
    let fieldCount = 0;
    for (const [key, value] of Object.entries(rawFields)) {
      if (key === "_hp" || key === "_consent") continue;
      if (fieldCount >= MAX_FIELDS) break;
      if (typeof value !== "string") continue;
      const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
      if (!trimmed) continue;
      fields[key.slice(0, MAX_KEY_LENGTH)] = trimmed;
      fieldCount += 1;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ ok: false, error: "No form data was submitted." }, { status: 400, headers });
    }

    const admin = createAdminClient();

    const { data: website, error: websiteError } = await admin
      .from("user_websites")
      .select("id, user_id, name")
      .eq("id", websiteId)
      .maybeSingle();

    if (websiteError || !website) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404, headers });
    }

    // TWO caps, both of which must pass.
    //
    // Per-website first, because it is the cheaper query and the one that
    // protects the owner's balance in aggregate. Per-IP second, because it
    // is what stops a single anonymous source from consuming that whole
    // budget on its own — see MAX_SUBMISSIONS_PER_IP_PER_HOUR above.
    //
    // The IP cap is scoped per website (`${websiteId}:${ip}`) rather than
    // globally, so one busy office behind a single NAT address cannot lock
    // itself out of every published site in the platform at once.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("website_form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("website_id", websiteId)
      .gte("created_at", oneHourAgo);
    if ((recentCount ?? 0) >= MAX_SUBMISSIONS_PER_HOUR) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions for this website right now — please try again later." },
        { status: 429, headers }
      );
    }

    // Checked BEFORE any money is spent and before anything is written —
    // the point is that a blocked request costs the owner nothing at all.
    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit({
      scope: "website_form_ip",
      identifier: `${websiteId}:${ip}`,
      maxAttempts: MAX_SUBMISSIONS_PER_IP_PER_HOUR,
      windowMinutes: 60,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions from this connection — please try again later." },
        { status: 429, headers }
      );
    }

    // Lead intelligence (see lib/lead-classification.ts) — best-effort:
    // a classification failure never blocks the submission itself from
    // being saved/emailed, it just ships without a priority tag.
    //
    // BILLED TO THE SITE OWNER. This endpoint is public by necessity —
    // the visitor filling in the form has no Ionexa account — so there
    // is no caller to charge. That is not a reason to charge nobody: the
    // classification exists to triage the OWNER's inbox, the owner is
    // who benefits, and until now every submission to every published
    // website spent real money that reached no cost log at all.
    //
    // The owner is checked for credits BEFORE the call, not after. There
    // is no reservation to fall back on here (a stranger's form POST
    // cannot hold the owner's credits while it runs), so a balance check
    // up front is the only thing that stops us spending money we then
    // cannot recover. An owner who cannot pay simply gets the submission
    // without a priority tag — the form itself never fails for the
    // visitor, which is the one behaviour that must not regress.
    // Fetched here rather than further down (it is also what addresses
    // the notification email) so the owner's plan is known before any
    // money is spent on their behalf.
    const { data: ownerAuth } = await admin.auth.admin.getUserById(website.user_id);
    const owner = ownerAuth?.user ?? null;
    const ownerPlan = await resolveEffectivePlan(owner);

    let classification: string | null = null;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && owner) {
      const costs = new CostAccumulator();
      try {
        const affordable = await hasEnoughCredits(
          website.user_id,
          LEAD_CLASSIFICATION_MIN_CREDITS,
          ownerPlan
        );
        if (affordable.ok) {
          classification = await classifyLeadMessage(apiKey, fields, costs);
        }
      } catch (err) {
        logApiError("/api/websites/[id]/submit-form", err, { stage: "lead_classification" });
      } finally {
        // Settled even when the classification threw after the call went
        // out: the tokens were spent either way, and an unbilled failure
        // is exactly the loss this change exists to stop.
        if (costs.callCount > 0) {
          await settleReservation({
            userId: website.user_id,
            reservationId: "", // charge-only; there was no hold to release
            feature: "lead_classification",
            costs,
            plan: ownerPlan,
            metadata: { websiteId, classified: classification !== null },
          });
        }
      }
    }

    // THE ROW IS WRITTEN FIRST, AND ITS ID COMES BACK.
    //
    // Storing before sending is the whole fallback: if the email cannot
    // go out — no API key, no verified domain, Resend down — the lead is
    // already saved and reachable, and the failure becomes a fact on the
    // row rather than a line in a log. Reversing these two would mean an
    // outage loses the submission and the owner never learns it existed.
    const { data: inserted, error: insertError } = await admin
      .from("website_form_submissions")
      .insert({
        website_id: websiteId,
        user_id: website.user_id,
        fields,
        classification,
        form_type: formType,
        consent,
        consent_text: consentText,
      })
      .select("id")
      .maybeSingle();
    if (insertError) {
      logApiError("/api/websites/[id]/submit-form", insertError, { stage: "insert" });
    }

    // AWAITED, not fired and forgotten.
    //
    // It used to be `void sendWebsiteFormSubmissionEmail(...)` — the
    // response went back before the send resolved, which on a serverless
    // runtime means the function can be frozen mid-flight and the email
    // simply never happens. It also meant the outcome was unknowable by
    // construction. The visitor waits for one email call; the caps above
    // are what stop that from being a lever.
    const ownerEmail = owner?.email;
    const delivery = ownerEmail
      ? await sendWebsiteFormSubmissionEmail({
          email: ownerEmail,
          userId: website.user_id,
          websiteName: website.name,
          fields,
          classification,
        })
      : { status: "failed" as const, detail: "The account has no email address." };

    if (inserted?.id) {
      const { error: statusError } = await admin
        .from("website_form_submissions")
        .update({ email_status: delivery.status, email_detail: delivery.detail })
        .eq("id", inserted.id);
      if (statusError) {
        logApiError("/api/websites/[id]/submit-form", statusError, { stage: "email_status" });
      }
    }

    // THE IN-APP NOTIFICATION IS THE FALLBACK THAT DOES NOT DEPEND ON
    // EMAIL AT ALL. It is created on every submission, not only when the
    // email failed: an owner who never set up a sending domain would
    // otherwise get a notification only for the submissions they were
    // already not being told about, which is the same silence one step
    // further in.
    const who = submissionHeadline(fields);
    await createNotification({
      userId: website.user_id,
      source: "website_form",
      title: `New ${formType} submission on "${website.name}"`,
      body: who ? `From ${who}.` : "Open it to see what they sent.",
      url: "/dashboard/form-submissions",
    });

    return NextResponse.json({ ok: true, submitted: true }, { headers });
  } catch (err) {
    logApiError("/api/websites/[id]/submit-form", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500, headers });
  }
}
