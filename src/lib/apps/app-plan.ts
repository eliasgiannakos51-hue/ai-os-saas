import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from "@/lib/agents/agent-config";
import { languageNameFor } from "@/lib/text/language-name";

/**
 * AN APP FROM A DESCRIPTION — the definition, and the four boxes a person
 * changes with words (the owner's "APPS: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ",
 * 2026-10-24, κομμάτι 2). No SDK in here on purpose: the screen prices
 * the next press from these same messages, so it imports this file.
 *
 * THE MODEL WRITES A DEFINITION, NOT CODE (docs/APPS-ISOLATION.md §1).
 * Collections with typed fields, screens that point at them, who sees
 * what, what gets notified — and our own components draw it. That one
 * decision is what makes the later pieces possible: a preview is the
 * definition drawn, "every button" is a set we own and can range over,
 * a version is a snapshot, and "how many rows would this lose" is a
 * COUNT rather than a guess.
 *
 * So parseDefinition below is not input hygiene. It is the only place
 * that decides what a valid app IS, and the self-check of κομμάτι 6
 * ranges over exactly what it enforces.
 */
export const APP_MODEL = "claude-sonnet-4-6";

export const APP_FIELD_TYPES = ["text", "longText", "number", "date", "time", "choice", "email", "phone", "checkbox"] as const;
export type AppFieldType = (typeof APP_FIELD_TYPES)[number];

export const APP_ROLES = ["owner", "customer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_SCREEN_KINDS = ["form", "list"] as const;
export type AppScreenKind = (typeof APP_SCREEN_KINDS)[number];

/** Who may see a row: everything to the owner, or each visitor their own. */
export const APP_VISIBILITIES = ["owner", "own"] as const;
export type AppVisibility = (typeof APP_VISIBILITIES)[number];

export type AppField = { key: string; label: string; type: AppFieldType; required: boolean; options?: string[] };
export type AppCollection = { key: string; label: string; visibility: AppVisibility; fields: AppField[] };
export type AppScreen = { key: string; label: string; kind: AppScreenKind; collection: string; role: AppRole };
export type AppNotification = { key: string; collection: string; to: AppRole; label: string };
export type AppDefinition = {
  title: string;
  collections: AppCollection[];
  screens: AppScreen[];
  notifications: AppNotification[];
};

/** The four boxes the owner named: δεδομένα, οθόνες, ποιος βλέπει τι, ειδοποιήσεις. */
export const APP_BOX_KINDS = ["data", "screens", "access", "notifications"] as const;
export type AppBoxKind = (typeof APP_BOX_KINDS)[number];

export const MAX_APP_DESCRIPTION_CHARS = 2_000;
export const MAX_APP_INSTRUCTION_CHARS = 600;
export const MAX_APP_TITLE_CHARS = 80;
export const MAX_LABEL_CHARS = 60;
export const MAX_KEY_CHARS = 40;
/**
 * The caps. They are small deliberately: an app that saves bookings needs
 * four collections, not forty, and every one of these numbers is a row
 * the self-check of κομμάτι 6 has to press and the preview has to draw.
 */
export const MAX_COLLECTIONS = 6;
export const MAX_FIELDS_PER_COLLECTION = 12;
export const MAX_SCREENS = 8;
export const MAX_NOTIFICATIONS = 4;
export const MAX_CHOICE_OPTIONS = 10;
/** The plan's call: four boxes of structure, not prose. */
export const PLAN_MAX_TOKENS = 3_000;
/**
 * The fixed words of planMessage/boxMessage — the rules, the fences and
 * the asks — measured 2026-10-24 by joining RULES and the longest
 * BOX_ASK. It is an estimate's constant, not a claim about one call.
 */
export const PLAN_OVERHEAD_CHARS = 900;

export function isAppBoxKind(v: unknown): v is AppBoxKind {
  return typeof v === "string" && (APP_BOX_KINDS as readonly string[]).includes(v);
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * A key the rest of the system can rely on: lower-case letters, digits
 * and underscores, never empty, never starting with a digit. It becomes
 * a jsonb property name and a testid, so a label like «Ώρα άφιξης» cannot
 * be one.
 */
export function toKey(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_CHARS);
  return /^[a-z]/.test(cleaned) ? cleaned : fallback;
}

function uniqueKey(wanted: string, taken: Set<string>): string {
  if (!taken.has(wanted)) {
    taken.add(wanted);
    return wanted;
  }
  for (let n = 2; n < 100; n++) {
    const candidate = `${wanted}_${n}`.slice(0, MAX_KEY_CHARS);
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  const last = `${wanted}_x`.slice(0, MAX_KEY_CHARS);
  taken.add(last);
  return last;
}

function parseAppField(raw: unknown, taken: Set<string>, index: number): AppField | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const label = clip(str(r.label), MAX_LABEL_CHARS);
  if (!label) return null;
  const type = (APP_FIELD_TYPES as readonly string[]).includes(str(r.type)) ? (str(r.type) as AppFieldType) : "text";
  const key = uniqueKey(toKey(str(r.key) || label, `field_${index + 1}`), taken);
  const field: AppField = { key, label, type, required: r.required === true };
  if (type === "choice") {
    const options = Array.isArray(r.options)
      ? r.options.map((o) => clip(str(o), MAX_LABEL_CHARS)).filter(Boolean).slice(0, MAX_CHOICE_OPTIONS)
      : [];
    // A choice with nothing to choose is a text field wearing a hat, and
    // the form would draw an empty dropdown nobody can answer.
    if (options.length === 0) return { key, label, type: "text", required: field.required };
    field.options = [...new Set(options)];
  }
  return field;
}

function parseAppCollection(raw: unknown, taken: Set<string>, index: number): AppCollection | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const label = clip(str(r.label), MAX_LABEL_CHARS);
  if (!label) return null;
  const fieldKeys = new Set<string>();
  const fields = (Array.isArray(r.fields) ? r.fields : [])
    .map((f, i) => parseAppField(f, fieldKeys, i))
    .filter((f): f is AppField => f !== null)
    .slice(0, MAX_FIELDS_PER_COLLECTION);
  if (fields.length === 0) return null;
  return {
    key: uniqueKey(toKey(str(r.key) || label, `collection_${index + 1}`), taken),
    label,
    // The closed answer is the default: a collection whose visibility the
    // model did not state shows nothing to a visitor.
    visibility: str(r.visibility) === "own" ? "own" : "owner",
    fields,
  };
}

