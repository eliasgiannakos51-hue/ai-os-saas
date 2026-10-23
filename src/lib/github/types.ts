// Client-safe types for the GitHub integration.
//
// NOTHING SECRET IS IN THIS FILE — same rule as providers.ts. The coding
// workspace imports these to render the repo/branch pickers and the
// connection status badge.

export type GitHubConnectionStatus = "connected" | "expired" | "revoked" | "error";

export type GitHubConnectionSummary = {
  login: string;
  installationId: number | null;
  status: GitHubConnectionStatus;
  connectedAt: string;
};

export type GitHubRepo = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
};

export type GitHubBranch = {
  name: string;
  isDefault: boolean;
};

export type GitHubFileEntry = {
  path: string;
  type: "file" | "dir";
  size: number;
};

export type GitHubFileContent = {
  path: string;
  content: string;
  encoding: string;
  size: number;
};

export type GitHubDiffFile = {
  path: string;
  action: "create" | "update";
  content: string;
};

export type GitHubPrResult = {
  number: number;
  url: string;
  title: string;
};
