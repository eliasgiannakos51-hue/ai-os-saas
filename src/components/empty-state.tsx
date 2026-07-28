export function EmptyState({
  icon = "∅",
  children,
}: {
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
      <div className="mb-2 text-2xl text-border" aria-hidden="true">
        {icon}
      </div>
      <div>{children}</div>
    </div>
  );
}
