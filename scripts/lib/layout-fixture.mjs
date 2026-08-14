/**
 * An account with real data in it.
 *
 * Every layout check in this repo has run against an empty account, so
 * every one of them measured the same thing: an empty state, centred, in a
 * box that cannot overflow. "No horizontal overflow at 375px" is trivially
 * true of a page showing "No entries yet". It says nothing about the page a
 * paying user actually looks at.
 *
 * What breaks layouts is data:
 *
 *   - LONG NAMES. A 68-character title in a card that sized itself around
 *     "Test entry".
 *   - WIDE ROWS. Every optional column populated at once — which no
 *     hand-made test record ever has, because the person making it fills in
 *     two fields and moves on.
 *   - MANY ROWS. Enough to page, so pagination controls, sort toggles and
 *     the footer are on screen at the same time as the list.
 *   - GREEK. The primary locale runs about 15% longer than English for the
 *     same sentence, and it is the locale most of these users read.
 *
 * Rows are generated FROM the module configs (lib/modules.ts,
 * lib/build-modules.ts) rather than hand-written, so a module that gains a
 * field gains fixture data for it in the same commit instead of quietly
 * dropping out of coverage.
 */
import { loadTs } from "../tests/load-ts.mjs";

const USER_ID = "00000000-0000-4000-8000-000000000001";

// 68 and 74 characters. Deliberately above any reasonable card width and
// containing no early space in the Greek one, so `overflow-wrap` has
// nowhere convenient to break — which is the case that actually clips.
const LONG_EN =
  "Quarterly consolidated revenue reconciliation and variance commentary";
const LONG_EL =
  "Τριμηνιαία ενοποιημένη συμφωνία εσόδων και σχολιασμός αποκλίσεων ανά τμήμα";
const LONG_URL =
  "https://example-customer-portal.internal.eu-west-1.amazonaws.com/reports/2026/q3/consolidated-revenue-variance.pdf";
const LONG_PROSE =
  "Revenue landed 4.2% under plan for the quarter, driven almost entirely by " +
  "the delayed enterprise renewals in the EMEA segment; the pipeline itself " +
  "held, but three of the five largest contracts slipped into the following " +
  "period after procurement changes on the customer side. Gross margin was " +
  "unaffected. The commentary below reconciles each variance line back to " +
  "the committed forecast and flags the two that are structural rather than " +
  "timing.";

const ROW_COUNT = 37; // > one page everywhere, small enough to stay fast

function isoDaysAgo(days) {
  return new Date(Date.UTC(2026, 6, 1) - days * 86400000).toISOString();
}

/** A value for one module field, chosen to be as wide as the type allows. */
function fieldValue(field, index) {
  switch (field.type) {
    case "number":
      // Wide numbers, including a negative — the sign adds a glyph that
      // right-aligned columns routinely forget about.
      return index % 7 === 0 ? -1234567.89 : 9876543.21;
    case "select":
      return field.options?.[index % (field.options?.length || 1)] ?? "planned";
    case "textarea":
      return LONG_PROSE;
    default:
      if (field.key === "url") return LONG_URL;
      // Alternate scripts so both the Latin and the Greek measurement run
      // against a genuinely long string.
      return `${index % 2 === 0 ? LONG_EN : LONG_EL} #${index + 1}`;
  }
}

function rowsForModule(moduleConfig) {
  return Array.from({ length: ROW_COUNT }, (_, i) => {
    const row = {
      id: `${moduleConfig.slug}-${String(i + 1).padStart(3, "0")}`,
      user_id: USER_ID,
      created_at: isoDaysAgo(i),
      updated_at: isoDaysAgo(i),
    };
    // EVERY field populated, not a realistic subset. The row that breaks a
    // layout is the one where nothing was left blank.
    for (const field of moduleConfig.fields) row[field.key] = fieldValue(field, i);
    return row;
  });
}

