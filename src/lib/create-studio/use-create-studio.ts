"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCredits } from "@/components/credits/credits-context";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import { getErrorMessage } from "@/lib/get-error-message";
import { createViaJob } from "@/lib/create-studio/create-via-job";
import { startAndWatchJob } from "@/lib/jobs/start-and-watch";
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
  const tCommon = useTranslations("common");
  const tStudio = useTranslations("dashboard.createStudio");
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
            // PLANNING IS A BACKGROUND JOB and this branch did not know it.
            //
            // The route stopped answering `{ planned: true, mission }` and
            // started answering 202 `{ jobId }` when mission planning moved
            // into a worker. This code kept testing `data.planned`, which is
            // now never present — so every single Create Studio mission
            // ended at "Could not create a plan." while the worker went on
            // to plan it and charge for it. The user's honest next move is
            // to press the button again, and that is a second charge for a
            // plan they already own. Awaiting the job is the fix; the
            // failure was never in the planner.
            pushStep({ key: "plan", labelKey: "planningMission", status: "running" });
            const outcome = await startAndWatchJob("/api/mission/plan", { goal: description });
            void refreshCredits();
            if (!outcome.ok) {
              // "still_running" is not a failure: the worker is fine and
              // this page stopped watching. Sending the user to the
              // missions list is the truthful answer, because that is
              // where the plan appears.
              if (outcome.code === "still_running") {
                finishStep("plan", "done");
                setResult({
                  type: "mission",
                  title: detection.title,
                  href: "/dashboard/mission",
                  website: null,
                  moduleTitle: null,
                  message: null,
                });
                return;
              }
              finishStep("plan", "failed");
              setError(getErrorMessage(outcome.error, "Could not create a plan."));
              return;
            }
            const planned = outcome.result as { planned?: boolean; message?: string; mission?: { goal?: string } };
            if (!planned.planned) {
              finishStep("plan", "failed");
              setError(planned.message ?? "Could not create a plan.");
              return;
            }
            finishStep("plan", "done");
            setResult({
              type: "mission",
              title: planned.mission?.goal ?? detection.title,
              href: "/dashboard/mission",
              website: null,
              moduleTitle: null,
              message: null,
            });
            return;
          }

          case "moduleEntry": {
            pushStep({ key: "route", labelKey: "routingEntry", status: "running" });
            const data = await createViaJob({ message: description, skipClarification: true });
            void refreshCredits();
            if (!data.ok) {
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

          case "agent": {
            // THROUGH /api/agents/build, not around it.
            //
            // That route is where the agent cap for the plan, the credit
            // reservation, the rate limit and the circuit breaker live. A
            // second "create an agent" path in this file would be a second
            // place all four have to stay correct, and the first one to be
            // forgotten in a later edit — the same reasoning that made
            // every other branch here call the feature's own route.
            //
            // NOT skipClarification. Every other branch skips it because
            // the studio preview already restated the request, but an
            // agent's schedule, its delivery address and what counts as
            // "the news" are things the preview never asked about, and
            // getting them wrong produces something that spends credits
            // every morning. The questions are answerable on the Agents
            // page, which is where this branch sends the user anyway.
            pushStep({ key: "design", labelKey: "designingAgent", status: "running" });
            const outcome = await startAndWatchJob("/api/agents/build", { request: description });
            void refreshCredits();

            // Every exit below lands on /dashboard/agents and NONE of them
            // marks the job consumed. That is deliberate: the page reads
            // /api/jobs?kind=agent_build on mount and restores whatever
            // the build produced — the draft to confirm, or the clarifying
            // questions to answer — so the work follows the user there
            // instead of being stranded on this screen.
            const toAgents = (title: string, message: string | null) => {
              setResult({
                type: "agent",
                title,
                href: "/dashboard/agents",
                website: null,
                moduleTitle: null,
                message,
              });
            };

            if (!outcome.ok) {
              // The worker is fine, this page stopped watching. Sending
              // them to the Agents page is the truthful answer, because
              // that is where the draft appears.
              if (outcome.code === "still_running") {
                finishStep("design", "done");
                toAgents(detection.title, tStudio("agentDraftWaiting"));
                return;
              }
              finishStep("design", "failed");
              setError(getErrorMessage(outcome.error, tStudio("agentBuildFailed")));
              return;
            }

            const built = (outcome.result ?? {}) as {
              built?: boolean;
              needsClarification?: boolean;
              error?: string;
              draft?: { name?: string };
            };
            // A build that came back asking questions is not a failure —
            // it is the step doing its job, and the answers belong on the
            // Agents page.
            if (built.needsClarification) {
              finishStep("design", "done");
              toAgents(detection.title, tStudio("agentNeedsAnswers"));
              return;
            }
            if (!built.built) {
              finishStep("design", "failed");
              setError(built.error ?? tStudio("agentBuildFailed"));
              return;
            }
            finishStep("design", "done");
            toAgents(built.draft?.name ?? detection.title, tStudio("agentDraftWaiting"));
            return;
          }
        }
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setRunning(false);
      }
    },
    [finishStep, pollWebsite, pushStep, refreshCredits, tCommon, tStudio]
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
