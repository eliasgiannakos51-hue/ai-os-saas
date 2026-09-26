# The sidebar: where every feature goes, before it exists

**Produced, not maintained.** The table below is written by
`node scripts/sidebar-register.mjs --write` out of `src/lib/sidebar-nav.ts`,
and the visibility columns are computed by running the product's own
`visibleGroups` / `sidebarGroups` from `src/lib/sidebar-visibility.ts`.
Re-run it after any change to the config; `scripts/tests/sidebar-structure.test.mjs`
is what stops the config and the declaration drifting apart in the
meantime.

The counts in the prose below are the ones the table prints. Anything
here that is a judgement rather than a measurement says so.

## Why a position is worth declaring before the feature exists

Every feature that arrived after the first list was written got appended
to the end of whichever group it belonged to, because nobody had said
where it went. A row is where a person reaches for it, and "wherever it
landed" is not a place.

`Meetings` is the worked example and the only one so far to make the
whole journey: its position was decided cold on 2026-09-19 while nothing
behind it existed, the flag came off on 2026-09-23 when the feature
shipped, and the row appeared between Weekly Reflection and Team without
anybody re-opening the question. The declaration did not change that day.
That is the entire point.

## The four states, and the difference between them

| state | is there a page? | drawn in the sidebar? | in ⌘K and on `/dashboard/records`? |
|---|---|---|---|
| live | yes | yes | yes |
| `hidden` | yes, and it works | no | yes |
| `notBuilt` | **no** | no | no — offering it would be offering a 404 |
| `retired` | yes, and it still serves anyone holding the URL | no | no — the capability was withdrawn |
| `ownerOnly` | yes | for the account owner only | for the account owner only |

`hidden` and `notBuilt` are not interchangeable and the gate treats a
swap between them as a decision rather than a detail. A `notBuilt`
href must NOT resolve — `sidebar-structure.test.mjs` fails the build if
a page appears under one without the flag being removed, which is what
makes the flag self-clearing instead of a label somebody has to
remember.

`retired` is the mirror of `notBuilt`: the page works and nothing offers
it. Ready-made helpers (`/dashboard/marketplace`) is the only one, and it
is there because it charged credits without producing anything.

## What the structure of 2026-09-26 asked for, and what it got

The owner's structure named ten groups and, by his count, sixty-nine
positions. Counted from his own list it is **eighty-four**; declared in
the config it is **111**, and the gap is not a disagreement. The 111
includes twenty-seven `hidden` rows that his list does not mention —
Create Studio, Published Sites, the two guided workflows, the twelve
trackers, the three owner-only operational pages — every one of which is
a page that exists, works, and is reachable from the command palette and
the hub. Deleting them to match a list of eighty-four would have removed
them from search, which is the opposite of making the product reachable.

Three of his groups' items already existed under a different name and
kept it: `Websites` is the Website Builder, `Goals & Plans` is Mission
Control, `Week` is the Weekly Reflection, `Memory` is what the chat
remembers. `Search` and `Files` were already drawn.

**One row changed state:** Data Analysis. It was built, it works — upload
profiles the file, `[id]/analyse` hands the profile to a model, `[id]/ask`
answers questions about it, `[id]/export` writes it out — and it was
hidden in the September tidy-up. Under the owner's own rule (exists and
works → the flag comes off) it is drawn again. *Verified by reading the
routes, not by a signed-in run; nothing in this container can sign in.*

**Five groups are declared and invisible.** Connect, Business,
Engineering, Verify and Personal hold forty-three positions between them
and not one live row, so `visibleGroups` empties them and drops them: no
heading, no palette entry, nothing on the hub. A reader of the running
app cannot tell they exist.

## What is on screen right now

Twenty-seven rows for an ordinary account, twenty-eight for the owner
(Business health is `ownerOnly`), under six headings. The declared
structure is 111 positions under eleven headings. Both numbers are
printed by `node scripts/sidebar-census.mjs`, which runs the same two
filters the sidebar does.

## The register

<!-- REGISTER:BEGIN — written by scripts/sidebar-register.mjs, do not edit by hand -->

Declared positions: **111** in **11** groups. Drawn for an ordinary account: **27**; for the owner: **28**. Offered by the command palette and the hub: **51**.

