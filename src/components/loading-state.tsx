export function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background font-mono">
      <div className="text-center">
        <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
        <p className="mt-2 animate-pulse text-sm text-muted">loading...</p>
      </div>
    </main>
  );
}
