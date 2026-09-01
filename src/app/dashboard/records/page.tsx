import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { PageHeader } from "@/components/dashboard/page-header";
import { MY_BUSINESS_ICON } from "@/lib/module-icons";
import { ALL_SIDEBAR_GROUPS, visibleGroups } from "@/lib/sidebar-nav";
import { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import {
  RecordsDirectory,
  type DirectoryGroup,
} from "@/components/records/records-directory";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.records");
}

// THE HUB THE SIDEBAR'S NINETEEN LOG ROWS BECAME — V4.6 #3.
//
// Built from `visibleGroups(ALL_SIDEBAR_GROUPS, isOwner)` — the SAME
// source and the SAME role filter as the sidebar and the command palette,
// so a page cannot be reachable from one surface and not the others. It
// uses `visibleGroups` rather than `sidebarGroups` on purpose: the
// entries the sidebar stopped drawing are exactly the ones this page
// exists to show.
//
// The role filter runs HERE, on the server, before any prop is built, so
// an owner-only entry is never in a non-owner's payload at all — and the
// labels are resolved here too, so the client component needs no dynamic
// translation key and the message slicer can still trim this route (see
// the note in records-directory.tsx).
export default async function RecordsPage() {
  const t = await getTranslations("dashboard.records");
  const tSidebar = await getTranslations("sidebar");
  const tCommon = await getTranslations("common");

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const groups: DirectoryGroup[] = visibleGroups(
    ALL_SIDEBAR_GROUPS,
    isAdminEmail(user.email)
  ).map((group) => ({
    id: group.heading,
    heading: GROUP_HEADING_KEYS[group.heading]
      ? tSidebar(`groups.${GROUP_HEADING_KEYS[group.heading]}`)
      : group.heading,
    items: group.items.map((item) => ({
      href: item.href,
      label:
        // Create Studio's name lives under `common`, shared with the
        // sidebar and the command palette's identical special case.
        item.label === "Create Studio"
          ? tCommon("createStudio")
          : ITEM_LABEL_KEYS[item.label]
            ? tSidebar(`items.${ITEM_LABEL_KEYS[item.label]}`)
            : item.label,
      hint: item.hintKey ? tSidebar(`hints.${item.hintKey}`) : null,
    })),
  }));

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          helpKey="help.records"
          icon={MY_BUSINESS_ICON}
          title={t("title")}
          description={t("description")}
        />
        <RecordsDirectory groups={groups} />
      </div>
    </div>
  );
}
