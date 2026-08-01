"use client";

import { useEffect, useState } from "react";

export type TopModule = { slug: string; title: string };

// Drives the Create Anything "smart suggestion" chips: fetches the
// caller's top-used modules once (cheap, doesn't change fast enough to
// need refetching per keystroke), then flips `visible` on ~1s after the
// user stops typing — never while they're actively typing, so it reads as
// a quiet nudge rather than something fighting for attention.
export function useSmartSuggestions(input: string) {
  const [modules, setModules] = useState<TopModule[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/create/top-modules")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setModules(data.modules ?? []);
      })
      .catch(() => {
        // Best-effort — no suggestions is a silent no-op, never an error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setVisible(false);
    if (!input.trim() || modules.length === 0) return;
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [input, modules.length]);

  return { modules, visible };
}
