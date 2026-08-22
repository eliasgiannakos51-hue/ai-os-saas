/**
 * WHAT A FORM ON A GENERATED SITE IS.
 *
 * Pure, and shared by four places that must not disagree: the prompt that
 * tells the model what to build, the public endpoint that accepts what a
 * visitor submits, the dashboard that lists it, and the CSV that leaves
 * the product.
 */

/**
 * The kinds of form a generated site may carry.
 *
 * BOOKING IS NOT HERE, and its absence is deliberate rather than
 * forgotten. A booking form needs availability, a calendar, a
 * double-booking rule and a cancellation path; one that only files a
 * message is a promise the product cannot keep, and the person who
 * turns up on Tuesday is the one who finds out. 'other' is the honest
 * bucket for a form that is none of these — it is stored and listed,
 * it just does not claim to be something it is not.
 */
export const FORM_TYPES = ["contact", "newsletter", "quote", "other"] as const;
export type FormType = (typeof FORM_TYPES)[number];

export function isFormType(value: unknown): value is FormType {
  return typeof value === "string" && (FORM_TYPES as readonly string[]).includes(value);
}

/** What an unrecognised or absent type becomes. Every existing row is one
 *  of these, because until this workstream there was only one kind. */
export const DEFAULT_FORM_TYPE: FormType = "contact";

export function parseFormType(value: unknown): FormType {
  return isFormType(value) ? value : DEFAULT_FORM_TYPE;
}

/** Consent text is copied off the page and stored beside the tick, so it
 *  is attacker-controlled length as much as anything else in the body. */
export const MAX_CONSENT_TEXT_LENGTH = 500;

/**
 * The fields a quote request actually needs, per industry.
 *
 * "Ask for what you need to quote" is not something a model reliably
 * derives from "a website for a plumber": the generic result is name /
 * email / message, which is a contact form wearing a different heading.
 * These are concrete enough to be useful and short enough to fit in a
 * prompt — the model is told to ADAPT them to the business, not to treat
 * them as a schema.
 *
 * Kept here rather than inline in the prompt so the list is one thing a
 * test can read, and so the prompt cannot quietly lose an industry.
 */
export const QUOTE_FIELDS_BY_INDUSTRY: Record<string, string[]> = {
  "trades / construction": ["property type", "job description", "square metres", "preferred start date"],
  "events / catering": ["event date", "number of guests", "venue or area", "menu or service style"],
  "professional services": ["company size", "service needed", "current setup", "budget range"],
  "transport / logistics": ["pickup location", "destination", "cargo type and weight", "preferred date"],
  "beauty / wellness": ["treatment wanted", "preferred days and times", "first visit or returning"],
  "education / tuition": ["subject or level", "student age", "lessons per week", "in person or online"],
};

/**
 * The headline for a submission row — the visitor's own name if they
 * gave one, otherwise their email, otherwise the first thing they typed.
 *
 * Case- and language-insensitive on the KEY, because the field names come
 * out of a model writing a page in one of ten languages: a Greek site's
 * form has name="onoma" as readily as name="name", and a list that says
 * "Submission" for every row of a Greek site is a list nobody reads.
 */
const NAME_KEYS = ["name", "fullname", "full_name", "yourname", "your_name", "onoma", "nombre", "nom", "nome"];
const EMAIL_KEYS = ["email", "e-mail", "e_mail", "mail", "correo", "courriel"];
const PHONE_KEYS = ["phone", "tel", "telephone", "mobile", "telefono", "tilefono"];
const MESSAGE_KEYS = ["message", "msg", "comments", "enquiry", "inquiry", "details", "minima", "mensaje"];

function pick(fields: Record<string, string>, candidates: string[]): string | null {
  const normalised = new Map<string, string>();
  for (const [key, value] of Object.entries(fields)) {
    const k = key.toLowerCase().replace(/[\s-]/g, "");
    if (!normalised.has(k) && value.trim()) normalised.set(k, value.trim());
  }
  for (const candidate of candidates) {
    const hit = normalised.get(candidate.replace(/[\s-]/g, ""));
    if (hit) return hit;
  }
  return null;
}

export function submissionName(fields: Record<string, string>): string | null {
  return pick(fields, NAME_KEYS);
}

export function submissionEmail(fields: Record<string, string>): string | null {
  return pick(fields, EMAIL_KEYS);
}

export function submissionPhone(fields: Record<string, string>): string | null {
  return pick(fields, PHONE_KEYS);
}

export function submissionMessage(fields: Record<string, string>): string | null {
  return pick(fields, MESSAGE_KEYS);
}

/** The one line that identifies a submission in a list. Falls back
 *  through name → email → phone → the first non-empty value, and only
 *  then to nothing, so a row is never blank while carrying data. */
export function submissionHeadline(fields: Record<string, string>): string | null {
  const found = submissionName(fields) ?? submissionEmail(fields) ?? submissionPhone(fields);
  if (found) return found;
  for (const value of Object.values(fields)) {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export type SubmissionForExport = {
  createdAt: string;
  websiteName: string;
  formType: string;
  consent: boolean;
  consentText: string | null;
  emailStatus: string;
  classification: string | null;
  fields: Record<string, string>;
};

/**
 * The CSV, as headers + rows.
 *
 * THE COLUMNS ARE THE UNION OF EVERY FIELD IN THE EXPORT, not the fields
 * of the first row. Two forms on two sites have different fields, and an
 * export that took its shape from row one would silently drop every
 * column the rest of the file introduced — the kind of loss nobody
 * notices, because the file opens and looks complete.
 *
 * Field columns are prefixed so a form field called "date" or "consent"
 * cannot collide with the fixed columns and overwrite them.
 */
export function submissionsToCsv(rows: SubmissionForExport[]): {
  headers: string[];
  values: (string | number | null)[][];
} {
  const fieldKeys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row.fields)) {
      if (!fieldKeys.includes(key)) fieldKeys.push(key);
    }
  }
  fieldKeys.sort();

  const headers = [
    "submitted_at",
    "website",
    "form_type",
    "consent",
    "consent_text",
    "email_status",
    "classification",
    ...fieldKeys.map((k) => `field_${k}`),
  ];

  const values = rows.map((row) => [
    row.createdAt,
    row.websiteName,
    row.formType,
    row.consent ? "yes" : "no",
    row.consentText ?? "",
    row.emailStatus,
    row.classification ?? "",
    ...fieldKeys.map((k) => row.fields[k] ?? ""),
  ]);

  return { headers, values };
}
