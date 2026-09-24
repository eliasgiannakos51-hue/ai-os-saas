import "server-only";
import { createResendClient, ResendNotConfiguredError } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
import { teamInviteEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

/**
 * NEVER THROWS, AND NOW SAYS WHAT HAPPENED. The difference is the whole
 * point of the change.
 *
 * It used to return `void`, and the route that calls it answered
 * `{ ok: true }` immediately afterwards, so the screen said "Invitation
 * sent to alice@example.com" whether or not a single byte left the
 * building. With no RESEND_API_KEY the SDK's own constructor throws, the
 * catch below logged it, and the owner was told it worked — measured
 * 2026-09-24 by scripts/measure-silent-features.mjs, which found
 * teamCollaboration to be the ONE sold feature that needs a provider key,
 * says nothing when it is missing, and reports success anyway.
 *
 * The invite ROW is still saved first and still stands on its own: the
 * invitee can accept by signing up with that address whether or not they
 * were emailed. So the failure is not fatal and this still must not
 * throw — it has to be REPORTABLE, which is a different thing from
 * fatal, and mixing those two up is what produced the lie.
 *
 * sendDeleteAccountConfirmationEmail already had this shape. It is
 * mirrored rather than invented.
 */
export type InviteEmailResult = {
  ok: boolean;
  /** Why not, for a screen that has to say something specific. */
  reason: "not_configured" | "send_failed" | null;
};

export async function sendTeamInviteEmail({
  to,
  inviterEmail,
  planName,
}: {
  to: string;
  inviterEmail: string;
  planName: string;
}): Promise<InviteEmailResult> {
  try {
    const siteUrl = getSiteUrl();
    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
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
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true, reason: null };
  } catch (err) {
    // THE TWO CASES ARE TOLD APART because the screen says different
    // things about them. A missing key is the operator's to fix and the
    // message names the variable; a refused send is Resend's answer —
    // most often an unverified sender domain, which delivers only to the
    // Resend account owner and silently drops everything else.
    const notConfigured = err instanceof ResendNotConfiguredError;
    logApiError("email:send-team-invite", err, {
      stage: notConfigured ? "not_configured" : "unhandled",
    });
    return { ok: false, reason: notConfigured ? "not_configured" : "send_failed" };
  }
}
