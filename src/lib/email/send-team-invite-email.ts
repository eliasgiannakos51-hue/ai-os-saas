import "server-only";
import { createResendClient } from "@/lib/resend";
import { teamInviteEmailHtml } from "@/lib/email/templates";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Veron AI <onboarding@resend.dev>";

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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `${inviterEmail} invited you to their Veron AI team`,
      html: teamInviteEmailHtml({
        inviterEmail,
        planName,
        signupUrl: `${siteUrl}/login?mode=signup`,
      }),
    });

    if (error) {
      console.error("sendTeamInviteEmail: Resend returned an error", error);
    }
  } catch (err) {
    console.error("sendTeamInviteEmail: failed to send", err);
  }
}
