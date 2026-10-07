"use client";

import { useTranslations } from "next-intl";
import { useRememberedLine } from "@/components/website-builder/use-remembered-line";
import type { GenerationNote } from "@/lib/website-generation-notes";

/**
 * WHAT THE CODE DID TO A GENERATED SITE, SAID IN THE READER'S LANGUAGE —
 * one sentence per note (lib/website-generation-notes.ts). Shared by the
 * Site page (website-builder-workspace.tsx) and the Site in the shell
 * (website-shell.tsx, package 10), so the two cannot word the same fact
 * differently. Held by scripts/tests/website-negatives.test.mjs.
 */
export function useGenerationNoteText(): (note: GenerationNote) => string {
  const t = useTranslations("dashboard.websiteBuilder");
  const remembered = useRememberedLine();
  return (note: GenerationNote): string => {
    switch (note.kind) {
      case "removedFeature":
        return t("notes.removedFeature", { feature: t(`notes.feature.${note.feature}`), count: note.count });
      case "removedPage":
        return t("notes.removedPage", { feature: t(`notes.feature.${note.feature}`), slug: note.slug });
      case "pageCap":
        return t("notes.pageCap", { cap: note.cap, started: note.started });
      case "mapZoom":
        return t("notes.mapZoom", { count: note.count });
      case "stopped":
        return t("notes.stopped", { count: note.credits });
      case "sameSkeleton":
        // THE OLDER SITE IS NAMED. "This looks like another of your sites"
        // is unactionable; "87% the same structure as Καφέ Λιμάνι" can be
        // opened in the other tab and disagreed with.
        return t("notes.sameSkeleton", { percent: note.percent, name: note.against });
      case "photosDropped":
        // THE REASON IS PART OF THE SENTENCE, not a detail behind it.
        // "No pictures were added" is not actionable; "the photo library
        // is not set up on this deployment" tells the owner to go and
        // set a key, and "no photographs matched" tells them to change
        // the words.
        return t(`notes.photosDropped.${note.reason}`, { count: note.count });
      case "fromMemory":
        // Where the name and the colours came from, so a wrong one is
        // corrected in Chat (or on the memory page) and not argued with here.
        return remembered.sentence(note);
      case "spelling":
        // The words themselves, joined — the owner is the only one who can
        // say whether "ρεμπα" is a typo or a brand, and they can only say
        // it if they can see the word.
        return t("notes.spelling", { count: note.words.length, words: note.words.join(", ") });
      case "pagesShort":
        // Both numbers: "three of the five asked for" is something to act
        // on — ask again, or add the missing page in words.
        return t("notes.pagesShort", { asked: note.asked, made: note.made });
    }
  };
}
