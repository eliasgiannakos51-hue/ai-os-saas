import type { EntityCardStatusTone } from "@/components/ui/entity-card";
import type { FieldConfig, ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";

/**
 * How a generic module record maps onto the shared card structure.
 *
 * EntityCard's slots are fixed (title / description / tags / status), but
 * the 18 module configs describe themselves only as a flat list of fields.
 * This is the one place that decides which field plays which role, so
 * every module resolves it the same way instead of each page inventing an
 * arrangement.
 */

/**
 * Fields that carry a lifecycle state rather than a value. Only these get
 * promoted to the card's status indicator — "where it makes sense" — and
 * they're then excluded from the tag row so the same fact isn't shown
 * twice on one card.
 */
const STATUS_FIELD_KEYS = new Set(["status", "result"]);

const STATUS_TONES: Record<string, EntityCardStatusTone> = {
  active: "active",
  "in progress": "active",
  processing: "active",
  pending: "active",
  planned: "neutral",
  draft: "neutral",
  archived: "neutral",
  paused: "warning",
  blocked: "warning",
  live: "success",
  done: "success",
  completed: "success",
  win: "success",
  loss: "danger",
  failed: "danger",
};

export function statusToneForValue(value: string): EntityCardStatusTone {
  return STATUS_TONES[value.trim().toLowerCase()] ?? "neutral";
}

function hasValue(record: ModuleRecord, key: string): boolean {
  const value = record[key];
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function statusFieldFor(module: ModuleConfig, record: ModuleRecord): FieldConfig | null {
  return (
    module.fields.find((f) => STATUS_FIELD_KEYS.has(f.key) && hasValue(record, f.key)) ?? null
  );
}

/**
 * The card's one- or two-line description: the first field that actually
 * reads like prose. Preferring a textarea matters — "Competitors" would
 * otherwise describe itself with a pricing tier, which tells the user
 * nothing they can't already see in the tag row.
 */
export function descriptionFor(module: ModuleConfig, record: ModuleRecord): string | null {
  const candidates = module.fields.filter(
    (f) => f.key !== module.headlineKey && !f.badge && !STATUS_FIELD_KEYS.has(f.key)
  );
  const prose = candidates.find((f) => f.type === "textarea" && hasValue(record, f.key));
  const fallback = candidates.find((f) => hasValue(record, f.key));
  const chosen = prose ?? fallback;
  return chosen ? String(record[chosen.key]) : null;
}

export function tagFieldsFor(module: ModuleConfig, record: ModuleRecord): FieldConfig[] {
  const statusKey = statusFieldFor(module, record)?.key;
  return module.fields.filter((f) => f.badge && f.key !== statusKey && hasValue(record, f.key));
}

/** Every field worth listing in the detail view's "Details" tab. */
export function detailFieldsFor(module: ModuleConfig, record: ModuleRecord): FieldConfig[] {
  return module.fields.filter((f) => f.key !== module.headlineKey && hasValue(record, f.key));
}

export function headlineFor(module: ModuleConfig, record: ModuleRecord, fallback: string): string {
  const value = record[module.headlineKey];
  return value === null || value === undefined || String(value).trim() === ""
    ? fallback
    : String(value);
}
