// What can be sold, and what a buyer actually receives.
//
// Five kinds, and the set is CLOSED. Each one names the table a seller
// exports FROM and the table a buyer's copy is installed INTO, because
// those are the two facts every path in this feature needs and deriving
// them from a string at each call site is how a listing ends up
// installing into the wrong table.
//
// WHAT IS SOLD IS A CONFIGURATION, NEVER A RESULT. An agent listing is
// the agent's prompt and schedule, not its past run outputs. A
// presentation listing is the deck's structure, not the seller's
// research findings or their sources. That line matters twice: the
// seller's own data must not leave with the listing, and the buyer must
// get something that runs on THEIR account rather than a snapshot of
// somebody else's.

export const LISTING_KINDS = [
  "website_template",
  "agent_config",
  "mission_template",
  "presentation_template",
  "automation",
] as const;

export type ListingKind = (typeof LISTING_KINDS)[number];

export function isListingKind(value: unknown): value is ListingKind {
  return typeof value === "string" && (LISTING_KINDS as readonly string[]).includes(value);
}

export type ListingKindSpec = {
  kind: ListingKind;
  /** Where a seller's own item is read from when they publish. */
  sourceTable: string;
  /** Where the buyer's copy is written on purchase. */
  installTable: string;
  /** i18n key under dashboard.marketplace.kinds.<labelKey>. */
  labelKey: string;
  /** Does the payload contain generated HTML that must go through the
   *  same static + AI security scan a published site does? Only the
   *  website template does, and saying so here rather than in an `if`
   *  at the publish route is what makes it impossible to add a
   *  sixth HTML-bearing kind without deciding this. */
  carriesHtml: boolean;
};

export const LISTING_KIND_SPECS: Record<ListingKind, ListingKindSpec> = {
  website_template: {
    kind: "website_template",
    sourceTable: "user_websites",
    installTable: "user_websites",
    labelKey: "websiteTemplate",
    carriesHtml: true,
  },
  agent_config: {
    kind: "agent_config",
    sourceTable: "user_agents",
    installTable: "user_agents",
    labelKey: "agentConfig",
    carriesHtml: false,
  },
  mission_template: {
    kind: "mission_template",
    sourceTable: "ai_missions",
    installTable: "ai_missions",
    labelKey: "missionTemplate",
    carriesHtml: false,
  },
  presentation_template: {
    kind: "presentation_template",
    sourceTable: "user_presentations",
    installTable: "user_presentations",
    labelKey: "presentationTemplate",
    carriesHtml: false,
  },
  automation: {
    kind: "automation",
    sourceTable: "user_automations",
    installTable: "user_automations",
    labelKey: "automation",
    carriesHtml: false,
  },
};

export function getListingKindSpec(kind: string): ListingKindSpec | undefined {
  return isListingKind(kind) ? LISTING_KIND_SPECS[kind] : undefined;
}

/** Bytes. A listing payload is a configuration, not an asset library —
 *  the largest legitimate one is a single-file generated site, which
 *  runs 20-60KB. The ceiling exists so a seller cannot park megabytes in
 *  a jsonb column the whole browse page has to skip over. */
export const MAX_PAYLOAD_BYTES = 512 * 1024;
