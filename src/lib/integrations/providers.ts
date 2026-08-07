// The provider registry.
//
// Client-safe on purpose: the /dashboard/integrations page renders one
// card per provider, and the consent screen has to state — before the user
// clicks Connect — exactly what the AI will be able to read. That list is
// the same list the OAuth scopes request, so it lives next to them rather
// than being written twice and drifting.
//
// NOTHING SECRET IS IN THIS FILE. Client ids and secrets are read from the
// environment inside lib/integrations/oauth.ts, which is `server-only`.

export type ProviderId = "gmail" | "google_drive" | "slack";

export type IntegrationAccess = "read" | "read_write";

export type ProviderMeta = {
  id: ProviderId;
  /** Brand name, not translated — "Gmail" is "Gmail" in every locale. */
  name: string;
  /** i18n key under dashboard.integrations.providers.<key>. */
  key: string;
  access: IntegrationAccess;
  /** OAuth scopes requested. Shown verbatim on the consent screen: a user
   *  who wants to check what we asked for should not have to trust a
   *  paraphrase. */
  scopes: string[];
  /** Which environment variables this provider needs to be usable. */
  requiredEnv: string[];
  /**
   * The Google providers share ONE OAuth client. Kept explicit so the
   * setup instructions can say "one app, two scope sets" rather than
   * having someone create two Google projects.
   */
  oauthFamily: "google" | "slack";
};

// Gmail and Drive are deliberately SEPARATE integrations even though they
// share a Google OAuth client.
//
// Data minimisation is the reason: a user who wants the AI to see their
// files should not have to hand over their mail to get it. One combined
// "Google" connection would make the broadest scope the price of the
// narrowest feature, and would make "disconnect Gmail" impossible to
// express. Two rows, two consent screens, two revocations.
export const PROVIDERS: ProviderMeta[] = [
  {
    id: "gmail",
    name: "Gmail",
    key: "gmail",
    access: "read",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    oauthFamily: "google",
  },
  {
    id: "google_drive",
    name: "Google Drive",
    key: "googleDrive",
    access: "read",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    oauthFamily: "google",
  },
  {
    id: "slack",
    name: "Slack",
    // The only read_write provider, because it is the one an agent
    // delivers INTO. Everything else is deliberately read-only: the AI
    // reading your mail is a feature, the AI sending mail as you is a
    // different product with a different risk profile.
    access: "read_write",
    key: "slack",
    scopes: ["channels:read", "channels:history", "chat:write", "users:read"],
    requiredEnv: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    oauthFamily: "slack",
  },
];

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDERS.some((p) => p.id === value);
}

/** Providers an agent can deliver to. */
export const DELIVERY_PROVIDERS: ProviderId[] = ["slack"];

export type IntegrationStatus = "connected" | "expired" | "revoked" | "error";

/** The row shape, minus every secret — this is what reaches the client. */
export type IntegrationSummary = {
  id: string;
  provider: ProviderId;
  status: IntegrationStatus;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
  /** Non-sensitive display metadata: the connected account's email or the
   *  Slack workspace name. Never a token, never an internal id we would
   *  not show the user. */
  account_label: string | null;
};
