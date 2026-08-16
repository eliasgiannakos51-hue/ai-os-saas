import type { PlanSlug } from "@/lib/billing/plans";

export type FieldType = "text" | "textarea" | "number" | "select";

/**
 * A MESSAGE KEY. Never display text.
 *
 * This file used to hold `label: "Company"`, `title: "Sales"` and ninety
 * more like them, rendered straight through `{field.label}` and
 * `title={module.title}`. Every scanner in the repo walked past them: at
 * the point of render they are EXPRESSIONS, not literals in JSX, and they
 * never appeared in messages/*.json for check-i18n.js to compare against.
 * Twenty module pages, their forms, their record cards, their filter
 * dropdowns, the AI Memory badge and "Logged to: ..." were English in all
 * ten languages while every i18n check in the repo stayed green.
 *
 * The prefix is the fix. `labelKey: "Company"` does not compile — "Company"
 * is not assignable to either prefix — so the next person to add a field
 * cannot put text here even by accident. The companion check
 * (i18n-coverage.test.mjs section 6) then proves every key these files
 * name resolves in all ten locales: the TYPE stops text getting in, the
 * TEST stops a typo getting out.
 */
export type ModuleMessageKey = `moduleData.${string}` | `dashboard.ideas.${string}`;

/**
 * The module's name, as one key.
 *
 * Deliberately `sidebar.items.*` rather than a second `moduleData.titles.*`
 * table: the sidebar already had translated names for all twenty, and a
 * separate copy is exactly how "Sales"/"CRM", "Research"/"Knowledge",
 * "Content"/"Marketing" and "Websites"/"Website Plans" became four modules
 * with two names each, depending on whether you read the sidebar or the
 * page heading.
 */
export type ModuleTitleKey = `sidebar.items.${string}`;

export type FieldConfig = {
  key: string;
  labelKey: ModuleMessageKey;
  type: FieldType;
  required?: boolean;
  full?: boolean;
  badge?: boolean;
  /**
   * The values STORED IN THE DATABASE, untranslated on purpose: a row
   * whose status reads "in progress" must keep reading "in progress"
   * whatever language the person who typed it was using, or a filter set
   * in Greek stops matching rows created in German. Only the DISPLAY is
   * translated, through optionLabelKey().
   */
  options?: string[];
  placeholderKey?: ModuleMessageKey;
};

/**
 * The display key for one stored option value.
 * "in progress" -> moduleData.options.inProgress
 */
export function optionLabelKey(option: string): ModuleMessageKey {
  const camel = option
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
  return `moduleData.options.${camel}`;
}

/**
 * The delete confirmation for one module, as a COMPLETE sentence.
 *
 * module.deleteConfirm pours a noun into "Delete this {label}?", which
 * only works while the noun is English. Greek, German, French, Spanish,
 * Italian, Portuguese and Arabic agree the demonstrative with the noun's
 * gender, and Greek's passive frame needs the nominative while German's
 * needs the accusative — none of which a shared template can express.
 */
export function deleteConfirmKey(slug: string): ModuleMessageKey {
  return `moduleData.deleteConfirm.${slug}`;
}

/**
 * The three parts of a module's empty screen.
 *
 * An empty page is the first thing a new account shows, and for twenty
 * modules it said the same sentence: "No entries yet — use the button
 * above to log your first one." That reports a FACT the user can already
 * see (the page is empty) and answers none of the questions they actually
 * have: what is this page for, why would I put something here, and what
 * does an entry even look like?
 *
 * So the empty state is three strings rather than one:
 *
 *   title   — what this page is, in a handful of words
 *   why     — the one sentence that makes it worth typing into
 *   example — a real first entry, which the user can PRESS to fill the
 *             form with (components/empty-state.tsx -> generic-list.tsx)
 *
 * The example is the part that does the teaching. "Advertising expense,
 * €200" tells a person what belongs in Finance faster than any sentence
 * about expense tracking, and pressing it turns reading into having
 * started. It is the same shape the Files workspace already proved out
 * (files-workspace.tsx's emptyTitle/emptyBody/emptyExample); this brings
 * the other twenty-one surfaces up to it instead of leaving one good
 * empty state surrounded by twenty generic ones.
 */