/**
 * THE DEFINITION THE MODEL RETURNED, OR WHY IT IS NOT ONE.
 *
 * Referential integrity is the part that matters and the part a looser
 * parser would skip: a screen naming a collection that is not there
 * draws an empty page with a button that does nothing, which is exactly
 * what the owner's ΚΡΙΤΗΡΙΑ ΠΟΙΟΤΗΤΑΣ forbid ("κάθε κουμπί κάνει κάτι,
 * καμία κενή οθόνη"). So a screen that does not resolve is dropped here,
 * before anything is stored, and an app left with no screen at all is
 * refused rather than saved empty.
 */
export function parseDefinition(input: unknown, fallbackTitle: string): { ok: true; definition: AppDefinition } | { ok: false; reason: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const collectionKeys = new Set<string>();
  const collections = (Array.isArray(raw.collections) ? raw.collections : [])
    .map((c, i) => parseAppCollection(c, collectionKeys, i))
    .filter((c): c is AppCollection => c !== null)
    .slice(0, MAX_COLLECTIONS);
  if (collections.length === 0) return { ok: false, reason: "no collection with any field" };

  const known = new Set(collections.map((c) => c.key));
  const screenKeys = new Set<string>();
  const screens = (Array.isArray(raw.screens) ? raw.screens : [])
    .map((s, i): AppScreen | null => {
      const r = (s ?? {}) as Record<string, unknown>;
      const label = clip(str(r.label), MAX_LABEL_CHARS);
      const collection = toKey(str(r.collection), "");
      if (!label || !known.has(collection)) return null;
      return {
        key: uniqueKey(toKey(str(r.key) || label, `screen_${i + 1}`), screenKeys),
        label,
        kind: str(r.kind) === "list" ? "list" : "form",
        collection,
        role: str(r.role) === "customer" ? "customer" : "owner",
      };
    })
    .filter((s): s is AppScreen => s !== null)
    .slice(0, MAX_SCREENS);
  if (screens.length === 0) return { ok: false, reason: "no screen that points at a collection that exists" };

  const notificationKeys = new Set<string>();
  const notifications = (Array.isArray(raw.notifications) ? raw.notifications : [])
    .map((n, i): AppNotification | null => {
      const r = (n ?? {}) as Record<string, unknown>;
      const label = clip(str(r.label), MAX_LABEL_CHARS);
      const collection = toKey(str(r.collection), "");
      if (!label || !known.has(collection)) return null;
      return {
        key: uniqueKey(toKey(str(r.key) || label, `notification_${i + 1}`), notificationKeys),
        label,
        collection,
        to: str(r.to) === "customer" ? "customer" : "owner",
      };
    })
    .filter((n): n is AppNotification => n !== null)
    .slice(0, MAX_NOTIFICATIONS);

  const title = clip(str(raw.title), MAX_APP_TITLE_CHARS) || clip(fallbackTitle, MAX_APP_TITLE_CHARS) || "App";
  return { ok: true, definition: { title, collections, screens, notifications } };
}

