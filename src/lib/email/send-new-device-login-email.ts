import "server-only";
import { createResendClient } from "@/lib/resend";
import { newDeviceLoginEmailHtml } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Ionexa AI <onboarding@resend.dev>";

// Best-effort — the caller (api/auth/device-check) already treats this as
// non-blocking, but this never throws either way so a Resend outage can
// never surface as a login failure.
export async function sendNewDeviceLoginEmail(
  email: string,
  {
    deviceLabel,
    ipAddress,
    signedInAt,
  }: { deviceLabel: string; ipAddress: string; signedInAt: string }
): Promise<void> {
  try {
    const resend = createResendClient();
    const siteUrl = getSiteUrl();
    const dateLabel = new Date(signedInAt).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "New sign-in to your Ionexa AI account",
      html: newDeviceLoginEmailHtml({
        email,
        deviceLabel,
        ipAddress,
        dateLabel,
        forgotPasswordUrl: `${siteUrl}/forgot-password`,
      }),
    });

    if (error) {
      logApiError("email:send-new-device-login", error, { stage: "resend_error" });
    }
  } catch (err) {
    logApiError("email:send-new-device-login", err, { stage: "unhandled" });
  }
}
