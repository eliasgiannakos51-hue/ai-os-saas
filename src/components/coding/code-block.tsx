"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download } from "lucide-react";
import { highlight, type TokenKind } from "@/lib/coding/highlight";
import { downloadTextFile, suggestedFileName } from "@/lib/coding/download";

// TOKENS TO <span>, never markup to innerHTML.
//
// lib/coding/highlight.ts explains why the highlighter returns tokens
// instead of an HTML string: the alternative is calling
// dangerouslySetInnerHTML on text a user pasted, on a page inside their
// own session, and trusting a library's escaping in every language mode
// forever. Here the code goes through React's normal text handling like
// any other string, so a highlighting bug stays a highlighting bug.

const CLASSES: Record<TokenKind, string> = {
  plain: "text-foreground",
  comment: "text-muted italic",
  string: "text-success",
  number: "text-muted",
  keyword: "text-foreground",
  builtin: "text-muted",
  punctuation: "text-muted",
};

export function CodeBlock({
  code,
  language,
  label,
  fileName,
}: {
  code: string;
  language?: string | null;
  label?: string;
  /** The path to suggest when downloading — null draws one from the
   *  language instead (see lib/coding/download.ts). */
  fileName?: string | null;
}) {
  const t = useTranslations("coding");
  const [copied, setCopied] = useState(false);
  const tokens = highlight(code, language);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      // Reverts on its own: a tick that stays forever stops meaning "just
      // now" and starts meaning nothing.
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // A clipboard write can be refused (permission, an insecure
      // origin). The text is still selectable, so the failure is a
      // missing convenience rather than a lost result — and pretending it
      // worked would be worse than the button doing nothing visible.
      setCopied(false);
    }
  }

  return (
    <div className="code-panel">
      <div className="code-panel-header">
        <span className="break-words text-[11px] uppercase tracking-wider text-muted">
          {label ?? language ?? t("code")}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => downloadTextFile(code, suggestedFileName(fileName ?? null, language ?? null))}
            aria-label={t("download")}
            data-testid="coding-download"
            className="code-action-button"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            {t("download")}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={t("copy")}
            data-testid="coding-copy"
            className="code-action-button"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      </div>
      {/* SCROLLS INSIDE ITSELF. A long line in a paste must not make the
          whole page scroll sideways. */}
      <pre className="overflow-x-auto px-3 py-3 text-xs leading-relaxed">
        <code>
          {tokens.map((token, index) => (
            <span key={index} className={CLASSES[token.kind]}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