/** A stored definition read back, never trusted to be whole. */
export function readDefinition(value: unknown): AppDefinition | null {
  const parsed = parseDefinition(value, "");
  return parsed.ok ? parsed.definition : null;
}

/**
 * ONE BOX REPLACED, EVERY OTHER BOX EXACTLY AS IT WAS.
 *
 * The owner's check for κομμάτι 2 is that changing one box leaves the
 * others alone, so the model is asked for that box's slice only and the
 * rest of the definition is carried across untouched rather than
 * re-generated. The one place that cannot hold is when the data box
 * loses a collection: a screen pointing at what is gone would be the
 * empty screen the quality rules forbid. Those are dropped, and SAID —
 * `dropped` is what the screen tells the person, and it is the first
 * form of the destructive guard κομμάτι 7 finishes.
 */
export function spliceBox(definition: AppDefinition, kind: AppBoxKind, slice: unknown): { definition: AppDefinition; dropped: string[] } {
  const raw = (slice ?? {}) as Record<string, unknown>;
  let next: AppDefinition = definition;

  if (kind === "data") {
    const taken = new Set<string>();
    const collections = (Array.isArray(raw.collections) ? raw.collections : [])
      .map((c, i) => parseAppCollection(c, taken, i))
      .filter((c): c is AppCollection => c !== null)
      .slice(0, MAX_COLLECTIONS);
    if (collections.length === 0) return { definition, dropped: [] };
    next = { ...definition, collections };
  } else if (kind === "screens") {
    const known = new Set(definition.collections.map((c) => c.key));
    const taken = new Set<string>();
    // Named apart from the `screens` the integrity pass below builds: the
    // two guards read the same on the page and mean different things —
    // "the slice brought nothing" against "the change would empty the
    // app" — and apps-tool.mutation.mjs could not tell them apart while
    // the lines were identical, so one mutant landed in the wrong one.
    const fromSlice = (Array.isArray(raw.screens) ? raw.screens : [])
      .map((s, i): AppScreen | null => {
        const r = (s ?? {}) as Record<string, unknown>;
        const label = clip(str(r.label), MAX_LABEL_CHARS);
        const collection = toKey(str(r.collection), "");
        if (!label || !known.has(collection)) return null;
        return {
          key: uniqueKey(toKey(str(r.key) || label, `screen_${i + 1}`), taken),
          label,
          kind: str(r.kind) === "list" ? "list" : "form",
          collection,
          role: str(r.role) === "customer" ? "customer" : "owner",
        };
      })
      .filter((s): s is AppScreen => s !== null)
      .slice(0, MAX_SCREENS);
    if (fromSlice.length === 0) return { definition, dropped: [] };
    next = { ...definition, screens: fromSlice };
  } else if (kind === "access") {
    // The access box carries no new objects — only the two answers to
    // "who sees this", applied by key onto what is already there. A key
    // the slice invents is ignored rather than creating a collection
    // through the back door.
    const byCollection = new Map<string, AppVisibility>();
    for (const c of Array.isArray(raw.collections) ? raw.collections : []) {
      const r = (c ?? {}) as Record<string, unknown>;
      const key = toKey(str(r.key), "");
      if (key && (APP_VISIBILITIES as readonly string[]).includes(str(r.visibility))) byCollection.set(key, str(r.visibility) as AppVisibility);
    }
    const byScreen = new Map<string, AppRole>();
    for (const s of Array.isArray(raw.screens) ? raw.screens : []) {
      const r = (s ?? {}) as Record<string, unknown>;
      const key = toKey(str(r.key), "");
      if (key && (APP_ROLES as readonly string[]).includes(str(r.role))) byScreen.set(key, str(r.role) as AppRole);
    }
    next = {
      ...definition,
      collections: definition.collections.map((c) => ({ ...c, visibility: byCollection.get(c.key) ?? c.visibility })),
      screens: definition.screens.map((s) => ({ ...s, role: byScreen.get(s.key) ?? s.role })),
    };
  } else {
    const known = new Set(definition.collections.map((c) => c.key));
    const taken = new Set<string>();
    const notifications = (Array.isArray(raw.notifications) ? raw.notifications : [])
      .map((n, i): AppNotification | null => {
        const r = (n ?? {}) as Record<string, unknown>;
        const label = clip(str(r.label), MAX_LABEL_CHARS);
        const collection = toKey(str(r.collection), "");
        if (!label || !known.has(collection)) return null;
        return {
          key: uniqueKey(toKey(str(r.key) || label, `notification_${i + 1}`), taken),
          label,
          collection,
          to: str(r.to) === "customer" ? "customer" : "owner",
        };
      })
      .filter((n): n is AppNotification => n !== null)
      .slice(0, MAX_NOTIFICATIONS);
    next = { ...definition, notifications };
  }

  const known = new Set(next.collections.map((c) => c.key));
  const dropped: string[] = [];
  const screens = next.screens.filter((s) => {
    if (known.has(s.collection)) return true;
    dropped.push(s.label);
    return false;
  });
  const notifications = next.notifications.filter((n) => {
    if (known.has(n.collection)) return true;
    dropped.push(n.label);
    return false;
  });
  // A change that would leave nothing to show is not applied at all: the
  // person asked to change a box, not to empty the app.
  if (screens.length === 0) return { definition, dropped: [] };
  return { definition: { ...next, screens, notifications }, dropped };
}

