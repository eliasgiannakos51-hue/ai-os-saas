-- ═══════════════════════════════════════════════════════════════════
-- IONEXA — THE FOUR ANALYSES (#27, #29, #30, #31)
--
-- Read-only. Every query below was executed against a database built
-- from bootstrap-supabase.sql + every migration in order, so the table
-- and column names are real. What they RETURN depends on your data.
--
-- ───────────────────────────────────────────────────────────────────
-- READ THIS BEFORE RUNNING ANYTHING
-- ───────────────────────────────────────────────────────────────────
--
-- WHICH TABLES ARE EMPTY TODAY, so that a zero is read as "no data yet"
-- rather than as a finding:
--
--   nav_events            EMPTY UNTIL THIS DEPLOYS. The table is new
--                         (20260915000000). It has no history: it starts
--                         filling on the first navigation after the
--                         deploy, and #29 is not worth reading until it
--                         has at least a week and, ideally, thirty
--                         active accounts. Before then every screen looks
--                         unused, including the ones people live in.
--   pwa_client_stats      one row per (user, client_id), UPDATED not
--                         appended — it has no history either way, only
--                         a current state per device.
--   subscription_events   only rows since the revenue engine shipped.
--   user_onboarding       one row per user who REACHED onboarding. People
--                         who signed up before it existed have no row, so
--                         it is not a denominator for "all users".
--
-- AND THE ONE DISTINCTION THAT DECIDES #29: OPENED is not USED.
-- nav_events answers "opened". The module tables answer "used" — somebody
-- typed something and it is still there. A module with high opens and no
-- entries is a module people try and abandon, which is a different
-- problem from one nobody visits, and the fix is different too. Both
-- halves are below and they are meant to be read side by side.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- #27  PLANS 6 -> 4
-- ───────────────────────────────────────────────────────────────────

-- 27.1  WHO IS ON WHAT. plan_tier lives on user_credits, one row/user.
select coalesce(plan_tier, 'none') as plan,
       count(*)                    as users,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
from public.user_credits
group by 1
order by users desc;

--   IF a tier has 0 users              -> DELETE it. Nobody has to be
--        migrated, nothing has to be honoured, and it is one fewer
--        column on the pricing page. Do it in the same week.
--   IF a tier has 1-2 users            -> MERGE it upward, and email
--        those people first with the price they will pay. Two users is
--        not a segment; it is two conversations.
--   IF a tier has 3-15% of users AND
--      the tier above it has more      -> MERGE DOWNWARD into the
--        popular one and keep the popular one's price. A middle tier
--        that loses to the tier above it is not a step, it is a
--        hesitation you are charging for.
--   IF two adjacent tiers both hold
--      >20%                            -> KEEP BOTH. That is a real
--        split and merging it will cost you the cheaper half.
--   IF 'none' is the largest row       -> THE QUESTION IS NOT THE PLANS.
--        Most accounts have no tier at all, and pricing structure is not
--        what is stopping them. Go to #30 instead.

-- 27.2  WHICH PLAN NOBODY CHOOSES — including the ones with zero users,
-- which the query above cannot show you because they have no rows.
select t.plan_tier,
       coalesce(c.users, 0) as users
from (values ('free'),('starter'),('growth'),('professional'),('ultimate'),('enterprise')) as t(plan_tier)
left join (select plan_tier, count(*) users from public.user_credits group by 1) c using (plan_tier)
order by users asc, t.plan_tier;

--   IF the zero rows are the TOP tiers  -> your ceiling is too high, not
--        your structure. Cut from the top; the bottom is working.
--   IF the zero rows are in the MIDDLE  -> classic six-tier failure. The
--        middle is where people cannot tell the difference, so they pick
--        the cheapest or the most expensive. Cut the middle.
--   IF every tier has users             -> DO NOT CUT TO FOUR. You were
--        told to go 6 -> 4; the data says the six are all being chosen.
--        Say so rather than performing the simplification.

-- 27.3  WHO A MERGE WOULD MOVE, and whether they are paying. Change the
-- two tier names to the pair you are considering.
select plan_tier,
       count(*)                                        as users,
       count(*) filter (where credits_remaining > 0)    as with_balance,
       sum(purchased_credits)                           as purchased_credits_held
from public.user_credits
where plan_tier in ('starter','growth')
group by 1;

--   IF purchased_credits_held > 0       -> THE MERGE HAS TO HONOUR IT.
--        Those are credits somebody paid cash for on top of a
--        subscription. Carry the balance across at face value and say so
--        in the email; do not convert it at the new tier's rate.
--   IF with_balance is near users       -> people are holding credits
--        they have not spent. Merging is safe. Changing the credit PRICE
--        in the same week is not: they bought at the old one.
--   IF with_balance is near 0           -> nobody is holding value; the
--        merge costs nothing to honour. Move on the same day.

-- 27.4  WHAT THEY HAVE ALREADY COMMITTED TO — an annual term is a
-- promise a merge has to keep until it expires.
select s.to_tier, s.to_interval, count(*) as events
from public.subscription_events s
where s.at > now() - interval '180 days'
group by 1, 2
order by events desc;

--   IF to_interval = 'year' has rows on a tier you are cutting
--                                       -> DO NOT CUT IT YET. Grandfather
--        those accounts on the old tier until renewal and remove it from
--        the pricing page today. The tier stops being sold; it does not
--        stop existing.
--   IF everything is 'month'            -> cut with one billing cycle's
--        notice. Thirty days is enough and is what the terms say.
--   IF this returns NOTHING             -> the revenue engine has no
--        history yet, NOT "nobody subscribes". Read 27.1 instead and come
--        back to this in a quarter.


-- ───────────────────────────────────────────────────────────────────
-- #29  RADICAL SIMPLIFICATION — what is opened, and what is used
-- ───────────────────────────────────────────────────────────────────
-- THIS IS THE ONE THAT COULD NOT BE ANSWERED. Until 20260915 there was
-- no navigation logging in this product at all, so "which modules do
-- people open" had no answer anywhere in the system and every decision
-- about what to cut was a guess. nav_events is that answer. It is also
-- EMPTY until the deploy — see the header.

-- 29.1  WHICH SCREENS ARE OPENED, HOW OFTEN, BY HOW MANY PEOPLE.
-- The view does the work; this is just how to read it.
select path,
       is_business_module,
       opens,
       users,
       opens_per_user,
       pct_of_all_opens,
       last_opened::date
from public.nav_screen_usage
order by opens desc;

--   A SCREEN WITH NO ROW AT ALL IS THE FINDING. It was opened by nobody
--   in the window. Check it against src/app/dashboard/ — the view can
--   only show what was visited.
--
--   IF a business module has 0 rows AND
--      0 entries in 29.3               -> CUT IT. Nobody opens it and
--        nobody has ever put anything in it. This is the only
--        combination that justifies deleting a module outright.
--   IF opens > 0 but users = 1         -> that is you. Not a signal.
--   IF pct_of_all_opens < 1% across
--      three or more modules           -> MERGE THEM into one screen with
--        a type filter rather than deleting them. The rows exist; the
--        navigation cost is what is not paying for itself.
--   IF opens_per_user < 1.5            -> people go once and do not come
--        back. That is a FIRST-RUN problem, not a value problem: the
--        screen is findable and unconvincing. Fix the empty state before
--        cutting anything.
--   IF opens_per_user > 8              -> that is a place people live.
--        Never cut it, and look at what it is missing instead.
--   IF /dashboard/:unknown has real
--      volume                          -> there is a dead link in the
--        product. Find it before anything else here: people are clicking
--        something that goes nowhere.

-- 29.2  HOW MUCH OF THE PRODUCT ONE PERSON USES.
select * from public.nav_user_breadth;

--   READ median_modules_per_user FIRST, not the average — a few accounts
--   that open everything drag the mean.
--
--   IF median_modules_per_user <= 2    -> you have a two-module product
--        with ten modules attached. Pick the two, make the Home about
--        them, and move the rest behind one "More" entry. Do NOT delete
--        them yet: see 29.3, they may be used without being browsed.
--   IF median 3-5                      -> the suite is real. Cut nothing;
--        group the sidebar so five feel like five and not like twelve.
--   IF median >= 6                     -> people are using the breadth.
--        Simplifying the NAVIGATION is still worth it; cutting MODULES
--        would remove something somebody opens weekly.
--   IF avg is far above the median     -> you have two products: a
--        handful of power users and everyone else. Price for the first,
--        design the Home for the second.
--   IF avg_active_days_per_user <= 1   -> almost everybody came once.
--        Nothing in #29 is actionable yet; this is a retention question
--        and #30 is where it lives.

-- 29.3  AND THE OTHER HALF: WHAT IS USED, i.e. what people actually
-- wrote something into. Opening a module is an intention; a row in it is
-- a fact. The union is written out because the 13 module tables are
-- separate tables, not one table with a type column.
with per_module as (
  select 'ideas'           as module, user_id from public.ideas
  union all select 'competitors',      user_id from public.competitors
  union all select 'research',         user_id from public.research
  union all select 'finance',          user_id from public.finance_entries
  union all select 'learning',         user_id from public.learning_entries
  union all select 'trading',          user_id from public.trades
  union all select 'decisions',        user_id from public.decisions
  union all select 'products',         user_id from public.products
  union all select 'content',          user_id from public.content
  union all select 'sales',            user_id from public.leads
  union all select 'feedback',         user_id from public.feedback
  union all select 'analytics',        user_id from public.metrics
  union all select 'automation',       user_id from public.automations
)
select module,
       count(*)                as entries,
       count(distinct user_id) as people
from per_module
group by 1
order by people desc, entries desc;

--   READ THIS AGAINST 29.1, ROW BY ROW. Four combinations, four actions:
--
--   OPENED, and has ENTRIES     -> working. Leave it alone.
--   OPENED, and has NO ENTRIES  -> the worst row on the page, and the
--        most fixable. People find it, look at it, and leave without
--        writing anything. That is an empty state or a form problem, not
--        a demand problem. Fix it; do not cut it.
--   NOT OPENED, but has ENTRIES -> it is being written by something other
--        than a person browsing to it — the classifier, Create Anything,
--        an automation. Cutting the SCREEN is safe; cutting the TABLE
--        would break a writer. Check what writes it first.
--   NOT OPENED, NO ENTRIES      -> cut it.

-- 29.4  WHERE PEOPLE COME FROM — the column that makes 29.1 a flow
-- rather than a pile of counts.
select coalesce(referrer, '(direct)') as came_from,
       path                            as went_to,
       count(*)                        as journeys
from public.nav_events
where created_at > now() - interval '30 days'
group by 1, 2
having count(*) > 1
order by journeys desc
limit 40;

--   IF the top rows are all from
--      '/dashboard'                     -> the Home is the product's
--        switchboard. Every module you want used has to be visible there,
--        not only in the sidebar.
--   IF a module's only inbound row is
--      '(direct)' or 'external'         -> people reach it by bookmark or
--        link, never from inside the app. It is unreachable by
--        navigation; that is a sidebar bug, not a demand signal.
--   IF a pair repeats constantly in
--      BOTH directions                  -> those two screens are one
--        screen. Merge them or put the second one's content in a panel on
--        the first.


-- ───────────────────────────────────────────────────────────────────
-- #30  ONBOARDING
-- ───────────────────────────────────────────────────────────────────

-- 30.1  THE FUNNEL. user_onboarding has one row per user who reached it.
select count(*)                                            as reached_onboarding,
       count(*) filter (where completed_at is not null)     as completed,
       count(*) filter (where skipped_at   is not null)     as skipped,
       count(*) filter (where activation_used_at is not null) as used_activation,
       count(*) filter (where home_seen_at is not null)     as saw_the_home,
       count(*) filter (where goal is not null and goal <> '') as stated_a_goal
from public.user_onboarding;

--   IF skipped > completed              -> the onboarding is a toll, not
--        a start. Cut it to one screen — the goal — and let the rest be
--        discovered. People who skip still convert; people who abandon
--        do not.
--   IF completed is high but
--      saw_the_home is much lower       -> they finish onboarding and
--        never arrive. That is a redirect or a load failure between the
--        last step and /dashboard, and it is a BUG, not a design
--        question. Find it today.
--   IF stated_a_goal is much lower
--      than reached_onboarding          -> the goal step is where they
--        stop. Make it optional or give it three buttons instead of a
--        text field.
--   IF used_activation is near 0        -> the activation offer is not
--        being seen or not worth taking. Check where it is shown before
--        changing what it gives.

-- 30.2  TIME FROM ONBOARDING TO FIRST ENTRY — "signup to first result".
with firsts as (
  select user_id, min(created_at) as first_entry from (
    select user_id, created_at from public.ideas
    union all select user_id, created_at from public.competitors
    union all select user_id, created_at from public.research
    union all select user_id, created_at from public.finance_entries
    union all select user_id, created_at from public.learning_entries
    union all select user_id, created_at from public.trades
    union all select user_id, created_at from public.decisions
    union all select user_id, created_at from public.products
    union all select user_id, created_at from public.content
    union all select user_id, created_at from public.leads
    union all select user_id, created_at from public.feedback
    union all select user_id, created_at from public.metrics
    union all select user_id, created_at from public.automations
  ) all_entries group by 1
)
select count(*)                                                              as people_with_a_first_entry,
       round(avg(extract(epoch from (f.first_entry - o.created_at)) / 60)::numeric, 1) as avg_minutes,
       round((percentile_cont(0.5) within group (
         order by extract(epoch from (f.first_entry - o.created_at)) / 60))::numeric, 1) as median_minutes
from public.user_onboarding o
join firsts f on f.user_id = o.user_id
where f.first_entry >= o.created_at;

--   READ median_minutes, not avg_minutes — one person who came back a
--   month later moves the mean by hours and tells you nothing.
--
--   IF median_minutes < 5               -> the first run works. Do not
--        touch onboarding; spend the effort on the second session.
--   IF median_minutes 5-30              -> acceptable, and the cheapest
--        win is a pre-filled example row so the first entry is an EDIT
--        rather than a blank form.
--   IF median_minutes > 60              -> people leave and come back
--        before writing anything. The first screen is not asking for
--        something small enough. Make the first action one field.
--   IF people_with_a_first_entry is a
--      small fraction of
--      reached_onboarding (30.1)        -> THIS IS THE NUMBER THAT
--        MATTERS MOST IN THE WHOLE FILE. Most people who sign up never
--        write anything at all, and no amount of module simplification
--        changes that. Fix it before #27 and before #29.

-- 30.3  WHERE THEY STOP. Each row is one step and how many are still
-- there. Read it top to bottom and find the biggest drop.
select 'reached onboarding' as step, count(*) as people from public.user_onboarding
union all
select 'stated a goal', count(*) from public.user_onboarding where goal is not null and goal <> ''
union all
select 'completed or skipped', count(*) from public.user_onboarding where completed_at is not null or skipped_at is not null
union all
select 'saw the Home', count(*) from public.user_onboarding where home_seen_at is not null
union all
select 'made an entry', count(distinct user_id) from (
  select user_id from public.ideas union all select user_id from public.finance_entries
  union all select user_id from public.leads union all select user_id from public.research
) any_entry;

--   THE BIGGEST SINGLE DROP IS THE ONLY THING TO WORK ON. Fixing a 5%
--   step while a 60% step sits below it changes nothing.
--
--   IF the drop is at 'stated a goal'   -> the form is the obstacle.
--   IF the drop is at 'saw the Home'    -> a routing or load bug.
--   IF the drop is at 'made an entry'   -> the Home does not make the
--        next action obvious. This is what the Home rework was for; if
--        the drop is still here afterwards, the rework did not land.
--   NOTE 'made an entry' counts FOUR modules, not thirteen — it is a
--   floor, deliberately. If it is already close to 'saw the Home', the
--   funnel is healthy and the real number is higher still.


-- ───────────────────────────────────────────────────────────────────
-- #31  MOBILE
-- ───────────────────────────────────────────────────────────────────
-- pwa_events DOES NOT EXIST. The real table is pwa_client_stats: one row
-- per (user, client_id), UPDATED rather than appended — so it describes
-- devices as they are now and cannot answer anything about change over
-- time. Every reading below is a snapshot.

-- 31.1  WHAT THEY ARE ON.
select coalesce(platform, 'unknown')     as platform,
       count(*)                          as clients,
       count(distinct user_id)           as people,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
from public.pwa_client_stats
group by 1
order by clients desc;

--   IF mobile platforms > 40%           -> mobile is not a secondary
--        surface and every new screen has to be built at 390px first.
--   IF mobile < 15%                     -> stop spending on mobile
--        polish; the desktop screens are where the users are. Say this
--        out loud rather than letting mobile work continue by default.
--   IF 'unknown' is the largest row     -> the platform is not being
--        recorded properly. Fix the reporting before reading anything
--        else here — a 60% 'unknown' makes every other percentage wrong.
--   IF clients is much larger than
--      people                           -> people use several devices.
--        Cross-device state (drafts, filters) is worth building; a
--        localStorage-only feature will feel broken to them.

-- 31.2  INSTALLED, AND PUSH.
select count(*)                                                  as clients,
       count(*) filter (where installed)                          as installed,
       round(100.0 * count(*) filter (where installed) / nullif(count(*), 0), 1) as pct_installed,
       count(*) filter (where push_subscribed)                    as push_subscribed,
       round(100.0 * count(*) filter (where push_subscribed) / nullif(count(*), 0), 1) as pct_push,
       count(*) filter (where push_permission = 'denied')         as push_denied
from public.pwa_client_stats;

--   IF pct_installed < 5%               -> the install prompt is not
--        working or is not being shown. Do not build more PWA features
--        until it is: an offline mode nobody installs is unreachable
--        code.
--   IF push_denied > push_subscribed    -> you are asking too early. A
--        denied permission is PERMANENT in the browser — it cannot be
--        asked again — so every one of those is a device that can never
--        receive a notification. Move the prompt behind a deliberate
--        action.
--   IF pct_push > 30%                   -> push is a real channel. It is
--        worth having something to say on it before the weekly digest.

-- 31.3  DISPLAY MODE — the honest "is it really installed" signal, since
-- `installed` is self-reported by the client.
select coalesce(display_mode, 'unknown') as display_mode, count(*) as clients
from public.pwa_client_stats
group by 1
order by clients desc;

--   IF 'standalone' is much LOWER than
--      `installed` in 31.2              -> the self-report is wrong and
--        31.2's install rate is optimistic. Trust this query, not that
--        one.
--   IF 'browser' dominates              -> nobody has installed anything,
--        whatever 31.2 says.
