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

/**
 * WHAT THE BOT SAYS IN DISCORD, FROM THE SAME CATALOGUE AS THE APP
 * (messages/*.json, `discordBot`). Loaded at module scope the way
 * lib/email/email-locale.ts loads it, because an interaction has no
 * request locale. The language is the one Discord says the member uses
 * (`locale` on the interaction, e.g. "el", "en-US", "pt-BR"), cut to our
 * ten; anything else is English. Never throws: a reply in the wrong
 * language beats no reply.
 */
type Catalogue = { discordBot?: Record<string, string> };
const CATALOGUES: Record<string, Catalogue> = { en, el, es, fr, de, it, pt, zh, ja, ar } as Record<string, Catalogue>;

export type BotTextKey = "notLinked" | "notAllowed" | "accountMissing" | "notOpen" | "tooMany" | "ceiling" | "noCredits" | "failed" | "cut" | "unknownCommand" | "empty";

export function botLocale(raw: unknown): string {
  const base = typeof raw === "string" ? raw.slice(0, 2).toLowerCase() : "";
  return base in CATALOGUES ? base : "en";
}

export function botText(locale: string, key: BotTextKey, values: Record<string, string | number> = {}): string {
  const template = CATALOGUES[locale]?.discordBot?.[key] ?? CATALOGUES.en.discordBot?.[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all));
}
