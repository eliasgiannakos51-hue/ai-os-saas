/** The client-safe half of lib/mission-step-edits.ts.
 *
 *  That file is "server-only" — it holds the scheduled-run index fix-up
 *  and must never be pulled into a browser bundle. The UI still needs the
 *  SHAPE of what a delete hands back so it can offer an undo, so the type
 *  lives here, where both sides can import it. */
export type RemovedRun = {
  step_index: number;
  step_text: string;
  agent_role: string;
  scheduled_for: string;
};
