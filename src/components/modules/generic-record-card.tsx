"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { iconForSlug } from "@/lib/module-icons";
import { EntityCard } from "@/components/ui/entity-card";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { AskAiButton } from "@/components/records/ask-ai-button";
// DEFERRED, AND GATED ON `open`. These two modals were imported at the
// top and RENDERED UNCONDITIONALLY with open={false} — so every record
// card on every module page shipped and mounted both of them, for a panel
// most people never open. Both already return null while closed and both
// reset their state on close ("every open/close cycle starts fresh", says
// ask-ai-modal), so mounting them on demand keeps the behaviour and drops
// them out of the first load.
const AskAiModal = dynamic(
  () => import("@/components/records/ask-ai-modal").then((m) => m.AskAiModal),
  { ssr: false },
);
import { LinkToButton } from "@/components/entity-links/link-to-button";
const LinkToModal = dynamic(
  () => import("@/components/entity-links/link-to-modal").then((m) => m.LinkToModal),
  { ssr: false },
);
import { DeleteButton } from "@/components/delete-button";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { deleteConfirmKey } from "@/lib/modules";
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
  const tKey = useTranslations();
  const headline = headlineFor(module, record, t("untitled"));
  const statusField = statusFieldFor(module, record);
  const statusValue = statusField ? String(record[statusField.key]) : null;
  const statusTone = statusValue ? statusToneForValue(statusValue) : null;
  // Owned HERE, not by the menu items that open them — see the `onOpen`
  // note on AskAiButton. A modal rendered inside CardMenu's dropdown is
  // unmounted by the same click that opens it.
  const [askOpen, setAskOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <>
    <EntityCard
      index={index}
      selected={selected}
      icon={iconForSlug(module.slug)}
      accentSlug={module.slug}
      title={headline}
      description={descriptionFor(module, record)}
      tags={tagFieldsFor(module, record).map((field) => ({
        key: field.key,
        label: `${tKey(field.labelKey)}: ${record[field.key]}`,
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
          {/* Triggers only — the two modals are rendered by THIS card,
              below and outside the menu, because the menu unmounts the
              moment `close()` runs and would take them with it. */}
          <AskAiButton
            variant="menuItem"
            onActivate={close}
            onOpen={() => setAskOpen(true)}
            moduleSlug={module.slug}
            moduleTitle={tKey(module.titleKey)}
            recordId={record.id}
            recordHeadline={headline}
          />
          <LinkToButton
            variant="menuItem"
            onActivate={close}
            onOpen={() => setLinkOpen(true)}
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
            confirmMessage={tKey(deleteConfirmKey(module.slug))}
            itemName={headline}
          />
        </>
      )}
    />
    {askOpen && (
    <AskAiModal
      open={askOpen}
      onClose={() => setAskOpen(false)}
      moduleSlug={module.slug}
      moduleTitle={tKey(module.titleKey)}
      recordId={record.id}
      recordHeadline={headline}
    />
    )}
    {linkOpen && (
    <LinkToModal
      open={linkOpen}
      onClose={() => setLinkOpen(false)}
      sourceTable={module.table}
      sourceId={record.id}
      sourceHeadline={headline}
    />
    )}
    </>
  );
}
