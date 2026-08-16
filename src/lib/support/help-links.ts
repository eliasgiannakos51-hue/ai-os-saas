// Where each help article sends the reader to DO the thing.
//
// NOT IN THE DATABASE, and that is deliberate. A route is code: it is
// identical in every language, it changes when the app changes, and storing
// it once per (slug, locale) row would give it a hundred-odd chances to
// drift out of step with the app. Here there is exactly one, and
// scripts/tests/help-links.test.mjs walks src/app to prove every value
// below resolves to a page that exists — which no database column can do.
//
// The precedent is not hypothetical: the old knowledge base pointed the
// privacy answer at /legal/privacy, a path this app has never had. It was
// invisible while nothing rendered the links, and became a 404 a real
// person could click the moment the Help Centre started rendering them.

/**
 * slug -> route, or null for an article that has nowhere to send anyone.
 *
 * Every slug in content/help/manifest.json must appear here; the test fails
 * on a slug that is missing as loudly as on one that points nowhere.
 */
export const HELP_LINKS: Record<string, string | null> = {
  // getting started
  "what-is-ionexa": null,
  languages: "/dashboard/settings",
  "mobile-app": null,

  // billing
  "pricing-overview": "/pricing",
  "change-plan": "/dashboard/settings",
  cancel: "/dashboard/settings",
  invoices: "/dashboard/settings",
  refund: "/dashboard/settings",

  // credits
  "what-are-credits": "/pricing",
  "credit-cost-per-action": "/dashboard/settings",
  "credits-ran-out": "/dashboard/settings",
  "credits-rollover": null,

  // websites
  "create-website": "/dashboard/website-builder",
  "publish-website": "/dashboard/website-builder",

  // agents & missions
  "create-agent": "/dashboard/agents",
  "create-mission": "/dashboard/mission",

  // chat, files, integrations
  "chat-memory": "/dashboard/memory",
  "upload-files": "/dashboard/files",
  "connect-gmail": "/dashboard/integrations",

  // account
  "password-reset": "/login",
  "invite-code": "/dashboard/settings",
  "team-members": "/pricing",
  notifications: "/dashboard/settings",
  "contact-support": "/dashboard/settings",

  // privacy
  "data-privacy": "/privacy",
  "export-data": "/dashboard/settings",
  "delete-account": "/dashboard/settings",
};

export function helpLink(slug: string): string | null {
  return HELP_LINKS[slug] ?? null;
}