### Make — 6 drawn of 14 declared

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 1 | 1 | Website Builder | `/dashboard/website-builder` | **live** | sidebar |
| 2 | 2 | Documents | `/dashboard/documents` | **live** | sidebar |
| 3 | 3 | Presentations | `/dashboard/presentations` | **live** | sidebar |
| 4 | 4 | Posts | `/dashboard/posts` | **live** | sidebar |
| 5 | 5 | AI Coding | `/dashboard/coding` | **live** | sidebar |
| 6 | 6 | Images | `/dashboard/images` | hidden | ⌘K + hub |
| 7 | 7 | Videos | `/dashboard/videos` | hidden | ⌘K + hub |
| 8 | 8 | Music | `/dashboard/music` | notBuilt | nowhere |
| 9 | 9 | Design | `/dashboard/design` | notBuilt | nowhere |
| 10 | 10 | Apps | `/dashboard/apps` | hidden | ⌘K + hub |
| 11 | 11 | Data Analysis | `/dashboard/data-analysis` | **live** | sidebar |
| 12 | 12 | CREATE_NAV_ITEM.label | `/dashboard/create` | hidden | ⌘K + hub |
| 13 | 13 | Published Sites | `/dashboard/published` | hidden | ⌘K + hub |
| 14 | 14 | Form Submissions | `/dashboard/form-submissions` | hidden | ⌘K + hub |

### Ask — 4 drawn of 6 declared

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 15 | 1 | Ionexa Chat | `CHAT_NAV_ITEM.href` | **live** | sidebar |
| 16 | 2 | Deep Research | `/dashboard/deep-research` | **live** | sidebar |
| 17 | 3 | Predictions | `/dashboard/predictions` | **live** | sidebar |
| 18 | 4 | Voice | `/dashboard/voice` | **live** | sidebar |
| 19 | 5 | Learning | `/dashboard/learning` | hidden | ⌘K + hub |
| 20 | 6 | Decisions | `/dashboard/decisions` | hidden | ⌘K + hub |

### Run — 2 drawn of 10 declared

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 21 | 1 | AI Agents | `/dashboard/agents` | **live** | sidebar |
| 22 | 2 | Automation | `/dashboard/automation` | **live** | sidebar |
| 23 | 3 | Marketplace | `/dashboard/marketplace` | retired | nowhere |
| 24 | 4 | Workflows | `/dashboard/workflows` | notBuilt | nowhere |
| 25 | 5 | Scheduled Jobs | `/dashboard/scheduled-jobs` | notBuilt | nowhere |
| 26 | 6 | Operations | `/dashboard/operations` | notBuilt | nowhere |
| 27 | 7 | Browser agent | `/dashboard/browser` | notBuilt | nowhere |
| 28 | 8 | Computer agent | `/dashboard/computer` | notBuilt | nowhere |
| 29 | 9 | Product Workflow | `/dashboard/product-workflow` | hidden | ⌘K + hub |
| 30 | 10 | Trading Workflow | `/dashboard/trading-workflow` | hidden | ⌘K + hub |

### See — 8 drawn of 23 declared

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 31 | 1 | Timeline | `TIMELINE_NAV_ITEM.href` | **live** | sidebar |
| 32 | 2 | Files | `/dashboard/files` | **live** | sidebar |
| 33 | 3 | Finance | `/dashboard/finance` | **live** | sidebar |
| 34 | 4 | Sales | `/dashboard/sales` | **live** | sidebar |
| 35 | 5 | Trading | `/dashboard/trading` | **live** | sidebar |
| 36 | 6 | Search my records | `/dashboard/search` | **live** | sidebar |
| 37 | 7 | What it remembers | `/dashboard/ai-memory` | **live** | sidebar |
| 38 | 8 | Business health | `/dashboard/business-health` | ownerOnly | sidebar (owner) |
| 39 | 9 | Analytics | `/dashboard/analytics` | hidden | ⌘K + hub |
| 40 | 10 | Monitoring | `/dashboard/monitoring` | notBuilt | nowhere |
| 41 | 11 | Knowledge Graph | `/dashboard/knowledge-graph` | notBuilt | nowhere |
| 42 | 12 | Home | `OVERVIEW_NAV_ITEM.href` | hidden | ⌘K + hub |
| 43 | 13 | My records | `/dashboard/records` | hidden | ⌘K + hub |
| 44 | 14 | Favorites | `/dashboard/favorites` | hidden | ⌘K + hub |
| 45 | 15 | Ideas | `/dashboard` | hidden | ⌘K + hub |
| 46 | 16 | Content | `/dashboard/content` | hidden | ⌘K + hub |
| 47 | 17 | Products | `/dashboard/products` | hidden | ⌘K + hub |
| 48 | 18 | Research | `/dashboard/research` | hidden | ⌘K + hub |
| 49 | 19 | Competitors | `/dashboard/competitors` | hidden | ⌘K + hub |
| 50 | 20 | Feedback | `/dashboard/feedback` | hidden | ⌘K + hub |
| 51 | 21 | Trading Journal | `/dashboard/trading-journal` | hidden | ⌘K + hub |
| 52 | 22 | Websites | `/dashboard/websites` | hidden | ⌘K + hub |
| 53 | 23 | Campaigns | `/dashboard/campaigns` | hidden | ⌘K + hub |

