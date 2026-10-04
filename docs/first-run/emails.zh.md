# The emails — zh

Every line of every email the product sends: **108 strings**. The interface has its own pack, `first-run.zh.md`, beside this one.

**Start with tier 1. It is 37 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 45 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (37)

_From the emails a person is sure or likely to receive, 5 words or more._

### welcome — every account gets it, minutes after signing up

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

你的账户已经可以使用了——不需要邮箱验证，现在就能登录。Ionexa AI 由 13 个模块组成，用来经营一家初创公司，另外还有一个自由输入框，会把你写下的内容自动归到正确的模块里。

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

提示：在 {path} 你可以直接用自己的话描述发生了什么，它会自动落到正确的模块。

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

你的 Ionexa AI 账户已就绪。

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

你的账户有新的登录

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

我们注意到有人用我们没见过的设备或浏览器登录了你的 Ionexa AI 账户。

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

如果是你本人，无需处理。如果你不认识这次登录，请立即重置密码。

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

有人从 {device} 登录了你的 Ionexa AI 账户。

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

这次生成已经运行超过 24 小时仍未完成——这并不正常，很可能是卡住了，而不是还在工作。这次没有扣除任何积分。点击下方打开它，重试或删除。

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}”已经卡在生成中超过 24 小时。

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

“{name}”似乎卡住了 — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

你的计划任务已完成

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

你的计划任务未能运行

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

你的计划任务“{step}”已完成。

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

你的计划任务“{step}”未能运行。

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

你的计划任务已完成 — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

你的计划任务未能运行 — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

积分不足——请充值或升级套餐，然后重新安排这项任务。

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

积分不足——请充值或升级套餐。该自动化将在下个周期再次尝试。

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

“{name}”已被关闭

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

它连续失败了 {count} 次，因此已停止运行，以免继续失败并继续消耗你的积分。

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

点击下方打开它，检查任务后重新开启。

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

“{name}”在 {count} 次失败后停止运行。

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

“{name}”已被关闭 — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

它无法运行，因为你的账户积分已用完。没有产生任何费用，也没有丢失任何东西——充值或升级后重新开启，它会恢复原本的计划。

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}”已暂停——你的账户积分已用完。

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}”已暂停 — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

你的订阅将要结束

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

你可以完整使用到 {date}。在那之前什么都不会变——剩余的额度仍可使用，你的数据一条也不会被删除。

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

你可以完整使用到已付费周期结束为止。在那之前什么都不会变——剩余的额度仍可使用，你的数据一条也不会被删除。

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

之后账户会转为免费方案。你的条目、文件和对话都会留在原处。

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

改主意了？恢复订阅

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

在订阅结束前你随时可以恢复，不需要额外付费——这个周期你已经付过了。

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

你的 Ionexa AI 订阅将在 {date} 结束。在那之前你仍可使用。

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

你的 Ionexa AI 订阅将要结束。已付费周期结束前你仍可使用。

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

我们收到了永久删除你的 Ionexa AI 账户以及所有模块中全部记录的请求。此操作无法撤销。

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

此链接 1 小时后失效。如果不是你提出的，忽略这封邮件即可，你的账户会保持原样。

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

确认永久删除你的 Ionexa AI 账户。

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

你在 Ionexa AI 的一周

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

{runs} 次智能体运行，其中 {found} 次有结果

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} 次智能体运行，其中 {found} 次有结果

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

花费 {count} 积分（你的平均值：{average}）

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

花费 {count} 积分（你的平均值：{average}）

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

{count} 个客户线索没有记录后续跟进

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} 个客户线索没有记录后续跟进

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

支出比你的平均值高 {percent}%

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

支出比你的平均值低 {percent}%

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

网站访问量上升了 {percent}%

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

网站访问量下降了 {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

有人通过“{name}”联系了你

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

“{name}”上有新的表单提交 — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

记录并评估新的产品或业务想法。

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

跟踪竞品、定价和市场定位。

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

你正在研究的一切的笔记与摘要。

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

你正在学习的主题，附带资料和测验。

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

交易记录——品种、方向、结果、盈亏。

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

权衡各种选择并记录结论。

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

产品规划——定价、路线图、发布计划。

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

内容创意、文案和系列贴文。

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

潜在客户、开发邮件和下一步。

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

用户反馈，按情绪和优先级分类。

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

任何值得长期跟踪的指标。

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

值得自动化的流程，以及省下的时间。

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

你收到这封邮件，是因为你拥有 Ionexa AI 账户。

## Tier 3 — Subjects, labels and the footer — skim (45)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### welcome — every account gets it, minutes after signing up

**`email.welcome.label`**

> EN — signup

注册

**`email.welcome.title`**

> EN — welcome to Ionexa AI

欢迎使用 Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

安全

**`email.newDevice.when`**

> EN — When

时间

**`email.newDevice.device`**

> EN — Device

设备

**`email.newDevice.ip`**

> EN — IP address

IP 地址

**`email.newDevice.cta`**

> EN — Reset password

重置密码

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

网站生成器

**`email.stuck.title`**

> EN — “{name}” seems stuck

“{name}”似乎卡住了

**`email.stuck.cta`**

> EN — Open Website Builder

打开网站生成器

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

计划中的智能体运行

**`email.scheduledRun.cta`**

> EN — Open {name}

打开{name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

你的智能体

**`email.agent.resultCta`**

> EN — Manage your agents

管理你的智能体

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — 你的计划结果。

**`email.agent.disabledLastError`**

> EN — Last error: {error}

最后一次错误：{error}

**`email.agent.disabledCta`**

> EN — Open your agents

打开你的智能体

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}”已暂停

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

充值积分

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

打开你的智能体

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

订阅

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

账户删除

**`email.deletion.title`**

> EN — confirm account deletion

确认删除账户

**`email.deletion.cta`**

> EN — Confirm deletion

确认删除

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

周报

**`email.digest.title`**

> EN — this week

本周

**`email.digest.noticed`**

> EN — what I noticed

我注意到的

**`email.digest.cta`**

> EN — Open your dashboard

打开你的仪表盘

**`email.digest.subject`**

> EN — this week: {first}

本周：{first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

{count} 条新记录

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} 条新记录

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

你的网站：{count} 次访问

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

你的网站：{count} 次访问

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

花费 {count} 积分

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

花费 {count} 积分

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

{count} 次智能体运行失败

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} 次智能体运行失败

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

新的表单提交

**`email.formSubmission.cta`**

> EN — View your websites

查看你的网站

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

{name} 上有新的表单提交

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

可能是真实客户

**`email.formSubmission.badges.question`**

> EN — General question

一般咨询

**`email.formSubmission.badges.spam`**

> EN — Possible spam

可能是垃圾信息

**`email.formSubmission.badges.unclear`**

> EN — Unclear

无法判断

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

记录收入和支出。
