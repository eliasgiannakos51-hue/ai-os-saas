// The guided first fortnight (V3 Task 9).
//
// TWO RULES, and they are what make this different from the checklist
// every SaaS ships and every user resents.
//
// 1. IT IS EARNED, NEVER TICKED. There is no "mark as done" button and
//    no onboarding table recording what a user claims to have seen. Each
//    step is complete when the ROW EXISTS — an idea in `ideas`, a call in
//    `ai_cost_log`, a mission in `missions`. So the checklist cannot
//    disagree with the account, cannot be gamed into looking finished,
//    and cannot show "add your first idea" to somebody with forty of
//    them. It is a view of the database, not a state machine beside it.
//
// 2. IT EXPIRES. A starter checklist is guidance in week one and
//    furniture by week four. After ONBOARDING_WINDOW_DAYS it disappears
//    whether or not it was finished, because at that point an unfinished
//    step is a decision the user made rather than a gap in their
//    knowledge, and continuing to ask is nagging.
//
// It also NEVER POINTS AT A LOCKED DOOR. Steps whose destination the
// user's plan does not include are dropped, not shown greyed out — a
// checklist you are structurally unable to complete is worse than no
// checklist. (Locked features still appear in the sidebar with their
// lock; see lib/feature-locks.ts. There the lock is the message. Here it
// would just be a dead end inside a list that asks to be finished.)
//
// The whole rule is pure and lives here rather than in the component, so
// it can be tested against every combination rather than trusted.

/** How long the guide is guidance rather than furniture. */
export const ONBOARDING_WINDOW_DAYS = 14;

export type OnboardingCounts = {
  ideas: number;
  aiActions: number;
  missions: number;
  presentations: number;
  websitesPublished: number;
};

export type OnboardingStep = {
  /** i18n key under onboarding.steps.<id>.{title,body} */
  id: string;
  href: string;
  done: boolean;
};

export type OnboardingGuide =
  | { kind: "hidden" }
  | {
      kind: "guide";
      steps: OnboardingStep[];
      /** How many of the shown steps are complete. */
      completed: number;
      /** The first incomplete step, which the card highlights. Null only
       *  in the instant between the last step completing and the guide
       *  going hidden. */
      next: OnboardingStep | null;
    };

/**
 * Every step the guide can show, in the order it shows them.
 *
 * Ordered by what teaches the product fastest, not by what is most
 * impressive: capture something, ask the AI about it, give the work a
 * direction, then make something that leaves the app. A user who does
 * those four in order has seen the whole shape of the product.
 */
const STEPS: { id: string; href: string; isDone: (c: OnboardingCounts) => boolean }[] = [
  { id: "capture", href: "/dashboard", isDone: (c) => c.ideas > 0 },
  { id: "ask", href: "/dashboard/chat", isDone: (c) => c.aiActions > 0 },
  { id: "direction", href: "/dashboard/mission", isDone: (c) => c.missions > 0 },
  { id: "present", href: "/dashboard/presentations", isDone: (c) => c.presentations > 0 },
  { id: "publish", href: "/dashboard/website-builder", isDone: (c) => c.websitesPublished > 0 },
];

export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000);
}

export function buildOnboardingGuide(params: {
  counts: OnboardingCounts;
  accountCreatedAt: string | null | undefined;
  /** Sidebar destinations this plan does not include, from
   *  lib/feature-locks.ts. Steps pointing at one are dropped. */
  lockedHrefs?: readonly string[];
  /** The user closed it. Held in the browser rather than a column,
   *  like the upgrade-prompt cooldown: it is a politeness setting, not a
   *  fact about the account, and the worst case of losing it is that the
   *  guide reappears once on a second device — inside a window that
   *  expires by itself in under a fortnight anyway. */
  dismissed?: boolean;
  now?: Date;
}): OnboardingGuide {
  if (params.dismissed) return { kind: "hidden" };

  // An unparseable or missing creation date fails CLOSED — no guide.
  // Showing a starter checklist to an account of unknown age risks
  // showing it to a two-year-old one, and the cost of missing it on a
  // genuinely new account is that they explore unaided, which is what
  // happened before this existed.
  const age = daysSince(params.accountCreatedAt, params.now);
  if (age === null || age > ONBOARDING_WINDOW_DAYS) return { kind: "hidden" };

  const locked = new Set(params.lockedHrefs ?? []);
  const steps: OnboardingStep[] = STEPS.filter((s) => !locked.has(s.href)).map((s) => ({
    id: s.id,
    href: s.href,
    done: s.isDone(params.counts),
  }));

  // A plan that locks everything leaves nothing to guide.
  if (steps.length === 0) return { kind: "hidden" };

  const completed = steps.filter((s) => s.done).length;
  // Finished. The reward for completing a checklist is that it goes
  // away; leaving five ticks on the overview forever is clutter dressed
  // as encouragement.
  if (completed === steps.length) return { kind: "hidden" };

  return { kind: "guide", steps, completed, next: steps.find((s) => !s.done) ?? null };
}