### Organise — 5 drawn of 8 declared

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 54 | 1 | Projects | `/dashboard/projects` | **live** | sidebar |
| 55 | 2 | MISSION_NAV_ITEM.label | `MISSION_NAV_ITEM.href` | **live** | sidebar |
| 56 | 3 | REFLECTION_NAV_ITEM.label | `REFLECTION_NAV_ITEM.href` | **live** | sidebar |
| 57 | 4 | Meetings | `/dashboard/meetings` | **live** | sidebar |
| 58 | 5 | Team | `/dashboard/team` | **live** | sidebar |
| 59 | 6 | Calendar | `/dashboard/calendar` | notBuilt | nowhere |
| 60 | 7 | Tasks | `/dashboard/tasks` | notBuilt | nowhere |
| 61 | 8 | Knowledge | `/dashboard/knowledge` | notBuilt | nowhere |

### Connect — 0 drawn of 11 declared · **the heading is not on screen**

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 62 | 1 | Email | `/dashboard/connect/email` | notBuilt | nowhere |
| 63 | 2 | Calendar Sync | `/dashboard/connect/calendar` | notBuilt | nowhere |
| 64 | 3 | GitHub | `/dashboard/connect/github` | notBuilt | nowhere |
| 65 | 4 | Google Drive | `/dashboard/connect/drive` | notBuilt | nowhere |
| 66 | 5 | Slack | `/dashboard/connect/slack` | notBuilt | nowhere |
| 67 | 6 | CRM Connector | `/dashboard/connect/crm` | notBuilt | nowhere |
| 68 | 7 | Banking | `/dashboard/connect/banking` | notBuilt | nowhere |
| 69 | 8 | APIs | `/dashboard/connect/apis` | notBuilt | nowhere |
| 70 | 9 | Data Sources | `/dashboard/connect/data-sources` | notBuilt | nowhere |
| 71 | 10 | MCP | `/dashboard/connect/mcp` | notBuilt | nowhere |
| 72 | 11 | IoT Devices | `/dashboard/connect/iot` | notBuilt | nowhere |

### Business — 0 drawn of 9 declared · **the heading is not on screen**

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 73 | 1 | CRM | `/dashboard/business/crm` | notBuilt | nowhere |
| 74 | 2 | Marketing | `/dashboard/business/marketing` | notBuilt | nowhere |
| 75 | 3 | Accounting | `/dashboard/business/accounting` | notBuilt | nowhere |
| 76 | 4 | Company Finance | `/dashboard/business/finance` | notBuilt | nowhere |
| 77 | 5 | HR | `/dashboard/business/hr` | notBuilt | nowhere |
| 78 | 6 | Legal | `/dashboard/business/legal` | notBuilt | nowhere |
| 79 | 7 | Procurement | `/dashboard/business/procurement` | notBuilt | nowhere |
| 80 | 8 | Inventory | `/dashboard/business/inventory` | notBuilt | nowhere |
| 81 | 9 | Customer Support | `/dashboard/business/support` | notBuilt | nowhere |

### Engineering — 0 drawn of 9 declared · **the heading is not on screen**

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 82 | 1 | Code | `/dashboard/engineering/code` | notBuilt | nowhere |
| 83 | 2 | Testing | `/dashboard/engineering/testing` | notBuilt | nowhere |
| 84 | 3 | Deployment | `/dashboard/engineering/deployment` | notBuilt | nowhere |
| 85 | 4 | Cloud | `/dashboard/engineering/cloud` | notBuilt | nowhere |
| 86 | 5 | Database Ops | `/dashboard/engineering/databases` | notBuilt | nowhere |
| 87 | 6 | DevOps | `/dashboard/engineering/devops` | notBuilt | nowhere |
| 88 | 7 | Security | `/dashboard/engineering/security` | notBuilt | nowhere |
| 89 | 8 | Service Monitoring | `/dashboard/engineering/monitoring` | notBuilt | nowhere |
| 90 | 9 | Infrastructure | `/dashboard/engineering/infrastructure` | notBuilt | nowhere |

