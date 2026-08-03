import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyLeadMessage } from "@/lib/lead-classification";
import { sendWebsiteFormSubmissionEmail } from "@/lib/email/send-website-form-submission-email";
import { logApiError } from "@/lib/log-error";

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
    try {
      const body = await request.json();
      rawFields = typeof body?.fields === "object" && body.fields !== null ? body.fields : {};
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

    const fields: Record<string, string> = {};
    let fieldCount = 0;
    for (const [key, value] of Object.entries(rawFields)) {
      if (key === "_hp") continue;
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

    // Lead intelligence (see lib/lead-classification.ts) — best-effort:
    // a classification failure never blocks the submission itself from
    // being saved/emailed, it just ships without a priority tag.
    let classification: string | null = null;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        classification = await classifyLeadMessage(apiKey, fields);
      } catch (err) {
        logApiError("/api/websites/[id]/submit-form", err, { stage: "lead_classification" });
      }
    }

    const { error: insertError } = await admin.from("website_form_submissions").insert({
      website_id: websiteId,
      user_id: website.user_id,
      fields,
      classification,
    });
    if (insertError) {
      logApiError("/api/websites/[id]/submit-form", insertError, { stage: "insert" });
    }

    const { data: ownerAuth } = await admin.auth.admin.getUserById(website.user_id);
    const ownerEmail = ownerAuth?.user?.email;
    if (ownerEmail) {
      void sendWebsiteFormSubmissionEmail({
        email: ownerEmail,
        websiteName: website.name,
        fields,
        classification,
      });
    }

    return NextResponse.json({ ok: true, submitted: true }, { headers });
  } catch (err) {
    logApiError("/api/websites/[id]/submit-form", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500, headers });
  }
}