export async function buildFixture() {
  const { MODULES } = await loadTs("src/lib/modules.ts");
  const { BUILD_MODULES } = await loadTs("src/lib/build-modules.ts");

  /** @type {Record<string, object[]>} */
  const tables = {};
  for (const m of [...MODULES, ...BUILD_MODULES]) tables[m.table] = rowsForModule(m);

  const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

  tables.ideas = seq(ROW_COUNT, (i) => ({
    id: `idea-${i}`,
    user_id: USER_ID,
    content: `${i % 2 === 0 ? LONG_EL : LONG_EN} — ${LONG_PROSE.slice(0, 180)}`,
    created_at: isoDaysAgo(i),
  }));

  tables.user_documents = seq(ROW_COUNT, (i) => ({
    id: `doc-${i}`,
    user_id: USER_ID,
    title: `${i % 2 === 0 ? LONG_EL : LONG_EN} #${i + 1}`,
    content: { blocks: [{ type: "paragraph", text: LONG_PROSE }] },
    created_at: isoDaysAgo(i),
    updated_at: isoDaysAgo(i),
  }));

  tables.user_agents = seq(ROW_COUNT, (i) => ({
    id: `agent-${i}`,
    user_id: USER_ID,
    name: `${i % 2 === 0 ? LONG_EN : LONG_EL} #${i + 1}`,
    description: LONG_PROSE,
    status: ["active", "paused", "draft"][i % 3],
    schedule_cron: "0 9 * * 1-5",
    schedule_description: "Every weekday at 09:00 Europe/Athens",
    delivery_channel: ["email", "slack", "in_app"][i % 3],
    delivery_target: "operations-and-revenue-reporting@example-company.com",
    capability: "research",
    estimated_credits_per_run: 1250,
    last_run_at: isoDaysAgo(i),
    created_at: isoDaysAgo(i),
    updated_at: isoDaysAgo(i),
  }));

  tables.ai_missions = seq(ROW_COUNT, (i) => ({
    id: `mission-${i}`,
    user_id: USER_ID,
    goal: `${i % 2 === 0 ? LONG_EL : LONG_EN} #${i + 1}`,
    status: ["planning", "active", "done"][i % 3],
    plan_steps: {
      steps: seq(6, (s) => ({
        text: `${LONG_EN} — step ${s + 1}`,
        status: s === 0 ? "done" : "todo",
        effort: ["light", "medium", "deep"][s % 3],
      })),
    },
    created_at: isoDaysAgo(i),
    updated_at: isoDaysAgo(i),
  }));

  tables.user_files = seq(ROW_COUNT, (i) => ({
    id: `file-${i}`,
    user_id: USER_ID,
    filename: `${(i % 2 === 0 ? LONG_EN : LONG_EL).replace(/\s+/g, "-").toLowerCase()}-${i + 1}.pdf`,
    file_type: ["pdf", "docx", "csv", "txt"][i % 4],
    size_bytes: 18_874_368,
    page_count: 412,
    char_count: 1_284_902,
    processing_status: ["ready", "processing", "failed", "pending"][i % 4],
    error: i % 4 === 2 ? LONG_PROSE.slice(0, 120) : null,
    uploaded_at: isoDaysAgo(i),
  }));

  tables.research_reports = seq(ROW_COUNT, (i) => ({
    id: `report-${i}`,
    user_id: USER_ID,
    topic: `${i % 2 === 0 ? LONG_EL : LONG_EN} #${i + 1}`,
    status: ["ready", "researching", "failed", "planning"][i % 4],
    questions: seq(8, (q) => ({ question: `${LONG_EN} ${q}?`, why: LONG_PROSE.slice(0, 140) })),
    sections: seq(5, (s) => ({ heading: `${LONG_EL} ${s}`, body: LONG_PROSE })),
    sources: seq(12, (s) => ({ title: `${LONG_EN} source ${s}`, url: LONG_URL })),
    document_id: null,
    credits_charged: 4800,
    error: null,
    questions_done: 8,
    questions_total: 8,
    current_question: null,
    created_at: isoDaysAgo(i),
    completed_at: isoDaysAgo(i),
  }));

  tables.user_websites = seq(12, (i) => ({
    id: `site-${i}`,
    user_id: USER_ID,
    name: `${i % 2 === 0 ? LONG_EN : LONG_EL} #${i + 1}`,
    prompt: LONG_PROSE,
    status: ["ready", "generating", "failed"][i % 3],
    html: "<html><body>fixture</body></html>",
    created_at: isoDaysAgo(i),
    updated_at: isoDaysAgo(i),
  }));

  tables.team_members = seq(9, (i) => ({
    id: `member-${i}`,
    team_owner_id: USER_ID,
    user_id: `member-user-${i}`,
    email: `an.exceptionally.long.address.for.testing.${i}@example-company-group.com`,
    role: i === 0 ? "owner" : "member",
    created_at: isoDaysAgo(i),
  }));

  tables.credit_transactions = seq(ROW_COUNT, (i) => ({
    id: `txn-${i}`,
    user_id: USER_ID,
    amount: i % 3 === 0 ? -12500 : 50000,
    reason: `${LONG_EN} #${i + 1}`,
    created_at: isoDaysAgo(i),
  }));

  // One row, read with .single().
  tables.user_credits = [
    {
      user_id: USER_ID,
      credits_remaining: 1_284_902,
      credits_total: 2_000_000,
      updated_at: isoDaysAgo(0),
    },
  ];

  return tables;
}
