"use client";

import { useState } from "react";
import { useCredits } from "@/components/credits/credits-context";
import { createViaJob } from "@/lib/create-studio/create-via-job";

export type CreateResult =
  | { type: "matched"; moduleTitle: string; href: string; message: string }
  | { type: "unmatched"; message: string }
  | { type: "error"; message: string }
  // Distinct from "error" on purpose: running out of credits is not a
  // failure to be retried, it is a state with two specific recovery
  // actions. Collapsing it into "error" is why the routes' outOfCredits
  // flag had no visible effect — the UI showed the same red text as a
  // network drop.
  | { type: "outOfCredits"; message: string }
  | { type: "needsClarification"; questions: string[]; suggestions: string[][] };

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
      // fetchWithAuthRetry (not plain fetch): skipClarification===true
      // means this is the resubmission after a clarifying-questions
      // pause, where a user's access token can realistically expire
      // while they compose real answers. See lib/fetch-with-auth-retry.ts.
      // Started as a background job: the work now outlives this request,
      // so closing the page mid-classification still creates the entry.
      const data = await createViaJob({ message, skipClarification, imagePaths });

      if (!data.ok) {
        if (data.outOfCredits) return { type: "outOfCredits", message: data.message ?? "" };
        return { type: "error", message: data.error ?? "Something went wrong." };
      }

      void refreshCredits();

      if (data.stillRunning) {
        return { type: "unmatched", message: "" };
      }

      if (data.needsClarification) {
        return {
          type: "needsClarification",
          questions: data.questions as string[],
          suggestions: data.questionSuggestions ?? [],
        };
      }

      if (data.matched) {
        return {
          type: "matched",
          moduleTitle: data.moduleTitle ?? "",
          href: data.href ?? "",
          message: data.message ?? "",
        };
      }
      return { type: "unmatched", message: data.message ?? "" };
    } catch {
      return { type: "error", message: "Network error — please try again." };
    } finally {
      setLoading(false);
    }
  }

  return { submit, loading };
}