const fence = (s: string) => `${UNTRUSTED_OPEN}\n${s}\n${UNTRUSTED_CLOSE}`;

const COLLECTION_SCHEMA = {
  type: "object",
  properties: {
    key: { type: "string", description: "lower_snake_case, from the label" },
    label: { type: "string" },
    visibility: { type: "string", enum: [...APP_VISIBILITIES], description: "owner: only the business sees these rows. own: each visitor sees only their own." },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "lower_snake_case" },
          label: { type: "string" },
          type: { type: "string", enum: [...APP_FIELD_TYPES] },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" }, description: "only for type choice" },
        },
        required: ["key", "label", "type", "required"],
      },
    },
  },
  required: ["key", "label", "visibility", "fields"],
};

const SCREEN_SCHEMA = {
  type: "object",
  properties: {
    key: { type: "string", description: "lower_snake_case" },
    label: { type: "string" },
    kind: { type: "string", enum: [...APP_SCREEN_KINDS], description: "form: fill one in. list: see them all." },
    collection: { type: "string", description: "the key of a collection above" },
    role: { type: "string", enum: [...APP_ROLES] },
  },
  required: ["key", "label", "kind", "collection", "role"],
};

const NOTIFICATION_SCHEMA = {
  type: "object",
  properties: {
    key: { type: "string", description: "lower_snake_case" },
    label: { type: "string", description: "what the message says, in one line" },
    collection: { type: "string", description: "the key of a collection above" },
    to: { type: "string", enum: [...APP_ROLES] },
  },
  required: ["key", "label", "collection", "to"],
};

export const PLAN_TOOL = {
  name: "plan_app",
  description: "The app's plan: a title, the data it keeps, the screens that use it, who sees what, and what gets told to whom.",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      collections: { type: "array", items: COLLECTION_SCHEMA },
      screens: { type: "array", items: SCREEN_SCHEMA },
      notifications: { type: "array", items: NOTIFICATION_SCHEMA },
    },
    required: ["title", "collections", "screens", "notifications"],
  },
};

