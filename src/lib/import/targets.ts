// What a CSV column may be mapped ONTO.
//
// Client-safe: the mapping the user confirms is rendered from this, and
// the server validates against the same list. Two copies would let the
// UI offer a target the server rejects.
//
// This is deliberately a SEPARATE, smaller list from lib/modules.ts. That
// file describes every field of every module for the generic add-form;
// this one describes what is worth importing in bulk from a spreadsheet,
// which is a much narrower thing. A "Suggested Response" column does not
// appear in anybody's export.

export type ImportFieldType = "text" | "number" | "date" | "enum";

export type ImportField = {
  key: string;
  label: string;
  type: ImportFieldType;
  required?: boolean;
  /** For enum fields: the values the column may resolve to. */
  options?: string[];
  /** What this field means, in the words a model needs to match a column
   *  header against it. Sent to the mapper. */
  hint: string;
};

export type ImportTarget = {
  /** Module slug — where the user goes to see the rows afterwards. */
  slug: string;
  table: string;
  label: string;
  /** What a file has to look like for this target to be right. Sent to
   *  the mapper, and the reason it can tell a trade log from an invoice
   *  list. */
  hint: string;
  fields: ImportField[];
};

export const IMPORT_TARGETS: ImportTarget[] = [
  {
    slug: "trading",
    table: "trades",
    label: "Trades",
    hint: "A trading log: one row per trade, with an instrument or ticker symbol, usually a direction (long/short or buy/sell), a profit or loss amount, and a date.",
    fields: [
      { key: "symbol", label: "Symbol", type: "text", required: true, hint: "The instrument, ticker or pair — AAPL, BTC/USD, EURUSD." },
      { key: "direction", label: "Direction", type: "enum", options: ["long", "short"], hint: "long/short, buy/sell, B/S. Buy means long." },
      { key: "result", label: "Result", type: "enum", options: ["win", "loss", "breakeven"], hint: "Whether the trade won or lost. If absent it is derived from the P&L sign." },
      { key: "pnl", label: "P&L", type: "number", hint: "Profit or loss, signed. Negative means a loss." },
      { key: "occurred_at", label: "Date", type: "date", hint: "When the trade was opened or closed. The single most valuable column in the file." },
      { key: "notes", label: "Notes", type: "text", hint: "Free text about the trade — setup, reason, review." },
    ],
  },
  {
    slug: "finance",
    table: "finance_entries",
    label: "Income & expenses",
    hint: "A book of money in and out: one row per invoice, payment, expense or transaction, with an amount and usually a date and a counterparty.",
    fields: [
      { key: "description", label: "Description", type: "text", required: true, hint: "What the entry was for — the memo, invoice line or category." },
      { key: "type", label: "Type", type: "enum", required: true, options: ["income", "expense"], hint: "income or expense. Credit/debit, in/out, sale/purchase all map here. If there is no such column it is derived from the sign of the amount." },
      { key: "amount", label: "Amount", type: "number", required: true, hint: "The value. Always stored positive; the direction lives in `type`." },
      { key: "counterparty", label: "Client or supplier", type: "text", hint: "Who paid or was paid — customer, client, vendor, supplier, payee, account name." },
      { key: "occurred_at", label: "Date", type: "date", hint: "When the money moved. Invoice date, payment date, transaction date." },
    ],
  },
  {
    slug: "sales",
    table: "leads",
    label: "Leads & customers",
    hint: "A CRM export or contact list: one row per person or company, usually with a name and sometimes a score, stage or date added.",
    fields: [
      { key: "lead_name", label: "Name", type: "text", required: true, hint: "The person or company. Full name, company name, account name." },
      { key: "score", label: "Score", type: "number", hint: "A lead score or rating, if the export has one." },
      { key: "next_steps", label: "Next steps", type: "text", hint: "Stage, status, owner or next action — anything describing where the lead stands." },
      { key: "occurred_at", label: "Date added", type: "date", hint: "When the lead arrived or was created." },
    ],
  },
  {
    slug: "analytics",
    table: "metrics",
    label: "Metrics",
    hint: "A list of measurements: one row per metric reading, with a name and a value.",
    fields: [
      { key: "metric_name", label: "Metric", type: "text", required: true, hint: "What was measured — MRR, signups, churn, sessions." },
      { key: "value", label: "Value", type: "number", hint: "The number." },
      { key: "notes", label: "Notes", type: "text", hint: "Free text about the reading." },
    ],
  },
  {
    slug: "competitors",
    table: "competitors",
    label: "Competitors",
    hint: "A list of rival companies or products, with names and usually notes on pricing or positioning.",
    fields: [
      { key: "company", label: "Company", type: "text", required: true, hint: "The competitor's name." },
      { key: "product", label: "Product", type: "text", hint: "What they sell." },
      { key: "pricing", label: "Pricing", type: "text", hint: "What they charge." },
      { key: "strengths", label: "Strengths", type: "text", hint: "What they do well." },
      { key: "weaknesses", label: "Weaknesses", type: "text", hint: "Where they are weak." },
    ],
  },
  {
    slug: "feedback",
    table: "feedback",
    label: "Feedback",
    hint: "Customer feedback, survey responses, reviews or support tickets: one row per piece of feedback.",
    fields: [
      { key: "summary", label: "Feedback", type: "text", required: true, hint: "What the customer said." },
      { key: "sentiment", label: "Sentiment", type: "enum", options: ["positive", "neutral", "negative"], hint: "positive/neutral/negative, or a rating mapped onto them." },
      { key: "category", label: "Category", type: "text", hint: "Topic, tag or area." },
      { key: "priority", label: "Priority", type: "text", hint: "Severity or urgency." },
    ],
  },
  {
    slug: "ideas",
    table: "ideas",
    label: "Ideas",
    hint: "A backlog of ideas or opportunities: one row per idea, with a name and often a problem or customer.",
    fields: [
      { key: "name", label: "Idea", type: "text", required: true, hint: "The idea, in a few words." },
      { key: "problem", label: "Problem", type: "text", hint: "The problem it solves." },
      { key: "customer", label: "Customer", type: "text", hint: "Who it is for." },
      { key: "score", label: "Score", type: "number", hint: "A rating or priority number." },
    ],
  },
];

export function getImportTarget(slug: string): ImportTarget | undefined {
  return IMPORT_TARGETS.find((t) => t.slug === slug);
}

export function isImportTargetSlug(value: unknown): value is string {
  return typeof value === "string" && IMPORT_TARGETS.some((t) => t.slug === value);
}

/** The field, if this target has it. Used to validate a mapping the
 *  client sent — a mapping naming a field that does not exist would
 *  otherwise become an insert with an unknown column. */
export function getImportField(target: ImportTarget, key: string): ImportField | undefined {
  return target.fields.find((f) => f.key === key);
}
