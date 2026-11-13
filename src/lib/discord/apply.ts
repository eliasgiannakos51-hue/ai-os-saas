import type { DiscordRest, DiscordFail } from "@/lib/discord/rest";
import { overwriteInteger, rolePermissionInteger } from "@/lib/discord/permissions";
import { APPLY_ORDER, messageBoxKey, type AutoModPlan, type Blueprint, type BoxKind, type ChannelKind, type Overwrite } from "@/lib/discord/blueprint";

/**
 * A PLAN MADE REAL IN DISCORD, AND TAKEN BACK (the owner's Discord
 * directive, 2026-11-05).
 *
 * APPLY walks the plan in APPLY_ORDER (lib/discord/blueprint.ts) — roles,
 * categories, channels with their overwrites, messages, AutoMod — one
 * request per box. Every id Discord answers with is RECORDED before the
 * next request is sent (`record`, which writes public.discord_build_items),
 * so whatever happens afterwards — a refusal, a rate limit that will not
 * clear, the function running out of time — the record says exactly what
 * exists. The first failure STOPS the apply: nothing after it is sent,
 * and the screen shows what was made and what was not.
 *
 * UNDO deletes ONLY what that apply recorded, newest first. Its input is
 * the recorded rows and nothing else: it never lists the server, never
 * matches by name, and so cannot reach a channel or role that existed
 * before. A 404 counts as already gone (the person deleted it by hand).
 *
 * Pure apart from the injected client and callbacks: held against a
 * stand-in Discord by scripts/tests/discord-bot.test.mjs.
 */

export type CreatedItem = {
  seq: number;
  kind: BoxKind;
  boxKey: string;
  discordId: string;
  /** For a message: the channel it is in, which its DELETE needs. */
  channelId: string | null;
  /** «made as a text channel: this server is not a Community server». */
  note: string | null;
};

export type ProgressEvent =
  | { type: "made"; box: string; kind: BoxKind; note: string | null }
  | { type: "failed"; box: string; kind: BoxKind; error: string }
  | { type: "deleted"; box: string; kind: BoxKind }
  | { type: "undo_failed"; box: string; kind: BoxKind; error: string };

export type ApplyContext = {
  rest: DiscordRest;
  guildId: string;
  /** The bot's own user id, given a member overwrite on every channel that hides itself from @everyone. */
  botUserId: string;
  /** Whether the server has Discord's COMMUNITY feature: announcement and forum channels need it. */
  community: boolean;
  /** Persists one created item. False stops the apply. */
  record: (item: CreatedItem) => Promise<boolean>;
  onProgress?: (event: ProgressEvent) => void;
  /** Seq to start numbering from: the build's next free seq. */
  firstSeq?: number;
};

export type ApplyOutcome = { ok: true; made: CreatedItem[] } | { ok: false; made: CreatedItem[]; failedBox: string; failedKind: BoxKind; error: string };

const CHANNEL_TYPE: Record<ChannelKind, number> = { text: 0, voice: 2, announcement: 5, forum: 15 };
const SNOWFLAKE = /^\d{15,22}$/;
const BOT_SELF = overwriteInteger(["view_channel", "send_messages", "read_message_history", "embed_links"]);

function failText(f: DiscordFail): string {
  return f.code ? `${f.reason}:${f.code}` : f.reason;
}

function automodBody(rule: AutoModPlan): Record<string, unknown> {
  const base = { name: rule.name, event_type: 1, enabled: true, actions: [{ type: 1 }] };
  switch (rule.kind) {
    case "keywords":
      return { ...base, trigger_type: 1, trigger_metadata: { keyword_filter: rule.keywords } };
    case "spam":
      return { ...base, trigger_type: 3 };
    case "preset":
      return { ...base, trigger_type: 4, trigger_metadata: { presets: rule.presets.map((p) => ({ profanity: 1, sexual_content: 2, slurs: 3 })[p]) } };
    case "mentions":
      return { ...base, trigger_type: 5, trigger_metadata: { mention_total_limit: rule.limit } };
  }
}

