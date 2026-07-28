export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-xs uppercase tracking-widest text-muted">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
      {description && <p className="mt-2 text-sm text-muted">{description}</p>}
    </div>
  );
}
