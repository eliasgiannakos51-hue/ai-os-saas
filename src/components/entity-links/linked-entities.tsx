"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { LinkedEntity } from "@/lib/entity-links";

export function LinkedEntities({ entities }: { entities: LinkedEntity[] }) {
  const t = useTranslations("entityLinks");
  const router = useRouter();
  const supabase = createClient();
  const [removingId, setRemovingId] = useState<string | null>(null);

  if (entities.length === 0) return null;

  async function handleRemove(linkId: string) {
    setRemovingId(linkId);
    const { error } = await supabase.from("entity_links").delete().eq("id", linkId);
    setRemovingId(null);
    if (!error) router.refresh();
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 text-xs text-muted">{t("linkedToLabel")}</p>
      <div className="flex flex-wrap gap-1.5">
        {entities.map((entity) => (
          <span
            key={entity.linkId}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-input py-0.5 pl-2 pr-1 text-xs text-foreground/90"
          >
            <Link href={entity.href} className="transition-colors duration-150 hover:text-orange-400">
              <span className="text-muted">{entity.moduleTitle}:</span> {entity.headline}
            </Link>
            <button
              type="button"
              onClick={() => handleRemove(entity.linkId)}
              disabled={removingId === entity.linkId}
              aria-label={t("unlinkAria", { name: entity.headline })}
              title={t("unlink")}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:text-red-400 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
