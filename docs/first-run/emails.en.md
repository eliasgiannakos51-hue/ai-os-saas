# The emails — en

Every line of every email the product sends: **115 strings**. The interface has its own pack, `first-run.en.md`, beside this one.

**Start with tier 1. It is 41 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 48 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

_This is the English original. It is here so a reader of another file can be sent both._

## Tier 1 — THE SENTENCES — read these (41)

_From the emails a person is sure or likely to receive, 5 words or more._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.subject`**


Confirm your email for Ionexa AI

**`email.confirm.preheader`**


One click and your account is ready.

**`email.confirm.body`**


Press the button to confirm this address and open your Ionexa AI account.

**`email.confirm.ignore`**


If you did not create this account, ignore this email: nothing happens without the link.

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.body`**


Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

**`email.welcome.tip`**


Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

**`email.welcome.preheader`**


Your Ionexa AI account is ready.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**


new sign-in to your account

**`email.newDevice.body`**


We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

**`email.newDevice.ifYou`**


If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

**`email.newDevice.preheader`**


New sign-in to your Ionexa AI account from {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**


This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

**`email.stuck.preheader`**


“{name}” has been stuck generating for over 24 hours.

**`email.stuck.subject`**


“{name}” seems stuck — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**


your scheduled task is done

**`email.scheduledRun.titleFailed`**


your scheduled task couldn't run

**`email.scheduledRun.preheaderDone`**


Your scheduled task “{step}” is done.

**`email.scheduledRun.preheaderFailed`**


Your scheduled task “{step}” couldn't run.

**`email.scheduledRun.subjectDone`**


Your scheduled task is done — Ionexa AI

**`email.scheduledRun.subjectFailed`**


Your scheduled task couldn't run — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**


Not enough credits — top up or upgrade your plan, then schedule it again.

**`email.scheduledRun.details.noCreditsRecurring`**


Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**


“{name}” has been switched off

**`email.agent.disabledBody`**


It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

**`email.agent.disabledHint`**


Open it below to check the task and turn it back on.

**`email.agent.disabledPreheader`**


“{name}” stopped running after {count} failures.

**`email.agent.disabledSubject`**


“{name}” has been switched off — Ionexa AI

**`email.agent.pausedBody`**


It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

**`email.agent.pausedPreheader`**


“{name}” is paused — your account is out of credits.

**`email.agent.pausedSubject`**


“{name}” is paused — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**


your subscription is set to end

**`email.cancelled.untilDate`**


You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

**`email.cancelled.untilPeriodEnd`**


You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

**`email.cancelled.afterwards`**


After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

**`email.cancelled.cta`**


Changed your mind? Restore it

**`email.cancelled.noCharge`**


You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

**`email.cancelled.preheaderDate`**


Your Ionexa AI subscription ends on {date}. You keep access until then.

**`email.cancelled.preheader`**


Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**


We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

**`email.deletion.expiry`**


This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

**`email.deletion.preheader`**


Confirm permanent deletion of your Ionexa AI account.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**


your week on Ionexa AI

**`email.digest.lines.agents.one`**


{runs} agent run, {found} with a result

**`email.digest.lines.agents.other`**


{runs} agent runs, {found} with a result

**`email.digest.lines.creditsWithAverage.one`**


{count} credit spent (your average: {average})

**`email.digest.lines.creditsWithAverage.other`**


{count} credits spent (your average: {average})

**`email.digest.lines.leads.one`**


{count} lead with no follow-up recorded

**`email.digest.lines.leads.other`**


{count} leads with no follow-up recorded

**`email.digest.lines.spendUp`**


spending is up {percent}% on your average

**`email.digest.lines.spendDown`**


spending is down {percent}% on your average

**`email.digest.lines.trafficUp`**


site traffic is up {percent}%

**`email.digest.lines.trafficDown`**


site traffic is down {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**


Someone contacted you via “{name}”

**`email.formSubmission.subject`**


New form submission on “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**


Capture and score new product or business ideas.

**`email.blurbs.competitors`**


Track rival products, pricing, and positioning.

**`email.blurbs.research`**


Notes and summaries from anything you're researching.

**`email.blurbs.learning`**


Topics you're studying, with resources and quizzes.

**`email.blurbs.trading`**


Trade log — symbol, direction, result, profit and loss.

**`email.blurbs.decisions`**


Weigh options and record the recommendation.

**`email.blurbs.products`**


Product plans — pricing, roadmap, launch plan.

**`email.blurbs.content`**


Content ideas, captions, and threads.

**`email.blurbs.sales`**


Leads, outreach emails, and next steps.

**`email.blurbs.feedback`**


User feedback, triaged by sentiment and priority.

**`email.blurbs.analytics`**


Any metric worth tracking over time.

**`email.blurbs.automation`**


Workflows worth automating, and time saved.

### footer — the footer under every email

**`email.footer`**


You're receiving this because you have a Ionexa AI account.

## Tier 3 — Subjects, labels and the footer — skim (48)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### confirm — every new account gets it first: the link that proves the address (NEEDS 22)

**`email.confirm.label`**


confirm your email

**`email.confirm.title`**


Confirm it's you

**`email.confirm.button`**


Confirm email

### welcome — every account gets it, minutes after confirming its address

**`email.welcome.label`**


signup

**`email.welcome.title`**


welcome to Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**


security

**`email.newDevice.when`**


When

**`email.newDevice.device`**


Device

**`email.newDevice.ip`**


IP address

**`email.newDevice.cta`**


Reset password

### stuck — a website generation that did not finish

**`email.stuck.label`**


website builder

**`email.stuck.title`**


“{name}” seems stuck

**`email.stuck.cta`**


Open Website Builder

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**


scheduled agent run

**`email.scheduledRun.cta`**


Open {name}

### agent — an agent's result or failure

**`email.agent.label`**


your agent

**`email.agent.resultCta`**


Manage your agents

**`email.agent.resultPreheader`**


{name} — your scheduled result.

**`email.agent.disabledLastError`**


Last error: {error}

**`email.agent.disabledCta`**


Open your agents

**`email.agent.pausedTitle`**


“{name}” is paused

**`email.agent.pausedCtaTopUp`**


Top up credits

**`email.agent.pausedCtaAgents`**


Open your agents

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**


subscription

### deletion — confirming that an account is being deleted

**`email.deletion.label`**


account deletion

**`email.deletion.title`**


confirm account deletion

**`email.deletion.cta`**


Confirm deletion

### digest — the weekly digest, for those who opt in

**`email.digest.label`**


digest

**`email.digest.title`**


this week

**`email.digest.noticed`**


what I noticed

**`email.digest.cta`**


Open your dashboard

**`email.digest.subject`**


this week: {first}

**`email.digest.lines.records.one`**


{count} new entry

**`email.digest.lines.records.other`**


{count} new entries

**`email.digest.lines.site.one`**


your site: {count} visit

**`email.digest.lines.site.other`**


your site: {count} visits

**`email.digest.lines.credits.one`**


{count} credit spent

**`email.digest.lines.credits.other`**


{count} credits spent

**`email.digest.lines.agentFailures.one`**


{count} agent run failed

**`email.digest.lines.agentFailures.other`**


{count} agent runs failed

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**


new form submission

**`email.formSubmission.cta`**


View your websites

**`email.formSubmission.preheader`**


New form submission on {name}

**`email.formSubmission.badges.genuine_interest`**


Likely genuine lead

**`email.formSubmission.badges.question`**


General question

**`email.formSubmission.badges.spam`**


Possible spam

**`email.formSubmission.badges.unclear`**


Unclear

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**


Log income and expenses.
