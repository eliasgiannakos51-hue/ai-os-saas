/**
 * A SKILL, AS THE OWNER DEFINED IT (directive 29, «29. SKILLS: ΤΟ
 * ΜΑΘΑΙΝΕΙΣ ΜΙΑ ΦΟΡΑ», 2026-10-31): exactly four things —
 *
 *   name       what it is called
 *   whenUsed   when Ionexa reaches for it
 *   steps      what it does, in order
 *   files      templates and examples that go with it
 *
 * Nothing here is invented beyond that list. `files` is typed even
 * though no code path can populate it yet (Κομμάτι 1 is read-only,
 * supabase/migrations/20261107000000_user_skills.sql grants select
 * only) — the shape exists so the detail screen can render a real
 * section the day a later piece starts writing into it, rather than the
 * type growing a field at the same moment the UI first needs it.
 */
export type SkillFile = {
  name: string;
  url: string;
};

export type Skill = {
  id: string;
  name: string;
  whenUsed: string;
  steps: string[];
  files: SkillFile[];
  createdAt: string;
};
