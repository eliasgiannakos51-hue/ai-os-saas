import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";
import { FILE_LIST_COLUMNS, usedStorageBytes } from "@/lib/files/store";
import { maxFilesForPlan, maxStorageBytesForPlan } from "@/lib/files/limits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** The user's files, plus where they stand against their allowances.
 *  Both in one response because the list is useless without the second
 *  half — "you have 3 files" only means something next to "of 3". */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_files")
      .select(FILE_LIST_COLUMNS)
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false })
      .limit(1000);

    if (error) {
      logApiError("/api/files", error, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load your files." }, { status: 500 });
    }

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const used = await usedStorageBytes(supabase, user.id);

    return NextResponse.json({
      ok: true,
      files: data ?? [],
      usage: {
        files: (data ?? []).length,
        fileCap: isAdmin ? null : maxFilesForPlan(planSlug),
        storageBytes: used ?? 0,
        storageCap: isAdmin ? null : maxStorageBytesForPlan(planSlug),
      },
    });
  } catch (err) {
    logApiError("/api/files", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
