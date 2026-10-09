/**
 * «ΠΛΗΡΩΣΑ 50 ΕΥΡΩ ΡΕΥΜΑ» → AN EXPENSE OF 50, FOR «ρεύμα» (MASTER 16,
 * package 18), behind the switch "finance-sales".
 *
 * READ BY CODE, NOT BY A MODEL. A sentence about money has two things that
 * must be right — the amount and which way it went — and both are words
 * a list can hold: the number next to a currency, and a verb («πλήρωσα»,
 * «εισέπραξα», "paid", "received") in ten languages. So it is free, it is
 * instant, and it is never a guess: when either is missing or doubtful
 * the sentence is NOT written, and the person is asked (api/finance/quick
 * answers 422 with what was missing). A wrong expense in somebody's books
 * costs more than a second sentence.
 *
 * Pure: scripts/tests/finance-sales.test.mjs runs it.
 */

export type MoneyEntry = { type: "income" | "expense"; amount: number; description: string };
export type MoneyReading =
  | { ok: true; entry: MoneyEntry }
  | { ok: false; missing: ("amount" | "type")[]; amount: number | null; type: "income" | "expense" | null };

export const MAX_QUICK_CHARS = 200;
const MAX_AMOUNT = 10_000_000;

/** Accents and case away, so «Πλήρωσα» and «πληρωσα» are one word. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Verbs and phrases, folded. A phrase is matched as words; CJK as text.
const EXPENSE = [
  "πληρωσα", "πληρωσαμε", "εδωσα", "αγορασα", "ξοδεψα", "χρεωθηκα", "πληρωμη",
  "paid", "spent", "bought", "pay for", "expense",
  "pague", "gaste", "compre", "gasto",
  "j'ai paye", "paye", "depense", "achete",
  "bezahlt", "ausgegeben", "gekauft",
  "pagato", "pagata", "speso", "comprato",
  "paguei", "gastei", "comprei", "despesa",
  "付了", "支付", "花了", "买了", "付款",
  "払った", "支払った", "買った", "支払い",
  "دفعت", "اشتريت", "صرفت",
];
const INCOME = [
  "εισεπραξα", "εισπραξα", "πληρωθηκα", "πηρα", "μπηκαν", "εισπραξη",
  "received", "earned", "got paid", "income", "was paid",
  "cobre", "recibi", "gane", "ingreso",
  "recu", "encaisse", "gagne",
  "erhalten", "bekommen", "verdient", "eingenommen",
  "ricevuto", "incassato", "guadagnato",
  "recebi", "ganhei", "receita",
  "收到", "赚了", "进账",
  "受け取った", "もらった", "入金",
  "استلمت", "ربحت", "قبضت",
];
const CURRENCY = /(€|\$|£|ευρω|ευρώ|ευρο|euros?|eur|usd|dollars?|δολαρια|gbp|pounds?|欧元|ユーロ|يورو)/i;
const NUMBER = /\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

function readAmount(raw: string): number | null {
  let s = raw.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : null;
}

function hasWord(folded: string, word: string): boolean {
  if (/[　-鿿؀-ۿ]/.test(word)) return folded.includes(word);
  return new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(folded);
}

export function readMoneySentence(text: string): MoneyReading {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUICK_CHARS);
  const folded = fold(clean);

  // THE AMOUNT: exactly one number in the sentence. Two numbers — «30 και
  // 20 ευρώ», a date beside a price — is a question, not an entry: which
  // one is the money is the person's to say, not this file's to guess.
  const numbers = [...clean.matchAll(NUMBER)].map((m) => ({ raw: m[0], at: m.index ?? 0 }));
  const picked = numbers.length === 1 ? numbers[0] : null;
  const amount = picked ? readAmount(picked.raw) : null;

  // WHICH WAY: one direction named, not both.
  const out = EXPENSE.some((w) => hasWord(folded, w));
  const into = INCOME.some((w) => hasWord(folded, w));
  const type = out === into ? null : out ? "expense" : "income";

  const missing: ("amount" | "type")[] = [];
  if (amount === null) missing.push("amount");
  if (type === null) missing.push("type");
  if (missing.length > 0 || amount === null || type === null) return { ok: false, missing, amount, type };

  // WHAT FOR: the sentence without its amount, its currency and its verb.
  let description = clean;
  if (picked) description = description.slice(0, picked.at) + description.slice(picked.at + picked.raw.length);
  description = description.replace(new RegExp(CURRENCY.source, "gi"), " ");
  for (const w of [...EXPENSE, ...INCOME].sort((a, b) => b.length - a.length)) {
    const foldedNow = fold(description);
    const at = foldedNow.indexOf(w);
    if (at >= 0 && hasWord(foldedNow, w)) description = description.slice(0, at) + description.slice(at + w.length);
  }
  description = description.replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, "").replace(/\s+/g, " ").trim();
  // «για ρεύμα» is «ρεύμα»: a leading "for" says nothing the entry does not.
  description = description.replace(/^(για|στο|στη|στον|στην|for|on|para|por|pour|für|per|de)\s+/iu, "");
  // A bare preposition left over is not a description («για», "for").
  if (description.length < 2 || /^(για|στο|στη|στον|for|on|para|pour|für|per|por|の|买|用于|على)$/iu.test(description)) description = clean;
  return { ok: true, entry: { type, amount, description: description.slice(0, 120) } };
}
