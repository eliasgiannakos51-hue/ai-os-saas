import Link from "next/link";
import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatRelativeTime } from "@/lib/format-time";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { DeleteButton } from "@/components/delete-button";
import type { UserDocument } from "@/types/document";

/**
 * One row of the Documents list.
 *
 * Pulled out of the page so the row can be rendered — and screenshotted —
 * without an authenticated session. The star, the delete button and the
 * padding that keeps them from overlapping are the parts worth being able
 * to look at directly.
 */
export async function DocumentListRow({
  doc,
  locale,
  favorited,
}: {
  doc: Pick<UserDocument, "id" | "title" | "updated_at">;
  locale: string;
  favorited: boolean;
}) {
  const t = await getTranslations("dashboard.documents");
  const title = doc.title || t("untitled");

  return (
    <li
      // pr reserves the corner star's column so the delete button lands to
      // its left rather than underneath it.
      className="group relative flex items-center justify-between gap-3 rounded-xl border border-border bg-panel px-4 py-3 pr-[52px] transition-colors duration-150 hover:border-orange-500/40"
    >
      <Link
        href={`/dashboard/documents/${doc.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <FileText
          className="h-4 w-4 shrink-0 text-orange-500/60 group-hover:text-orange-400"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          <span className="block text-xs text-muted" suppressHydrationWarning>
            {formatRelativeTime(doc.updated_at, locale)}
          </span>
        </span>
      </Link>
      <FavoriteButton
        table="user_documents"
        recordId={doc.id}
        headline={title}
        initialFavorited={favorited}
      />
      <DeleteButton
        table="user_documents"
        id={doc.id}
        label={t("deleteLabel")}
        itemName={doc.title}
      />
    </li>
  );
}
