import { formatRelativeTime } from "@/lib/format-time";

export type CreditTransaction = {
  id: string;
  amount: number;
  action_type: string;
  description: string;
  created_at: string;
};

export function CreditHistory({ transactions }: { transactions: CreditTransaction[] }) {
  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">Credit History</h2>
      {transactions.length === 0 ? (
        <p className="text-xs text-muted">No credit activity yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {transactions.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="truncate text-foreground">{tx.description || tx.action_type}</p>
                <p
                  className="mt-0.5 text-muted"
                  suppressHydrationWarning
                >
                  {formatRelativeTime(tx.created_at)}
                </p>
              </div>
              <span
                className={`shrink-0 font-semibold ${tx.amount < 0 ? "text-red-400" : "text-emerald-400"}`}
              >
                {tx.amount > 0 ? "+" : ""}
                {tx.amount.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
