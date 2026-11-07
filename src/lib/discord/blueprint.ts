import {
  ROLE_ELEVATED,
  ROLE_SAFE,
  isElevatedPermission,
  isRefusedPermission,
  isSafePermission,
  type ElevatedPermission,
  type SafePermission,
} from "@/lib/discord/permissions";

/**
 * A DISCORD SERVER AS BOXES (the owner's Discord directive, 2026-11-05).
 *
 * The model writes a server plan — roles, categories, channels, the
 * welcome message, the rules, AutoMod — and THIS file decides whether it
 * is one. Read the way lib/automations/boxes.ts reads a row of boxes:
 * anything that is not exactly a plan is refused, never repaired, and
 * every count is capped, so what reaches Discord is bounded before the
 * first request.
 *
 * WHAT IS REFUSED BY NAME, not filtered out quietly:
 *   - Administrator and Ban Members anywhere in a role: `refused_permission`
 *     (lib/discord/permissions.ts, ROLE_REFUSED);
 *   - a permission outside ROLE_SAFE in a role's own list, or in an
 *     overwrite: `bad_role` / `bad_overwrite`;
 *   - more than MAX_ROLES roles, MAX_CHANNELS channels, MAX_CATEGORIES
 *     categories or MAX_AUTOMOD AutoMod rules: `too_many_*`;
 *   - a reference to a key that is not in the plan: `unknown_*`.
 *
 * TICKS ARE THE PERSON'S, NEVER THE MODEL'S. A role's `granted` list —
 * the elevated permissions it is really created with — is set only by a
 * press on the role's box (api/discord/plan, action "tick"). Reading a
 * model's answer passes `fromModel`, and `granted` is emptied whatever the
 * answer said; the model can only ASK (`ask`), and the box shows that as
 * an unticked line with what the permission lets a member do.
 *
 * Client-safe and pure. Held by scripts/tests/discord-bot.test.mjs.
 */

export const MAX_ROLES = 20;
export const MAX_CATEGORIES = 15;
export const MAX_CHANNELS = 50;
export const MAX_AUTOMOD = 4;
export const MAX_OVERWRITES = 10;
export const MAX_KEYWORDS = 50;
export const MAX_KEYWORD_CHARS = 60;
export const MAX_NAME_CHARS = 100;
export const MAX_TOPIC_CHARS = 1024;
/** Discord's own ceiling for one message's content. */
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TITLE_CHARS = 80;

export const CHANNEL_KINDS = ["text", "voice", "forum", "announcement"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const AUTOMOD_PRESETS = ["profanity", "sexual_content", "slurs"] as const;
export type AutoModPreset = (typeof AUTOMOD_PRESETS)[number];

export const MESSAGE_KEYS = ["welcome", "rules"] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];
/** A message's box key: its own namespace, so a channel keyed "welcome" is not a collision. */
export const messageBoxKey = (k: MessageKey): string => `msg-${k}`;
const RESERVED_KEYS = new Set(["everyone", ...MESSAGE_KEYS.map(messageBoxKey)]);

/** "everyone" is the server's @everyone role; anything else is a role key of this plan. */
export type Overwrite = { target: string; allow: SafePermission[]; deny: SafePermission[] };

export type RolePlan = {
  key: string;
  name: string;
  /** #RRGGBB, or null for Discord's default. */
  colour: string | null;
  hoist: boolean;
  mentionable: boolean;
  permissions: SafePermission[];
  /** Elevated permissions the plan suggests: shown unticked, never sent. */
  ask: ElevatedPermission[];
  /** Elevated permissions the PERSON ticked: the only ones sent. */
  granted: ElevatedPermission[];
};

export type CategoryPlan = { key: string; name: string; overwrites: Overwrite[] };

export type ChannelPlan = {
  key: string;
  name: string;
  kind: ChannelKind;
  /** A category key of this plan, or null for none. */
  category: string | null;
  topic: string | null;
  overwrites: Overwrite[];
};

export type MessagePlan = { key: MessageKey; channel: string; text: string };

export type AutoModPlan =
  | { key: string; kind: "keywords"; name: string; keywords: string[] }
  | { key: string; kind: "spam"; name: string }
  | { key: string; kind: "preset"; name: string; presets: AutoModPreset[] }
  | { key: string; kind: "mentions"; name: string; limit: number };

