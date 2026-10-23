"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, LogOut, ChevronDown, Search, Plus, Settings, ExternalLink } from "lucide-react";
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

const STORAGE_KEY = "ionexa.codingGitHub";

function restoreSelection(): GitHubSelection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { repo?: string; branch?: string };
      return { repo: parsed.repo ?? null, branch: parsed.branch ?? null };
    }
  } catch {
    // private window or corrupted
  }
  return { repo: null, branch: null };
}

function persistSelection(s: GitHubSelection) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // nothing to persist to
  }
}

export function GitHubConnect({
  selection,
  onSelectionChange,
  isAdmin,
  githubConfigured,
}: {
  selection: GitHubSelection;
  onSelectionChange: (s: GitHubSelection) => void;
  isAdmin: boolean;
  githubConfigured: boolean;
}) {
  const t = useTranslations("coding.github");
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const repoDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restored = restoreSelection();
    if (restored.repo) onSelectionChange(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!githubConfigured) return;
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
  }, [githubConfigured]);

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
            if (def) {
              const next = { ...selection, branch: def.name };
              onSelectionChange(next);
              persistSelection(next);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.repo]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false);
      }
    }
    if (repoDropdownOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [repoDropdownOpen]);

  function selectRepo(fullName: string) {
    const next: GitHubSelection = { repo: fullName, branch: null };
    onSelectionChange(next);
    persistSelection(next);
    setRepoDropdownOpen(false);
    setRepoSearch("");
  }

  function selectBranch(name: string) {
    const next = { ...selection, branch: name };
    onSelectionChange(next);
    persistSelection(next);
    setCreatingBranch(false);
    setNewBranchName("");
  }

  async function createBranch() {
    if (!newBranchName.trim() || !selection.repo) return;
    const baseBranch = branches.find((b) => b.isDefault)?.name ?? "main";
    const res = await fetch("/api/github/create-branch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: selection.repo, baseBranch, newBranch: newBranchName.trim() }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (body?.ok) {
      setBranches((prev) => [{ name: newBranchName.trim(), isDefault: false }, ...prev]);
      selectBranch(newBranchName.trim());
    }
  }

  async function disconnect() {
    await fetch("/api/github/disconnect", { method: "DELETE" });
    setStatus((prev) => (prev ? { ...prev, connected: false, login: null, hasInstallation: false } : prev));
    setRepos([]);
    setBranches([]);
    const next: GitHubSelection = { repo: null, branch: null };
    onSelectionChange(next);
    persistSelection(next);
  }

  if (!githubConfigured && isAdmin) {
    return (
      <div
        data-testid="github-admin-setup"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-warning/40 bg-warning/5 px-3 text-xs text-warning"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("adminSetup")}</span>
        <a
          href="https://docs.github.com/en/apps/creating-github-apps"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline hover:text-foreground"
        >
          {t("adminSetupLink")}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
    );
  }

  if (!githubConfigured) return null;

  if (!status) return null;
  if (!status.available) return null;

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

  const filteredRepos = repoSearch
    ? repos.filter((r) => r.fullName.toLowerCase().includes(repoSearch.toLowerCase()))
    : repos;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="github-connected">
      <div className="inline-flex items-center gap-1.5 text-xs text-muted">
        <GitBranch className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        <span className="font-medium text-foreground">{status.login}</span>
      </div>

      <div className="relative" ref={repoDropdownRef}>
        <button
          type="button"
          onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
          disabled={loadingRepos}
          aria-label={t("repoLabel")}
          data-testid="github-repo-select"
          className="flex h-9 max-w-[14rem] items-center gap-1 rounded-item border border-border bg-transparent px-2 text-xs text-foreground outline-none hover:bg-panel-hover disabled:opacity-40"
        >
          <span className="truncate">{selection.repo ?? t("pickRepo")}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
        </button>
        {repoDropdownOpen && (
          <div className="absolute start-0 top-full z-50 mt-1 w-72 rounded-card border border-border bg-background shadow-lg">
            <div className="flex items-center gap-1.5 border-b border-divider px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              <input
                type="text"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                placeholder={t("searchRepos")}
                autoFocus
                data-testid="github-repo-search"
                className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filteredRepos.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted">{t("noRepos")}</p>
              )}
              {filteredRepos.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectRepo(r.fullName)}
                  data-testid="github-repo-option"
                  className={`flex w-full min-h-[36px] items-center px-3 text-start text-xs hover:bg-panel-hover ${
                    selection.repo === r.fullName ? "bg-panel-hover text-foreground" : "text-body"
                  }`}
                >
                  <span className="truncate">{r.fullName}</span>
                  {r.private && <span className="ms-auto shrink-0 text-[10px] text-muted">private</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selection.repo && (
        <div className="relative">
          {creatingBranch ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder={t("newBranchName")}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createBranch();
                  if (e.key === "Escape") setCreatingBranch(false);
                }}
                data-testid="github-new-branch-input"
                className="h-9 w-40 rounded-item border border-border bg-transparent px-2 text-xs text-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => void createBranch()}
                disabled={!newBranchName.trim()}
                data-testid="github-create-branch"
                className="h-9 rounded-item bg-foreground px-2.5 text-xs text-background hover:opacity-80 disabled:opacity-40"
              >
                {t("create")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <div className="relative">
                <select
                  value={selection.branch ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setCreatingBranch(true);
                      return;
                    }
                    selectBranch(e.target.value);
                  }}
                  disabled={loadingBranches}
                  aria-label={t("branchLabel")}
                  data-testid="github-branch-select"
                  className="h-9 max-w-[12rem] appearance-none rounded-item border border-border bg-transparent pe-6 ps-2 text-xs text-foreground outline-none hover:bg-panel-hover disabled:opacity-40"
                >
                  <option value="">{t("pickBranch")}</option>
                  <option value="__new__">+ {t("newBranch")}</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.isDefault ? ` (${t("default")})` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden="true" />
              </div>
            </div>
          )}
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
