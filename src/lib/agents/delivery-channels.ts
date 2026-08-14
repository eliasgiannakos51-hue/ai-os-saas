// Where an agent's result is allowed to go, and how each destination is
// proved to belong to the person who asked for it.
//
// Client-safe on purpose (no `server-only`): the agent editor has to tell
// the user "that is not a Discord webhook address" while they are typing,
// and the API has to decide the same thing again with the same function,
// because a check in the browser is a convenience and never a boundary.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: an agent may only deliver to a
// destination the user themselves established. It runs unattended, forever,
// on data the user has not read yet — so a delivery target taken from a
// request body, or a webhook URL pointing at any host that will accept a
// POST, is not a configuration option. It is an exfiltration channel with a
// schedule attached.

export type DeliveryChannel = "email" | "slack" | "telegram" | "discord" | "in_app";

export const DELIVERY_CHANNELS: DeliveryChannel[] = ["email", "slack", "telegram", "discord", "in_app"];

export function isDeliveryChannel(value: unknown): value is DeliveryChannel {
  return typeof value === "string" && (DELIVERY_CHANNELS as string[]).includes(value);
}

/**
 * The channels whose credentials the user saves once and reuses.
 *
 * Slack is NOT one of them: it is an OAuth connection managed in
 * Integrations, and its "credential" is a grant we hold on the user's
 * behalf rather than a secret they paste.
 */
export const CREDENTIAL_CHANNELS = ["telegram", "discord"] as const;
export type CredentialChannel = (typeof CREDENTIAL_CHANNELS)[number];

export function isCredentialChannel(value: unknown): value is CredentialChannel {
  return typeof value === "string" && (CREDENTIAL_CHANNELS as readonly string[]).includes(value);
}

/**
 * What each destination can carry in one message.
 *
 * These are the platforms' own hard limits, and they matter because an
 * agent's output is routinely longer: a briefing that exceeds them is not
 * truncated by Telegram or Discord, it is REJECTED. Silently sending
 * nothing every morning is the failure this constant prevents — the
 * message is cut here, with a marker, so the user gets the beginning of
 * their result and can see there was more.
 */
export const CHANNEL_TEXT_LIMITS: Record<DeliveryChannel, number> = {
  // Resend's own ceiling is far above anything an agent produces, and the
  // agent output column is capped at 20000 anyway.
  email: 100_000,
  // Slack's chat.postMessage limit before it starts splitting.
  slack: 3_900,
  // Telegram's sendMessage limit is 4096 UTF-16 code units.
  telegram: 4_096,
  // Discord's webhook content limit is 2000.
  discord: 2_000,
  in_app: 10_000,
};

/** Cut to fit, and SAY it was cut. A result that silently stops mid-
 *  sentence reads as the agent having failed halfway. */
export function fitToChannel(text: string, channel: DeliveryChannel, suffix = "…"): string {
  const limit = CHANNEL_TEXT_LIMITS[channel];
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - suffix.length)) + suffix;
}

// ---------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------

/**
 * A bot token as BotFather issues it: a numeric bot id, a colon, then a
 * secret. Checked for SHAPE only — whether it works is Telegram's answer
 * to give, and the save path asks them (lib/agents/delivery-store.ts)
 * rather than storing something that will silently fail at 08:00.
 */
const TELEGRAM_TOKEN_RE = /^\d{5,20}:[A-Za-z0-9_-]{20,}$/;

export function isTelegramBotToken(value: unknown): boolean {
  return typeof value === "string" && TELEGRAM_TOKEN_RE.test(value.trim());
}

/**
 * A chat id: the numeric id of a private chat, group (negative) or
 * channel, or an @username for a public channel.
 *
 * ASCII-only, deliberately. Telegram usernames are ASCII, and accepting a
 * lookalike written in Cyrillic would let a target that LOOKS like the
 * user's own channel resolve to somebody else's — the same homoglyph
 * problem this codebase already handles in agent text.
 */
export function normaliseTelegramChat(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^-?\d{1,20}$/.test(trimmed)) return trimmed;
  const at = trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
  return /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(at) ? at : "";
}

export function isTelegramChat(value: unknown): boolean {
  return normaliseTelegramChat(value).length > 0;
}

// ---------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------

/**
 * The hosts a Discord webhook may live on. An allowlist, not a pattern.
 *
 * THIS IS THE SECURITY BOUNDARY OF THE WHOLE FEATURE. A "webhook URL" is
 * a free-text field that a scheduled, unattended job will POST the user's
 * own data to, forever. Without an allowlist it is a request forgery
 * primitive with the server's network position: `http://169.254.169.254/`
 * (cloud instance metadata), `http://localhost:54321/` (the database),
 * `http://10.0.0.5/` (anything else in the VPC). And even pointed
 * outward it is a standing exfiltration channel to a host of the
 * attacker's choosing.
 *
 * Matched against the parsed URL's hostname — never against the raw
 * string, because `https://discord.com@evil.example/` contains
 * "discord.com" and resolves to evil.example.
 */
const DISCORD_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "ptb.discord.com",
  "canary.discord.com",
]);

export function isDiscordWebhookUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  // https only: a webhook is a bearer credential in a path, and http would
  // put it on the wire in clear text.
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  if (!DISCORD_WEBHOOK_HOSTS.has(url.hostname.toLowerCase())) return false;
  // /api/webhooks/<id>/<token>, with an optional /vN version segment.
  return /^\/api(?:\/v\d{1,2})?\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,}$/.test(url.pathname);
}

/** What the user is shown of a saved secret. Never the secret: a webhook
 *  URL and a bot token are both bearer credentials, and a settings page
 *  that displays them turns one shoulder-glance into a standing grant. */
export function redactSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

// ---------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------

