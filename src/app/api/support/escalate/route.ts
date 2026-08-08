import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { sendSupportEscalationEmail } from "@/lib/email/send-support-escalation-email";
import { MAX_QUESTION_CHARS } from "@/lib/support/answer";

export const dynamic = "force-dynamic";

// "I don't know" has to lead somewhere.
//
// A support assistant that refuses to guess is only an improvement if the
// refusal is followed by a person. This is that step: the question, the
// reason the assistant would not answer it, and the address to reply to,
// stored and mailed.
//
// THE ROW IS WRITTEN BEFORE THE MAIL IS SENT, and the request succeeds
// even if the mail does not. A user who has pressed "send this to a
// human" must not be told it failed because Resend was down — the
// question is recorded either way, and support_escalations is the queue
// that gets worked. The other order would lose the question entirely on
// exactly the day the mail provider is having a bad afternoon.
const VALID_REASONS = new Set([
  "no_answer",
  "ungrounded_number",
  "ungrounded_claim",
  "empty",
  "unavailable",
  "user_asked",
]);

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "support_escalate",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many messages in the last hour. Please try again later." },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      question?: unknown;
      reason?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json({ ok: false, error: "Nothing to send." }, { status: 400 });
    }
    const reason =
      typeof body.reason === "string" && VALID_REASONS.has(body.reason) ? body.reason : "user_asked";

    const email = user.email ?? "";
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "This account has no email address to reply to." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("support_escalations").insert({
      user_id: user.id,
      email,
      question,
      reason,
    });
    if (error) {
      logApiError("/api/support/escalate", error, { stage: "insert" });
      return NextResponse.json(
        { ok: false, error: "Could not send that. Please try again." },
        { status: 500 }
      );
    }

    // Best-effort, and deliberately after the row exists.
    await sendSupportEscalationEmail({ email, question, reason });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/support/escalate", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
