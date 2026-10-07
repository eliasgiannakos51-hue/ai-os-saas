"use client";

import { MessageContent } from "@/components/chat/message-content";
import { linkCitations, type CitedSource } from "@/lib/research/cited-markdown";

/**
 * One section of a research report, its [n] markers opening their sources
 * (lib/research/cited-markdown.ts), its Markdown read — the bold, the lists
 * and the headings the report was written with, which the plain-text
 * paragraph showed as asterisks and hashes. Behind the switch
 * "research-slides", on the Research shell and the Research page.
 */
export function CitedBody({ body, sources, className }: { body: string; sources: readonly CitedSource[]; className: string }) {
  return (
    <div data-testid="research-cited-body">
      <MessageContent content={linkCitations(body, sources)} className={className} />
    </div>
  );
}
