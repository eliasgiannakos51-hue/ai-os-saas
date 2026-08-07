import { NextResponse } from "next/server";
import { createResendClient } from "@/lib/resend";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { ADMIN_EMAILS } from "@/lib/admin";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 10;

/**
 * The public contact form.
 *
 * ONE OF THE FEW ROUTES WITH NO SESSION, and it is on the auth gate's
 * allowlist for that reason. Being public is the whole point — somebody
 * who cannot log in, or has not signed up, is exactly who needs to reach
 * us — and it is also what makes it the most abusable endpoint in the
 * app: an unauthenticated POST that causes an email to be sent.
 *
 * So the defences are the ones that work without an identity:
 *
 *   RATE LIMIT BY IP. Not by user, because there is no user. Five an
 *   hour is generous for a person and useless for a script.
 *
 *   A HONEYPOT. A field a real form never fills in, mirroring the one
 *   the generated-site form handler already uses. A bot that fills every
 *   input gets a 200 and nothing sent — answering 400 would tell it
 *   which field to skip next time.
 *
 *   FIXED RECIPIENT. The message goes to the account owners and nowhere
 *   else. The sender's address appears only as reply-to and in the body;
 *   it never chooses a destination. That is the difference between a
 *   contact form and an open relay.
 *
 * Nothing is stored. A support message is not data this product needs to
 * hold, and a table of unauthenticated free text is a liability with no
 * corresponding feature.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limited = await checkRateLimit({
      scope: "contact_form",
      identifier: ip,
      maxAttempts: 5,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many messages. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    // The honeypot, checked before anything else is validated. Returns
    // the SAME success shape a real submission gets: a bot that learns
    // it was caught learns which field to leave alone.
    if (typeof body._hp === "string" && body._hp.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const name = String(body.name ?? "").trim().slice(0, MAX_NAME);
    const email = String(body.email ?? "").trim().slice(0, MAX_EMAIL);
    const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE);

    if (message.length < MIN_MESSAGE) {
      return NextResponse.json(
        { ok: false, error: `Please write at least ${MIN_MESSAGE} characters.` },
        { status: 400 }
      );
    }
    // Deliberately loose. A stricter pattern rejects real addresses
    // (plus-addressing, new TLDs, non-ASCII local parts) far more often
    // than it catches a bad one, and the address is only ever used as
    // reply-to — it selects no recipient and grants no access.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "That email address does not look right." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      logApiError("/api/contact", new Error("RESEND_API_KEY not configured"), {});
      // 503, not 200. Telling somebody their message was sent when it
      // was not is worse than telling them to email us directly.
      return NextResponse.json(
        { ok: false, error: "Messages are temporarily unavailable. Please email us directly." },
        { status: 503 }
      );
    }

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAILS,
      // Reply-to, never `from`. Sending AS the visitor's address would
      // fail SPF and get the domain's reputation burned within a week.
      replyTo: email,
      subject: `Contact form: ${name || email}`,
      text: [
        `From: ${name || "(no name)"} <${email}>`,
        "",
        message,
      ].join("\n"),
    });

    if (error) {
      logApiError("/api/contact", error, { stage: "resend_error" });
      return NextResponse.json({ ok: false, error: "Could not send your message." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/contact", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
