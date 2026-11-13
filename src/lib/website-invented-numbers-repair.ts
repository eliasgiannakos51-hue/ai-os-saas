// BOUNDARY-FORMAT: html
// siteLocale()'s \b below is applied to the HTML markup, matching the
// <html lang="xx"> tag's own syntax (<, =) — not a bare word on prose
// (scripts/tests/untrusted-boundaries.test.mjs).
/**
 * THE "FIX AND RE-CHECK" HALF OF BUILD-SPECS.MD §1.5, FOR INVENTED NUMBERS.
 *
 * docs/BUILD-SPECS.md §1.5 "Ποιότητα αποτελέσματος" requires three things
 * for every tool: no invented facts; a visible gap when one is missing, with
 * that said out loud; and everything produced passes a check before
 * delivery — if the check fails, fix and re-check, at most two cycles, then
 * deliver with a clear indication of what did not pass.
 *
 * Before this file, the website builder had the first two thirds and not
 * the third: lib/website-invented-numbers.ts (DETECTOR) finds a fabricated
 * phone/price/time/address/stat, and the editor UI (website-builder-
 * workspace.tsx) already shows the owner a warning banner when one survives
 * (DISCLOSURE). But both API routes that call the detector
 * (api/websites/generate/process, api/websites/edit) only ever logged the
 * finding — the business owner never saw it unless they happened to look at
 * the editor banner, and nothing ever tried to FIX it. Market research,
 * 2026-04: biziq.com/blog/ai-hallucination-data/ (published 2026-04-20,
 * updated 2026-04-29; 600 prompts tested + 565 marketers surveyed) found
 * 36.5% of marketers had AI-hallucinated content published publicly, and
 * over 70% spend hours a week fact-checking AI output by hand — exactly the
 * cost this repair removes for a business's own website.
 *
 * THE FIX, deliberately NOT another AI call: asking a model to rewrite a
 * whole page to remove a few numbers risks a new hallucination, a cost, and
 * a truncated page. Instead this is a literal, deterministic string
 * replacement — each suspect's own flagged text, swapped for a bracketed
 * placeholder in the site's own declared language — reusing the EXACT
 * convention the generation prompt already establishes for a missing fact
 * (lib/website-builder.ts: "a visible, obviously-unfinished placeholder in
 * the language of the site — e.g. [Your phone number] / [Το τηλέφωνό σας].
 * Square brackets, always"). Square brackets are why this is guaranteed to
 * re-check clean: findInventedNumbers's insideBrackets() excuses anything
 * inside [ ] by construction, so a repaired page cannot still be flagged
 * for the same text.
 *
 * NOT A DATABASE COLUMN. user_websites carries no site-language column
 * (checked: supabase/migrations/20260803000000_baseline_schema.sql and
 * every later migration touching user_websites — the closest is
 * generation_notes, which is the OWNER's language for reading notes about
 * the site, not the SITE's own language for its visitors). The one place
 * the site's language is already recorded, reliably, for every site ever
 * generated, is the markup itself: lib/website-builder.ts's prompt sets
 * lang="xx" on <html> for exactly this reason (also used for its dir="rtl"
 * decision). Reading it back off the HTML already in hand needs no new
 * state and cannot go stale against the page it describes.
 *
 * Pure and dependency-free, like the detector it sits on top of — no
 * network, no AI call, no database read.
 */

import { findInventedNumbers, type SuspectNumber } from "@/lib/website-invented-numbers";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/constants";

export type InventedNumbersRepairResult = {
  html: string;
  /** How many distinct suspects (by digits) were placeholdered. 0 means the
   *  page was already clean — nothing to tell the owner. */
  repairedCount: number;
  /** What findInventedNumbers(result.html, brief) still returns after up to
   *  two repair cycles. Empty on success. A caller that still sees entries
   *  here is the "clear indication of what did not pass" §1.5 requires —
   *  it must not drop them silently. */
  remaining: SuspectNumber[];
};

/** One short noun phrase per kind, in the site's own language — the same
 *  "[Your phone number]" shape the generation prompt already asks the
 *  model to write by hand when a fact is missing, so a repaired page reads
 *  exactly like a page the model placeholdered correctly the first time. */