export type EmptyStatePart = "title" | "why" | "example";

/**
 * `moduleData.empty.finance` + "example" -> moduleData.empty.finance.example
 *
 * Built here, next to optionLabelKey() and deleteConfirmKey(), for the
 * reason those two are here: the key a component looks up and the key
 * i18n-coverage.test.mjs proves exists have to be produced by the same
 * line of code, or the check is verifying its own guess about the naming.
 */
export function emptyStateKey(module: ModuleConfig, part: EmptyStatePart): ModuleMessageKey {
  return `${module.emptyKey}.${part}`;
}

export type ModuleConfig = {
  slug: string;
  titleKey: ModuleTitleKey;
  table: string;
  headlineKey: string;
  fields: FieldConfig[];
  // Credits system (see lib/billing/credits.ts). creditCost, when set,
  // routes GenericAddForm through /api/modules/create instead of a direct
  // client insert, so the cost can be checked/deducted server-side.
  // minPlanSlug, when set, gates the whole page (BuildModulePage only) —
  // below that plan, the page shows an "Upgrade Required" prompt instead
  // of its normal content.
  //
  // There used to be a third field here, countCapCapability, which existed
  // solely to cap the "agents" tracker's row count against
  // plan.capabilities.maxAiAgents. /dashboard/agents is the real
  // Autonomous Agents feature now and maxAiAgents means the number of REAL
  // agents an account may own (enforced in lib/agents/agent-limits.ts and
  // checked in api/agents). Leaving a second, unrelated enforcement of the
  // same capability behind would have made one number mean two things.
  creditCost?: number;
  minPlanSlug?: PlanSlug;
  /**
   * The module's own empty screen, as the key GROUP holding its title,
   * why and example (see EmptyStatePart above).
   *
   * REQUIRED, and required on purpose. This was `emptyKey?: string` — an
   * optional override, added for Presentation Notes, where the shared
   * "No entries yet" message was actively misleading. It fixed that one
   * module and left nineteen with a sentence that tells a new user
   * nothing; because it was optional, the twentieth module was always
   * going to be written without one too.
   *
   * Optional is what made the generic case the default. Mandatory is what
   * makes "what does this page want from me" a question the author of a
   * module has to answer before it compiles — the same reason labelKey
   * and titleKey are mandatory, and the same reason they are typed as
   * keys rather than as strings.
   */
  emptyKey: ModuleMessageKey;
};

