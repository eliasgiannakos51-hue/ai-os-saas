"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Layers,
  Loader2,
  MessageCircle,
  Pencil,
  Shuffle,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DetailPanel, type DetailTab } from "@/components/ui/detail-panel";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { OutOfCreditsNotice } from "@/components/credits/out-of-credits-notice";
import { StudioChat } from "@/components/create/studio-chat";
import { useCredits } from "@/components/credits/credits-context";
import { useCreateStudio } from "@/lib/create-studio/use-create-studio";
import { ResumedWorkNotice } from "@/components/jobs/resumed-work-notice";
import { ExamplePrompts } from "@/components/ai/example-prompts";
import {
  CREATE_STUDIO_TYPES,
  estimateCreditsFor,
  timeBucketFor,
  type CreateStudioDetection,
  type CreateStudioType,
} from "@/lib/create-studio/plan";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { iconForSlug, MISSION_ICON, MODULE_ICONS, WEBSITE_BUILDER_ICON } from "@/lib/module-icons";
import { moduleAccent } from "@/lib/module-colors";
import { getErrorMessage } from "@/lib/get-error-message";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";

const MAX_DESCRIPTION_LENGTH = 20000;

type TypeMeta = { icon: LucideIcon; accentSlug: string; labelKey: string };

const TYPE_META: Record<CreateStudioType, TypeMeta> = {
  website: { icon: WEBSITE_BUILDER_ICON, accentSlug: "websiteBuilder", labelKey: "typeWebsite" },
  mission: { icon: MISSION_ICON, accentSlug: "missionControl", labelKey: "typeMission" },
  moduleEntry: { icon: Layers, accentSlug: "createStudio", labelKey: "typeModuleEntry" },
  automation: { icon: MODULE_ICONS.automation, accentSlug: "automation", labelKey: "typeAutomation" },
  document: { icon: FileText, accentSlug: "documents", labelKey: "typeDocument" },
};

type WorkspaceTab = "overview" | "progress" | "chat" | "files";

/**
 * Create Studio — one input, no tool picker.
 *
 * Three phases, in order:
 *
 *   1. the sentence. One box. The user never chooses a tool.
 *   2. the preview. What the system understood, which of the five kinds
 *      it decided that is, roughly how long it takes and roughly what it
 *      costs — then Create / Edit description / Change type. Nothing has
 *      been created and nothing beyond the small detection call has been
 *      charged at this point, which is exactly why a wrong guess here is
 *      cheap to correct.
 *   3. the workspace. Overview / Progress / AI Chat / Files.
 *
 * Every number shown comes from something real: the credit figure runs
 * through the same estimateForAction the creating route reserves against,
 * and the time figure is a coarse RANGE derived from that action's
 * expected output size — never a countdown or a percentage, because
 * nothing here can measure those before the work runs.
 */