export type Blueprint = {
  title: string;
  roles: RolePlan[];
  categories: CategoryPlan[];
  channels: ChannelPlan[];
  messages: MessagePlan[];
  automod: AutoModPlan[];
};

export type BlueprintRefusal =
  | "not_object"
  | "too_many_roles"
  | "too_many_categories"
  | "too_many_channels"
  | "too_many_automod"
  | "bad_title"
  | "bad_role"
  | "bad_category"
  | "bad_channel"
  | "bad_overwrite"
  | "bad_message"
  | "bad_automod"
  | "refused_permission"
  | "duplicate_key"
  | "unknown_category"
  | "unknown_target"
  | "unknown_channel"
  | "empty";

export type BlueprintVerdict = { ok: true; blueprint: Blueprint } | { ok: false; reason: BlueprintRefusal; detail?: string };

const KEY = /^[a-z0-9][a-z0-9-]{0,31}$/;
const COLOUR = /^#[0-9a-fA-F]{6}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

class Refused extends Error {
  constructor(
    readonly reason: BlueprintRefusal,
    readonly detail?: string
  ) {
    super(reason);
  }
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown, max: number, reason: BlueprintRefusal, opts: { multiline?: boolean } = {}): string {
  if (typeof v !== "string") throw new Refused(reason, "not text");
  const value = v.trim();
  if (!value) throw new Refused(reason, "empty text");
  if (value.length > max) throw new Refused(reason, `longer than ${max}`);
  if (CONTROL.test(value) || (!opts.multiline && /[\r\n]/.test(value))) throw new Refused(reason, "control characters");
  return value;
}

function key(v: unknown, reason: BlueprintRefusal): string {
  if (typeof v !== "string" || !KEY.test(v)) throw new Refused(reason, "bad key");
  return v;
}

function list(v: unknown, reason: BlueprintRefusal): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Refused(reason, "not a list");
  return v;
}