export const MODULES: ModuleConfig[] = [
  {
    slug: "competitors",
    emptyKey: "moduleData.empty.competitors",
    titleKey: "sidebar.items.competitors",
    table: "competitors",
    headlineKey: "company",
    fields: [
      { key: "company", labelKey: "moduleData.fields.company", type: "text", required: true },
      { key: "product", labelKey: "moduleData.fields.product", type: "text" },
      { key: "pricing", labelKey: "moduleData.fields.pricing", type: "text" },
      { key: "customers", labelKey: "moduleData.fields.customers", type: "text" },
      { key: "marketing", labelKey: "moduleData.fields.marketing", type: "textarea", full: true },
      { key: "strengths", labelKey: "moduleData.fields.strengths", type: "textarea", full: true },
      { key: "weaknesses", labelKey: "moduleData.fields.weaknesses", type: "textarea", full: true },
    ],
  },
  {
    slug: "research",
    emptyKey: "moduleData.empty.research",
    titleKey: "sidebar.items.research",
    table: "research",
    headlineKey: "topic",
    fields: [
      { key: "topic", labelKey: "moduleData.fields.topic", type: "text", required: true },
      { key: "summary", labelKey: "moduleData.fields.summary", type: "textarea", full: true },
    ],
  },
  {
    slug: "finance",
    emptyKey: "moduleData.empty.finance",
    titleKey: "sidebar.items.finance",
    table: "finance_entries",
    headlineKey: "description",
    fields: [
      { key: "description", labelKey: "moduleData.fields.description", type: "text", required: true },
      {
        key: "type",
        labelKey: "moduleData.fields.type",
        type: "select",
        required: true,
        badge: true,
        options: ["income", "expense"],
      },
      { key: "amount", labelKey: "moduleData.fields.amount", type: "number", required: true, badge: true },
    ],
  },
  {
    slug: "learning",
    emptyKey: "moduleData.empty.learning",
    titleKey: "sidebar.items.learning",
    table: "learning_entries",
    headlineKey: "topic",
    fields: [
      { key: "topic", labelKey: "moduleData.fields.topic", type: "text", required: true },
      { key: "resources", labelKey: "moduleData.fields.resources", type: "textarea", full: true },
      { key: "quiz", labelKey: "moduleData.fields.quiz", type: "textarea", full: true },
    ],
  },
  {
    slug: "trading",
    emptyKey: "moduleData.empty.trading",
    titleKey: "sidebar.items.trading",
    table: "trades",
    headlineKey: "symbol",
    fields: [
      { key: "symbol", labelKey: "moduleData.fields.symbol", type: "text", required: true },
      { key: "direction", labelKey: "moduleData.fields.direction", type: "text", badge: true, placeholderKey: "moduleData.placeholders.longShort" },
      { key: "result", labelKey: "moduleData.fields.result", type: "text", badge: true, placeholderKey: "moduleData.placeholders.winLoss" },
      { key: "pnl", labelKey: "moduleData.fields.pnl", type: "number", badge: true },
      { key: "notes", labelKey: "moduleData.fields.notes", type: "textarea", full: true },
    ],
  },
  {
    slug: "decisions",
    emptyKey: "moduleData.empty.decisions",
    titleKey: "sidebar.items.decisions",
    table: "decisions",
    headlineKey: "idea_names",
    fields: [
      { key: "idea_names", labelKey: "moduleData.fields.ideaNames", type: "text", required: true },
      { key: "ranking", labelKey: "moduleData.fields.ranking", type: "text", badge: true },
      { key: "recommendation", labelKey: "moduleData.fields.recommendation", type: "textarea", full: true },
    ],
  },
  {
    slug: "products",
    emptyKey: "moduleData.empty.products",
    titleKey: "sidebar.items.products",
    table: "products",
    headlineKey: "product_name",
    fields: [
      { key: "product_name", labelKey: "moduleData.fields.productName", type: "text", required: true },
      { key: "pricing", labelKey: "moduleData.fields.pricing", type: "text" },
      { key: "target_audience", labelKey: "moduleData.fields.targetAudience", type: "text" },
      { key: "mvp_features", labelKey: "moduleData.fields.mvpFeatures", type: "textarea", full: true },
      { key: "roadmap", labelKey: "moduleData.fields.roadmap", type: "textarea", full: true },
      { key: "user_journey", labelKey: "moduleData.fields.userJourney", type: "textarea", full: true },
      { key: "risks", labelKey: "moduleData.fields.risks", type: "textarea", full: true },
      { key: "launch_plan", labelKey: "moduleData.fields.launchPlan", type: "textarea", full: true },
    ],
  },
  {
    slug: "content",
    emptyKey: "moduleData.empty.content",
    titleKey: "sidebar.items.content",
    table: "content",
    headlineKey: "topic",
    fields: [
      { key: "topic", labelKey: "moduleData.fields.topic", type: "text", required: true },
      { key: "hashtags", labelKey: "moduleData.fields.hashtags", type: "text" },
      { key: "caption", labelKey: "moduleData.fields.caption", type: "textarea", full: true },
      { key: "twitter_thread", labelKey: "moduleData.fields.twitterThread", type: "textarea", full: true },
      { key: "content_ideas", labelKey: "moduleData.fields.contentIdeas", type: "textarea", full: true },
    ],
  },
  {
    slug: "sales",
    emptyKey: "moduleData.empty.sales",
    titleKey: "sidebar.items.sales",
    table: "leads",
    headlineKey: "lead_name",
    fields: [
      { key: "lead_name", labelKey: "moduleData.fields.leadName", type: "text", required: true },
      { key: "score", labelKey: "moduleData.fields.score", type: "number", badge: true },
      { key: "cold_email", labelKey: "moduleData.fields.coldEmail", type: "textarea", full: true },
      { key: "follow_up_email", labelKey: "moduleData.fields.followUpEmail", type: "textarea", full: true },
      { key: "next_steps", labelKey: "moduleData.fields.nextSteps", type: "textarea", full: true },
    ],
  },
  {
    slug: "feedback",
    emptyKey: "moduleData.empty.feedback",
    titleKey: "sidebar.items.feedback",
    table: "feedback",
    headlineKey: "summary",
    fields: [
      { key: "summary", labelKey: "moduleData.fields.summary", type: "text", required: true },
      { key: "sentiment", labelKey: "moduleData.fields.sentiment", type: "text", badge: true },
      { key: "category", labelKey: "moduleData.fields.category", type: "text", badge: true },
      { key: "priority", labelKey: "moduleData.fields.priority", type: "text", badge: true },
      { key: "suggested_response", labelKey: "moduleData.fields.suggestedResponse", type: "textarea", full: true },
    ],
  },
  {
    slug: "analytics",
    emptyKey: "moduleData.empty.analytics",
    titleKey: "sidebar.items.analytics",
    table: "metrics",
    headlineKey: "metric_name",
    fields: [
      { key: "metric_name", labelKey: "moduleData.fields.metricName", type: "text", required: true },
      { key: "value", labelKey: "moduleData.fields.value", type: "number", badge: true },
      { key: "notes", labelKey: "moduleData.fields.notes", type: "textarea", full: true },
    ],
  },
  {
    slug: "automation",
    emptyKey: "moduleData.empty.automation",
    titleKey: "sidebar.items.automation",
    table: "automations",
    headlineKey: "task_name",
    creditCost: 50,
    fields: [
      { key: "task_name", labelKey: "moduleData.fields.taskName", type: "text", required: true },
      { key: "time_saved", labelKey: "moduleData.fields.timeSaved", type: "text", badge: true },
      { key: "idea", labelKey: "moduleData.fields.idea", type: "text" },
      { key: "tools_needed", labelKey: "moduleData.fields.toolsNeeded", type: "text" },
      { key: "suggested_workflow", labelKey: "moduleData.fields.suggestedWorkflow", type: "textarea", full: true },
    ],
  },
];

export function getModule(slug: string): ModuleConfig | undefined {
  return MODULES.find((m) => m.slug === slug);
}

export const NAV_ITEMS: { href: string; titleKey: ModuleTitleKey }[] = [
  { href: "/dashboard", titleKey: "sidebar.items.ideas" },
  ...MODULES.map((m) => ({ href: `/dashboard/${m.slug}`, titleKey: m.titleKey })),
];

export const CREATE_NAV_ITEM = { href: "/dashboard/create", label: "Create Studio" };

export const CHAT_NAV_ITEM = { href: "/dashboard/chat", label: "Ionexa Chat" };

export const TIMELINE_NAV_ITEM = { href: "/dashboard/timeline", label: "Timeline" };

export const MISSION_NAV_ITEM = { href: "/dashboard/mission", label: "Mission Control" };

export const REFLECTION_NAV_ITEM = { href: "/dashboard/reflection", label: "Weekly Reflection" };

export const OVERVIEW_NAV_ITEM = { href: "/dashboard/overview", label: "Overview" };

export const SETTINGS_NAV_ITEM = { href: "/dashboard/settings", label: "Settings" };
