import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { loadMemories } from "@/lib/memory/store";
import { readBrand } from "@/lib/memory/brand";
import { cleanGlossaryTerms } from "@/lib/translate/text-source";

export const dynamic = "force-dynamic";

/**
 * WORDS THAT DO NOT TRANSLATE (the standalone Translate tool, package 4),
 * behind "translate-tool": one row per account (20261029000000_translate_glossary.sql),
 * read and written as the whole list — there is no per-term id to edit one
 * at a time, so GET returns the array and PUT replaces it.
 *
 * GET also suggests the account's own remembered business name
 * (lib/memory/brand.ts's BRAND_NAME_PREFIX line, the same one the Site
 * builder already reads) as a one-press add — never written here by
 * itself; only PUT, which the account pressed, saves anything.
 */
const MEMORY_WINDOW = 200;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("translate-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    const { data, error } = await supabase.from("translate_glossary").select("terms").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const terms: string[] = Array.isArray(data?.terms) ? data.terms.map(String) : [];
    const brand = readBrand(await loadMemories(supabase, user.id, MEMORY_WINDOW));
    const suggestedBrand = brand.name && !terms.includes(brand.name) ? brand.name : null;
    return NextResponse.json({ ok: true, terms, suggestedBrand });
  } catch (err) {
    logApiError("/api/translate/glossary", err, { stage: "get" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: { terms?: unknown };
  try {
    body = (await request.json()) as { terms?: unknown };
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  // Required here — unlike the translate routes, where an omitted
  // glossary just means "none this run" (cleanGlossaryTerms(undefined) is
  // []), a PUT with no terms at all is a malformed save, not an empty list.
  if (body.terms === undefined) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
  const terms = cleanGlossaryTerms(body.terms);
  if (terms === null) return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("translate-tool", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    const { error } = await supabase.from("translate_glossary").upsert({ user_id: user.id, terms, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true, terms });
  } catch (err) {
    logApiError("/api/translate/glossary", err, { stage: "put" });
    return NextResponse.json({ ok: false, code: "not_saved" }, { status: 500 });
  }
}
