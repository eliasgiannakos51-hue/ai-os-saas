import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import type { UserWebsite } from "@/types/user-website";

export const dynamic = "force-dynamic";

// One complimentary, no-extra-charge regenerate for a website the AI
// Output Protection Layer flagged (status 'flagged' — see
// api/websites/generate/process/route.ts). Resets the row back to
// 'pending' and hands the client back the original description +
// already-uploaded reference image paths so it can immediately re-fire
// the normal /api/websites/generate/process worker request, same as a
// fresh generation — this route itself makes no AI call and charges
// nothing.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const websiteId = params.id;
    if (!websiteId) {
      return NextResponse.json({ ok: false, error: "Missing website id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS (select_own_user_websites) already scopes this to the caller's
    // own row — a stranger's websiteId simply won't be found.
    const { data: website, error: fetchError } = await supabase
      .from("user_websites")
      .select("*")
      .eq("id", websiteId)
      .maybeSingle();

    if (fetchError || !website) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }

    const typedWebsite = website as UserWebsite;

    if (typedWebsite.status !== "flagged") {
      return NextResponse.json(
        { ok: false, error: "Only a flagged website can be regenerated for free." },
        { status: 400 }
      );
    }
    if (typedWebsite.free_retry_used) {
      return NextResponse.json(
        { ok: false, error: "The free regenerate for this website has already been used." },
        { status: 400 }
      );
    }
    if (!typedWebsite.description) {
      return NextResponse.json(
        {
          ok: false,
          error: "This website was created before regeneration was supported — please start a new one instead.",
        },
        { status: 400 }
      );
    }

    const { data: imageRows } = await supabase
      .from("website_reference_images")
      .select("image_url")
      .eq("website_id", websiteId);
    const referenceImagePaths = (imageRows ?? []).map((r) => r.image_url as string);

    // Atomic conditional UPDATE — only claims if it's still 'flagged' and
    // the free retry hasn't already been spent, same race-guard pattern
    // used by editing_started_at/processing_started_at elsewhere in this
    // app: a fast double-click on "Regenerate (free)" can only ever win
    // this update once.
    const { data: claimedRows, error: claimError } = await supabase
      .from("user_websites")
      .update({ status: "pending", error_message: null, free_retry_used: true })
      .eq("id", websiteId)
      .eq("status", "flagged")
      .eq("free_retry_used", false)
      .select("id");

    if (claimError) {
      logApiError("/api/websites/[id]/regenerate", claimError, { stage: "claim" });
      return NextResponse.json({ ok: false, error: claimError.message }, { status: 500 });
    }
    if (!claimedRows || claimedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "This website's free regenerate has already been started or used." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      websiteId,
      description: typedWebsite.description,
      referenceImagePaths,
    });
  } catch (err) {
    logApiError("/api/websites/[id]/regenerate", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
