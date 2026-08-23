"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { highlight, type TokenKind } from "@/lib/coding/highlight";

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
  string: "text-emerald-400",
  number: "text-sky-400",
  keyword: "text-orange-400",
  builtin: "text-violet-400",
  punctuation: "text-muted",
};

export function CodeBlock({
  code,
  language,
  label,
}: {
  code: string;
  language?: string | null;
  label?: string;
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
    <div className="rounded-xl border border-border bg-panel-hover">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-[11px] uppercase tracking-wider text-muted">
          {label ?? language ?? t("code")}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={t("copy")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? t("copied") : t("copy")}
        </button>
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
