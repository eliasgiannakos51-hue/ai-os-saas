import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { GenericRecordRow } from "@/components/modules/generic-record-row";

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

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <GenericRecordRow key={record.id} module={module} record={record} />
      ))}
    </div>
  );
}
