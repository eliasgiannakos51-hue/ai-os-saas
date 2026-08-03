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
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-orange-400 underline underline-offset-2"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mb-2 mt-1 text-base font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-1 text-[15px] font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-1 text-sm font-bold first:mt-0">{children}</h3>,
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg border border-border bg-input p-3 text-xs leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isBlock = typeof className === "string" && className.startsWith("language-");
    if (isBlock) {
      return <code className="font-mono">{children}</code>;
    }
    return (
      <code className="rounded bg-input px-1 py-0.5 font-mono text-[13px]">{children}</code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-orange-500/40 pl-3 text-foreground/80 last:mb-0">
      {children}
    </blockquote>
  ),
};

// Memoized: depends only on `content` (a plain string, compared by value),
// so a re-render of the parent list (e.g. chat-workspace.tsx's
// streamingText updating once per streamed delta chunk) no longer forces
// every ALREADY-FINISHED message to re-parse its markdown — only the one
// message whose `content` actually changed does. Pure performance win,
// same rendered output either way.
export const MessageContent = memo(function MessageContent({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