/** A role's or overwrite's permission names: refused names first, then unknown ones. */
function safeNames(v: unknown, reason: BlueprintRefusal): SafePermission[] {
  const out: SafePermission[] = [];
  for (const name of list(v, reason)) {
    if (isRefusedPermission(name)) throw new Refused("refused_permission", String(name));
    if (!isSafePermission(name)) throw new Refused(reason, `not allowed: ${String(name)}`);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function elevatedNames(v: unknown): ElevatedPermission[] {
  const out: ElevatedPermission[] = [];
  for (const name of list(v, "bad_role")) {
    if (isRefusedPermission(name)) throw new Refused("refused_permission", String(name));
    if (!isElevatedPermission(name)) throw new Refused("bad_role", `not allowed: ${String(name)}`);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function readOverwrites(v: unknown): Overwrite[] {
  const raw = list(v, "bad_overwrite");
  if (raw.length > MAX_OVERWRITES) throw new Refused("bad_overwrite", `more than ${MAX_OVERWRITES}`);
  const out: Overwrite[] = [];
  for (const item of raw) {
    const o = obj(item);
    if (!o) throw new Refused("bad_overwrite", "not an object");
    const target = o.target === "everyone" ? "everyone" : key(o.target, "bad_overwrite");
    const allow = safeNames(o.allow, "bad_overwrite");
    const deny = safeNames(o.deny, "bad_overwrite");
    if (allow.some((p) => deny.includes(p))) throw new Refused("bad_overwrite", "allowed and denied at once");
    if (out.some((x) => x.target === target)) throw new Refused("bad_overwrite", "two overwrites for one target");
    out.push({ target, allow, deny });
  }
  return out;
}

function readRole(v: unknown, fromModel: boolean): RolePlan {
  const o = obj(v);
  if (!o) throw new Refused("bad_role", "not an object");
  const colour = o.colour === null || o.colour === undefined || o.colour === "" ? null : typeof o.colour === "string" && COLOUR.test(o.colour) ? o.colour.toUpperCase() : null;
  if (o.colour && colour === null) throw new Refused("bad_role", "bad colour");
  const permissions = safeNames(o.permissions, "bad_role");
  const ask = elevatedNames(o.ask);
  // The person's ticks, never the model's: see the header.
  const granted = fromModel ? [] : elevatedNames(o.granted);
  return {
    key: key(o.key, "bad_role"),
    name: text(o.name, MAX_NAME_CHARS, "bad_role"),
    colour,
    hoist: o.hoist === true,
    mentionable: o.mentionable === true,
    permissions,
    ask: ask.filter((p) => !granted.includes(p)),
    granted,
  };
}

function readCategory(v: unknown): CategoryPlan {
  const o = obj(v);
  if (!o) throw new Refused("bad_category", "not an object");
  return { key: key(o.key, "bad_category"), name: text(o.name, MAX_NAME_CHARS, "bad_category"), overwrites: readOverwrites(o.overwrites) };
}

function readChannel(v: unknown): ChannelPlan {
  const o = obj(v);
  if (!o) throw new Refused("bad_channel", "not an object");
  if (!(CHANNEL_KINDS as readonly unknown[]).includes(o.kind)) throw new Refused("bad_channel", "bad kind");
  const kind = o.kind as ChannelKind;
  const category = o.category === null || o.category === undefined || o.category === "" ? null : key(o.category, "bad_channel");
  const topic = kind === "voice" || o.topic === null || o.topic === undefined || o.topic === "" ? null : text(o.topic, MAX_TOPIC_CHARS, "bad_channel", { multiline: true });
  return { key: key(o.key, "bad_channel"), name: text(o.name, MAX_NAME_CHARS, "bad_channel"), kind, category, topic, overwrites: readOverwrites(o.overwrites) };
}

function readMessage(v: unknown): MessagePlan {
  const o = obj(v);
  if (!o) throw new Refused("bad_message", "not an object");
  if (!(MESSAGE_KEYS as readonly unknown[]).includes(o.key)) throw new Refused("bad_message", "bad key");
  return { key: o.key as MessageKey, channel: key(o.channel, "bad_message"), text: text(o.text, MAX_MESSAGE_CHARS, "bad_message", { multiline: true }) };
}

function readAutoMod(v: unknown): AutoModPlan {
  const o = obj(v);
  if (!o) throw new Refused("bad_automod", "not an object");
  const k = key(o.key, "bad_automod");
  const name = text(o.name, MAX_NAME_CHARS, "bad_automod");
  switch (o.kind) {
    case "keywords": {
      const raw = list(o.keywords, "bad_automod");
      if (raw.length === 0 || raw.length > MAX_KEYWORDS) throw new Refused("bad_automod", `1 to ${MAX_KEYWORDS} keywords`);
      const keywords = [...new Set(raw.map((w) => text(w, MAX_KEYWORD_CHARS, "bad_automod")))];
      return { key: k, kind: "keywords", name, keywords };
    }
    case "spam":
      return { key: k, kind: "spam", name };
    case "preset": {
      const presets = [...new Set(list(o.presets, "bad_automod"))];
      if (presets.length === 0 || !presets.every((p) => (AUTOMOD_PRESETS as readonly unknown[]).includes(p))) throw new Refused("bad_automod", "bad preset");
      return { key: k, kind: "preset", name, presets: presets as AutoModPreset[] };
    }
    case "mentions": {
      const limit = Number(o.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Refused("bad_automod", "limit 1 to 50");
      return { key: k, kind: "mentions", name, limit };
    }
    default:
      throw new Refused("bad_automod", "bad kind");
  }
}

/**
 * A whole plan, or the reason it is not one. `fromModel` empties every
 * role's `granted` (see the header); a stored plan keeps the ticks.
 */
export function readBlueprint(raw: unknown, opts: { fromModel?: boolean } = {}): BlueprintVerdict {
  try {
    const o = obj(raw);
    if (!o) throw new Refused("not_object");
    const roles = list(o.roles, "bad_role");
    const categories = list(o.categories, "bad_category");
    const channels = list(o.channels, "bad_channel");
    const automod = list(o.automod, "bad_automod");
    if (roles.length > MAX_ROLES) throw new Refused("too_many_roles", String(roles.length));
    if (categories.length > MAX_CATEGORIES) throw new Refused("too_many_categories", String(categories.length));
    if (channels.length > MAX_CHANNELS) throw new Refused("too_many_channels", String(channels.length));
    if (automod.length > MAX_AUTOMOD) throw new Refused("too_many_automod", String(automod.length));

    const bp: Blueprint = {
      title: text(o.title, MAX_TITLE_CHARS, "bad_title"),
      roles: roles.map((r) => readRole(r, opts.fromModel === true)),
      categories: categories.map(readCategory),
      channels: channels.map(readChannel),
      messages: list(o.messages, "bad_message").map(readMessage),
      automod: automod.map(readAutoMod),
    };
    if (bp.roles.length + bp.categories.length + bp.channels.length === 0) throw new Refused("empty");
    return { ok: true, blueprint: checkReferences(bp) };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason, detail: err.detail };
    throw err;
  }
}

/** Every key unique; every reference to a key of this plan; one message of each kind; one AutoMod rule of each kind. */
function checkReferences(bp: Blueprint): Blueprint {
  const keys = [...bp.roles, ...bp.categories, ...bp.channels, ...bp.automod].map((b) => b.key);
  if (new Set(keys).size !== keys.length || keys.some((k) => RESERVED_KEYS.has(k))) throw new Refused("duplicate_key");
  const roleKeys = new Set(bp.roles.map((r) => r.key));
  const categoryKeys = new Set(bp.categories.map((c) => c.key));
  const postable = new Set(bp.channels.filter((c) => c.kind === "text" || c.kind === "announcement").map((c) => c.key));
  for (const holder of [...bp.categories, ...bp.channels]) {
    for (const o of holder.overwrites) if (o.target !== "everyone" && !roleKeys.has(o.target)) throw new Refused("unknown_target", o.target);
  }
  for (const c of bp.channels) if (c.category !== null && !categoryKeys.has(c.category)) throw new Refused("unknown_category", c.category);
  const seen = new Set<string>();
  for (const m of bp.messages) {
    if (seen.has(m.key)) throw new Refused("bad_message", "two of one kind");
    seen.add(m.key);
    if (!postable.has(m.channel)) throw new Refused("unknown_channel", m.channel);
  }
  const kinds = bp.automod.map((a) => a.kind);
  if (new Set(kinds).size !== kinds.length) throw new Refused("bad_automod", "two rules of one kind");
  return bp;
}

// ---------------------------------------------------------------------------
// The boxes, in the order they are made
// ---------------------------------------------------------------------------

export type BoxKind = "role" | "category" | "channel" | "message" | "automod";
export type PlanBox = { key: string; kind: BoxKind };

/**
 * THE APPLY ORDER, and why it is this one: an overwrite names a role, so
 * roles come first; a channel names its category, so categories come
 * before channels; a message is posted INTO a channel, so channels come
 * before messages; AutoMod last, because it is the one step that needs
 * Manage Server and its failure should leave the structure standing.
 * Undo walks the recorded ids of this order backwards
 * (lib/discord/apply.ts).
 */
export const APPLY_ORDER: readonly BoxKind[] = ["role", "category", "channel", "message", "automod"];

export function planBoxes(bp: Blueprint): PlanBox[] {
  return [
    ...bp.roles.map((r) => ({ key: r.key, kind: "role" as const })),
    ...bp.categories.map((c) => ({ key: c.key, kind: "category" as const })),
    ...bp.channels.map((c) => ({ key: c.key, kind: "channel" as const })),
    ...bp.messages.map((m) => ({ key: messageBoxKey(m.key), kind: "message" as const })),
    ...bp.automod.map((a) => ({ key: a.key, kind: "automod" as const })),
  ];
}

export function boxKindOf(bp: Blueprint, k: string): BoxKind | null {
  return planBoxes(bp).find((b) => b.key === k)?.kind ?? null;
}

/**
 * ONE BOX CHANGED WITH WORDS: the box with `k` is taken from `next` and
 * put in its place in `current`; every other box stays exactly as it
 * was. A role keeps the person's own ticks. The result is read again as
 * a whole, because a changed box can name a key that is not there.
 */
export function replaceOneBox(current: Blueprint, next: Blueprint, k: string): BlueprintVerdict {
  const kind = boxKindOf(current, k);
  if (!kind || boxKindOf(next, k) !== kind) return { ok: false, reason: "unknown_target", detail: k };
  const out: Blueprint = structuredClone(current);
  if (kind === "role") {
    const old = current.roles.find((r) => r.key === k)!;
    const changed = next.roles.find((r) => r.key === k)!;
    out.roles = out.roles.map((r) => (r.key === k ? { ...changed, granted: old.granted, ask: changed.ask.filter((p) => !old.granted.includes(p)) } : r));
  } else if (kind === "category") out.categories = out.categories.map((c) => (c.key === k ? next.categories.find((x) => x.key === k)! : c));
  else if (kind === "channel") out.channels = out.channels.map((c) => (c.key === k ? next.channels.find((x) => x.key === k)! : c));
  else if (kind === "message") out.messages = out.messages.map((m) => (messageBoxKey(m.key) === k ? next.messages.find((x) => messageBoxKey(x.key) === k)! : m));
  else out.automod = out.automod.map((a) => (a.key === k ? next.automod.find((x) => x.key === k)! : a));
  return readBlueprint(out);
}

/** A whole plan changed with words: the new one, with each surviving role's ticks carried over. */
export function carryTicks(previous: Blueprint, next: Blueprint): Blueprint {
  const ticks = new Map(previous.roles.map((r) => [r.key, r.granted]));
  return {
    ...next,
    roles: next.roles.map((r) => {
      const granted = ticks.get(r.key) ?? [];
      return { ...r, granted, ask: r.ask.filter((p) => !granted.includes(p)) };
    }),
  };
}

/** A box deleted, with every reference to it: overwrites for a deleted role, a deleted category's channels left uncategorised, a deleted channel's messages. */
export function removeBox(bp: Blueprint, k: string): BlueprintVerdict {
  const out: Blueprint = structuredClone(bp);
  out.roles = out.roles.filter((r) => r.key !== k);
  out.categories = out.categories.filter((c) => c.key !== k);
  out.channels = out.channels.filter((c) => c.key !== k);
  out.messages = out.messages.filter((m) => messageBoxKey(m.key) !== k && m.channel !== k);
  out.automod = out.automod.filter((a) => a.key !== k);
  const strip = (ows: Overwrite[]) => ows.filter((o) => o.target !== k);
  out.categories = out.categories.map((c) => ({ ...c, overwrites: strip(c.overwrites) }));
  out.channels = out.channels.map((c) => ({ ...c, category: c.category === k ? null : c.category, overwrites: strip(c.overwrites) }));
  return readBlueprint(out);
}

/** One tick on a role's box, pressed by the person. Only elevated names; never a refused one. */
export function setTick(bp: Blueprint, roleKey: string, permission: unknown, on: boolean): BlueprintVerdict {
  if (isRefusedPermission(permission)) return { ok: false, reason: "refused_permission", detail: String(permission) };
  if (!isElevatedPermission(permission)) return { ok: false, reason: "bad_role", detail: "not tickable" };
  const role = bp.roles.find((r) => r.key === roleKey);
  if (!role) return { ok: false, reason: "unknown_target", detail: roleKey };
  const granted = on ? [...new Set([...role.granted, permission])] : role.granted.filter((p) => p !== permission);
  const ask = on ? role.ask.filter((p) => p !== permission) : [...new Set([...role.ask, permission])];
  return readBlueprint({ ...bp, roles: bp.roles.map((r) => (r.key === roleKey ? { ...r, granted, ask } : r)) });
}

/** How many Discord requests an apply makes, at most: one per box. */
export function requestCount(bp: Blueprint): number {
  return planBoxes(bp).length;
}

export { ROLE_SAFE, ROLE_ELEVATED };

// ---------------------------------------------------------------------------
// The planner's answer, read without a model
// ---------------------------------------------------------------------------

export type PlanAnswer = { ok: true; blueprint: Blueprint } | { ok: false; kind: "question"; question: string } | { ok: false; kind: "unusable"; detail: string };

/** The `set_server` tool's input (lib/discord/planner.ts): a plan, or one question. Ticks are never read from it. */
export function readPlanAnswer(input: Record<string, unknown> | null): PlanAnswer {
  if (!input) return { ok: false, kind: "unusable", detail: "no tool call" };
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (question) return { ok: false, kind: "question", question: question.slice(0, 300) };
  const verdict = readBlueprint(input.plan, { fromModel: true });
  if (!verdict.ok) return { ok: false, kind: "unusable", detail: verdict.detail ? `${verdict.reason}: ${verdict.detail}` : verdict.reason };
  return { ok: true, blueprint: verdict.blueprint };
}
