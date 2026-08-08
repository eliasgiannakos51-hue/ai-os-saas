"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plug, Link2, Unlink, ShieldCheck, SearchX, Eye } from "lucide-react";
import { EntityCard, CardGrid, type EntityCardStatus } from "@/components/ui/entity-card";
import { ListLayout } from "@/components/ui/list-layout";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast/toast-context";
import { formatDateTime } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/get-error-message";
import { PROVIDERS, type IntegrationSummary, type ProviderId } from "@/lib/integrations/providers";

/**
 * The integrations surface.
 *
 * Two things it does that a normal list does not:
 *
 * 1. CONSENT IS A STEP, not a checkbox on a card. Pressing Connect opens a
 *    panel that names, in plain language and in the scopes' own words,
 *    what the AI will be able to read — and the user has to press again.
 *    "Το AI θα διαβάζει τα emails σου" is a thing a person should read
 *    before Google's screen, not after.
 * 2. IT SHOWS WHAT WAS ACTUALLY READ. `last_sync_at` plus the audit trail
 *    behind it is the answer to "what has this thing been doing with my
 *    mail", which is the question every integration should be able to
 *    answer and almost none can.
 */
export function IntegrationsList({
  integrations,
  cap,
  configured,
  encryptionReady,
}: {
  integrations: IntegrationSummary[];
  /** Infinity renders as "unlimited". */
  cap: number;
  /** Providers whose OAuth app is set up on this deployment. */
  configured: ProviderId[];
  /** False when INTEGRATION_ENCRYPTION_KEY is missing — connecting is
   *  refused server-side, and saying so here beats a 503 after a redirect. */
  encryptionReady: boolean;
}) {
  const t = useTranslations("dashboard.integrations");
  const tModule = useTranslations("module");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [consentFor, setConsentFor] = useState<ProviderId | null>(null);
  const [busy, setBusy] = useState<ProviderId | null>(null);

  // The OAuth callback redirects back with ?status=… — the only way the
  // user learns the outcome of a round trip through Google.
  const status = searchParams.get("status");
  useEffect(() => {
    if (!status) return;
    const isError = status !== "connected";
    addToast(
      // Every status the callback can produce has its own message; an
      // unknown one falls back rather than rendering a raw code.
      t.has(`status.${status}`) ? t(`status.${status}`) : t("status.error"),
      isError ? "error" : "success"
    );
    router.replace("/dashboard/integrations");
  }, [status, addToast, router, t]);

  const byProvider = useMemo(
    () => new Map(integrations.map((i) => [i.provider, i])),
    [integrations]
  );
  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROVIDERS.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [query]);

  async function disconnect(provider: ProviderId, name: string) {
    if (!window.confirm(t("confirmDisconnect", { name }))) return;
    setBusy(provider);
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(data.error ?? t("disconnectError"), "error");
        return;
      }
      // Reported honestly: if the provider refused the revoke we say so,
      // rather than claiming a clean disconnect we did not achieve.
      addToast(data.revokedAtProvider ? t("disconnectSuccess") : t("disconnectLocalOnly"));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("disconnectError")), "error");
    } finally {
      setBusy(null);
    }
  }

  function statusFor(integration: IntegrationSummary | undefined): EntityCardStatus {
    if (!integration) return { label: t("statusNotConnected"), tone: "neutral" };
    if (integration.status === "connected") return { label: t("statusConnected"), tone: "success" };
    if (integration.status === "revoked") return { label: t("statusRevoked"), tone: "danger" };
    if (integration.status === "expired") return { label: t("statusExpired"), tone: "warning" };
    return { label: t("statusError"), tone: "danger" };
  }

  return (
    <div className="space-y-5">
      <ListLayout
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tModule("searchPlaceholder")}
        meta={
          <span className="text-xs text-muted">
            {Number.isFinite(cap)
              ? t("used", { used: connectedCount, cap })
              : t("usedUnlimited", { used: connectedCount })}
          </span>
        }
      >
        {!encryptionReady && (
          <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-300">
            {t("notConfigured")}
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
        ) : (
          <CardGrid>
            {rows.map((provider, index) => {
              const integration = byProvider.get(provider.id);
              const isConnected = integration?.status === "connected";
              const isAvailable = configured.includes(provider.id) && encryptionReady;

              return (
                <EntityCard
                  key={provider.id}
                  index={index}
                  icon={Plug}
                  accentSlug="automation"
                  title={provider.name}
                  description={t(`providers.${provider.key}.summary`)}
                  status={statusFor(integration)}
                  tags={[
                    {
                      key: "access",
                      label:
                        provider.access === "read"
                          ? t("accessReadOnly")
                          : t("accessReadWrite"),
                      tone: "accent",
                    },
                    ...(integration?.account_label
                      ? [{ key: "account", label: integration.account_label }]
                      : []),
                    ...(integration?.last_sync_at
                      ? [
                          {
                            key: "sync",
                            label: t("lastSync", {
                              when: formatDateTime(integration.last_sync_at, locale),
                            }),
                          },
                        ]
                      : []),
                  ]}
                  menuLabel={tModule("actionsFor", { name: provider.name })}
                  menu={
                    isConnected
                      ? [
                          {
                            key: "disconnect",
                            label: t("disconnect"),
                            icon: Unlink,
                            destructive: true,
                            disabled: busy === provider.id,
                            onSelect: () => void disconnect(provider.id, provider.name),
                          },
                        ]
                      : [
                          {
                            key: "connect",
                            label: t("connect"),
                            icon: Link2,
                            disabled: !isAvailable,
                            onSelect: () => setConsentFor(provider.id),
                          },
                        ]
                  }
                >
                  {/* Transparency, on the card itself rather than behind a
                      link: what the AI can see is the single most important
                      fact about an integration, and it should never require
                      a click to find out. */}
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                      <Eye className="h-3 w-3" aria-hidden="true" />
                      {t("whatAiSees")}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted">
                      {t(`providers.${provider.key}.sees`)}
                    </p>
                    {!isAvailable && (
                      <p className="text-[11px] text-amber-400/80">{t("providerUnavailable")}</p>
                    )}
                  </div>
                </EntityCard>
              );
            })}
          </CardGrid>
        )}
      </ListLayout>

      {consentFor && (
        <ConsentPanel
          providerId={consentFor}
          onCancel={() => setConsentFor(null)}
        />
      )}
    </div>
  );
}

