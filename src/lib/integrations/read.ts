import "server-only";
import { logApiError } from "@/lib/log-error";
import { getUsableAccessToken, recordSync } from "@/lib/integrations/store";
import type { ProviderId } from "@/lib/integrations/providers";

// Reading the user's real data.
//
// THE RULE THAT SHAPES EVERY FUNCTION HERE: what comes back is CONTENT
// OTHER PEOPLE WROTE. An email subject is a string an arbitrary stranger
// chose and sent to this user. A shared Drive file's name is chosen by
// whoever shared it. A Slack message is written by a colleague — or by
// anyone who can post into a channel the bot is in.
//
// So none of it is ever handed to a model as instructions. Every result
// leaves this module as DATA inside an explicit untrusted fence
// (lib/agents/agent-config.ts's wrapUntrusted), and the callers say so in
// their system prompts. This is the same boundary the agent runner draws
// around web-search results, for the same reason and with the same
// markers.
//
// DATA MINIMISATION, second rule: these functions ask the provider for the
// least that answers the question. Gmail is read with format=metadata plus
// the snippet Google already computes — not the full body — so a question
// about "emails from the accountant" never pulls the attachments, and a
// bug in this app cannot leak what it never fetched.

/** Hard ceiling per call, whatever the model asks for. */
export const MAX_RESULTS = 10;
/** Characters of any single field passed on to a model. */
const MAX_FIELD_CHARS = 500;
/** Characters of a file's extracted text. */
const MAX_FILE_CHARS = 6000;

export type IntegrationItem = {
  /** Where it came from, so a citation can name it. */
  source: ProviderId;
  title: string;
  /** Sender, owner, or channel — whatever identifies the origin. */
  from?: string;
  date?: string;
  /** A short excerpt. Never a full body. */
  snippet?: string;
  /** A link the user can open to see the real thing themselves. */
  link?: string;
};

export type ReadResult =
  | { ok: true; items: IntegrationItem[] }
  | { ok: false; reason: string };

function clip(value: unknown, max = MAX_FIELD_CHARS): string {
  const text = typeof value === "string" ? value : "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Shared authenticated GET. Never returns a provider error body — those
 *  echo the request, and the request carried a bearer token. */
async function apiGet(
  url: string,
  accessToken: string
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, reason: response.status === 401 ? "unauthorised" : `http_${response.status}` };
    }
    return { ok: true, json: (await response.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

// ---------------------------------------------------------------------
// Gmail (read-only).
// ---------------------------------------------------------------------

async function readGmail(accessToken: string, query: string, limit: number): Promise<ReadResult> {
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(limit));
  // Never touches Spam or Trash: a question about "my emails" does not
  // mean the quarantine folder, and spam is the single most likely place
  // for a message engineered to talk to an AI.
  listUrl.searchParams.set("q", `${query} -in:spam -in:trash`.trim());

  const list = await apiGet(listUrl.toString(), accessToken);
  if (!list.ok) return list;

  const ids = Array.isArray(list.json.messages)
    ? (list.json.messages as Array<{ id?: string }>).map((m) => m.id).filter(Boolean).slice(0, limit)
    : [];
  if (ids.length === 0) return { ok: true, items: [] };

  // format=metadata is the data-minimisation choice: it returns the
  // headers named below plus Google's own snippet, and NOT the body, the
  // attachments or the thread.
  const items = await Promise.all(
    ids.map(async (id): Promise<IntegrationItem | null> => {
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
      url.searchParams.set("format", "metadata");
      for (const header of ["From", "Subject", "Date"]) {
        url.searchParams.append("metadataHeaders", header);
      }
      const message = await apiGet(url.toString(), accessToken);
      if (!message.ok) return null;

      const payload = (message.json.payload ?? {}) as { headers?: Array<{ name?: string; value?: string }> };
      const header = (name: string) =>
        payload.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      return {
        source: "gmail" as const,
        title: clip(header("Subject")) || "(no subject)",
        from: clip(header("From"), 120),
        date: clip(header("Date"), 60),
        snippet: clip(message.json.snippet),
        link: `https://mail.google.com/mail/u/0/#inbox/${id}`,
      };
    })
  );

  return { ok: true, items: items.filter((i): i is IntegrationItem => i !== null) };
}

// ---------------------------------------------------------------------
// Google Drive (read-only).
// ---------------------------------------------------------------------

async function readDrive(accessToken: string, query: string, limit: number): Promise<ReadResult> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  // The escaping matters: a file name containing an apostrophe would
  // otherwise terminate the query string and change its meaning — a query
  // injection into Drive's own search syntax.
  const safe = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  url.searchParams.set("q", `fullText contains '${safe}' and trashed = false`);
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))");
  url.searchParams.set("orderBy", "modifiedTime desc");

  const result = await apiGet(url.toString(), accessToken);
  if (!result.ok) return result;

  const files = Array.isArray(result.json.files) ? (result.json.files as Record<string, unknown>[]) : [];
  return {
    ok: true,
    items: files.slice(0, limit).map((file) => {
      const owners = Array.isArray(file.owners) ? (file.owners as Array<{ displayName?: string }>) : [];
      return {
        source: "google_drive" as const,
        title: clip(file.name) || "(untitled)",
        from: clip(owners[0]?.displayName, 120),
        date: clip(file.modifiedTime, 60),
        snippet: clip(file.mimeType, 80),
        link: typeof file.webViewLink === "string" ? file.webViewLink : undefined,
      };
    }),
  };
}