/**
 * Everything the server resolved from the DATABASE about where this user
 * is allowed to send. Never from the request body — that is the whole
 * point of the type.
 */
export type DeliveryOwnership = {
  accountEmail: string | null | undefined;
  /** Channel ids from the user's own connected Slack workspace. */
  allowedSlackChannels?: string[];
  /** Telegram chat id the user saved with their bot token, if any. */
  telegramChat?: string | null;
  /** Whether a Discord webhook has been saved for this user. */
  hasDiscordWebhook?: boolean;
};

export type DeliveryDecision = { ok: true; target: string } | { ok: false; message: string };

/**
 * The one question every write path asks: may this user's agent deliver
 * here, and what exactly gets stored as the target?
 *
 * ONE FUNCTION, because there are three write paths (create, edit, and the
 * builder's draft) and a channel that is checked in two of them is a
 * channel that is unchecked in the third.
 */
export function resolveDeliveryTarget(
  channel: DeliveryChannel,
  requestedTarget: unknown,
  ownership: DeliveryOwnership
): DeliveryDecision {
  switch (channel) {
    case "email": {
      const target = normaliseEmailTarget(
        typeof requestedTarget === "string" && requestedTarget.trim()
          ? requestedTarget
          : ownership.accountEmail
      );
      if (!target) return { ok: false, message: "Your account has no email address to send to." };
      if (!isEmailTargetAllowed(target, ownership.accountEmail)) {
        return { ok: false, message: "An agent can only send results to your own account email address." };
      }
      return { ok: true, target };
    }
    case "slack": {
      const channelId = normaliseSlackChannelId(typeof requestedTarget === "string" ? requestedTarget : "");
      if (!channelId) return { ok: false, message: "Choose a Slack channel to post to." };
      if (!isSlackChannelIdAllowed(channelId, ownership.allowedSlackChannels)) {
        return {
          ok: false,
          message: "An agent can only post to a channel in your own connected Slack workspace.",
        };
      }
      return { ok: true, target: channelId };
    }
    case "telegram": {
      const saved = normaliseTelegramChat(ownership.telegramChat ?? "");
      if (!saved) {
        return { ok: false, message: "Connect Telegram first — an agent needs your bot token and chat." };
      }
      // THE TARGET IS THE SAVED ONE, not the requested one. A requested
      // chat id that differs is refused rather than quietly corrected:
      // silently redirecting a delivery is how a user ends up believing
      // their results went somewhere they did not.
      const requested = normaliseTelegramChat(requestedTarget);
      if (requested && requested !== saved) {
        return {
          ok: false,
          message: "An agent can only message the Telegram chat you connected.",
        };
      }
      return { ok: true, target: saved };
    }
    case "discord": {
      if (!ownership.hasDiscordWebhook) {
        return { ok: false, message: "Add a Discord webhook first — an agent needs somewhere to post." };
      }
      // The target is a MARKER, never the URL. The webhook is a bearer
      // credential; putting it in user_agents.delivery_target would copy
      // it into every agent row, the GDPR export and the run history.
      return { ok: true, target: DISCORD_TARGET };
    }
    case "in_app": {
      // The destination is the user themselves. There is nothing to own
      // and nothing to check, which is what makes it the safe default for
      // somebody who does not want their results leaving the product.
      return { ok: true, target: IN_APP_TARGET };
    }
  }
}

/** Stored in delivery_target for the two channels whose real destination
 *  lives elsewhere. Constants rather than empty strings so a row is never
 *  ambiguous about whether it was configured. */
export const DISCORD_TARGET = "discord:webhook";
export const IN_APP_TARGET = "in_app:self";

// ---------------------------------------------------------------------
// Email and Slack, moved here UNCHANGED so that all five channels are
// decided in one file rather than two.
//
// Byte-for-byte the implementations that were in agent-config.ts, which
// now re-exports them. Rewriting them "better" while moving them would
// change who an existing agent is allowed to deliver to, in a diff that
// looks like a refactor.
// ---------------------------------------------------------------------

export function normaliseEmailTarget(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * An agent may only email the account's own address.
 *
 * EXACT comparison after lowercasing, and deliberately NOT a folded one.
 * Folding is the right tool for search, where matching more is the
 * feature; here it would make a lookalike address written with a Cyrillic
 * "а" compare EQUAL to the Latin account address — and since the stored
 * target is the string the caller supplied, the agent would then send
 * every result to the lookalike. Matching less is the safe direction when
 * the answer decides where somebody's data goes.
 */
export function isEmailTargetAllowed(target: string, accountEmail: string | null | undefined): boolean {
  const account = normaliseEmailTarget(accountEmail);
  if (!account) return false;
  return target.trim().toLowerCase() === account;
}

/**
 * A Slack channel id, normalised.
 *
 * Case-PRESERVING, unlike the email normaliser: Slack ids are
 * case-sensitive ("C01ABCDEF"), and lowercasing one produces an id that
 * silently addresses nothing. No format pattern either — the allow-list
 * from the user's own workspace is the authority on what a real id looks
 * like, and a regex guessing at Slack's id format would reject real
 * channels in workspaces that do not match the guess.
 */
export function normaliseSlackChannelId(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Is this channel one the caller's own connected workspace offers?
 *
 * An empty allow-list means no workspace is connected, which allows
 * NOTHING — the fail-closed direction.
 */
export function isSlackChannelIdAllowed(
  channelId: string,
  allowedChannels: string[] | null | undefined
): boolean {
  const target = normaliseSlackChannelId(channelId);
  if (!target) return false;
  if (!Array.isArray(allowedChannels) || allowedChannels.length === 0) return false;
  return allowedChannels.some((c) => normaliseSlackChannelId(c) === target);
}
