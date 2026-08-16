"use client";

import { useState } from "react";
import { AddIdeaForm } from "@/components/ideas/add-idea-form";
import { IdeasList } from "@/components/ideas/ideas-list";
import type { Idea } from "@/types/ideas";
import type { LinkedEntity } from "@/lib/entity-links";

/**
 * The one piece of state the Ideas page's form and list have to share.
 *
 * Every other module gets this for free: GenericList renders GenericAddForm
 * itself, so pressing the worked example on the empty screen is a setState
 * away. Ideas keeps its form and its list as siblings — the form sits in
 * its own block above the list rather than inside the list's toolbar — and
 * dashboard/page.tsx is a server component, which cannot hold the state
 * between them.
 *
 * So this is the smallest thing that closes that gap: a client boundary
 * that owns the prefill and renders the two exactly where they already
 * were. Moving AddIdeaForm inside IdeasList would have unified the code at
 * the cost of moving the create button on the one page most users see
 * first, which is a bigger change than the feature needs.
 */
export function IdeasSection({
  ideas,
  linkedEntities,
  favoritedIds,
  children,
}: {
  ideas: Idea[];
  linkedEntities?: Record<string, LinkedEntity[]>;
  favoritedIds?: Set<string>;
  /** Rendered between the form and the list, where the load error was. */
  children?: React.ReactNode;
}) {
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);

  return (
    <>
      <div className="mb-6">
        <AddIdeaForm prefill={prefill} />
      </div>

      {children}

      <IdeasList
        ideas={ideas}
        linkedEntities={linkedEntities}
        favoritedIds={favoritedIds}
        onExample={(text) => setPrefill((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }))}
      />
    </>
  );
}
