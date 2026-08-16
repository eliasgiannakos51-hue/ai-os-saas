import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Creates a blank document and returns its id — the editor page then loads
// it and the client takes over from there via PATCH /api/documents/[id].
// No AI call, no credit cost: this is user-authored freeform text, not a
// generated artifact.
//
// An OPTIONAL title may be posted. This took no body at all and always
// wrote "Untitled", which made the worked example on the empty screen
// ("Notes from Monday's meeting") a button that opened an editor on a
// document called something else — the one thing an example must not do.
// Length-capped and trimmed here rather than trusted: the client is not
// the only thing that can call this.
const MAX_TITLE_LENGTH = 200;

function requestedTitle(body: unknown): string {
  if (!body || typeof body !== "object") return "Untitled";
  const raw = (body as { title?: unknown }).title;
  if (typeof raw !== "string") return "Untitled";
  const trimmed = raw.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed || "Untitled";
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { allowed } = await checkRateLimit({
      scope: "documents_create",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many documents created. Please try again later." },
        { status: 429 }
      );
    }

    // A malformed or absent body is not an error — it is the old,
    // still-supported call, and it means "Untitled".
    const body = await request.json().catch(() => null);

    const { data, error } = await supabase
      .from("user_documents")
      .insert({ user_id: user.id, title: requestedTitle(body), content: { html: "" } })
      .select("id")
      .single();

    if (error || !data) {
      logApiError("/api/documents", error, { stage: "insert" });
      return NextResponse.json(
        { ok: false, error: "Could not create document." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    logApiError("/api/documents", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
