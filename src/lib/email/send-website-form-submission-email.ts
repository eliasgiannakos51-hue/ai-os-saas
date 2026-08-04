import "server-only";
import { createResendClient } from "@/lib/resend";
import { websiteFormSubmissionEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Sent by api/websites/[id]/submit-form/route.ts whenever a real visitor
// submits a contact/booking form on one of the user's published,
// downloaded websites — this is the entire point of that endpoint
// existing (see lib/website-builder.ts's FUNCTIONAL_ELEMENTS_SECTION):
// the form isn't decorative, it actually reaches the owner. Best-effort,
// same pattern as every other transactional email in this app: never
// throws, just logs.
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
}): Promise<void> {
  if (!email) return;
  try {
    const gate = await checkEmailAllowed(userId, "website_form_submission");
    if (!gate.allowed) return;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `New form submission on "${websiteName}" — Ionexa AI`,
      html: websiteFormSubmissionEmailHtml({
        websiteName,
        fields,
        classification,
        dashboardUrl: `${getSiteUrl()}/dashboard/website-builder`,
      }),
    });

    if (error) {
      logApiError("email:send-website-form-submission", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "website_form_submission");
    }
  } catch (err) {
    logApiError("email:send-website-form-submission", err, { stage: "unhandled" });
  }
}
