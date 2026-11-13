// Input grammar for the GitHub routes (2026-11-05, SECURITY-AUDIT ΑΣ-1.15).
//
// Everything a request names — the repository, a pull request number, a
// branch, a path inside the repository — is checked here BEFORE any URL is
// built from it. Each function returns null/false for anything outside the
// grammar, so a route refuses with 400 instead of passing the text on.
//
// WHY A PATH IS CHECKED SEGMENT BY SEGMENT. encodeURIComponent leaves "."
// and ".." as they are, and the URL parser in fetch() resolves them, so a
// segment of either kind would change which URL is asked for. This file
// refuses them; lib/github/permission.ts's one-repository token is the
// second wall, since GitHub refuses it anywhere but its own repository.
//
// Pure functions with no imports: scripts/tests/github-repo-access.test.mjs
// runs every one of them against the edge cases it exists for.

/** GitHub's account-login grammar: 1–39 letters, digits or hyphens, not
 *  starting or ending with a hyphen. */
const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** GitHub's repository-name grammar: 1–100 letters, digits, ".", "_" or "-".
 *  "." and ".." are refused separately: GitHub does not allow them as names
 *  and here they would be path segments. */
const GITHUB_REPO_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export type RepoTarget = { owner: string; name: string };

/** "owner/name", exactly two parts, each in GitHub's grammar. */
export function parseRepoFullName(raw: unknown): RepoTarget | null {
  if (typeof raw !== "string" || raw.length > 140) return null;
  const parts = raw.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!GITHUB_OWNER_RE.test(owner)) return null;
  if (!GITHUB_REPO_NAME_RE.test(name) || name === "." || name === "..") return null;
  return { owner, name };
}

/** A pull request number: a positive safe integer, given as a number (JSON
 *  body) or as digits only (query string) — no sign, no exponent, no
 *  leading zero, no surrounding text. */
export function parsePullNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === "string" && /^[1-9][0-9]{0,15}$/.test(raw)) {
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/** A branch name git itself would accept (the rules of
 *  `git check-ref-format --branch` that a name can break on its own). */
export function isValidBranchName(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 255) return false;
  // Control characters, space, and git's forbidden set ~ ^ : ? * [ \
  if (/[\u0000- \u007f~^:?*[\\]/.test(raw)) return false;
  if (raw.includes("..") || raw.includes("@{") || raw.includes("//")) return false;
  if (raw === "@" || raw.startsWith("-") || raw.startsWith("/")) return false;
  if (raw.endsWith("/") || raw.endsWith(".")) return false;
  for (const part of raw.split("/")) {
    if (part.startsWith(".") || part.endsWith(".lock")) return false;
  }
  return true;
}

/** A path inside a repository: segments separated by "/", none of them
 *  empty, "." or "..", and no control characters. The empty string is the
 *  repository root and is accepted only where a route lists a directory. */
export function isValidRepoPath(raw: unknown, allowRoot = false): raw is string {
  if (typeof raw !== "string") return false;
  if (raw === "") return allowRoot;
  if (raw.length > 4096) return false;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return false;
  return raw.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