export async function applyBlueprint(bp: Blueprint, ctx: ApplyContext): Promise<ApplyOutcome> {
  const made: CreatedItem[] = [];
  const roleIds = new Map<string, string>();
  const channelIds = new Map<string, string>();
  let seq = ctx.firstSeq ?? 1;

  const overwrites = (list: Overwrite[]) => {
    const out: { id: string; type: number; allow: string; deny: string }[] = list.map((o) => ({
      id: o.target === "everyone" ? ctx.guildId : roleIds.get(o.target)!,
      type: 0,
      allow: overwriteInteger(o.allow),
      deny: overwriteInteger(o.deny),
    }));
    // A channel hidden from @everyone hides it from the bot too, and then
    // the bot can neither post the welcome into it nor delete it on Undo.
    if (list.some((o) => o.target === "everyone" && (o.deny.includes("view_channel") || o.deny.includes("send_messages")))) {
      out.push({ id: ctx.botUserId, type: 1, allow: BOT_SELF, deny: "0" });
    }
    return out;
  };

  /** One request, recorded at once; false means stop. */
  async function step(kind: BoxKind, boxKey: string, path: string, body: unknown, extra: { channelId?: string; note?: string } = {}): Promise<string | null> {
    const res = await ctx.rest.request<{ id?: string }>("POST", path, body);
    const id = res.ok && typeof res.body?.id === "string" && SNOWFLAKE.test(res.body.id) ? res.body.id : null;
    if (!res.ok || !id) {
      const error = res.ok ? "no_id" : failText(res);
      ctx.onProgress?.({ type: "failed", box: boxKey, kind, error });
      throw Object.assign(new Error(error), { box: boxKey, kind });
    }
    const item: CreatedItem = { seq: seq++, kind, boxKey, discordId: id, channelId: extra.channelId ?? null, note: extra.note ?? null };
    if (!(await ctx.record(item))) {
      // Made but not recorded: an id nothing would ever undo. Taken back at
      // once, then the apply stops.
      await deleteOne(ctx.rest, ctx.guildId, item);
      ctx.onProgress?.({ type: "failed", box: boxKey, kind, error: "record_failed" });
      throw Object.assign(new Error("record_failed"), { box: boxKey, kind });
    }
    made.push(item);
    ctx.onProgress?.({ type: "made", box: boxKey, kind, note: item.note });
    return id;
  }

  try {
    for (const kind of APPLY_ORDER) {
      if (kind === "role") {
        for (const r of bp.roles) {
          const id = await step("role", r.key, `/guilds/${ctx.guildId}/roles`, {
            name: r.name,
            permissions: rolePermissionInteger(r.permissions, r.granted),
            color: r.colour ? parseInt(r.colour.slice(1), 16) : 0,
            hoist: r.hoist,
            mentionable: r.mentionable,
          });
          roleIds.set(r.key, id!);
        }
      } else if (kind === "category") {
        for (const c of bp.categories) {
          const id = await step("category", c.key, `/guilds/${ctx.guildId}/channels`, { name: c.name, type: 4, permission_overwrites: overwrites(c.overwrites) });
          channelIds.set(c.key, id!);
        }
      } else if (kind === "channel") {
        for (const c of bp.channels) {
          const needsCommunity = c.kind === "announcement" || c.kind === "forum";
          const type = needsCommunity && !ctx.community ? 0 : CHANNEL_TYPE[c.kind];
          const body: Record<string, unknown> = { name: c.name, type, permission_overwrites: overwrites(c.overwrites) };
          if (c.topic && type !== 2) body.topic = c.topic;
          if (c.category) body.parent_id = channelIds.get(c.category);
          const id = await step("channel", c.key, `/guilds/${ctx.guildId}/channels`, body, { note: type !== CHANNEL_TYPE[c.kind] ? "community_needed" : undefined });
          channelIds.set(c.key, id!);
        }
      } else if (kind === "message") {
        for (const m of bp.messages) {
          const channelId = channelIds.get(m.channel)!;
          // allowed_mentions empty: a welcome that says "@everyone" pings nobody.
          await step("message", messageBoxKey(m.key), `/channels/${channelId}/messages`, { content: m.text, allowed_mentions: { parse: [] } }, { channelId });
        }
      } else {
        for (const a of bp.automod) await step("automod", a.key, `/guilds/${ctx.guildId}/auto-moderation/rules`, automodBody(a));
      }
    }
    return { ok: true, made };
  } catch (err) {
    const e = err as Error & { box?: string; kind?: BoxKind };
    if (!e.box || !e.kind) throw err;
    return { ok: false, made, failedBox: e.box, failedKind: e.kind, error: e.message };
  }
}

/** The DELETE for one recorded item. */
export function deletePath(guildId: string, item: Pick<CreatedItem, "kind" | "discordId" | "channelId">): string {
  switch (item.kind) {
    case "role":
      return `/guilds/${guildId}/roles/${item.discordId}`;
    case "category":
    case "channel":
      return `/channels/${item.discordId}`;
    case "message":
      return `/channels/${item.channelId}/messages/${item.discordId}`;
    case "automod":
      return `/guilds/${guildId}/auto-moderation/rules/${item.discordId}`;
  }
}

async function deleteOne(rest: DiscordRest, guildId: string, item: CreatedItem): Promise<{ ok: boolean; error: string | null }> {
  if (!SNOWFLAKE.test(item.discordId) || (item.kind === "message" && !SNOWFLAKE.test(item.channelId ?? ""))) return { ok: false, error: "bad_record" };
  const res = await rest.request("DELETE", deletePath(guildId, item));
  if (res.ok || res.reason === "not_found") return { ok: true, error: null };
  return { ok: false, error: failText(res) };
}

export type UndoOutcome = { ok: true; deleted: number } | { ok: false; deleted: number; failedBox: string; error: string };

/**
 * Deletes the recorded items, newest first, marking each as it goes.
 * `items` is the record of ONE apply — see the header.
 */
export async function undoItems(
  items: readonly CreatedItem[],
  ctx: { rest: DiscordRest; guildId: string; markDeleted: (seq: number) => Promise<boolean>; onProgress?: (event: ProgressEvent) => void }
): Promise<UndoOutcome> {
  let deleted = 0;
  for (const item of [...items].sort((a, b) => b.seq - a.seq)) {
    const res = await deleteOne(ctx.rest, ctx.guildId, item);
    if (!res.ok || !(await ctx.markDeleted(item.seq))) {
      const error = res.error ?? "record_failed";
      ctx.onProgress?.({ type: "undo_failed", box: item.boxKey, kind: item.kind, error });
      return { ok: false, deleted, failedBox: item.boxKey, error };
    }
    deleted++;
    ctx.onProgress?.({ type: "deleted", box: item.boxKey, kind: item.kind });
  }
  return { ok: true, deleted };
}
