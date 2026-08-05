"use client";

import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { iconForSlug } from "@/lib/module-icons";
import { EntityCard } from "@/components/ui/entity-card";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { AskAiButton } from "@/components/records/ask-ai-button";
import { LinkToButton } from "@/components/entity-links/link-to-button";
import { DeleteButton } from "@/components/delete-button";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import {
  descriptionFor,
  headlineFor,
  statusFieldFor,
  statusToneForValue,
  tagFieldsFor,
} from "@/lib/module-card-fields";

/**
 * One record of any of the 18 module lists, rendered as the shared
 * EntityCard.
 *
 * Every action the old bottom action-bar carried is still here and still
 * the same component — Ask AI and Link To still own their modals, Delete
 * still owns its confirm and its row-collapse animation — they've just
 * moved behind the card's "..." menu as labelled rows rather than five
 * anonymous grey icons. Clicking the card body opens the detail panel.
 */
export function GenericRecordCard({
  module,
  record,
  index,
  selected,
  isFavorited = false,
  onOpen,
  onDeleted,
}: {
  module: ModuleConfig;
  record: ModuleRecord;
  index: number;
  selected: boolean;
  isFavorited?: boolean;
  /** Opens the detail panel, optionally straight onto a given tab. */
  onOpen: (tab?: "details" | "edit" | "links") => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("module");
  const headline = headlineFor(module, record, t("untitled"));
  const statusField = statusFieldFor(module, record);
  const statusValue = statusField ? String(record[statusField.key]) : null;
  const statusTone = statusValue ? statusToneForValue(statusValue) : null;

  return (
    <EntityCard
      index={index}
      selected={selected}
      icon={iconForSlug(module.slug)}
      accentSlug={module.slug}
      title={headline}
      description={descriptionFor(module, record)}
      tags={tagFieldsFor(module, record).map((field) => ({
        key: field.key,
        label: `${field.label}: ${record[field.key]}`,
      }))}
      status={
        statusValue && statusTone
          ? { label: statusValue, tone: statusTone, pulse: statusTone === "active" }
          : null
      }
      onSelect={() => onOpen()}
      corner={
        <FavoriteButton
          table={module.table}
          recordId={record.id}
          headline={headline}
          initialFavorited={isFavorited}
          // "inline", not the default "corner": EntityCard already lays the
          // corner controls out in a flex row with the "..." menu, and an
          // absolutely-positioned star would sit on top of it.
          variant="inline"
        />
      }
      menuLabel={t("actionsFor", { name: headline })}
      menu={[{ key: "edit", label: t("edit"), icon: Pencil, onSelect: () => onOpen("edit") }]}
      menuExtra={(close) => (
        <>
          <AskAiButton
            variant="menuItem"
            onActivate={close}
            moduleSlug={module.slug}
            moduleTitle={module.title}
            recordId={record.id}
            recordHeadline={headline}
          />
          <LinkToButton
            variant="menuItem"
            onActivate={close}
            sourceTable={module.table}
            sourceId={record.id}
            sourceHeadline={headline}
          />
          <div className="my-1 border-t border-border" />
          <DeleteButton
            variant="menuItem"
            onActivate={close}
            onDeleted={onDeleted}
            table={module.table}
            id={record.id}
            label={module.title.toLowerCase()}
            itemName={headline}
          />
        </>
      )}
    />
  );
}
