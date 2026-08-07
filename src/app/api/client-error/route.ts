import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Receives client-side crashes from WidgetBoundary so they land in
// production_errors next to server failures.
//
// Authenticated-only and heavily bounded: an open, unauthenticated
// endpoint that writes rows on demand is a free way for anyone to fill
// the owner's error table and trigger alert emails.
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // logApiError dedups and thresholds ALERTS, but every accepted call
    // still writes a row — and a page stuck in a crash loop (or a user
    // scripting their own session) should not get to grow the error
    // table without bound. Sixty an hour keeps every real debugging
    // session while capping the flood.
    const limited = await checkRateLimit({
      scope: "client_error",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      // The beacon is fire-and-forget; a capped report succeeds quietly.
      return NextResponse.json({ ok: true });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const message = typeof body.message === "string" ? body.message.slice(0, MAX_MESSAGE) : "";
    if (!message) return NextResponse.json({ ok: false }, { status: 400 });

    const component = typeof body.component === "string" ? body.component.slice(0, 80) : "widget";
    const stack = typeof body.stack === "string" ? body.stack.slice(0, MAX_STACK) : undefined;

    // Routed through logApiError so it takes exactly the same dedup,
    // threshold and alert path as a server-side failure.
    logApiError(`client:${component}`, Object.assign(new Error(message), { stack }), {
      userId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
