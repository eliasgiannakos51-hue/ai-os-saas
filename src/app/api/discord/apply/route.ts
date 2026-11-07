import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { discordMissing, botRest } from "@/lib/discord/config";
import { botGuild, botUserId } from "@/lib/discord/bot";
import { applyBlueprint, undoItems, type ProgressEvent } from "@/lib/discord/apply";
import { listItems, loadBuild, markItemDeleted, moveBuild, ownsGuild, recordItem, setBuildStatus } from "@/lib/discord/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * «Φτιάξ' το στο Discord» AND «Αναίρεση» (the owner's Discord directive,
 * 2026-11-05). The only route that changes anything in Discord.
 *
 *   {build, action: "apply"}  the plan, box by box, in APPLY_ORDER
 *   {build, action: "undo"}   ONLY what that apply recorded, newest first
 *
 * One line of NDJSON per box as it happens ({type: "made"|"failed"|
 * "deleted"|"undo_failed", box, kind}), then {type: "done", status}, so
 * the screen marks each box the moment Discord answers. If the stream
 * drops, nothing is lost: every id is in public.discord_build_items
 * before the next request is sent (lib/discord/apply.ts), and the screen
 * reads that on its next load.
 *
 * The status moves by compare-and-swap (planned|failed → applying,
 * applied|failed → undoing, and back to planned once undone), so a second press while one runs is refused
 * rather than doubled. No model is called and nothing is charged. Bounded
 * by checkRateLimit scope discord_apply.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const action = body.action;
  const buildId = typeof body.build === "string" && UUID.test(body.build) ? body.build : "";
  if ((action !== "apply" && action !== "undo") || !buildId) return refuse("invalid_body", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  if (!(await isFeatureOn("discord-bot", user))) return refuse("not_found", 404);
  if (discordMissing().length > 0) return refuse("not_configured", 503);

  const limited = await checkRateLimit({ scope: "discord_apply", identifier: user.id, maxAttempts: 20, windowMinutes: 60 });
  if (!limited.allowed) return refuse("rate_limited", 429);

  const build = await loadBuild(user.id, buildId);
  if (!build) return refuse("not_found", 404);
  // The server must still be this account's, and the bot still in it.
  if (!(await ownsGuild(user.id, build.guild_id))) return refuse("not_connected", 409);
  const rest = botRest();
  const guild = await botGuild(build.guild_id, rest);
  if (!guild) return refuse("bot_not_in_server", 409);

  const items = await listItems(user.id, build.id);
  const live = items.filter((i) => i.deletedAt === null);
  if (action === "apply") {
    // What a previous apply made must be undone first: one live record per build.
    if (live.length > 0) return refuse("already_applied", 409);
    if (!(await moveBuild(user.id, build.id, ["planned", "failed"], "applying"))) return refuse("busy", 409);
  } else {
    if (!(await moveBuild(user.id, build.id, ["applied", "failed"], "undoing"))) return refuse("busy", 409);
  }
  const botId = action === "apply" ? await botUserId(rest) : null;
  if (action === "apply" && !botId) {
    await setBuildStatus(user.id, build.id, "planned");
    return refuse("bot_unavailable", 503);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          // The person closed the page: the apply goes on, the record stands.
        }
      };
      const onProgress = (event: ProgressEvent) => send(event);
      try {
        if (action === "apply") {
          const outcome = await applyBlueprint(build.blueprint, {
            rest,
            guildId: build.guild_id,
            botUserId: botId!,
            community: guild.community,
            record: (item) => recordItem(user.id, build.id, item),
            onProgress,
            firstSeq: items.reduce((max, i) => Math.max(max, i.seq), 0) + 1,
          });
          const status = outcome.ok ? "applied" : "failed";
          await setBuildStatus(user.id, build.id, status);
          send({ type: "done", status, ...(outcome.ok ? {} : { failedBox: outcome.failedBox, error: outcome.error }) });
        } else {
          const outcome = await undoItems(live, {
            rest,
            guildId: build.guild_id,
            markDeleted: (seq) => markItemDeleted(user.id, build.id, seq),
            onProgress,
          });
          // Undone, the plan is a plan again: it can be changed and made again.
          const status = outcome.ok ? "planned" : "failed";
          await setBuildStatus(user.id, build.id, status);
          send({ type: "done", status, ...(outcome.ok ? {} : { failedBox: outcome.failedBox, error: outcome.error }) });
        }
      } catch (err) {
        logApiError("/api/discord/apply", err, { stage: String(action) });
        await setBuildStatus(user.id, build.id, "failed").catch(() => undefined);
        send({ type: "done", status: "failed", error: "error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
