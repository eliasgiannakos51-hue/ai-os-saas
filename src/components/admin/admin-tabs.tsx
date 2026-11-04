"use client";

import { useState, type ReactNode } from "react";

type Tab = { key: string; label: string; content: ReactNode };

export function AdminTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              active === tab.key
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tabs.find((t) => t.key === active)?.content}
      </div>
    </div>
  );
}