export function CreateStudio() {
  const t = useTranslations("dashboard.createStudio");
  const tCommon = useTranslations("common");
  const { accountCreditPriceEur, planSlug } = useCredits();
  const studio = useCreateStudio();

  const [description, setDescription] = useState("");
  const [detection, setDetection] = useState<CreateStudioDetection | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [changingType, setChangingType] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("overview");

  const phase: "input" | "preview" | "workspace" =
    studio.result || studio.steps.length > 0 ? "workspace" : detection ? "preview" : "input";

  const estimatedCredits = useMemo(
    () =>
      detection
        ? estimateCreditsFor(
            detection.type,
            description.trim().length,
            DEFAULTS,
            accountCreditPriceEur ?? undefined,
            planSlug
          )
        : 0,
    [detection, description, accountCreditPriceEur, planSlug]
  );

  const timeBucket = detection ? timeBucketFor(detection.type, description.trim().length) : null;

  async function handleDetect(e: FormEvent) {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed || detecting) return;

    setDetecting(true);
    setDetectError(null);
    setOutOfCredits(false);
    try {
      const res = await fetchWithAuthRetry("/api/create-studio/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDetectError(getErrorMessage(data?.error, t("detectFailed")));
        return;
      }
      if (data.outOfCredits) {
        setOutOfCredits(true);
        return;
      }
      setDetection(data.detection as CreateStudioDetection);
    } catch {
      setDetectError(t("networkError"));
    } finally {
      setDetecting(false);
    }
  }

  function startOver() {
    setDetection(null);
    setDetectError(null);
    setChangingType(false);
    setTab("overview");
    studio.reset();
  }

  function editDescription() {
    setDetection(null);
    setChangingType(false);
  }

  // ---------------------------------------------------------------- input
  if (phase === "input") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-6">
        <div className="text-center">
          <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${moduleAccent("createStudio")}`}>
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t("subtitle")}</p>
        </div>

        {/* WHAT WAS ALREADY ASKED FOR. A create that was still running
            when the user left this page finishes and saves itself — but a
            blank composer looks exactly like a page where nothing was
            started, and the honest response to that is to type it again
            and pay for it twice. */}
        <div className="mt-6">
          <ResumedWorkNotice kind="create" />
        </div>

        <form onSubmit={handleDetect}>
          <label htmlFor="studio-input" className="sr-only">
            {t("inputLabel")}
          </label>
          <textarea
            id="studio-input"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            placeholder={t("inputPlaceholder")}
            rows={3}
            className="input min-h-28 resize-y text-base"
            autoFocus
          />

          {detectError && (
            <p className="mt-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {detectError}
            </p>
          )}
          {outOfCredits && (
            <div className="mt-2">
              <OutOfCreditsNotice />
            </div>
          )}

          {/* FOUR EXAMPLES, one per kind this box can produce.
              Create Studio is the front door and the one place where "you
              write one sentence and it works out what you meant" has to be
              believable before it is used. A page, a plan, an entry and a
              recurring reminder — pressed rather than explained. */}
          <ExamplePrompts surface="createStudio" onPick={setDescription} className="mt-3" />

          <button
            type="submit"
            disabled={detecting || !description.trim()}
            className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {detecting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
            {detecting ? t("detecting") : t("continue")}
          </button>
          <p className="mt-2 text-xs text-muted">{t("noToolPickerHint")}</p>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------- preview
  if (phase === "preview" && detection) {
    const meta = TYPE_META[detection.type];
    const Icon =
      detection.type === "moduleEntry" && detection.moduleSlug
        ? iconForSlug(detection.moduleSlug, meta.icon)
        : meta.icon;
    const accentSlug =
      detection.type === "moduleEntry" && detection.moduleSlug
        ? detection.moduleSlug
        : meta.accentSlug;

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="panel-pop-in rounded-2xl border border-border bg-panel p-5">
          <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${moduleAccent(accentSlug)}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-orange-500/80">
                {t("understoodLabel")}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground">
                {detection.understanding}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-input px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wide text-muted">{t("detectedType")}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {detection.type === "moduleEntry" && detection.moduleSlug
                  ? t("typeModuleEntryNamed", { module: detection.moduleSlug })
                  : t(meta.labelKey)}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-input px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wide text-muted">{t("estimatedTime")}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {timeBucket ? t(`time.${timeBucket}`) : "—"}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-input px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wide text-muted">
                {t("estimatedCredits")}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {estimatedCredits === 0 ? t("noCreditCost") : t("creditsApprox", { count: estimatedCredits })}
              </dd>
            </div>
          </dl>

          {detection.type === "automation" && detection.frequency && (
            <p className="mt-3 rounded-lg border border-border bg-input px-3 py-2 text-xs text-muted">
              {t("automationFrequency", { frequency: t(`frequency.${detection.frequency}`) })}
            </p>
          )}

          {changingType ? (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted">{t("pickTypePrompt")}</p>
              <div className="flex flex-wrap gap-2">
                {CREATE_STUDIO_TYPES.map((type) => {
                  const TypeIcon = TYPE_META[type].icon;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setDetection((prev) =>
                          prev
                            ? {
                                ...prev,
                                type,
                                moduleSlug: type === "moduleEntry" ? prev.moduleSlug : null,
                                frequency: type === "automation" ? prev.frequency ?? "weekly" : null,
                              }
                            : prev
                        );
                        setChangingType(false);
                      }}
                      aria-pressed={type === detection.type}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                        type === detection.type
                          ? "border-orange-500 text-orange-400"
                          : "border-border text-foreground hover:border-orange-500 hover:text-orange-400"
                      }`}
                    >
                      <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {t(TYPE_META[type].labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => studio.create(detection, description.trim())}
              disabled={studio.running}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {studio.running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {t("create")}
            </button>
            <button
              type="button"
              onClick={editDescription}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {t("editDescription")}
            </button>
            <button
              type="button"
              onClick={() => setChangingType((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              {t("changeType")}
            </button>
          </div>

          {studio.error && (
            <p className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {studio.error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ workspace
  const activeDetection = detection!;
  const meta = TYPE_META[activeDetection.type];
  const Icon =
    activeDetection.type === "moduleEntry" && activeDetection.moduleSlug
      ? iconForSlug(activeDetection.moduleSlug, meta.icon)
      : meta.icon;
  const accentSlug =
    activeDetection.type === "moduleEntry" && activeDetection.moduleSlug
      ? activeDetection.moduleSlug
      : meta.accentSlug;

  const website = studio.result?.website ?? null;
  const websiteReady = website?.status === "completed";
  const fileCount = websiteReady ? 1 : 0;

  const tabs: DetailTab[] = [
    { key: "overview", label: t("tabOverview"), icon: FileText },
    { key: "progress", label: t("tabProgress"), icon: Circle, badge: studio.steps.length || undefined },
    { key: "chat", label: t("tabChat"), icon: MessageCircle },
    { key: "files", label: t("tabFiles"), icon: Download, badge: fileCount || undefined },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <DetailPanel
        icon={Icon}
        accentSlug={accentSlug}
        title={studio.result?.title ?? activeDetection.title}
        subtitle={t(meta.labelKey)}
        tabs={tabs}
        activeTab={tab}
        onTabChange={(key) => setTab(key as WorkspaceTab)}
        actions={
          <>
            {studio.result?.href && (
              <Link
                href={studio.result.href}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                {t("openCreated")}
              </Link>
            )}
            <button
              type="button"
              onClick={startOver}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("createAnother")}
            </button>
          </>
        }
      >
        {tab === "overview" && (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-orange-500/80">
                {t("understoodLabel")}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {activeDetection.understanding}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {t("yourRequest")}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">
                {description.trim()}
              </p>
            </div>
            {studio.result?.moduleTitle && (
              <p className="rounded-lg border border-emerald-900/60 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                {t("routedTo", { module: studio.result.moduleTitle })}
              </p>
            )}
            {studio.result?.message && (
              <p className="text-sm text-foreground/90">{studio.result.message}</p>
            )}
            {studio.error && (
              <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                {studio.error}
              </p>
            )}
          </div>
        )}

        {tab === "progress" && (
          <ol className="space-y-2">
            {studio.steps.length === 0 ? (
              <p className="text-sm text-muted">{t("progressEmpty")}</p>
            ) : (
              studio.steps.map((step) => (
                <li
                  key={step.key}
                  className="flex items-start gap-2.5 rounded-xl border border-border bg-input px-3 py-2.5"
                >
                  {step.status === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  ) : step.status === "failed" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                  ) : (
                    <ThinkingIndicator size="sm" className="mt-1" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{t(`progress.${step.labelKey}`)}</p>
                    {step.detail && <p className="mt-0.5 text-xs text-muted">{step.detail}</p>}
                  </div>
                </li>
              ))
            )}
          </ol>
        )}

        {tab === "chat" && (
          <StudioChat
            context={t("chatContext", {
              type: t(meta.labelKey),
              title: studio.result?.title ?? activeDetection.title,
              request: description.trim().slice(0, 500),
            })}
          />
        )}

        {tab === "files" && (
          <div>
            {websiteReady && website ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-input px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {website.name}.html
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => downloadHtml(website.name, website.html_content)}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {tCommon("save")}
                </button>
              </div>
            ) : (
              // Honest empty state: only a generated website produces a
              // downloadable file today. A mission, an entry, an automation
              // and a document all live in the app, not on disk — inventing
              // file rows for them would be showing something that isn't there.
              <p className="text-sm text-muted">{t("filesEmpty")}</p>
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  );
}

function downloadHtml(name: string, html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "website"}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
