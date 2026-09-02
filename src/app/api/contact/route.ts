import { NextResponse } from "next/server";
import { createResendClient } from "@/lib/resend";
import { senderAddress, senderStatus } from "@/lib/email/resend-config";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { ADMIN_EMAILS } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
 *
 * ------------------------------------------------------------------
 * THE FROM ADDRESS, AND WHY THIS ROUTE NO LONGER PICKS ITS OWN
 * ------------------------------------------------------------------
 *
 * The 2026-08-08 draft of this file opened with
 *
 *     const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL
 *       || "Ionexa AI <onboarding@resend.dev>";
 *
 * which is the exact line lib/email/resend-config.ts was written to
 * delete — its own header records that FOURTEEN files carried a copy of
 * it. Worse than the duplication is what the `||` hides: the fallback is
 * Resend's SHARED TEST SENDER, and a deployment on it is not "working
 * with a different From". It delivers ONLY to the Resend account
 * owner's own address and refuses every other recipient, one API call at
 * a time. The `||` turns that into a silent state.
 *
 * So the address comes from senderAddress() and the STATE comes from
 * senderStatus(), and this route reports the state instead of absorbing
 * it:
 *
 *   no_key      — no RESEND_API_KEY. Nothing can be sent by anybody.
 *                 503, and the page does not render a form at all.
 *
 *   test_sender — a key, no RESEND_FROM_EMAIL. This is the state this
 *                 deployment is in today, and CONTACT IS THE ONE PATH
 *                 THAT PLAUSIBLY STILL WORKS IN IT, because its
 *                 recipient IS the account owner — the single address
 *                 the shared sender is allowed to reach. So the send is
 *                 attempted rather than refused. It is not called a
 *                 success in advance: the response carries the status,
 *                 the page carries a banner, and a refusal from Resend
 *                 is returned as a refusal.
 *
 *   ok          — a verified sender of this deployment's own.
 *
 * The status rides on EVERY response, success included. A caller that
 * needs to know whether mail is really configured must not have to
 * provoke an error to find out.
 *
 * ------------------------------------------------------------------
 * EVERY REFUSAL CARRIES A STABLE `code`
 * ------------------------------------------------------------------
 *
 * The same convention the voice and trading routes already use, and for
 * the same reason: this route has no locale. It is a public POST with no
 * session, no NEXT_LOCALE cookie in scope and no i18n provider, so an
 * English sentence composed here is an English sentence in a product that
 * ships in ten languages.
 *
 * So the English stays — it is what a curl, a log line and a bug report
 * get — and the browser never renders it. components/contact/contact-form
 * looks the code up under `contact.errors.<code>` in all ten locales and
 * falls back to this sentence only for a code that build has no word for,
 * which today is none of them.
 */
export async function POST(request: Request) {
  const status = senderStatus();

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
        { ok: false, senderStatus: status, code: "rate_limited", error: "Too many messages. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, senderStatus: status, code: "invalid_request", error: "Invalid request." },
        { status: 400 }
      );
    }

    // The honeypot, checked before anything else is validated. Returns
    // the SAME success shape a real submission gets: a bot that learns
    // it was caught learns which field to leave alone.
    if (typeof body._hp === "string" && body._hp.trim() !== "") {
      return NextResponse.json({ ok: true, senderStatus: status });
    }

    const name = String(body.name ?? "").trim().slice(0, MAX_NAME);
    const email = String(body.email ?? "").trim().slice(0, MAX_EMAIL);
    const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE);

    if (message.length < MIN_MESSAGE) {
      return NextResponse.json(
        {
          ok: false,
          senderStatus: status,
          code: "too_short",
          error: `Please write at least ${MIN_MESSAGE} characters.`,
        },
        { status: 400 }
      );
    }
    // Deliberately loose. A stricter pattern rejects real addresses
    // (plus-addressing, new TLDs, non-ASCII local parts) far more often
    // than it catches a bad one, and the address is only ever used as
    // reply-to — it selects no recipient and grants no access.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, senderStatus: status, code: "bad_email", error: "That email address does not look right." },
        { status: 400 }
      );
    }

    if (status === "no_key") {
      logApiError("/api/contact", new Error("RESEND_API_KEY is not set"), {
        stage: "sender_not_configured",
        senderStatus: status,
      });
      // 503, not 200. Telling somebody their message was sent when it
      // was not is worse than telling them to reach us another way.
      return NextResponse.json(
        {
          ok: false,
          senderStatus: status,
          code: "not_configured",
          error: "Messages are not configured on this deployment and nothing was sent.",
        },
        { status: 503 }
      );
    }

    if (status === "test_sender") {
      // NOT an error, and not silence either. The attempt goes ahead;
      // this line is what makes "it went to the owner's own address on a
      // shared test sender" a thing somebody can find in a log later,
      // rather than a thing that has to be re-derived from the env.
      logApiError("/api/contact", new Error("RESEND_FROM_EMAIL is not set"), {
        stage: "shared_test_sender",
        senderStatus: status,
        note: "sending from Resend's shared test sender, which reaches only the Resend account owner",
      });
    }

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: ADMIN_EMAILS,
      // Reply-to, never `from`. Sending AS the visitor's address would
      // fail SPF and get the domain's reputation burned within a week.
      replyTo: email,
      subject: `Contact form: ${name || email}`,
      text: [`From: ${name || "(no name)"} <${email}>`, "", message].join("\n"),
    });

    if (error) {
      logApiError("/api/contact", error, { stage: "resend_error", senderStatus: status });
      return NextResponse.json(
        {
          ok: false,
          senderStatus: status,
          code: status === "test_sender" ? "not_delivered_test_sender" : "send_failed",
          error:
            status === "test_sender"
              ? "Your message could not be delivered. This deployment has no verified sender address."
              : "Could not send your message.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, senderStatus: status });
  } catch (err) {
    logApiError("/api/contact", err, { senderStatus: status });
    return NextResponse.json(
      { ok: false, senderStatus: status, code: "unknown", error: "Something went wrong." },
      { status: 500 }
    );
  }
}