/**
 * The text of ONE Drive file, for when the user wants the AI to actually
 * read a document rather than just find it.
 *
 * Deliberately a separate, explicit call rather than something the search
 * does automatically: fetching every matching document's contents to
 * answer "which files mention X" would read far more than the question
 * needs, every time.
 */
export async function readDriveFileText(
  userId: string,
  fileId: string
): Promise<{ ok: true; name: string; text: string } | { ok: false; reason: string }> {
  const token = await getUsableAccessToken(userId, "google_drive");
  if (!token.ok) return { ok: false, reason: token.reason };

  const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metaUrl.searchParams.set("fields", "id,name,mimeType");
  const meta = await apiGet(metaUrl.toString(), token.accessToken);
  if (!meta.ok) return meta;

  const mimeType = String(meta.json.mimeType ?? "");
  const name = clip(meta.json.name, 200) || "(untitled)";

  // Google-native formats must be EXPORTED; everything else is downloaded.
  // Only text-shaped types are read at all — a request to "read" a 40 MB
  // video would otherwise stream 40 MB into a string.
  const exportable = mimeType.startsWith("application/vnd.google-apps.");
  const plainReadable = /^(text\/|application\/json|application\/xml)/.test(mimeType);
  if (!exportable && !plainReadable) {
    return { ok: false, reason: "unsupported_type" };
  }

  const contentUrl = exportable
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  try {
    const response = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const text = (await response.text()).slice(0, MAX_FILE_CHARS);
    await recordSync({
      integrationId: token.integrationId,
      userId,
      itemsSynced: 1,
      source: "chat",
    });
    return { ok: true, name, text };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

// ---------------------------------------------------------------------
// Slack.
// ---------------------------------------------------------------------

async function readSlack(accessToken: string, query: string, limit: number): Promise<ReadResult> {
  // search.messages needs a USER token and a paid workspace. A bot token
  // can list the channels it has been invited to and read their recent
  // history, which is both what the bot scopes actually grant and the
  // narrower read — so that is what this does, filtering client-side.
  const channels = await apiGet(
    "https://slack.com/api/conversations.list?limit=100&exclude_archived=true&types=public_channel",
    accessToken
  );
  if (!channels.ok) return channels;
  if (channels.json.ok === false) {
    return { ok: false, reason: String(channels.json.error ?? "slack_error") };
  }

  const list = Array.isArray(channels.json.channels)
    ? (channels.json.channels as Array<{ id?: string; name?: string; is_member?: boolean }>)
    : [];
  // Only channels the bot was actually invited to. Listing a channel is
  // not permission to read it, and Slack will refuse anyway — asking
  // regardless would just produce a wall of errors.
  const joined = list.filter((c) => c.is_member && c.id).slice(0, 10);

  const needle = query.trim().toLowerCase();
  const items: IntegrationItem[] = [];

  for (const channel of joined) {
    if (items.length >= limit) break;
    const history = await apiGet(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel.id!)}&limit=30`,
      accessToken
    );
    if (!history.ok || history.json.ok === false) continue;

    const messages = Array.isArray(history.json.messages)
      ? (history.json.messages as Array<{ text?: string; user?: string; ts?: string }>)
      : [];
    for (const message of messages) {
      if (items.length >= limit) break;
      const text = message.text ?? "";
      if (needle && !text.toLowerCase().includes(needle)) continue;
      items.push({
        source: "slack",
        title: `#${channel.name ?? "channel"}`,
        from: message.user ? `<@${message.user}>` : undefined,
        date: message.ts ? new Date(Number(message.ts) * 1000).toISOString() : undefined,
        snippet: clip(text),
      });
    }
  }

  return { ok: true, items };
}

/** Posts an agent's result into a Slack channel. The ONLY write this
 *  feature performs against any provider. */
