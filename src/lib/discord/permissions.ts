/**
 * DISCORD PERMISSIONS, BY NAME, AND THE ONE INTEGER THE BOT ASKS FOR
 * (the owner's Discord directive, 2026-11-05).
 *
 * Discord permissions are bits of a 53-bit-plus integer sent as a decimal
 * STRING (https://discord.com/developers/docs/topics/permissions). They
 * are computed here with BigInt, because the high bits do not survive a
 * JavaScript number, and the bits are named once so nothing in this tree
 * writes a magic number.
 *
 * THREE LISTS, AND THE REASON THERE ARE THREE:
 *
 *   BOT_PERMISSIONS     what the invite asks for. Explicit and minimal,
 *                       each with the feature that needs it. NEVER
 *                       Administrator: scripts/tests/discord-bot.test.mjs
 *                       computes the integer and requires bit 3 clear.
 *   ROLE_SAFE           what a role or a channel overwrite Ionexa creates
 *                       may carry without a tick. Discord lets a bot grant
 *                       only permissions it holds itself (the docs'
 *                       «Permission Hierarchy»), so this is a subset of
 *                       BOT_PERMISSIONS — a role asking for more would be
 *                       refused by Discord half-way through an apply.
 *   ROLE_ELEVATED       what a role may carry only when the person ticks
 *                       it on that role's box, each with one sentence
 *                       saying what it lets a member do.
 *
 * And two that are NEVER granted, whatever is ticked: Administrator and
 * Ban Members (ROLE_REFUSED). The bot does not hold either — by design,
 * for Administrator — so Discord would refuse the request anyway; the
 * screen says so instead of offering a tick that cannot work
 * (docs/DECISIONS.md, «Discord: Administrator και Ban Members»).
 *
 * Client-safe and pure: the screen draws the ticks from it, the routes
 * validate with it.
 */

const bit = (n: number): bigint => BigInt(1) << BigInt(n);

/** The bits this tree names. Numbers are Discord's own. */
export const PERMISSION_BITS = {
  ban_members: bit(2),
  administrator: bit(3),
  manage_channels: bit(4),
  manage_guild: bit(5),
  view_channel: bit(10),
  send_messages: bit(11),
  embed_links: bit(14),
  read_message_history: bit(16),
  manage_roles: bit(28),
  manage_webhooks: bit(29),
} as const;

export type PermissionName = keyof typeof PERMISSION_BITS;

/**
 * WHAT THE BOT ASKS FOR, AND WHY EACH ONE. A permission with no feature
 * behind it is not on this list; Manage Webhooks is named in the
 * directive as «only if a feature needs it», and none does — messages are
 * posted as the bot itself.
 */
export const BOT_PERMISSIONS: { name: PermissionName; why: string }[] = [
  { name: "manage_roles", why: "creates the plan's roles, and gives a role from an automation" },
  { name: "manage_channels", why: "creates the plan's categories and channels, and deletes them on Undo" },
  { name: "view_channel", why: "sees the channels it created, to post into them" },
  { name: "send_messages", why: "posts the welcome message, the rules, and an automation's message" },
  { name: "embed_links", why: "an answer to /ionexa ask can carry a link preview" },
  { name: "read_message_history", why: "lets a private channel's overwrite include it: Discord lets a bot grant only what it holds" },
  { name: "manage_guild", why: "AutoMod rules can only be created and deleted with Manage Server" },
];

export function permissionBits(names: readonly PermissionName[]): bigint {
  let out = BigInt(0);
  for (const name of names) out |= PERMISSION_BITS[name];
  return out;
}

/** The invite's `permissions` parameter, as Discord wants it: a decimal string. */
export function botPermissionInteger(): string {
  const bits = permissionBits(BOT_PERMISSIONS.map((p) => p.name));
  if ((bits & PERMISSION_BITS.administrator) !== BigInt(0)) throw new Error("the bot must never ask for Administrator");
  return bits.toString();
}

/** What a created role or overwrite may carry with no tick. */
export const ROLE_SAFE = ["view_channel", "send_messages", "embed_links", "read_message_history"] as const;
export type SafePermission = (typeof ROLE_SAFE)[number];

/** What a created role may carry only when the person ticks it on the box. */
export const ROLE_ELEVATED = ["manage_guild", "manage_channels", "manage_roles"] as const;
export type ElevatedPermission = (typeof ROLE_ELEVATED)[number];

/** Never granted to a created role, whatever is ticked. */
export const ROLE_REFUSED = ["administrator", "ban_members"] as const;
export type RefusedPermission = (typeof ROLE_REFUSED)[number];

export function isSafePermission(v: unknown): v is SafePermission {
  return typeof v === "string" && (ROLE_SAFE as readonly string[]).includes(v);
}
export function isElevatedPermission(v: unknown): v is ElevatedPermission {
  return typeof v === "string" && (ROLE_ELEVATED as readonly string[]).includes(v);
}
export function isRefusedPermission(v: unknown): v is RefusedPermission {
  return typeof v === "string" && (ROLE_REFUSED as readonly string[]).includes(v);
}

/**
 * The integer a created role is sent with. Elevated names count only when
 * they are in `granted` — the person's own ticks — and a refused bit in
 * the result throws rather than being sent: the last line before Discord.
 */
export function rolePermissionInteger(safe: readonly SafePermission[], granted: readonly ElevatedPermission[]): string {
  const names: PermissionName[] = [...safe.filter(isSafePermission), ...granted.filter(isElevatedPermission)];
  const bits = permissionBits(names);
  for (const refused of ROLE_REFUSED) {
    if ((bits & PERMISSION_BITS[refused]) !== BigInt(0)) throw new Error(`a created role must never carry ${refused}`);
  }
  return bits.toString();
}

/** An overwrite's allow or deny: safe names only. */
export function overwriteInteger(names: readonly SafePermission[]): string {
  return permissionBits(names.filter(isSafePermission)).toString();
}

/** Does a member's permission string (an interaction's `member.permissions`) include this bit? */
export function hasPermission(raw: unknown, name: PermissionName): boolean {
  if (typeof raw !== "string" || !/^\d{1,30}$/.test(raw)) return false;
  return (BigInt(raw) & PERMISSION_BITS[name]) !== BigInt(0);
}
