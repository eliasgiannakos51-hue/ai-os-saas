"use client";

import { useCallback, useRef, useState } from "react";
import { useCredits } from "@/components/credits/credits-context";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import { getErrorMessage } from "@/lib/get-error-message";
import type { CreateStudioDetection, CreateStudioType } from "@/lib/create-studio/plan";
import type { UserWebsite } from "@/types/user-website";

/** One real step of the creation, as it actually happened. */
export type StudioProgressStep = {
  key: string;
  /** i18n key under dashboard.createStudio.progress. */
  labelKey: string;
  status: "running" | "done" | "failed";
  /** Free text from the server (an error, a routed module name). */
  detail?: string;
};

export type StudioResult = {
  type: CreateStudioType;
  title: string;
  /** Where the created thing lives, once it exists. */
  href: string | null;
  /** Website Builder only — polled until it leaves pending/processing. */
  website: UserWebsite | null;
  /** Module entry only — the module it was routed into. */
  moduleTitle: string | null;
  /** Anything the creating route said, shown verbatim. */
  message: string | null;
};

const POLL_INTERVAL_MS = 2500;

/**
 * Runs a confirmed Create Studio creation against the SAME per-type route
 * the dedicated pages use.
 *
 * Nothing is reimplemented here: a website goes through
 * /api/websites/generate + /process + status polling exactly as the
 * Website Builder does, a mission through /api/mission/plan, an entry
 * through /api/create, an automation through /api/automations/create, a
 * document through /api/documents. Create Studio is a different door into
 * the same rooms, not a parallel implementation of them — which is also
 * why every credit charge, RLS check and safety review already applies
 * without this file knowing about any of them.
 */
