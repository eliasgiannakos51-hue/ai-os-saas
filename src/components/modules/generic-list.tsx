import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { DeleteButton } from "@/components/delete-button";

export function GenericList({
  module,
  records,
}: {
  module: ModuleConfig;
  records: ModuleRecord[];
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
        no entries yet — run{" "}
        <span className="text-amber-500">{module.table}.insert()</span> to
        log your first one.
      </div>
    );
  }

  const badgeFields = module.fields.filter((f) => f.badge);
  const bodyFields = module.fields.filter(
    (f) => f.key !== module.headlineKey && !f.badge
  );

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <div
          key={record.id}
          className="rounded-md border border-border bg-panel p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {record[module.headlineKey] ?? "untitled"}
            </h3>
            {badgeFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {badgeFields.map((field) => {
                  const value = record[field.key];
                  if (value === null || value === undefined || value === "") {
                    return null;
                  }
                  return (
                    <span
                      key={field.key}
                      className="rounded border border-border bg-black/30 px-2 py-0.5 text-xs text-foreground"
                    >
                      {field.label}: {value}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {bodyFields.map((field) => {
            const value = record[field.key];
            if (value === null || value === undefined || value === "") {
              return null;
            }
            return (
              <p key={field.key} className="mt-1 text-sm text-foreground/90">
                <span className="text-amber-500">{field.label}:</span>{" "}
                {value}
              </p>
            );
          })}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted">
              logged {new Date(record.created_at).toLocaleString()}
            </p>
            <DeleteButton
              table={module.table}
              id={record.id}
              label={module.title.toLowerCase()}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