/** One box, rewritten. Only the part belonging to that box comes back. */
export const BOX_TOOL = {
  name: "rewrite_box",
  description: "The one box, rewritten as asked. Return only the part that belongs to that box.",
  inputSchema: {
    type: "object" as const,
    properties: {
      collections: { type: "array", items: COLLECTION_SCHEMA },
      screens: { type: "array", items: SCREEN_SCHEMA },
      notifications: { type: "array", items: NOTIFICATION_SCHEMA },
    },
    required: [],
  },
};

const RULES = [
  `At most ${MAX_COLLECTIONS} collections, ${MAX_FIELDS_PER_COLLECTION} fields each, ${MAX_SCREENS} screens, ${MAX_NOTIFICATIONS} notifications. Fewer is better: only what the business actually needs.`,
  "Every screen names a collection that exists. Every notification names a collection that exists.",
  "A collection a visitor writes into (a booking, an order, a form answer) is visibility own, so one customer never reads another's. A collection only the business reads (its services, its stock) is visibility owner.",
  "A form the customer fills in is role customer. A list the business reads is role owner.",
  "Do not invent a field for payment card details, a password, or any government number. The app does not take payments.",
  "Keys are lower_snake_case and in English; labels are in the language you are told.",
];

export function planMessage(description: string, locale: string): string {
  return [
    `Plan an app that SAVES DATA for this business. Write the title and every label in ${languageNameFor(locale)}.`,
    ...RULES.map((r) => `- ${r}`),
    "",
    fence(description),
  ].join("\n");
}

/** The definition as the model reads it back — the same text for every box. */
export function definitionText(definition: AppDefinition): string {
  const lines = [`TITLE: ${definition.title}`, "COLLECTIONS:"];
  for (const c of definition.collections) {
    lines.push(`- ${c.key} "${c.label}" (visibility: ${c.visibility})`);
    for (const f of c.fields) lines.push(`    ${f.key} "${f.label}" ${f.type}${f.required ? " required" : ""}${f.options ? ` [${f.options.join(", ")}]` : ""}`);
  }
  lines.push("SCREENS:");
  for (const s of definition.screens) lines.push(`- ${s.key} "${s.label}" ${s.kind} of ${s.collection}, for the ${s.role}`);
  lines.push("NOTIFICATIONS:");
  if (definition.notifications.length === 0) lines.push("- (none)");
  for (const n of definition.notifications) lines.push(`- ${n.key} "${n.label}" on a new ${n.collection}, to the ${n.to}`);
  return lines.join("\n");
}

const BOX_ASK: Record<AppBoxKind, string> = {
  data: "Return ONLY `collections` — the whole list, with the change applied. Keep every collection and field that was not asked about exactly as it is, same keys.",
  screens: "Return ONLY `screens` — the whole list, with the change applied. Every screen must name a collection that exists. Keep the others exactly as they are, same keys.",
  access: "Return ONLY the visibility of collections and the role of screens, as `collections` (key and visibility) and `screens` (key and role). Change nothing else.",
  notifications: "Return ONLY `notifications` — the whole list, with the change applied.",
};

export function boxMessage(definition: AppDefinition, kind: AppBoxKind, instruction: string, locale: string): string {
  return [
    `Here is the whole plan, for context. Change ONLY the ${kind} box as asked. Labels in ${languageNameFor(locale)}.`,
    BOX_ASK[kind],
    ...RULES.map((r) => `- ${r}`),
    "",
    definitionText(definition),
    "",
    "What to change:",
    fence(instruction),
  ].join("\n");
}

/**
 * What the screen's price is computed from, so the number under the
 * field and the number the route holds come from one formula. The
 * screen cannot call definitionText on a plan it has not loaded yet, so
 * the first press prices on the description alone, which is what is
 * sent.
 */
export function planInputChars(systemChars: number, descriptionChars: number): number {
  return systemChars + descriptionChars + PLAN_OVERHEAD_CHARS;
}

export function boxInputChars(systemChars: number, definition: AppDefinition, instructionChars: number): number {
  return systemChars + definitionText(definition).length + instructionChars + PLAN_OVERHEAD_CHARS;
}
