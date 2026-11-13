import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Assistant replies only — user messages stay plain text (rendered
// directly, no markdown parsing) since they're never meant to contain
// formatting. No syntax-highlighting library here: block code just gets
// clean monospace styling via the `pre` override below, distinguished from
// inline `code` spans by the `language-*` class remark adds to fenced
// blocks — full per-token highlighting would need an extra heavy
// dependency, so it's left out.

/**
 * Whether a markdown image's `src` is one a chat answer may show:
 * same-origin, inline data, or a chat attachment's own blob preview —
 * the first three sources of the app's CSP `img-src` (next.config.mjs,
 * APP_SECURITY_HEADERS, ΑΣ2-3.1) and none of the hosts after them (the
 * project's Supabase and Unsplash's CDN, FD6, 2026-11-05), which serve
 * other screens and never a chat answer. No chat feature puts an
 * external-host image into an answer — a model's own words, an echoed
 * web-search result, or a PDF's text can, and that is exactly what this
 * rejects, same defense-in-depth belt as `frame-ancestors`+X-Frame-Options.
 */
export function isAllowedChatImageSrc(src: unknown): boolean {
  if (typeof src !== "string" || src.length === 0) return false;
  // "//host/…" is protocol-relative — a real external origin, not
  // same-origin, and startsWith("/") alone would have let it through.
  if (src.startsWith("//")) return false;
  // Hardening (2026-11-05): the URL parser reads a backslash after the
  // first slash as a slash, so this is the same address as the line above.
  if (src.startsWith("/\\")) return false;
  return src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/");
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 ps-5">{children}</ol>,
  li: ({ children }) => <li className="ps-0.5">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-2"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mb-2 mt-1 text-base font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-1 text-[15px] font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-1 text-sm font-bold first:mt-0">{children}</h3>,
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-item border border-border bg-workspace p-3 text-xs leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isBlock = typeof className === "string" && className.startsWith("language-");
    if (isBlock) {
      return <code className="font-mono">{children}</code>;
    }
    return (
      <code className="rounded-item bg-input px-1 py-0.5 font-mono text-[13px]">{children}</code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-s-2 border-foreground/40 ps-3 text-foreground/80 last:mb-0">
      {children}
    </blockquote>
  ),
  img: ({ src, alt }) => (isAllowedChatImageSrc(src) ? <img src={src as string} alt={alt ?? ""} className="max-w-full rounded-item" /> : null),
};

// Memoized: depends only on `content` (a plain string, compared by value),
// so a re-render of the parent list (e.g. chat-workspace.tsx's
// streamingText updating once per streamed delta chunk) no longer forces
// every ALREADY-FINISHED message to re-parse its markdown — only the one
// message whose `content` actually changed does. Pure performance win,
// same rendered output either way.
export const MessageContent = memo(function MessageContent({
  content,
  // THE SIZE IS THE CALLER'S — V4.6 #12. It was hard-coded `text-sm`
  // here, which is right for the four surfaces that render this inside a
  // fixed-width panel (ask-ai-modal, mission-detail, studio-chat,
  // reflection-generator) and wrong for the chat thread, whose whole
  // width rule is expressed in `ch`. `ch` is the width of "0" AT THE
  // ELEMENT'S OWN FONT SIZE, so a container capped at 68ch wrapping text
  // fixed at 14px caps a different number of characters than it says it
  // does. The chat passes no size and lets the measured container
  // cascade; everybody else keeps exactly what they had.
  className = "text-sm leading-relaxed",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
