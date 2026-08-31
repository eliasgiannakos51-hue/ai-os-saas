"use client";

import { useCallback, useRef, useState } from "react";
import { escapeHtml } from "@/lib/html-escape";
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
  /**
   * WHERE IT WENT, as the sidebar's own key for that place.
   *
   * V4.6 #11.3. The report was "I said something to the AI, it put the
   * post somewhere else, I did not understand what it does there" — and
   * the link that was there said "Open it", which names nothing. All six
   * types shared that one string, so the only type that told you the
   * destination was moduleEntry, and only through a separate line.
   *
   * The sidebar's key rather than a literal: the destination is a place
   * in this app and it already has a translated name in ten languages.
   * Writing a second one here is how "Goals & Plans" in the nav becomes
   * "Mission Control" in a confirmation.
   */
  destinationKey: string | null;
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
              destinationKey: "sidebar.items.websiteBuilder",
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
                  destinationKey: "sidebar.items.missionControl",
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
            const planned = outcome.result as {
              planned?: boolean;
              message?: string;
              // `id` as well as `goal` — the job handler has always
              // returned the whole inserted row (jobs/handlers/
              // mission-plan.ts does `.select("*").single()`), and this
              // cast was what narrowed it away. Without the id the
              // confirmation could only offer the list.
              mission?: { id?: string; goal?: string };
            };
            if (!planned.planned) {
              finishStep("plan", "failed");
              setError(planned.message ?? "Could not create a plan.");
              return;
            }
            finishStep("plan", "done");
            setResult({
              type: "mission",
              title: planned.mission?.goal ?? detection.title,
              // AT THE PLAN, not at the list of plans — V4.6 #11.3.
              // components/mission/mission-list.tsx reads `?mission=` and
              // opens the detail panel for it. The still_running branch
              // above keeps the bare list URL on purpose: there is no id
              // yet, because this page stopped watching before the row
              // came back.
              href: planned.mission?.id
                ? `/dashboard/mission?mission=${encodeURIComponent(planned.mission.id)}`
                : "/dashboard/mission",
              destinationKey: "sidebar.items.missionControl",
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
              // The module's own name, already resolved by the route that
              // classified it — so this is the same word the nav uses.
              destinationKey: data.moduleTitleKey ?? null,
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
              // AT THE AUTOMATION — V4.6 #11.3. /api/automations/create
              // returns the inserted row (and the existing one on the
              // duplicate-suppressed path, which is the right target
              // too: the user asked for that automation and it is
              // already there). components/automation/
              // automation-active-list.tsx scrolls to `?automation=` and
              // marks it; there is no detail view to open because an
              // automation does not have one.
              href: data.automation?.id
                ? `/dashboard/automation?automation=${encodeURIComponent(String(data.automation.id))}`
                : "/dashboard/automation",
              destinationKey: "sidebar.items.automation",
              website: null,
              moduleTitle: null,
              message: data.message ?? null,
            });
            return;
          }

          case "agent": {
            // THE AGENT BUILDER ALREADY EXISTS, and Create Studio could not
            // reach it. "agent" was not one of the kinds detection could
            // return, and Create Studio has no "none" — so a request for an
            // agent came back as the closest OTHER kind (usually an
            // automation, because both recur) and the user was handed
            // something they did not ask for.
            //
            // Two calls, in this order, because that is the shape the
            // feature already has: /api/agents/build DESIGNS (one AI call,
            // charged) and /api/agents SAVES (no AI call, charges nothing).
            // The per-plan agent cap is checked by the build route BEFORE
            // it starts the job, so a capped account is refused without
            // paying for a design it cannot keep.
            pushStep({ key: "designAgent", labelKey: "designingAgent", status: "running" });
            const outcome = await startAndWatchJob("/api/agents/build", {
              request: description,
              // Create Studio already showed its restatement and let the
              // user edit it, so the clarifying pass would ask twice.
              skipClarification: true,
              // The agent's schedule is stored with a timezone; without
              // this every agent would run on UTC and "every morning"
              // would arrive at the wrong hour.
              timezone: resolveTimeZone(),
            });
            void refreshCredits();

            if (!outcome.ok) {
              // Not a failure: the worker is still designing and this page
              // stopped watching. The agents list is where it appears.
              if (outcome.code === "still_running") {
                finishStep("designAgent", "done");
                setResult({
                  type: "agent",
                  title: detection.title,
                  href: "/dashboard/agents",
                  destinationKey: "sidebar.items.agents",
                  website: null,
                  moduleTitle: null,
                  message: null,
                });
                return;
              }
              finishStep("designAgent", "failed");
              setError(getErrorMessage(outcome.error, tStudio("agentDesignFailed")));
              return;
            }

            const built = outcome.result as {
              built?: boolean;
              draft?: Record<string, unknown>;
              error?: string;
            };
            if (!built.built || !built.draft) {
              finishStep("designAgent", "failed");
              setError(built.error ?? tStudio("agentDesignFailed"));
              return;
            }
            finishStep("designAgent", "done");

            pushStep({ key: "saveAgent", labelKey: "savingAgent", status: "running" });
            const res = await fetchWithAuthRetry("/api/agents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ draft: built.draft }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok || !data.agent?.id) {
              // The design was charged and this save was not. Say so —
              // silently reporting "could not create" would leave the user
              // to guess whether they were billed.
              finishStep("saveAgent", "failed");
              setError(getErrorMessage(data?.error, tStudio("agentSaveFailed")));
              return;
            }
            finishStep("saveAgent", "done");
            setResult({
              type: "agent",
              // The builder's own name for it, which is what the agents
              // list will show — not the detector's guess.
              title: typeof built.draft.name === "string" ? built.draft.name : detection.title,
              href: `/dashboard/agents?agent=${data.agent.id}`,
              destinationKey: "sidebar.items.agents",
              website: null,
              moduleTitle: null,
              message: null,
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
              destinationKey: "sidebar.items.documents",
              website: null,
              moduleTitle: null,
              message: null,
            });
            return;
          }

          default: {
            // EXHAUSTIVENESS, enforced by the compiler.
            //
            // This switch had no default and no never-check, so adding a
            // sixth kind to CREATE_STUDIO_TYPES compiled cleanly and did
            // NOTHING at runtime — press Create, watch the spinner stop,
            // no result, no error. That is how "agent" could be added to
            // the list and still not be creatable. `never` makes the next
            // kind a compile error instead of a silent no-op.
            const exhaustive: never = detection.type;
            void exhaustive;
            setError(tStudio("unsupportedType"));
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

/**
 * This browser's IANA timezone, or UTC.
 *
 * An agent's schedule is stored WITH a timezone; without one, "every
 * morning" is 08:00 UTC, which for the account this product is built
 * around is three hours before the morning it meant.
 */
function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