### Verify — 0 drawn of 7 declared · **the heading is not on screen**

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 91 | 1 | Fact Checking | `/dashboard/verify/facts` | notBuilt | nowhere |
| 92 | 2 | Data Validation | `/dashboard/verify/data` | notBuilt | nowhere |
| 93 | 3 | Code Verification | `/dashboard/verify/code` | notBuilt | nowhere |
| 94 | 4 | Security Testing | `/dashboard/verify/security` | notBuilt | nowhere |
| 95 | 5 | Output Evaluation | `/dashboard/verify/output` | notBuilt | nowhere |
| 96 | 6 | Source Verification | `/dashboard/verify/sources` | notBuilt | nowhere |
| 97 | 7 | Red Teaming | `/dashboard/verify/red-team` | notBuilt | nowhere |

### Personal — 0 drawn of 7 declared · **the heading is not on screen**

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 98 | 1 | Habits | `/dashboard/personal/habits` | notBuilt | nowhere |
| 99 | 2 | Health | `/dashboard/personal/health` | notBuilt | nowhere |
| 100 | 3 | Travel | `/dashboard/personal/travel` | notBuilt | nowhere |
| 101 | 4 | Shopping | `/dashboard/personal/shopping` | notBuilt | nowhere |
| 102 | 5 | Personal Finance | `/dashboard/personal/finance` | notBuilt | nowhere |
| 103 | 6 | Journaling | `/dashboard/personal/journal` | notBuilt | nowhere |
| 104 | 7 | Life OS | `/dashboard/personal/life-os` | notBuilt | nowhere |

### Settings — 3 drawn of 7 declared

| # | position | label (en) | href | state | reachable from |
|---|---|---|---|---|---|
| 105 | 1 | Integrations | `/dashboard/integrations` | **live** | sidebar |
| 106 | 2 | Settings | `SETTINGS_NAV_ITEM.href` | **live** | sidebar |
| 107 | 3 | Help Centre | `/help` | **live** | sidebar |
| 108 | 4 | Affiliate | `/dashboard/affiliate` | hidden | ⌘K + hub |
| 109 | 5 | Costs | `/dashboard/costs` | ownerOnly + hidden | nowhere |
| 110 | 6 | Routing | `/dashboard/routing` | ownerOnly + hidden | nowhere |
| 111 | 7 | System Health | `/dashboard/system-health` | ownerOnly + hidden | nowhere |

<!-- REGISTER:END -->

## What holds this

| file | what it holds |
|---|---|
| `scripts/tests/sidebar-structure.test.mjs` | the declared ORDER, position by position, for all eleven groups drawn or not; the flag each held row carries; that no held row reaches the palette; that a heading appears exactly when its group has a live row |
| `scripts/tests/sidebar-structure.mutation.mjs` | 26 mutants, each required to redden a named clause — a held row drawn, an empty group with a heading, a reorder, a tracker shown under Make |
| `scripts/tests/sidebar-and-tooltips.test.mjs` | the same group rule through the real filter for both roles, split by reading the config rather than by naming the five |
| `scripts/tests/sidebar-naming.test.mjs` | every heading and every label has a key and ten translations; nothing that fails to reach a model is drawn under Make |
| `scripts/tests/sidebar-hints-coverage.test.mjs` | every drawn row has a hint in ten languages, and no held row has one |
| `scripts/tests/sidebar-size.test.mjs` | at most six headings ON SCREEN, at most eleven declared |
| `scripts/sidebar-census.mjs` | what is drawn, declared, offered and dark — by running the filters |
| `scripts/sidebar-register.mjs` | the table above |

**Labels are translated for held rows; hints are not.** A name is the
word the owner already chose and the row has to be findable in ten
languages the day its flag comes off. A hint is a sentence about how a
feature behaves and cannot be written before it behaves —
`sidebar-hints-coverage.test.mjs` checks that direction too, so a hint
written for a row nobody can see fails the build.

**Every held row wears the same icon** (`HELD_POSITION_ICON`, a dashed
circle). An icon is chosen against what a screen does and none of these
has a screen; nobody ever sees it, because the row is stripped before
every surface. A row needs its own mark the day the flag comes off.
