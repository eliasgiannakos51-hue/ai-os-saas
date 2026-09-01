import "server-only";
import { senderAddress } from "@/lib/email/resend-config";
import { Resend } from "resend";
import { websiteFormSubmissionEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";
import {
  classifySendFailure,
  usesSharedTestSender,
  type FormEmailStatus,
} from "@/lib/websites/form-delivery";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

export type FormEmailResult = { status: FormEmailStatus; detail: string | null };

/**
 * Sent by api/websites/[id]/submit-form/route.ts whenever a real visitor
 * submits a form on one of the user's published websites.
 *
 * IT RETURNS WHAT HAPPENED. Every other sender in lib/email/ returns
 * void and logs on failure, which is right for a welcome email — nobody
 * is waiting for it and nothing downstream changes. It is wrong here.
 * This message IS the lead. A site owner whose sending domain is not
 * verified sees a working form, a filling dashboard and an empty inbox,
 * and the only record of why is a server log they cannot read.
 *
 * So the outcome goes back to the caller, onto the submission row, and
 * onto the screen. Still never throws: the visitor's form must not fail
 * because our mail provider did.
 */
export async function sendWebsiteFormSubmissionEmail({
  email,
  userId,
  websiteName,
  fields,
  classification,
}: {
  email: string;
  userId: string;
  websiteName: string;
  fields: Record<string, string>;
  classification: string | null;
}): Promise<FormEmailResult> {
  if (!email) return { status: "failed", detail: "The account has no email address." };

  // CHECKED BY NAME, BEFORE THE CLIENT IS BUILT. `new Resend(undefined)`
  // throws from its constructor, so a deployment with no RESEND_API_KEY
  // fails identically to a network error — inside the catch, as a log
  // line. Naming the cause here is the difference between "email is
  // broken" and "set RESEND_API_KEY".
  if (!process.env.RESEND_API_KEY) {
    return {
      status: "no_key",
      detail: "RESEND_API_KEY is not set on this deployment, so no email can be sent.",
    };
  }

  try {
    const gate = await checkEmailAllowed(userId, "website_form_submission");
    if (!gate.allowed) {
      return {
        status: gate.reason === "opted_out" ? "opted_out" : "daily_cap",
        detail:
          gate.reason === "opted_out"
            ? "Form-submission emails are switched off in your email settings."
            : "The daily email limit for this account was already reached.",
      };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: `New form submission on "${websiteName}" — Ionexa AI`,
      html: websiteFormSubmissionEmailHtml({
        websiteName,
        fields,
        classification,
        dashboardUrl: `${getSiteUrl()}/dashboard/form-submissions`,
      }),
    });

    if (error) {
      const classified = classifySendFailure(error);
      logApiError("email:send-website-form-submission", error, { stage: "resend_error" });
      return classified;
    }

    // ACCEPTED IS NOT DELIVERED, and the one case where that gap is
    // predictable is worth saying out loud rather than reporting 'sent'.
    // The shared sender only ever reaches the address that owns the
    // Resend account; for anyone else Resend usually refuses above, but
    // a deployment where it does NOT refuse is one where the owner is
    // the account holder and everybody else silently gets nothing.
    if (usesSharedTestSender(senderAddress())) {
      await recordEmailSend(userId, "website_form_submission");
      return {
        status: "unverified_domain",
        detail:
          "Sent from the shared Resend test address, which only delivers to the Resend account owner. Set RESEND_FROM_EMAIL to an address on a verified domain.",
      };
    }

    await recordEmailSend(userId, "website_form_submission");
    return { status: "sent", detail: null };
  } catch (err) {
    logApiError("email:send-website-form-submission", err, { stage: "unhandled" });
    return classifySendFailure(err);
  }
}
