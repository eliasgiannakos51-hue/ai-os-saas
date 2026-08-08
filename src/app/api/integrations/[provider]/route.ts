import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isProviderId } from "@/lib/integrations/providers";
import { disconnectIntegration } from "@/lib/integrations/store";
import { revokeConsent } from "@/lib/integrations/consent";

export const dynamic = "force-dynamic";

// Disconnect.
//
// GDPR erasure for a third-party grant, and the one operation in this
// feature that must never fail quietly. lib/integrations/store.ts does the
// work in the order that matters — revoke at the provider FIRST, then
// delete our row — so a "Disconnect" cannot leave a live grant behind that
// we no longer hold the token to revoke.
//
// The delete cascades to integration_sync_log, so the record of what the
// AI read goes with the access that let it read.
export async function DELETE(_request: Request, { params }: { params: { provider: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    if (!isProviderId(params.provider)) {
      return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 404 });
    }

    const limited = await checkRateLimit({
      scope: "integration_disconnect",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }

    const result = await disconnectIntegration(user.id, params.provider);
    // Disconnecting withdraws the consent too. Leaving it live would mean
    // the next "Connect" skipped the consent screen entirely — the user
    // would be sent to Google on the strength of an agreement they made
    // before they changed their mind, which is the opposite of what
    // pressing Disconnect means.
    await revokeConsent(user.id, params.provider);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Could not disconnect that integration." },
        { status: 500 }
      );
    }

    // Reported honestly rather than as a flat success: if the provider
    // refused the revoke (it was down, or the token had already been
    // revoked there), the user should be told they may want to check their
    // account settings — not assured of something we did not do.
    return NextResponse.json({ ok: true, revokedAtProvider: result.revokedAtProvider });
  } catch (err) {
    logApiError("/api/integrations/[provider]", err, { provider: params.provider });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
