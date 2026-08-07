import "server-only";
import { createResendClient } from "@/lib/resend";
import { collaborationInviteEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort — never throws, same contract as every send-* module here.
// The invite row is already saved by the time this runs; a Resend outage
// means the invitee doesn't get the email yet, and the owner can see the
// pending invite (and its link) in the share panel regardless.
export async function sendCollaborationInviteEmail({
  to,
  inviterEmail,
  projectGoal,
  role,
  token,
}: {
  to: string;
  inviterEmail: string;
  projectGoal: string;
  role: string;
  token: string;
}): Promise<void> {
  try {
    const siteUrl = getSiteUrl();
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `${inviterEmail} invited you to collaborate on Ionexa AI`,
      html: collaborationInviteEmailHtml({
        inviterEmail,
        projectGoal,
        role,
        // The accept page handles both worlds: signed out it forwards to
        // signup/login with itself as the destination, signed in it shows
        // the accept button. The token in the URL is single-purpose and
        // expires with the invite.
        acceptUrl: `${siteUrl}/collaborate/${token}`,
      }),
    });

    if (error) {
      logApiError("email:send-collaboration-invite", error, { stage: "resend_error" });
    }
  } catch (err) {
    logApiError("email:send-collaboration-invite", err, { stage: "unhandled" });
  }
}
