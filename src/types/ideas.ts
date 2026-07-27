export type Idea = {
  id: string;
  user_id: string;
  name: string;
  problem: string | null;
  customer: string | null;
  competitors: string | null;
  market_size: string | null;
  mvp: string | null;
  score: number | null;
  verdict: string | null;
  created_at: string;
};