/**
 * The consent step.
 *
 * Deliberately not a one-click "Connect": the next screen the user sees is
 * Google's, and Google's screen describes the SCOPE, not what we will do
 * with it. This is where "the AI will read your email in order to answer
 * questions about it" gets said in our words, before they approve
 * anything.
 *
 * It navigates with a plain link rather than fetch(): the connect endpoint
 * answers with a 302 to the provider, and a redirect is a navigation, not
 * something to unwrap in JavaScript.
 */
function ConsentPanel({
  providerId,
  onCancel,
}: {
  providerId: ProviderId;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard.integrations");
  const provider = PROVIDERS.find((p) => p.id === providerId)!;

  return (
    <section className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="h-4 w-4 text-orange-400" aria-hidden="true" />
        {t("consentTitle", { name: provider.name })}
      </h2>

      <p className="text-sm leading-relaxed text-foreground">
        {t(`providers.${provider.key}.consent`)}
      </p>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">{t("scopesLabel")}</p>
        {/* The scopes verbatim. A user who wants to check what we actually
            asked Google for should not have to trust our paraphrase of it. */}
        <ul className="space-y-0.5">
          {provider.scopes.map((scope) => (
            <li key={scope} className="break-all font-mono text-[11px] text-muted">
              {scope}
            </li>
          ))}
        </ul>
      </div>

      <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
        <li>• {t("consentPointEncrypted")}</li>
        <li>• {t("consentPointAudit")}</li>
        <li>• {t("consentPointRevoke")}</li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/integrations/${provider.id}/connect`}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("consentApprove", { name: provider.name })}
        </a>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
        >
          {t("cancel")}
        </button>
      </div>
    </section>
  );
}
