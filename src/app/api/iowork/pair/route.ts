import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getClientIp } from "@/lib/get-client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  newPairingCode,
  newSecret,
  hashSecret,
  formatPairingCode,
  parsePlatform,
  parseDeviceLabel,
  PAIRING_TTL_MINUTES,
} from "@/lib/iowork/pairing";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** How often the app should ask api/iowork/pair/token whether the person
 *  has typed the code yet. The server says it rather than the app choosing,
 *  so the polling rate can be changed without shipping a new app. */
export const PAIR_POLL_SECONDS = 10;

// @service-role-justified pre-auth
//
// THE FIRST HALF OF PAIRING ONE COMPUTER (§3 of the approved
// docs/IOWORK-SECURITY-PLAN.md). The desktop app calls this before any
// account is involved at all — that is the whole point of the step, and it
// is why there is no session to check: the app has just been installed and
// belongs to nobody yet.
//
// It hands back two things that are not the same:
//
//   code        eight characters, shown on the computer's screen, typed by
//               the person into ionexa.ai. Low entropy by design, because a
//               person has to retype it. It proves to the ACCOUNT that
//               whoever is claiming holds this computer.
//
//   claimSecret 32 random bytes the app keeps and never displays. It is the
//               only thing that can later collect the device token
//               (api/iowork/pair/token). Someone who reads the code off the
//               screen therefore cannot take the token — the two values
//               guard different doors, and this is the reason there are
//               two of them.
//
// NOTHING HERE TOUCHES A FILE and nothing here names a folder: a pairing
// row holds a code, a hash, a platform and a label (§4).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const platform = parsePlatform((body as { platform?: unknown }).platform);
    if (!platform) {
      return NextResponse.json({ ok: false, code: "bad_platform" }, { status: 400 });
    }
    const label = parseDeviceLabel((body as { label?: unknown }).label, platform === "mac" ? "Mac" : "Windows");

    // Anyone on the internet can reach this route, so the ceiling is per
    // address: enough for a person reinstalling or retrying, far short of
    // a machine filling the table with pending pairings.
    const { allowed } = await checkRateLimit({
      scope: "iowork_pair_start",
      identifier: getClientIp(request),
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!allowed) {
      return NextResponse.json({ ok: false, code: "rateLimited" }, { status: 429 });
    }

    const claimSecret = newSecret();
    const admin = createAdminClient();

    // `code` is unique, so a collision is a failed insert rather than two
    // pairings answering to one code. Three tries: at 32^8 the second is
    // already theatre, but an insert that fails for any other reason should
    // not read as "all codes are taken".
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newPairingCode();
      const { error } = await admin.from("iowork_pairings").insert({
        code,
        claim_secret_hash: hashSecret(claimSecret),
        platform,
        label,
      });
      if (!error) {
        return NextResponse.json({
          ok: true,
          code,
          display: formatPairingCode(code),
          claimSecret,
          expiresInMinutes: PAIRING_TTL_MINUTES,
          pollSeconds: PAIR_POLL_SECONDS,
        });
      }
      if (attempt === 2) {
        logApiError("/api/iowork/pair", error, { stage: "insert" });
        return NextResponse.json({ ok: false, code: "not_started" }, { status: 500 });
      }
    }
    // Unreachable: the loop either returns or logs on its last attempt.
    return NextResponse.json({ ok: false, code: "not_started" }, { status: 500 });
  } catch (err) {
    logApiError("/api/iowork/pair", err, { stage: "start" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
