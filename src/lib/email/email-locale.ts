import "server-only";
import en from "../../../messages/en.json";
import el from "../../../messages/el.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";
import de from "../../../messages/de.json";
import it from "../../../messages/it.json";
import pt from "../../../messages/pt.json";
import zh from "../../../messages/zh.json";
import ja from "../../../messages/ja.json";
import ar from "../../../messages/ar.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * THE LANGUAGE AN EMAIL IS WRITTEN IN.
 *
 * WHAT THIS REPLACES. Every email this product sends was English, for an
 * interface that ships in ten languages, and two modules explained why
 * with a reason that was not true: "the messages/*.json catalogue is not
 * loaded outside a request's locale context". The imports above are that
 * catalogue, at module scope, outside every request. It loads.
 *
 * What was actually missing is the thing this file supplies: the send
 * functions are handed an ADDRESS, not an account, so there was no user
 * to look a language up for. The language itself has been on the account
 * the whole time — lib/locale-preference.ts writes
 * raw_user_meta_data.preferred_locale when somebody changes it, and
 * middleware.ts reads it back on every request.
 *
 * FAILS TO ENGLISH, NEVER THROWS. An email is sent from a catch-block's
 * neighbourhood — a welcome after signup, a warning after a login, a
 * receipt after a cancellation — and the one outcome worse than an email
 * in the wrong language is no email at all. Every path here ends in a
 * string.
 */
const CATALOGUES: Record<string, unknown> = { en, el, es, fr, de, it, pt, zh, ja, ar };

export const EMAIL_LOCALES = Object.keys(CATALOGUES);

/** The account's own language, or English. Never throws. */
export async function emailLocaleFor(userId: string | null | undefined): Promise<string> {
  if (!userId) return "en";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return "en";
    const stored = data.user.user_metadata?.preferred_locale;
    // The same shape middleware.ts accepts: a bare code, matched against
    // what this product actually ships rather than trusted.
    const code = typeof stored === "string" ? stored.split("-")[0].trim().toLowerCase() : "";
    return CATALOGUES[code] ? code : "en";
  } catch (err) {
    logApiError("email:locale", err, { stage: "resolve" });
    return "en";
  }
}

function leaf(catalogue: unknown, key: string): string | null {
  let node: unknown = catalogue;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}

/**
 * A translator for one email.
 *
 * FALLS BACK PER KEY, not per email. A locale that is missing one string
 * — a key added today and translated tomorrow — sends that one line in
 * English inside an otherwise translated message, rather than throwing
 * the whole email away or printing a raw key at somebody.
 *
 * `{name}` placeholders are substituted here rather than through ICU.
 * That is a deliberate narrowing, not an absence: ICU's own escaping rule
 * is what shipped the literal text `{query}` in nine languages
 * (scripts/check-i18n.js fails the build on that shape now), and an email
 * is rendered outside any request, where next-intl's formatter is not
 * available anyway. What ICU would otherwise be needed for is plurals,
 * and `t.n` below does that part with Intl.PluralRules.
 */
export type EmailTranslator = ((key: string, vars?: Record<string, string | number>) => string) & {
  /**
   * The count-dependent form of `key`.
   *
   * `t.n("email.digest.lines.records", 1)` reads
   * `email.digest.lines.records.one`; with 12 it reads `.other`. Which
   * suffix is asked for is Intl.PluralRules' decision, not a `=== 1`
   * ternary, because `=== 1` is the English rule wearing a locale's
   * clothes: Arabic distinguishes six categories, Japanese and Chinese
   * one, and Greek's two do not split where English's do for zero.
   *
   * A form a catalogue does not carry falls back to `.other` in the same
   * language before it falls back to English — an Arabic digest missing
   * its `few` reads Arabic, not English.
   */
  n: (key: string, count: number, vars?: Record<string, string | number>) => string;
};

/**
 * Which plural form a language wants for this number.
 *
 * Never throws: an unknown locale tag would otherwise take down a digest
 * from inside Intl, and the English rule is a survivable wrong answer
 * where no rendered line at all is not.
 */
export function pluralForm(locale: string, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return new Intl.PluralRules("en").select(count);
  }
}

export function emailTranslator(locale: string): EmailTranslator {
  const catalogue = CATALOGUES[locale] ?? en;
  const t = (key: string, vars?: Record<string, string | number>): string => {
    const raw = leaf(catalogue, key) ?? leaf(en, key);
    if (raw === null) {
      // A key that is in NO catalogue is a bug in the caller, not a
      // translation gap. Say which key, in the logs, and send the key
      // rather than an empty line — an empty <h1> is harder to diagnose
      // from an inbox than a visible one.
      logApiError("email:locale", `missing key ${key}`, { locale });
      return key;
    }
    if (!vars) return raw;
    return Object.entries(vars).reduce(
      (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
      raw
    );
  };

  const n = (key: string, count: number, vars?: Record<string, string | number>): string => {
    const form = pluralForm(locale, count);
    // THE LOCALE'S OWN `other` BEFORE ENGLISH ANYTHING. leaf() is asked
    // twice against `catalogue` before t() is allowed to reach for en,
    // because a missing form is a gap in ONE string and falling to
    // English for it would put an English sentence inside a translated
    // list — the exact shape this whole file exists to remove.
    const key2 = leaf(catalogue, `${key}.${form}`) !== null ? `${key}.${form}` : `${key}.other`;
    return t(key2, { count, ...vars });
  };

  return Object.assign(t, { n });
}

/** Right-to-left languages need `dir="rtl"` on the email's root element. */
export function isRtlLocale(locale: string): boolean {
  return locale === "ar";
}
