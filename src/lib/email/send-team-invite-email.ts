import "server-only";
import { createResendClient } from "@/lib/resend";
import { teamInviteEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort — never throws, mirroring sendWelcomeEmail. The invite row is
// already saved by the time this runs, so a Resend outage means the invitee
// just doesn't get the email yet, not that the invite silently failed.
export async function sendTeamInviteEmail({
  to,
  inviterEmail,
  planName,
}: {
  to: string;
  inviterEmail: string;
  planName: string;
}): Promise<void> {
  try {
    const siteUrl = getSiteUrl();
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `${inviterEmail} invited you to their Ionexa AI team`,
      html: teamInviteEmailHtml({
        inviterEmail,
        planName,
        // plan=free skips straight to account details (step 2) with no
        // plan-selection screen — invited members get full access at the
        // owner's tier automatically (see acceptPendingTeamInvite), so they
        // must never be routed into picking/paying for a plan themselves.
        signupUrl: `${siteUrl}/signup?plan=free`,
      }),
    });

    if (error) {
      logApiError("email:send-team-invite", error, { stage: "resend_error" });
    }
  } catch (err) {
    logApiError("email:send-team-invite", err, { stage: "unhandled" });
  }
}
