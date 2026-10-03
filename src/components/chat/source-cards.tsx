"use client";

import { useTranslations } from "next-intl";
import { parseWebSources } from "@/lib/chat/web-sources";

/**
 * THE SAME NUMBERS AS THE SENTENCE, ON CARDS UNDER THE ANSWER.
 *
 * Read from the stored text's own definitions (lib/chat/web-sources.ts),
 * so an answer reloaded from the database shows exactly the cards the
 * streamed one did. Title and site only — never the quoted passage, which
 * is the source's words, not the answer's.
 */
export function SourceCards({ content }: { content: string }) {
  const t = useTranslations("dashboard.chat.sources");
  const sources = parseWebSources(content);
  if (sources.length === 0) return null;
  return (
    <div className="source-cards mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">{t("title")}</p>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sources.map((s) => {
          let host = s.url;
          try {
            host = new URL(s.url).hostname.replace(/^www\./, "");
          } catch {
            /* the parser only returns http(s) URLs; this is belt and braces */
          }
          return (
            <li key={s.n}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                data-source={s.n}
                className="flex min-h-[44px] items-start gap-2 rounded-xl bg-panel px-3 py-2 text-xs transition-colors duration-150 hover:bg-panel-hover"
              >
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold tabular-nums text-orange-300">
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 block font-medium text-foreground">{s.title}</span>
                  <span className="block truncate text-muted">{host}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
