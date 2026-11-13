import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBlueprint, type Blueprint } from "@/lib/discord/blueprint";
import type { CreatedItem } from "@/lib/discord/apply";

/**
 * EVERY READ AND WRITE OF THE THREE DISCORD TABLES
 * (supabase/migrations/20261119000000_discord_bot.sql). They have no
 * policy, so they are reached only through the service role, and EVERY
 * function here takes the session's user id and filters by it — a route
 * cannot ask for another account's plan by naming its id.
 */

export type GuildRow = { guild_id: string; guild_name: string | null; connected_at: string };
export type BuildStatus = "planned" | "applying" | "applied" | "failed" | "undoing" | "undone";
export type BuildRow = { id: string; guild_id: string; said: string; blueprint: Blueprint; version: number; status: BuildStatus; updated_at: string };
export type ItemRow = CreatedItem & { deletedAt: string | null };

/** An apply or undo that has not moved for this long died with its function (api/discord/apply's maxDuration is 300s). */
const STALE_MS = 6 * 60 * 1000;

export async function listGuilds(userId: string): Promise<GuildRow[]> {
  const { data, error } = await createAdminClient().from("discord_guilds").select("guild_id, guild_name, connected_at").eq("user_id", userId).order("connected_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GuildRow[];
}

/** Whose account a server belongs to: the slash command's one question. */
export async function guildOwner(guildId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("discord_guilds").select("user_id").eq("guild_id", guildId).maybeSingle();
  if (error) throw error;
  return (data?.user_id as string | undefined) ?? null;
}

/** Links a server the bot has confirmed. A server already linked to ANOTHER account is refused, not taken over. */
export async function linkGuild(userId: string, guildId: string, guildName: string | null): Promise<"linked" | "taken" | "failed"> {
  const admin = createAdminClient();
  const name = guildName?.slice(0, 100) ?? null;
  // An insert, never an upsert: the primary key refuses a second account
  // in the database, so two connects racing cannot both win.
  const { error } = await admin.from("discord_guilds").insert({ guild_id: guildId, user_id: userId, guild_name: name });
  if (!error) return "linked";
  if (error.code !== "23505") return "failed";
  const { data, error: again } = await admin.from("discord_guilds").update({ guild_name: name }).eq("guild_id", guildId).eq("user_id", userId).select("guild_id");
  if (again) return "failed";
  return (data ?? []).length === 1 ? "linked" : "taken";
}

export async function unlinkGuild(userId: string, guildId: string): Promise<boolean> {
  const { error, count } = await createAdminClient().from("discord_guilds").delete({ count: "exact" }).eq("user_id", userId).eq("guild_id", guildId);
  return !error && (count ?? 0) > 0;
}

export async function ownsGuild(userId: string, guildId: string): Promise<boolean> {
  return (await guildOwner(guildId)) === userId;
}

function readRow(row: Record<string, unknown> | null): BuildRow | null {
  if (!row) return null;
  const bp = readBlueprint(row.blueprint);
  if (!bp.ok) return null;
  let status = row.status as BuildStatus;
  if ((status === "applying" || status === "undoing") && Date.now() - Date.parse(String(row.updated_at)) > STALE_MS) status = "failed";
  return { id: String(row.id), guild_id: String(row.guild_id), said: String(row.said), blueprint: bp.blueprint, version: Number(row.version), status, updated_at: String(row.updated_at) };
}

/** The fields the screen draws of a plan (lib/discord/screen.ts, api/discord/plan). */
export function screenBuild(row: BuildRow) {
  return { id: row.id, guildId: row.guild_id, said: row.said, blueprint: row.blueprint, version: row.version, status: row.status };
}

const BUILD_COLUMNS = "id, guild_id, said, blueprint, version, status, updated_at";

export async function loadBuild(userId: string, id: string): Promise<BuildRow | null> {
  const { data, error } = await createAdminClient().from("discord_builds").select(BUILD_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return readRow(data);
}

export async function latestBuild(userId: string): Promise<BuildRow | null> {
  const { data, error } = await createAdminClient().from("discord_builds").select(BUILD_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return readRow(data);
}

export async function createBuild(userId: string, guildId: string, said: string, blueprint: Blueprint): Promise<string | null> {
  const { data, error } = await createAdminClient().from("discord_builds").insert({ user_id: userId, guild_id: guildId, said: said.slice(0, 2000), blueprint }).select("id").single();
  return error ? null : String(data.id);
}

/** A changed plan, only while it is still a plan and only over the version the change was made from. */
export async function saveBlueprint(userId: string, id: string, fromVersion: number, blueprint: Blueprint): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("discord_builds")
    .update({ blueprint, version: fromVersion + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("version", fromVersion)
    .eq("status", "planned")
    .select("id");
  return !error && (data ?? []).length === 1;
}

/** Compare-and-swap on status: two presses of one button start one apply. */
export async function moveBuild(userId: string, id: string, from: BuildStatus[], to: BuildStatus): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("discord_builds")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", from)
    .select("id");
  return !error && (data ?? []).length === 1;
}

export async function setBuildStatus(userId: string, id: string, to: BuildStatus): Promise<void> {
  await createAdminClient().from("discord_builds").update({ status: to, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
}

export async function recordItem(userId: string, buildId: string, item: CreatedItem): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("discord_build_items").insert({
    build_id: buildId,
    seq: item.seq,
    user_id: userId,
    kind: item.kind,
    box_key: item.boxKey,
    discord_id: item.discordId,
    channel_id: item.channelId,
    note: item.note,
  });
  if (error) return false;
  // Keeps the build fresh while it runs, so a live apply is never read as stale.
  await admin.from("discord_builds").update({ updated_at: new Date().toISOString() }).eq("id", buildId).eq("user_id", userId);
  return true;
}

export async function listItems(userId: string, buildId: string): Promise<ItemRow[]> {
  const { data, error } = await createAdminClient()
    .from("discord_build_items")
    .select("seq, kind, box_key, discord_id, channel_id, note, deleted_at")
    .eq("build_id", buildId)
    .eq("user_id", userId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    seq: Number(r.seq),
    kind: r.kind as CreatedItem["kind"],
    boxKey: String(r.box_key),
    discordId: String(r.discord_id),
    channelId: (r.channel_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    deletedAt: (r.deleted_at as string | null) ?? null,
  }));
}

export async function markItemDeleted(userId: string, buildId: string, seq: number): Promise<boolean> {
  const { error } = await createAdminClient().from("discord_build_items").update({ deleted_at: new Date().toISOString() }).eq("build_id", buildId).eq("user_id", userId).eq("seq", seq);
  return !error;
}
