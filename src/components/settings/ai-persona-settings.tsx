"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

const MAX_PERSONA_NAME_LENGTH = 40;

// Ultimate+ only (capabilities.customAiPersona — see lib/billing/plans.ts).
// The saved name replaces "Ionexa" in api/chat's system prompt; this
// component itself is only ever rendered for accounts entitled to it (see
// dashboard/settings/page.tsx), so no plan check is duplicated here.
export function AiPersonaSettings({ initialName }: { initialName: string }) {
  const supabase = createClient();
  const { addToast } = useToast();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const trimmed = name.trim().slice(0, MAX_PERSONA_NAME_LENGTH);
    const { error } = await supabase.auth.updateUser({
      data: { ai_persona_name: trimmed || null },
    });

    setSaving(false);

    if (error) {
      addToast(`✗ could not save persona name`, "error");
      return;
    }

    setName(trimmed);
    addToast("✓ persona name updated");
  }

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-orange-400" /> AI Persona
        <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
          Ultimate
        </span>
      </h2>
      <p className="text-xs text-muted">
        Give the assistant a custom name in Ionexa Chat — leave blank to keep the default
        &quot;Ionexa&quot;.
      </p>
      <form onSubmit={handleSave} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_PERSONA_NAME_LENGTH}
          placeholder="Ionexa"
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
