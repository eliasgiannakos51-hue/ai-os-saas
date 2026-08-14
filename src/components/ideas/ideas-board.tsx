"use client";

import { useState } from "react";
import { AddIdeaForm } from "@/components/ideas/add-idea-form";
import { IdeasList } from "@/components/ideas/ideas-list";
import type { Idea } from "@/types/ideas";
import type { LinkedEntity } from "@/lib/entity-links";

/**
 * The Ideas board — the add form and the list, with one piece of state
 * shared between them.
 *
 * GenericList owns both halves for the other nineteen modules, which is
 * why the empty state's "start from this example" could prefill the form
 * there and could not here: Ideas is the one board whose form and list are
 * siblings under a server component, with nowhere to put the signal that
 * connects them. This is that place.
 *
 * It matters more than one module's worth, because Ideas is where the
 * overview's first Quick Action card sends a brand-new user
 * (classifier-modules.ts's `ideas` -> /dashboard). It is the empty state
 * most likely to be the first one anybody ever sees.
 */
export function IdeasBoard({
  ideas,
  linkedEntities,
  favoritedIds,
}: {
  ideas: Idea[];
  linkedEntities: Record<string, LinkedEntity[]>;
  favoritedIds: Set<string>;
}) {
  const [exampleSignal, setExampleSignal] = useState(0);

  return (
    <>
      <div className="mb-6">
        <AddIdeaForm openSignal={exampleSignal} />
      </div>
      <IdeasList
        ideas={ideas}
        linkedEntities={linkedEntities}
        favoritedIds={favoritedIds}
        onUseExample={() => setExampleSignal((n) => n + 1)}
      />
    </>
  );
}
