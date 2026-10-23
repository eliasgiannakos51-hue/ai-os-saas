"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, LogOut, ChevronDown } from "lucide-react";
import type { GitHubRepo, GitHubBranch } from "@/lib/github/types";

type GitHubStatus = {
  available: boolean;
  connected: boolean;
  login: string | null;
  hasInstallation: boolean;
};

export type GitHubSelection = {
  repo: string | null;
  branch: string | null;
};

export function GitHubConnect({
  selection,
  onSelectionChange,
}: {
  selection: GitHubSelection;
  onSelectionChange: (s: GitHubSelection) => void;
}) {
  const t = useTranslations("coding.github");
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/github/status")
      .then((r) => r.json())
      .then((body: { ok?: boolean; available?: boolean; connected?: boolean; login?: string; hasInstallation?: boolean }) => {
        if (!active) return;
        if (!body.ok || !body.available) {
          setStatus({ available: false, connected: false, login: null, hasInstallation: false });
          return;
        }
        setStatus({
          available: true,
          connected: body.connected === true,
          login: body.login ?? null,
          hasInstallation: body.hasInstallation === true,
        });
      })
      .catch(() => {
        if (active) setStatus({ available: false, connected: false, login: null, hasInstallation: false });
      });
    return () => { active = false; };
  }, []);

  const fetchRepos = useCallback(() => {
    setLoadingRepos(true);
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((body: { ok?: boolean; repos?: GitHubRepo[] }) => {
        if (body.ok && body.repos) setRepos(body.repos);
      })
      .catch(() => {})
      .finally(() => setLoadingRepos(false));
  }, []);

  useEffect(() => {
    if (status?.connected && status.hasInstallation) fetchRepos();
  }, [status, fetchRepos]);

  useEffect(() => {
    if (!selection.repo) {
      setBranches([]);
      return;
    }
    setLoadingBranches(true);
    fetch(`/api/github/branches?repo=${encodeURIComponent(selection.repo)}`)
      .then((r) => r.json())
      .then((body: { ok?: boolean; branches?: GitHubBranch[] }) => {
        if (body.ok && body.branches) {
          setBranches(body.branches);
          if (!selection.branch) {
            const def = body.branches.find((b) => b.isDefault);
            if (def) onSelectionChange({ ...selection, branch: def.name });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.repo]);

  async function disconnect() {
    await fetch("/api/github/disconnect", { method: "DELETE" });
    setStatus((prev) => (prev ? { ...prev, connected: false, login: null, hasInstallation: false } : prev));
    setRepos([]);
    setBranches([]);
    onSelectionChange({ repo: null, branch: null });
  }

  if (!status || !status.available) return null;

  if (!status.connected) {
    return (
      <a
        href="/api/github/connect"
        data-testid="github-connect-button"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
      >
        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
        {t("connect")}
      </a>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="github-connected">
      <div className="inline-flex items-center gap-1.5 text-xs text-muted">
        <GitBranch className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        <span className="font-medium text-foreground">{status.login}</span>
      </div>

      <div className="relative">
        <select
          value={selection.repo ?? ""}
          onChange={(e) => onSelectionChange({ repo: e.target.value || null, branch: null })}
          disabled={loadingRepos}
          aria-label={t("repoLabel")}
          data-testid="github-repo-select"
          className="h-9 max-w-[12rem] appearance-none rounded-item border border-border bg-transparent pe-6 ps-2 text-xs text-foreground outline-none hover:bg-panel-hover disabled:opacity-40"
        >
          <option value="">{t("pickRepo")}</option>
          {repos.map((r) => (
            <option key={r.id} value={r.fullName}>
              {r.fullName}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute end-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden="true" />
      </div>

      {selection.repo && (
        <div className="relative">
          <select
            value={selection.branch ?? ""}
            onChange={(e) => onSelectionChange({ ...selection, branch: e.target.value || null })}
            disabled={loadingBranches}
            aria-label={t("branchLabel")}
            data-testid="github-branch-select"
            className="h-9 max-w-[10rem] appearance-none rounded-item border border-border bg-transparent pe-6 ps-2 text-xs text-foreground outline-none hover:bg-panel-hover disabled:opacity-40"
          >
            <option value="">{t("pickBranch")}</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}{b.isDefault ? ` (${t("default")})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute end-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden="true" />
        </div>
      )}

      <button
        type="button"
        onClick={() => void disconnect()}
        aria-label={t("disconnect")}
        data-testid="github-disconnect"
        className="inline-flex h-9 items-center gap-1 rounded-item px-2 text-xs text-muted hover:bg-panel-hover hover:text-danger"
      >
        <LogOut className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
