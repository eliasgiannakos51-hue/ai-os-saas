"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plug, RefreshCw, Trash2, ShieldCheck, Send } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLimitText } from "@/lib/errors/use-error-text";
import type { McpServerSummary } from "@/lib/mcp/types";

/**
 * CONNECT BY ADDRESS. A person gives the address of an app that speaks MCP
 * (and a token if it wants one); the AI can then use that app's tools. The
 * rules the screen keeps, each of them also held on the server:
 *
 * - The token goes up once and is never shown again.
 * - A tool the app marked read-only runs when asked; anything else comes
 *   back as a PLAN with a press, and nothing happens before the press.
 * - What the app returns is shown as text. It is data: nothing here runs it
 *   or treats it as an instruction.
 */

type CallResult = { text: string; isError: boolean; truncated: boolean };
type PlanState = {
  say: string;
  tool: string | null;
  args: Record<string, unknown> | null;
  needsApproval: boolean;
  result: CallResult | null;
  credits: number | null;
};

export function McpApps({ initialServers, cap }: { initialServers: McpServerSummary[]; cap: number }) {
  const t = useTranslations("dashboard.integrations.mcp");
  const router = useRouter();
  const { addToast } = useToast();
  const limitText = useLimitText();
  const [servers, setServers] = useState(initialServers);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<Record<string, PlanState | undefined>>({});

  // Literal keys, so the message slicer can bound what this page needs.
  const errors: Record<string, string> = {
    bad_name: t("errors.bad_name"),
    bad_token: t("errors.bad_token"),
    invalid_url: t("errors.invalid_url"),
    not_https: t("errors.not_https"),
    credentials_in_url: t("errors.credentials_in_url"),
    blocked_host: t("errors.blocked_host"),
    too_long: t("errors.too_long"),
    blocked_address: t("errors.blocked_address"),
    unreachable: t("errors.unreachable"),
    timeout: t("errors.timeout"),
    too_large: t("errors.too_large"),
    redirect_refused: t("errors.redirect_refused"),
    unauthorized: t("errors.unauthorized"),
    http_error: t("errors.http_error"),
    protocol: t("errors.protocol"),
    no_tools: t("errors.no_tools"),
    duplicate: t("errors.duplicate"),
    limit: t("errors.limit", { cap }),
    rate_limited: t("errors.rate_limited"),
    encryption_unavailable: t("errors.encryption_unavailable"),
    insufficient_credits: t("errors.insufficient_credits"),
    ai_unavailable: t("errors.ai_unavailable"),
    unusable_plan: t("errors.unusable_plan"),
    approval_required: t("errors.approval_required"),
    empty: t("errors.empty"),
  };
  const say = (code: unknown) => (typeof code === "string" && errors[code]) || t("errors.default");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, token }),
      });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      setServers((list) => [data.server as McpServerSummary, ...list]);
      setName("");
      setUrl("");
      setToken("");
      addToast(t("connected", { name: data.server.name }));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.default")), "error");
    } finally {
      setAdding(false);
    }
  }

  async function refresh(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/mcp/${id}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      if (data.server) setServers((list) => list.map((s) => (s.id === id ? (data.server as McpServerSummary) : s)));
      addToast(t("refreshed"));
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.default")), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(server: McpServerSummary) {
    if (!window.confirm(t("confirmRemove", { name: server.name }))) return;
    setBusy(server.id);
    try {
      const res = await fetch(`/api/mcp/${server.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      setServers((list) => list.filter((s) => s.id !== server.id));
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.default")), "error");
    } finally {
      setBusy(null);
    }
  }

  async function ask(server: McpServerSummary) {
    const text = (asking[server.id] ?? "").trim();
    if (!text) {
      addToast(errors.empty, "error");
      return;
    }
    setBusy(server.id);
    setPlans((p) => ({ ...p, [server.id]: undefined }));
    try {
      const res = await fetch(`/api/mcp/${server.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text }),
      });
      const data = await res.json();
      if (!data.ok) {
        // A limit the platform named is said with the time it opens again.
        addToast(limitText(data) ?? say(data.code), "error");
        return;
      }
      setPlans((p) => ({
        ...p,
        [server.id]: {
          say: data.plan?.say ?? "",
          tool: data.plan?.kind === "call" ? data.plan.tool : null,
          args: data.plan?.kind === "call" ? data.plan.arguments : null,
          needsApproval: data.needsApproval === true,
          result: data.result ?? null,
          credits: typeof data.creditsCharged === "number" ? data.creditsCharged : null,
        },
      }));
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.default")), "error");
    } finally {
      setBusy(null);
    }
  }

  // The press. Only this sends approved: true.
  async function approve(server: McpServerSummary) {
    const plan = plans[server.id];
    if (!plan?.tool || !plan.args) return;
    setBusy(server.id);
    try {
      const res = await fetch(`/api/mcp/${server.id}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: plan.tool, arguments: plan.args, approved: true }),
      });
      const data = await res.json();
      if (!data.ok) {
        addToast(say(data.code), "error");
        return;
      }
      setPlans((p) => ({ ...p, [server.id]: { ...plan, needsApproval: false, result: data.result as CallResult } }));
    } catch (err) {
      addToast(getErrorMessage(err, t("errors.default")), "error");
    } finally {
      setBusy(null);
    }
  }

  function decline(id: string) {
    setPlans((p) => ({ ...p, [id]: undefined }));
  }

  return (
    <section className="mt-8 space-y-4" data-testid="mcp-apps" aria-labelledby="mcp-title">
      <div>
        <h2 id="mcp-title" className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Plug className="h-4 w-4" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t("intro")}</p>
      </div>

      <form onSubmit={add} className="surface-tight space-y-3" data-testid="mcp-add-form">
        <label className="block text-xs text-muted">
          {t("nameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            placeholder={t("namePlaceholder")}
            data-testid="mcp-name"
            className="field-box mt-1 min-h-[44px] w-full px-3"
          />
        </label>
        <label className="block text-xs text-muted">
          {t("urlLabel")}
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            inputMode="url"
            required
            placeholder={t("urlPlaceholder")}
            data-testid="mcp-url"
            className="field-box mt-1 min-h-[44px] w-full px-3"
          />
        </label>
        <label className="block text-xs text-muted">
          {t("tokenLabel")}
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            autoComplete="off"
            data-testid="mcp-token"
            className="field-box mt-1 min-h-[44px] w-full px-3"
          />
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t("tokenHint")}
          </span>
        </label>
        <button
          type="submit"
          disabled={adding}
          data-testid="mcp-add"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-foreground px-3 text-xs font-medium text-background hover:opacity-80 disabled:opacity-50"
        >
          {adding ? t("adding") : t("add")}
        </button>
      </form>

      {servers.length === 0 ? (
        <p className="text-xs text-muted" data-testid="mcp-empty">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {servers.map((server) => {
            const plan = plans[server.id];
            return (
              <li key={server.id} className="surface-tight space-y-3" data-testid="mcp-server">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{server.name}</p>
                    <p className="break-all text-[11px] text-muted">{server.host}</p>
                    <p className="text-[11px] text-muted">
                      {t("toolsCount", { count: server.tools.length })}
                      {server.hasToken ? ` · ${t("tokenStored")}` : ""}
                      {server.status === "error" ? ` · ${t("statusError")}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => refresh(server.id)}
                      disabled={busy === server.id}
                      aria-label={t("refresh")}
                      title={t("refresh")}
                      className="flex h-11 w-11 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(server)}
                      disabled={busy === server.id}
                      aria-label={t("remove")}
                      title={t("remove")}
                      data-testid="mcp-remove"
                      className="flex h-11 w-11 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <ul className="flex flex-wrap gap-1.5" aria-label={t("toolsLabel")}>
                  {server.tools.map((tool) => (
                    <li key={tool.name} className="rounded-item bg-panel-hover px-2 py-1 text-[11px] text-foreground" title={tool.description}>
                      {tool.name}
                      <span className="ms-1 text-muted">{tool.readOnly ? t("readOnly") : t("needsPress")}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <input
                    value={asking[server.id] ?? ""}
                    onChange={(e) => setAsking((a) => ({ ...a, [server.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void ask(server);
                      }
                    }}
                    maxLength={2000}
                    placeholder={t("askPlaceholder")}
                    aria-label={t("askLabel")}
                    data-testid="mcp-ask-input"
                    className="field-box min-h-[44px] min-w-0 flex-1 px-3"
                  />
                  <button
                    type="button"
                    onClick={() => ask(server)}
                    disabled={busy === server.id}
                    data-testid="mcp-ask"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-foreground px-3 text-xs font-medium text-background hover:opacity-80 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("ask")}
                  </button>
                </div>

                {plan && (
                  <div className="space-y-2 pt-1" data-testid="mcp-plan">
                    {plan.say && <p className="text-xs text-foreground">{plan.say}</p>}
                    {plan.tool === null && !plan.say && <p className="text-xs text-muted">{t("none")}</p>}
                    {plan.tool && (
                      <p className="break-all text-[11px] text-muted">
                        {t("willCall")} <span className="text-foreground">{plan.tool}</span> {JSON.stringify(plan.args)}
                      </p>
                    )}
                    {plan.needsApproval && (
                      <div className="space-y-2" data-testid="mcp-approval">
                        <p className="text-[11px] text-warning">{t("approvalNote")}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => approve(server)}
                            disabled={busy === server.id}
                            data-testid="mcp-approve"
                            className="inline-flex min-h-[44px] items-center rounded-item bg-foreground px-3 text-xs font-medium text-background hover:opacity-80 disabled:opacity-50"
                          >
                            {t("approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => decline(server.id)}
                            className="inline-flex min-h-[44px] items-center rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover"
                          >
                            {t("decline")}
                          </button>
                        </div>
                      </div>
                    )}
                    {plan.result && (
                      <div data-testid="mcp-result">
                        <p className="text-[11px] text-muted">
                          {plan.result.isError ? t("errorResult") : t("resultTitle")} · {t("resultNote")}
                          {plan.result.truncated ? ` · ${t("truncated")}` : ""}
                        </p>
                        <pre className="field-box mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 text-xs">{plan.result.text}</pre>
                      </div>
                    )}
                    {plan.credits !== null && plan.credits > 0 && <p className="text-[11px] text-muted">{t("credits", { credits: plan.credits })}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted">{t("limitNote", { cap })}</p>
    </section>
  );
}