export async function postToSlack(params: {
  userId: string;
  channel: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = await getUsableAccessToken(params.userId, "slack");
  if (!token.ok) return { ok: false, reason: token.reason };

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: params.channel,
        // mrkdwn:false — the agent's output is prose that may contain
        // characters Slack would interpret as formatting, and worse, a
        // <http://...|link> that renders as innocent text. Posting it as
        // plain text means what the user reads is what the agent wrote.
        text: params.text.slice(0, 3500),
        mrkdwn: false,
        unfurl_links: false,
        unfurl_media: false,
      }),
      cache: "no-store",
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok || json.ok === false) {
      return { ok: false, reason: String(json.error ?? `http_${response.status}`) };
    }
    await recordSync({
      integrationId: token.integrationId,
      userId: params.userId,
      itemsSynced: 1,
      source: "agent",
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

/** The channels an agent can be pointed at — the ones the bot is in. */
export async function listSlackChannels(
  userId: string
): Promise<{ ok: true; channels: { id: string; name: string }[] } | { ok: false; reason: string }> {
  const token = await getUsableAccessToken(userId, "slack");
  if (!token.ok) return { ok: false, reason: token.reason };

  const result = await apiGet(
    "https://slack.com/api/conversations.list?limit=200&exclude_archived=true&types=public_channel",
    token.accessToken
  );
  if (!result.ok) return result;
  if (result.json.ok === false) return { ok: false, reason: String(result.json.error ?? "slack_error") };

  const list = Array.isArray(result.json.channels)
    ? (result.json.channels as Array<{ id?: string; name?: string; is_member?: boolean }>)
    : [];
  return {
    ok: true,
    channels: list
      .filter((c) => c.is_member && c.id && c.name)
      .map((c) => ({ id: c.id!, name: c.name! }))
      .slice(0, 200),
  };
}

// ---------------------------------------------------------------------
// The one entry point everything above the integration layer uses.
// ---------------------------------------------------------------------

export type SearchSource = "email" | "files" | "slack";

const SOURCE_TO_PROVIDER: Record<SearchSource, ProviderId> = {
  email: "gmail",
  files: "google_drive",
  slack: "slack",
};

export async function searchUserData(params: {
  userId: string;
  source: SearchSource;
  query: string;
  limit?: number;
  /** What caused the read, for the user-visible audit trail. */
  trigger: "chat" | "agent" | "life_context" | "manual";
}): Promise<ReadResult> {
  const provider = SOURCE_TO_PROVIDER[params.source];
  if (!provider) return { ok: false, reason: "unknown_source" };

  const limit = Math.min(MAX_RESULTS, Math.max(1, Math.floor(params.limit ?? 5)));
  const token = await getUsableAccessToken(params.userId, provider);
  if (!token.ok) return { ok: false, reason: token.reason };

  const query = String(params.query ?? "").slice(0, 200);

  let result: ReadResult;
  try {
    if (provider === "gmail") result = await readGmail(token.accessToken, query, limit);
    else if (provider === "google_drive") result = await readDrive(token.accessToken, query, limit);
    else result = await readSlack(token.accessToken, query, limit);
  } catch (err) {
    // The provider payload never reaches the log — only the fact of a
    // failure and which provider it was.
    logApiError("integrations:search", err, { provider, source: params.source });
    result = { ok: false, reason: "provider_error" };
  }

  await recordSync({
    integrationId: token.integrationId,
    userId: params.userId,
    itemsSynced: result.ok ? result.items.length : 0,
    source: params.trigger,
    status: result.ok ? "success" : "failed",
    error: result.ok ? null : result.reason,
  });

  return result;
}

/**
 * Renders results for a model.
 *
 * Returns a plain, bounded, clearly-labelled block. The CALLER is
 * responsible for wrapping it in the untrusted-content fence — that is not
 * done here so it is impossible to forget that this text is untrusted by
 * having it look already-safe.
 */
export function formatItemsForModel(items: IntegrationItem[]): string {
  if (items.length === 0) return "No matching items were found.";
  return items
    .map((item, index) => {
      const lines = [`[${index + 1}] ${item.title}`];
      if (item.from) lines.push(`from: ${item.from}`);
      if (item.date) lines.push(`date: ${item.date}`);
      if (item.snippet) lines.push(`excerpt: ${item.snippet}`);
      if (item.link) lines.push(`link: ${item.link}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * The connected account's own label — the Gmail address, the Drive
 * account's address, the Slack workspace name.
 *
 * Fetched with the scopes we ALREADY have rather than by asking for
 * `userinfo.email`: gmail.readonly can read the mailbox's own address via
 * users.getProfile, and drive.readonly can read it via about?fields=user.
 * Requesting an extra identity scope just to put a label on a card would
 * be asking for more than the feature needs, which is the opposite of what
 * this whole module is built around.
 *
 * Best-effort: a card that says "Connected" without naming the account is
 * a smaller problem than a connection that fails because a cosmetic call
 * did.
 */
export async function fetchAccountLabel(
  provider: ProviderId,
  accessToken: string
): Promise<string | null> {
  try {
    if (provider === "gmail") {
      const result = await apiGet(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        accessToken
      );
      if (!result.ok) return null;
      return typeof result.json.emailAddress === "string" ? result.json.emailAddress : null;
    }
    if (provider === "google_drive") {
      const result = await apiGet(
        "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
        accessToken
      );
      if (!result.ok) return null;
      const user = (result.json.user ?? {}) as { emailAddress?: string };
      return typeof user.emailAddress === "string" ? user.emailAddress : null;
    }
    // Slack's workspace name already arrived in the token response and is
    // stored as metadata.team_name, so there is nothing extra to fetch.
    return null;
  } catch {
    return null;
  }
}
