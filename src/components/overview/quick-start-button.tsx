"use client";

import { useState } from "react";
import { Rocket } from "lucide-react";
import { QuickStartModal } from "@/components/overview/quick-start-modal";

export function QuickStartButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 sm:min-h-0"
      >
        <Rocket className="h-3.5 w-3.5" /> Quick Start
      </button>
      <QuickStartModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
