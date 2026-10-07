import type { ClientStep } from "@/lib/jobs/job-timeline";

export type Question = { question: string; why: string };
export type Source = { title: string; url: string };
export type Section = { heading: string; body: string };

/** A research report as the Research page reads it (research_reports, and api/research/[id]). */
export type ResearchReport = {
  id: string;
  topic: string;
  status: "pending" | "planning" | "researching" | "synthesising" | "ready" | "failed";
  questions: Question[];
  sections?: Section[];
  sources?: Source[];
  document_id: string | null;
  credits_charged: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  // Written by the worker after each question. Optional because a
  // database that has not had the progress migration applied simply does
  // not return them — see api/research/[id], which selects `*`.
  questions_done?: number | null;
  questions_total?: number | null;
  current_question?: string | null;
  // One step per question, then the writing — built by the server from
  // the findings (lib/research/research-timeline.ts). Absent from the
  // list endpoint; present on every poll of api/research/[id].
  timeline?: ClientStep[];
};
