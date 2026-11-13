"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/**
 * WHETHER THIS READER SEES THE EDITOR LAYOUT (the switch "editor-shell",
 * src/lib/flags/flags.ts), read ONCE on the server by
 * app/dashboard/layout.tsx and handed down here — so the ~20 tools that
 * draw components/shell/tool-shell.tsx follow it without a single page
 * reading the switch itself. Outside the dashboard there is no provider
 * and the answer is `false`: the shell every customer has today.
 */
const EditorShellOn = createContext(false);

export function EditorShellProvider({ on, children }: { on: boolean; children: ReactNode }) {
  return <EditorShellOn.Provider value={on}>{children}</EditorShellOn.Provider>;
}

/** True when the owner-approved editor layout is on for this reader. */
export function useEditorShell(): boolean {
  return useContext(EditorShellOn);
}

/**
 * THE FIELD'S TWO SLOTS: the selected piece (a chip inside the field) and
 * the price (muted, before the send button) — docs/design/approved/08-Site.png
 * and 14-Image.png.
 *
 * Tools already SAY both, under the field: «Μόνο: Hero ×» is `ChosenBox`
 * and «≈ 2 credits» is `CostEstimateHint` (or a line of the tool's own).
 * Rather than ask ~20 tools to pass the same facts twice, those
 * components register what they say here when an editor shell is above
 * them, and draw nothing of their own; under the old shell there is no
 * registry and they draw exactly what they drew. components/shell/editor-shell.tsx
 * provides it and draws the chip and the price.
 */
export type FieldSelection = { label: string; onClear: () => void };
type Registry = {
  setSelection: (value: FieldSelection | null) => void;
  setCost: (value: string | null) => void;
};
const FieldSlots = createContext<Registry | null>(null);

export function FieldSlotsProvider({ value, children }: { value: Registry; children: ReactNode }) {
  return <FieldSlots.Provider value={value}>{children}</FieldSlots.Provider>;
}

/**
 * Registers `label` as the field's selection chip while the caller is
 * mounted inside an editor shell; returns whether it did, so the caller
 * knows to draw nothing of its own. `onClear` is read when pressed, not
 * when registered, so a new closure on every render costs no re-register.
 */
export function useFieldSelection(label: string, onClear: () => void): boolean {
  const slots = useContext(FieldSlots);
  const clear = useRef(onClear);
  clear.current = onClear;
  useEffect(() => {
    if (!slots) return;
    slots.setSelection({ label, onClear: () => clear.current() });
    return () => slots.setSelection(null);
  }, [slots, label]);
  return slots !== null;
}

/** The same for the price shown before sending. */
export function useFieldCost(text: string | null): boolean {
  const slots = useContext(FieldSlots);
  useEffect(() => {
    if (!slots || text === null) return;
    slots.setCost(text);
    return () => slots.setCost(null);
  }, [slots, text]);
  return slots !== null;
}

/**
 * A tool's own price line, said once: inside an editor shell its words
 * go into the field (and nothing is drawn here); anywhere else the line
 * itself is drawn, unchanged. For a tool whose price is not a
 * `CostEstimateHint` (Image's, Site's).
 */
export function FieldCost({ text, children = null }: { text: string; children?: ReactNode }) {
  const registered = useFieldCost(text);
  return registered ? null : <>{children}</>;
}
