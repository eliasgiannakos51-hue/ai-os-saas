"use client";

import { useTranslations } from "next-intl";
import { parseGenerationNotes, type GenerationNote } from "@/lib/website-generation-notes";
import type { UserWebsite } from "@/types/user-website";

type FromMemory = Extract<GenerationNote, { kind: "fromMemory" }>;

/**
 * WHAT A SITE'S BRIEF TOOK FROM MEMORY (package 6), as one sentence — the
 * one sentence the Site shell, the old Site page and the Site opened beside
 * Chat all say, so it is written once.
 */
export function useRememberedLine() {
  const t = useTranslations("dashboard.websiteBuilder");
  const sentence = (note: FromMemory): string =>
    note.name !== null && note.colours.length > 0
      ? t("notes.fromMemory.both", { name: note.name, colours: note.colours.join(", ") })
      : note.name !== null
        ? t("notes.fromMemory.name", { name: note.name })
        : t("notes.fromMemory.colours", { colours: note.colours.join(", ") });
  return {
    sentence,
    forRecord: (record: UserWebsite): string | null => {
      const note = parseGenerationNotes(record.generation_notes).find((n): n is FromMemory => n.kind === "fromMemory");
      return note ? sentence(note) : null;
    },
  };
}
