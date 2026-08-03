"use client";

import { useState } from "react";
import { useCredits } from "@/components/credits/credits-context";

export type CreateResult =
  | { type: "matched"; moduleTitle: string; href: string; message: string }
  | { type: "unmatched"; message: string }
  | { type: "error"; message: string }
  | { type: "needsClarification"; questions: string[] };

// Shared submit logic for the "Create Anything" classifier, used by both
// the lightweight home-page composer (CreateChat) and the full chat-thread
// Create Anything page (AssistantChat) — same /api/create contract, two UIs.
// skipClarification is only ever true on the resubmission after the
// caller has already shown "needsClarification" questions and the user
// answered or explicitly skipped (see lib/clarification.ts) — never set
// on a genuinely first submission. imagePaths (optional, up to
// MAX_ATTACHMENT_IMAGES) are already-uploaded Storage paths — see
// lib/create-attachment-image.ts — sent as real vision context to the
// classifier, same mechanism mission-card.tsx's "Create with AI" inherits
// for free since it calls this same endpoint.
export function useCreateAnything() {
  const [loading, setLoading] = useState(false);
  const { refresh: refreshCredits } = useCredits();

  async function submit(message: string, skipClarification = false, imagePaths: string[] = []): Promise<CreateResult> {
    setLoading(true);
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, skipClarification, imagePaths }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        return { type: "error", message: data.error ?? "Something went wrong." };
      }

      void refreshCredits();

      if (data.needsClarification) {
        return { type: "needsClarification", questions: data.questions as string[] };
      }

      if (data.matched) {
        return {
          type: "matched",
          moduleTitle: data.moduleTitle,
          href: data.href,
          message: data.message,
        };
      }
      return { type: "unmatched", message: data.message };
    } catch {
      return { type: "error", message: "Network error — please try again." };
    } finally {
      setLoading(false);
    }
  }

  return { submit, loading };
}
