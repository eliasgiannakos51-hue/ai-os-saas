"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ProductUpdate = {
  id: string;
  title: string;
  description: string;
  type: "feature" | "improvement" | "fix";
  publishedAt: string;
  seen: boolean;
};

type ChangelogContextValue = {
  updates: ProductUpdate[];
  unseenCount: number;
  markSeen: (ids: string[]) => void;
};

const ChangelogContext = createContext<ChangelogContextValue | null>(null);

/**
 * One fetch per dashboard load, shared by the bell (badge + dropdown),
 * the what's-new modal and the improvements banner — the same
 * one-provider pattern as CreditsProvider, so three consumers never
 * mean three requests.
 */
export function ChangelogProvider({ children }: { children: ReactNode }) {
  const [updates, setUpdates] = useState<ProductUpdate[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/changelog");
        const data = await response.json();
        if (!cancelled && data?.ok && Array.isArray(data.updates)) {
          setUpdates(data.updates as ProductUpdate[]);
        }
      } catch {
        // The bell simply shows no badge. What's-new is never worth an
        // error state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setUpdates((current) => current.map((u) => (ids.includes(u.id) ? { ...u, seen: true } : u)));
    void fetch("/api/changelog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updateIds: ids }),
    }).catch(() => {
      // Best-effort: an unsaved "seen" just re-badges next visit.
    });
  }, []);

  const unseenCount = updates.filter((u) => !u.seen).length;

  return (
    <ChangelogContext.Provider value={{ updates, unseenCount, markSeen }}>
      {children}
    </ChangelogContext.Provider>
  );
}

export function useChangelog(): ChangelogContextValue {
  const value = useContext(ChangelogContext);
  if (!value) throw new Error("useChangelog must be used within a ChangelogProvider");
  return value;
}
