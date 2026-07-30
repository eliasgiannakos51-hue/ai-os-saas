export function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-xs tracking-widest text-orange-500">
          Nexa AI //
        </p>
        <div className="space-y-3" aria-label="Loading" role="status">
          <div className="h-4 w-1/3 animate-pulse rounded bg-white/5" />
          <div
            className="h-10 w-full animate-pulse rounded bg-white/5"
            style={{ animationDelay: "75ms" }}
          />
          <div
            className="h-10 w-full animate-pulse rounded bg-white/5"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="h-10 w-5/6 animate-pulse rounded bg-white/5"
            style={{ animationDelay: "225ms" }}
          />
        </div>
      </div>
    </main>
  );
}
