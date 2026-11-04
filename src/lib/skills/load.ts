import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import type { Skill, SkillFile } from "@/lib/skills/types";

/** Every skill it finds, newest first, read through RLS (select_own_user_skills). */
export async function loadSkills(supabase: SupabaseClient, userId: string): Promise<Skill[]> {
  const { data, error } = await supabase
    .from("user_skills")
    .select("id, name, when_used, steps, files, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logApiError("skills:load", error);
    return [];
  }

  return (data ?? []).map((row) => toSkill(row));
}

/**
 * Narrow from whatever the database hands back (jsonb columns arrive
 * typed `unknown`) to the shape the screen reads — a row whose `steps` or
 * `files` is not the array shape it should be renders as an empty list
 * rather than throwing, the same defensive read my-stuff/load.ts already
 * uses for its own jsonb columns.
 */
function toSkill(row: {
  id: unknown;
  name: unknown;
  when_used: unknown;
  steps: unknown;
  files: unknown;
  created_at: unknown;
}): Skill {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    whenUsed: String(row.when_used ?? ""),
    steps: Array.isArray(row.steps) ? row.steps.filter((s): s is string => typeof s === "string") : [],
    files: Array.isArray(row.files) ? row.files.filter(isSkillFile) : [],
    createdAt: String(row.created_at ?? ""),
  };
}

function isSkillFile(value: unknown): value is SkillFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).name === "string" &&
    typeof (value as Record<string, unknown>).url === "string"
  );
}