export function useCreateStudio() {
  const { refresh: refreshCredits } = useCredits();
  const [steps, setSteps] = useState<StudioProgressStep[]>([]);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const mountedRef = useRef(true);

  const pushStep = useCallback((step: StudioProgressStep) => {
    setSteps((prev) => [...prev.filter((s) => s.key !== step.key), step]);
  }, []);

  const finishStep = useCallback(
    (key: string, status: "done" | "failed", detail?: string) => {
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, detail } : s)));
    },
    []
  );

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    setError(null);
  }, []);

  const pollWebsite = useCallback(
    function poll(id: string) {
      async function tick() {
        try {
          const res = await fetch(`/api/websites/status?id=${id}`);
          const data = await res.json();
          if (!res.ok || !data.ok) {
            if (mountedRef.current) setTimeout(tick, POLL_INTERVAL_MS);
            return;
          }
          const record = data.record as UserWebsite;
          if (!mountedRef.current) return;
          setResult((prev) => (prev ? { ...prev, website: record } : prev));

          if (record.status === "pending" || record.status === "processing") {
            setTimeout(tick, POLL_INTERVAL_MS);
            return;
          }
          void refreshCredits();
          finishStep(
            "generate",
            record.status === "completed" ? "done" : "failed",
            record.status === "completed" ? undefined : record.error_message ?? undefined
          );
        } catch {
          if (mountedRef.current) setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
      void tick();
    },
    [finishStep, refreshCredits]
  );

  const create = useCallback(
    async (detection: CreateStudioDetection, description: string) => {
      setRunning(true);
      setError(null);
      setSteps([]);
      setResult(null);

      try {
        switch (detection.type) {
          case "website": {
            pushStep({ key: "create", labelKey: "creatingProject", status: "running" });
            const res = await fetchWithAuthRetry("/api/websites/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: detection.title,
                description,
                referenceImagePaths: [],
                // Create Studio already showed the user its restatement and
                // let them edit it before pressing Create, so the separate
                // clarifying-questions pass would ask the same thing twice.
                skipClarification: true,
              }),
            });
            const data = await res.json();
            void refreshCredits();
            if (!res.ok || !data.ok || !data.generated) {
              finishStep("create", "failed");
              setError(getErrorMessage(data?.error ?? data?.message, "Could not start the generation."));
              return;
            }
            const record = data.record as UserWebsite;
            finishStep("create", "done");
            setResult({
              type: "website",
              title: record.name,
              href: `/dashboard/website-builder?project=${record.id}`,
              website: record,
              moduleTitle: null,
              message: null,
            });
            pushStep({ key: "generate", labelKey: "generatingWebsite", status: "running" });
            if (!data.duplicateSuppressed) {
              void fetch("/api/websites/generate/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                body: JSON.stringify({ websiteId: record.id, description, referenceImagePaths: [] }),
              });
            }
            pollWebsite(record.id);
            return;
          }

          case "mission": {
            pushStep({ key: "plan", labelKey: "planningMission", status: "running" });
            const res = await fetchWithAuthRetry("/api/mission/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ goal: description }),
            });
            const data = await res.json();
            void refreshCredits();
            if (!res.ok || !data.ok || !data.planned) {
              finishStep("plan", "failed");
              setError(getErrorMessage(data?.error ?? data?.message, "Could not create a plan."));
              return;
            }
            finishStep("plan", "done");
            setResult({
              type: "mission",
              title: data.mission?.goal ?? detection.title,
              href: "/dashboard/mission",
              website: null,
              moduleTitle: null,
              message: null,
            });
            return;
          }

          case "moduleEntry": {
            pushStep({ key: "route", labelKey: "routingEntry", status: "running" });
            const res = await fetchWithAuthRetry("/api/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: description, skipClarification: true }),
            });
            const data = await res.json();
            void refreshCredits();
            if (!res.ok || !data.ok) {
              finishStep("route", "failed");
              setError(getErrorMessage(data?.error, "Could not create that entry."));
              return;
            }
            if (!data.matched) {
              finishStep("route", "failed", data.message);
              setError(data.message ?? "Could not route that to a module.");
              return;
            }
            finishStep("route", "done", data.moduleTitle);
            setResult({
              type: "moduleEntry",
              title: detection.title,
              href: data.href ?? null,
              website: null,
              moduleTitle: data.moduleTitle ?? null,
              message: data.message ?? null,
            });
            return;
          }

          case "automation": {
            pushStep({ key: "schedule", labelKey: "schedulingAutomation", status: "running" });
            const res = await fetchWithAuthRetry("/api/automations/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                description,
                frequency: detection.frequency ?? "weekly",
                skipClarification: true,
              }),
            });
            const data = await res.json();
            void refreshCredits();
            if (!res.ok || !data.ok) {
              finishStep("schedule", "failed");
              setError(getErrorMessage(data?.error, "Could not schedule that automation."));
              return;
            }
            finishStep("schedule", "done");
            setResult({
              type: "automation",
              title: detection.title,
              href: "/dashboard/automation",
              website: null,
              moduleTitle: null,
              message: data.message ?? null,
            });
            return;
          }

          case "document": {
            pushStep({ key: "document", labelKey: "creatingDocument", status: "running" });
            const res = await fetchWithAuthRetry("/api/documents", { method: "POST" });
            const data = await res.json();
            if (!res.ok || !data.ok || !data.id) {
              finishStep("document", "failed");
              setError(getErrorMessage(data?.error, "Could not create the document."));
              return;
            }
            // Seeds the new document with the user's own sentence as its
            // first paragraph — their words, not generated text, which is
            // the whole distinction between a document and every other
            // type here.
            await fetch(`/api/documents/${data.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: detection.title,
                content: { html: `<p>${escapeHtml(description)}</p>` },
              }),
            });
            finishStep("document", "done");
            setResult({
              type: "document",
              title: detection.title,
              href: `/dashboard/documents/${data.id}`,
              website: null,
              moduleTitle: null,
              message: null,
            });
            return;
          }
        }
      } catch {
        setError("Network error — please try again.");
      } finally {
        setRunning(false);
      }
    },
    [finishStep, pollWebsite, pushStep, refreshCredits]
  );

  return { create, reset, steps, result, error, running, setError, mountedRef };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