const LABELS: Record<SuspectNumber["kind"], Record<SupportedLocale, string>> = {
  phone: {
    en: "Your phone number",
    el: "Το τηλέφωνό σας",
    es: "Su número de teléfono",
    fr: "Votre numéro de téléphone",
    de: "Ihre Telefonnummer",
    it: "Il tuo numero di telefono",
    pt: "O seu número de telefone",
    zh: "您的电话号码",
    ja: "お電話番号",
    ar: "رقم هاتفك",
  },
  price: {
    en: "Price",
    el: "Τιμή",
    es: "Precio",
    fr: "Prix",
    de: "Preis",
    it: "Prezzo",
    pt: "Preço",
    zh: "价格",
    ja: "価格",
    ar: "السعر",
  },
  time: {
    en: "Opening hours",
    el: "Ώρες λειτουργίας",
    es: "Horario de apertura",
    fr: "Heures d'ouverture",
    de: "Öffnungszeiten",
    it: "Orari di apertura",
    pt: "Horário de funcionamento",
    zh: "营业时间",
    ja: "営業時間",
    ar: "ساعات العمل",
  },
  address: {
    en: "Your address",
    el: "Η διεύθυνσή σας",
    es: "Su dirección",
    fr: "Votre adresse",
    de: "Ihre Adresse",
    it: "Il tuo indirizzo",
    pt: "O seu endereço",
    zh: "您的地址",
    ja: "ご住所",
    ar: "عنوانك",
  },
  stat: {
    en: "Add your own figure",
    el: "Προσθέστε το δικό σας νούμερο",
    es: "Añada su propia cifra",
    fr: "Ajoutez votre propre chiffre",
    de: "Fügen Sie Ihre eigene Zahl hinzu",
    it: "Aggiungi il tuo numero",
    pt: "Adicione o seu próprio número",
    zh: "请填写您自己的数据",
    ja: "ご自身の数値を入力してください",
    ar: "أضف رقمك الخاص",
  },
};

/** Reads the same lang="xx" the generation prompt is instructed to set on
 *  <html> (website-builder.ts) — not a guess, the site's own declaration.
 *  Falls back to the app's own default when absent (a site generated
 *  before this existed, or one the model failed to tag) rather than
 *  guessing from the brief's script, which §1.5's "no invented X" bar
 *  applies to this file's own output too. */
function siteLocale(html: string): SupportedLocale {
  const m = /<html[^>]*\blang\s*=\s*["']([a-zA-Z-]+)["']/.exec(html);
  const code = m?.[1]?.slice(0, 2).toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(code ?? "") ? (code as SupportedLocale) : DEFAULT_LOCALE;
}

function placeholderFor(kind: SuspectNumber["kind"], locale: SupportedLocale): string {
  return `[${LABELS[kind][locale]}]`;
}

/**
 * Deterministically placeholders every invented number findInventedNumbers
 * can find, then re-checks, for up to `maxCycles` rounds (default 2, the
 * §1.5 ceiling).
 *
 * One round is normally enough — `split(text).join(placeholder)` replaces
 * EVERY literal occurrence of a given suspect's exact text in one pass, not
 * just the first, so a phone number repeated in a header and a footer is
 * fixed by the same round. A second round exists for the one case a single
 * pass cannot: a suspect whose repair was itself a substring of a LATER
 * pattern's match in the same text (the detector's own `claimed` spans
 * prevent this inside one findInventedNumbers call, but a brand-new scan of
 * the already-repaired HTML starts those spans over).
 *
 * WHAT THIS CANNOT SEE, same honesty as the detector it sits on: a literal
 * text replace cannot tell a `tel:` href's digits from the same digits
 * typed as a JSON-LD script constant that coincidentally matches — stated
 * here rather than silently "handled", same as the detector's own "WHAT IT
 * CANNOT SEE" paragraph.
 */
export function repairInventedNumbers(html: string, brief: string, maxCycles = 2): InventedNumbersRepairResult {
  let current = html;
  let repairedCount = 0;
  let suspects = findInventedNumbers(current, brief);
  let cycles = 0;

  while (suspects.length > 0 && cycles < maxCycles) {
    const locale = siteLocale(current);
    for (const suspect of suspects) {
      if (!current.includes(suspect.text)) continue; // an earlier replacement in this same round already removed it
      current = current.split(suspect.text).join(placeholderFor(suspect.kind, locale));
      repairedCount++;
    }
    cycles++;
    suspects = findInventedNumbers(current, brief);
  }

  return { html: current, repairedCount, remaining: suspects };
}
