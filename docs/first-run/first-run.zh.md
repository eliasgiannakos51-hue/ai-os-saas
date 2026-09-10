# The first run — zh

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **610 strings**. The whole product is 3067, which is why this file exists.

**Start with tier 1. It is 46 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 366 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (46)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

无法创建账户。请检查填写的信息后重试 — 未向你收费。

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

您必须同意服务条款和隐私政策才能创建账户。

**`pricing.businessCardDescription`**

> EN — Start with any plan as your team's base, then invite members for +{price}/month each — everyone gets full access at your plan's tier. Perfect for teams working together.

选择任意方案作为团队的基础方案,然后以每位成员 +{price}/月 的价格邀请成员 — 每个人都能获得与您方案同等级别的完整访问权限。非常适合共同协作的团队。

### login

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

无法登录。请检查邮箱和密码，如不确定可重置密码。

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

该登录未完成。请重试，或在下方使用邮箱和密码登录。

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

导入一些真实数据，AI 会在两分钟内告诉你一些关于你业务的发现。

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

你的数据始终属于你。它以私有方式存储，只有你能读取，且绝不会用于训练任何模型。你可以随时删除数据或整个账户。

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

仅呈现你刚导入数据中真实存在的规律。若不足以下结论，我们会明说。

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV 或制表符分隔，最大 {max}。我们会先读取并展示结果，然后才保存。

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

你的日期可能是 日/月 也可能是 月/日——所有日期都在 12 号或之前，我们无法判断。是哪一种？

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

你的首次导入与分析是免费的，不会消耗任何积分。

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

目前的数据还不足以称为规律。通常几十行带日期的记录就会开始显现出一些东西——我们宁可不说，也不会编造。

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

商业计划、会议记录、客户名单。我们会提取可记录的部分，其余保持不变。

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

来自券商、银行或 CRM 的 CSV 导出文件。我们会判断每一列是什么。

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

选择最方便的方式。都不是必需的，之后还可以再添加。

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

商业计划、笔记、清单——我们会提取其中的结构化内容。

### dashboard chrome

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

这些条目是演示数据——一家小设计工作室最近三个月的记录，不是你的。

**`sidebar.hints.apps`**

> EN — Keep track of apps you are planning or have already shipped. It does not build them.

记录你正在筹划或已经上线的应用。它不会构建应用。

**`sidebar.hints.coding`**

> EN — Write, explain, fix, convert and test snippets of code. It does not run code or open a repository.

编写、解释、修复、转换和测试代码片段。它不运行代码，也不访问代码仓库。

**`sidebar.hints.create`**

> EN — Describe what you want in one sentence; it works out the rest.

用一句话描述你要什么，其余的它自己判断。

**`sidebar.hints.deepResearch`**

> EN — Give it a topic and it searches, cross-checks and writes a sourced report

给一个主题，它会搜索、交叉核对并写出带来源的报告

**`sidebar.hints.files`**

> EN — Upload PDFs, Word and Excel files and ask the AI questions about them

上传 PDF、Word 和 Excel 文件，然后向 AI 提问

**`sidebar.hints.images`**

> EN — Keep track of images you are planning or have already made. It does not generate them.

记录你正在筹划或已经做好的图片。它不会生成图片。

**`sidebar.hints.integrations`**

> EN — Connect Gmail, Drive and Slack so the AI can work with your real data

连接 Gmail、Drive 与 Slack，让 AI 处理你真实的数据

**`sidebar.hints.library`**

> EN — Starred, recent and search — all your own entries in one place

收藏、最近和搜索 —— 你的东西都在这里

**`sidebar.hints.marketplace`**

> EN — Share an agent's shape as a template, and start from one someone else shared.

把一个智能体的结构作为模板分享，也可以从别人分享的模板开始。

**`sidebar.hints.posts`**

> EN — Say it once and get a post per platform, each at its length and in its register. It publishes nothing — you copy and post.

说一次，就能得到每个平台各一条、长度和语气各自贴合的帖子。它不发布任何内容——由你复制并发布。

**`sidebar.hints.predictions`**

> EN — Patterns found in your own rows, each with the number of entries it rests on and a link to them.

在你自己的记录里发现的规律，每条都标明依据的条数，并可点回原始记录。

**`sidebar.hints.presentations`**

> EN — Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts.

描述一份演示并获得幻灯片——PowerPoint 或 PDF，配图来自 Unsplash 或你自己的照片。它不绘制图表。

**`sidebar.hints.projects`**

> EN — A folder with a goal. What you put in is what is in it — nothing is dragged in with it.

有目标的文件夹。你放什么就有什么——不会自己进来。

**`sidebar.hints.published`**

> EN — Every site you have live on the web, with its traffic and version history

你所有已上线的网站，含访问量与版本历史

**`sidebar.hints.records`**

> EN — Every log in one place — filter by type instead of hunting the menu

所有记录集中在一处——按类型筛选，不必在菜单里找

**`sidebar.hints.videos`**

> EN — Keep track of videos you are planning or have already made. It does not generate them.

记录你正在筹划或已经做好的视频。它不会生成视频。

**`sidebar.hints.voice`**

> EN — Have text read out loud, or speak and have it written down. Minutes are metered and the price per minute is on the page.

把文字读出来，或者说话并转成文字。按分钟计量，每分钟价格显示在页面上。

### first result

**`dashboard.overview.healthScore.suggestion.recency`**

> EN — You haven't logged anything in a while — add a new entry to pick things back up.

你有一段时间没有记录任何内容了 — 添加一条新条目继续前进。

**`dashboard.overview.nextAction.revisitLink`**

> EN — You linked "{source}" to "{target}" a few days ago — worth revisiting?

你几天前把"{source}"关联到了"{target}" — 值得重新看看吗?

**`dashboard.overview.nextAction.startNew`**

> EN — No new activity in the last 3 days — ready to start something new?

过去3天没有新活动 — 准备好开始新的事情了吗?

**`dashboard.overview.setupProgress.suggestion`**

> EN — Your activity score appears once you have logged {count} entries — enough that no single one decides it.

记录 {count} 条条目后会出现活跃度评分——足够多，才不会由某一条决定。

**`dashboard.overview.statRow.mostActiveExplain`**

> EN — The module you have written in most. Where your attention has gone.

你写得最多的模块，也就是注意力所在。

**`dashboard.overview.statRow.thisWeekExplain`**

> EN — Logged in the last seven days — how active this week has been.

最近七天记录的条目——本周的活跃程度。

**`common.betaExpiry`**

> EN — Your beta access expires in {days, plural, one {# day} other {# days}}. <link>Upgrade to keep full access</link>.

你的 Beta 访问将在 {days, plural, other {#天}}后到期。<link>升级即可继续使用全部功能</link>。

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

显示最近的 {count, number} 条。更早的记录仍然保存着——用「搜索我的记录」可以找到它们。

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

这看起来像一个问题。要回答它，还是记录它？

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

描述任何内容——一个产品创意、一笔交易、一条用户反馈、一项指标——它会自动归入正确的模块。

**`dashboard.energyCheckIn.whatItDoes`**

> EN — Ionexa uses this to pick which plan step to suggest next — lighter work when you're low, demanding work when you're not.

Ionexa 用它来挑选下一个建议的计划步骤——状态低时给轻松的，状态好时给有挑战的。

**`sampleData.loadFree`**

> EN — Free — nothing is generated, and you can remove it in one click

免费——不生成任何内容，一键即可移除

## Tier 2 — The labels — skim these (366)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

我同意

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

已有账户？

**`auth.signup.and`**

> EN — and

和

**`auth.signup.change`**

> EN — change

更改

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

选择你的方案

**`auth.signup.continue`**

> EN — Continue

继续

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

继续支付

**`auth.signup.country`**

> EN — Country

国家/地区

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

选择你的国家/地区（可选）

**`auth.signup.createAccount`**

> EN — Create Account

创建账户

**`auth.signup.createYourAccount`**

> EN — Create your account

创建账户

**`auth.signup.discountCode`**

> EN — Discount code

优惠码

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

优惠码（可选）

**`auth.signup.email`**

> EN — Email

邮箱

**`auth.signup.inviteCode`**

> EN — Invite code

邀请码

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

邀请码（可选）

**`auth.signup.logIn`**

> EN — Log in

登录

**`auth.signup.mostPopular`**

> EN — Most Popular

最受欢迎

**`auth.signup.password`**

> EN — Password

密码

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

请选择满足以上所有要求的密码。

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

隐私政策

**`auth.signup.step`**

> EN — Step {step} of 2

第 {step} 步，共 2 步

**`auth.signup.termsOfService`**

> EN — Terms of Service

服务条款

**`auth.signup.working`**

> EN — Working...

处理中...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

选择 Professional 或 Ultimate 作为基础方案

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

Ultimate 方案免费包含团队席位

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets full access at your plan's tier

每位成员都能获得与您方案同等级别的完整访问权限

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

随时在团队设置中管理席位

**`pricing.businessSubtitle`**

> EN — For teams building together

为共同打造的团队而生

**`pricing.businessTitle`**

> EN — Business

商业版

**`pricing.custom`**

> EN — Custom

定制

**`pricing.features.aiMemory`**

> EN — AI Memory

AI 记忆

**`pricing.features.basicAiChat`**

> EN — Basic AI chat

基础 AI 聊天

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count} 积分/月

**`pricing.features.customAiPersonaNameInIonexaChat`**

> EN — Custom AI persona name in Ionexa Chat

在 Ionexa Chat 中自定义 AI 名称

**`pricing.features.customCredits`**

> EN — Custom credits

定制积分

**`pricing.features.everythingInGrowth`**

> EN — Everything in Growth

包含 Growth 的全部功能

**`pricing.features.everythingInProfessional`**

> EN — Everything in Professional

包含 Professional 的全部功能

**`pricing.features.everythingInStarter`**

> EN — Everything in Starter

包含 Starter 的全部功能

**`pricing.features.everythingInUltimate`**

> EN — Everything in Ultimate

包含 Ultimate 的全部功能

**`pricing.features.extendedChatMemoryRetention100Vs20RecentFact`**

> EN — Extended chat memory retention (100 vs 20 recent facts)

扩展的聊天记忆保留（100 条对比 20 条近期信息）

**`pricing.features.teamCollaboration`**

> EN — Team collaboration

团队协作

**`pricing.features.unlimitedMembers`**

> EN — Unlimited members

无限成员

**`pricing.features.unlimitedTeamSeatsIncludedNoPerMemberCharge`**

> EN — Unlimited team seats included — no per-member charge

包含无限团队席位——不按成员收费

**`pricing.features.upTo100AiAgents`**

> EN — Up to 100 AI agents

最多 100 个 AI 智能体

**`pricing.features.upTo15AiAgentsTeams`**

> EN — Up to 15 AI agents & teams

最多 15 个 AI 智能体与团队

**`pricing.features.upTo2AiAgents`**

> EN — Up to 2 AI agents

最多 2 个 AI 智能体

**`pricing.features.upTo50AiAgents`**

> EN — Up to 50 AI agents

最多 50 个 AI 智能体

**`pricing.features.upTo5AiAgents`**

> EN — Up to 5 AI agents

最多 5 个 AI 智能体

**`pricing.features.websiteAutomationBuilderAccess`**

> EN — Website & Automation Builder access

网站与自动化构建器访问权限

**`pricing.perMonth`**

> EN — /month

/月

**`auth.generateStrongPassword`**

> EN — Generate strong password

生成高强度密码

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

使用 Google 继续

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

无法启动 Google 登录,请重试。

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

或使用邮箱继续

**`common.hidePassword`**

> EN — Hide password

隐藏密码

**`common.showPassword`**

> EN — Show password

显示密码

### login

**`auth.login.email`**

> EN — Email

邮箱

**`auth.login.forgotPassword`**

> EN — Forgot password?

忘记密码？

**`auth.login.logIn`**

> EN — Log In

登录

**`auth.login.noAccount`**

> EN — No account yet?

还没有账户？

**`auth.login.password`**

> EN — Password

密码

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

密码已更新——请使用新密码登录。

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

登录后即可保存你分享的内容。

**`auth.login.signUp`**

> EN — Sign up

注册

**`auth.login.welcomeBack`**

> EN — Welcome back

欢迎回来

**`auth.login.working`**

> EN — Working...

处理中...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

让它成为你的

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

无法读取该文件。

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

正在你的数据中寻找规律…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

换一个文件

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

选择文件

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{total} 行中有 {ready} 行可导入

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

上传你的表格

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

日 / 月

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

月 / 日

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

提取条目

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

代理机构或小型企业

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

自由职业收入与客户

**`dashboard.onboarding.goals.other`**

> EN — Something else

其他

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

我正在创业

**`dashboard.onboarding.goals.trading`**

> EN — My trading

我的交易

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

你主要想掌握什么？

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

前往你的仪表板

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— 忽略此列 —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

已导入 {count} 行

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

现在你的账户中有 {count} 行数据。

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

导入未能完成。

**`dashboard.onboarding.importing`**

> EN — Importing…

正在导入…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

导入 {count} 行

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

分析未能完成。

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

这是我的发现

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

这看起来是：{label}。

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

映射列 {column}

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

各列的含义——如有错误请修改

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

暂时还没有可靠的发现

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

再添加一些数据，然后从仪表板重新运行。

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

这段文字中没有值得记录的内容。

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

在此粘贴文字…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

粘贴任何内容

**`dashboard.onboarding.previewSource`**

> EN — From your file

来自你的文件

**`dashboard.onboarding.previewStored`**

> EN — Stored as

保存为

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

实际将被保存的内容

**`dashboard.onboarding.reading`**

> EN — Reading…

正在读取…

**`dashboard.onboarding.skip`**

> EN — Skip for now

暂时跳过

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

跳过 {count} 行

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

上传表格

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

连接 Gmail 或 Drive

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

只读，且仅限你授权的范围。

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

我自己手动添加

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

直接进入仪表板，从零开始。

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

粘贴一段文字

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

导入你的数据

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

第 {step} 步，共 {total} 步

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

表格文件不得超过 {max}。

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

仅读取了前面的行

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

已经了解你工作的 AI。什么都可以问它。

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

{module}的首次记录

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

成就已解锁:{achievement}

**`common.accountMenu`**

> EN — Account menu

账户菜单

**`common.commandPalette`**

> EN — Command palette

命令面板

**`common.createStudio`**

> EN — Make anything

创建任何东西

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

剩余额度 — 可在设置中购买更多

**`common.creditsUnlimited`**

> EN — Unlimited

无限制

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — 按 Enter 键关闭

**`common.jumpToPage`**

> EN — Jump to a module or page...

跳转到模块或页面...

**`common.loading`**

> EN — Loading...

加载中...

**`common.noMatches`**

> EN — No matches for “{query}”

没有找到与“{query}”匹配的结果

**`common.offline.checking`**

> EN — Checking…

检查中…

**`common.offline.retry`**

> EN — Try again

重试

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

此页面上的内容不会更新。

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

这里的内容不会更新 —— 于 {minutes} 分钟前加载。

**`common.offline.stillOffline`**

> EN — Still no connection.

仍然没有连接。

**`common.offline.title`**

> EN — You're offline.

你已离线。

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

所有者权限 — 无限额度

**`common.paletteClose`**

> EN — close

关闭

**`common.paletteNavigate`**

> EN — navigate

导航

**`common.paletteSelect`**

> EN — select

选择

**`common.search`**

> EN — Search anything...

搜索任何内容...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

免费消息 · 本月剩余 {count} 条

**`credits.unlimited`**

> EN — Unlimited — no credits used

无限 — 未使用积分

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

无限 — 将花费 {count} 积分

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

已使用 {count} 积分

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

已使用 {count} 积分 · 剩余 {remaining}

**`dashboard.search.dates.30d`**

> EN — 30 days

30 天

**`dashboard.search.dates.365d`**

> EN — 1 year

1 年

**`dashboard.search.dates.7d`**

> EN — 7 days

7 天

**`dashboard.search.dates.any`**

> EN — Any time

不限时间

**`dashboard.search.filters.all`**

> EN — All

全部

**`dashboard.search.filters.date`**

> EN — Date

日期

**`dashboard.search.filters.module`**

> EN — Module

模块

**`dashboard.search.filters.type`**

> EN — Type

类型

**`dashboard.search.kinds.agent`**

> EN — Agents

智能体

**`dashboard.search.kinds.chat`**

> EN — Conversations

对话

**`dashboard.search.kinds.file`**

> EN — Files

文件

**`dashboard.search.kinds.help`**

> EN — Help

帮助

**`dashboard.search.kinds.mission`**

> EN — Plans

计划

**`dashboard.search.kinds.module`**

> EN — Entries

记录

**`dashboard.search.kinds.page`**

> EN — Pages

页面

**`dashboard.search.kinds.research`**

> EN — Research

研究

**`dashboard.search.kinds.website`**

> EN — Websites

网站

**`sampleData.banner`**

> EN — Sample data

示例数据

**`sampleData.clear`**

> EN — Remove the sample

移除示例

**`sampleData.clearFailed`**

> EN — That did not work.

没有成功。

**`sampleData.clearing`**

> EN — Removing…

移除中…

**`sidebar.closeMenu`**

> EN — Close menu

关闭菜单

**`sidebar.groups.ask`**

> EN — Ask

提问

**`sidebar.groups.build`**

> EN — Build

创建

**`sidebar.groups.business`**

> EN — Business

业务

**`sidebar.groups.create`**

> EN — Create

创建

**`sidebar.groups.daily`**

> EN — Daily

日常

**`sidebar.groups.insights`**

> EN — What I noticed

我注意到的

**`sidebar.groups.make`**

> EN — Make

创建

**`sidebar.groups.marketplace`**

> EN — Marketplace

市场

**`sidebar.groups.myBusiness`**

> EN — My business

我的业务

**`sidebar.groups.operations`**

> EN — Operations

运营

**`sidebar.groups.organise`**

> EN — Organise

整理

**`sidebar.groups.run`**

> EN — Run

运行

**`sidebar.groups.see`**

> EN — See

查看

**`sidebar.groups.settings`**

> EN — Settings

设置

**`sidebar.groups.strategy`**

> EN — Strategy

策略

**`sidebar.groups.track`**

> EN — Track

记录

**`sidebar.groups.tracking`**

> EN — Tracking

记录

**`sidebar.groups.work`**

> EN — Work

工作

**`sidebar.groups.workspace`**

> EN — Workspace

工作区

**`sidebar.hints.affiliate`**

> EN — Your referral link, what you've earned, and how you get paid.

你的推广链接、已赚金额，以及如何收款。

**`sidebar.hints.agents`**

> EN — Plan the agents you want. A tracker, not a runtime.

规划你想要的智能体。这是记录，不是运行时。

**`sidebar.hints.analytics`**

> EN — Metrics you're watching.

你在关注的指标。

**`sidebar.hints.automation`**

> EN — Things that run on a schedule.

按计划自动运行的事情。

**`sidebar.hints.businessHealth`**

> EN — MRR, margin, churn and runway. Owner only.

MRR、毛利、流失与现金。仅限所有者。

**`sidebar.hints.campaigns`**

> EN — Plan campaigns — channel, budget, status.

规划营销活动——渠道、预算、状态。

**`sidebar.hints.chat`**

> EN — Ask anything — not tied to any module.

什么都可以问——不绑定任何模块。

**`sidebar.hints.competitors`**

> EN — Track rival products, pricing and positioning.

跟踪竞品、定价与定位。

**`sidebar.hints.content`**

> EN — Content ideas, captions and threads.

内容创意、文案和推文串。

**`sidebar.hints.costs`**

> EN — What every AI call has cost, per model and per day.

每次 AI 调用的花费，按模型和日期列出。

**`sidebar.hints.dataAnalysis`**

> EN — Analysis requests and what you found.

分析请求以及你的发现。

**`sidebar.hints.decisions`**

> EN — Weigh the options before you decide.

决定之前先权衡选项。

**`sidebar.hints.documents`**

> EN — Freeform notes and documents you write yourself.

你自己撰写的自由笔记和文档。

**`sidebar.hints.favorites`**

> EN — Everything you've starred.

你收藏的一切。

**`sidebar.hints.feedback`**

> EN — What users told you, in one place.

用户告诉你的话，集中在一处。

**`sidebar.hints.finance`**

> EN — Log income and expenses.

记录收入和支出。

**`sidebar.hints.formSubmissions`**

> EN — Everything visitors sent through a form on your published sites

访客通过已发布网站上的表单提交的全部内容

**`sidebar.hints.help`**

> EN — Answers to the questions people ask most — no credits used.

最常见问题的答案，不消耗额度。

**`sidebar.hints.home`**

> EN — Your dashboard — activity, stats and quick actions.

你的仪表板——活动、统计和快捷操作。

**`sidebar.hints.ideas`**

> EN — Capture new ideas before you forget them.

在忘记之前记下新想法。

**`sidebar.hints.learning`**

> EN — Track what you're studying.

记录你正在学习的内容。

**`sidebar.hints.memory`**

> EN — What the AI remembers about you.

AI 记住的关于你的事。

**`sidebar.hints.mine`**

> EN — Everything you have made, newest first — with a starred-only tab

你创建的全部内容，最新在前，并有仅收藏标签页

**`sidebar.hints.missionControl`**

> EN — Set a goal, AI breaks it into steps.

设定目标，AI 拆成步骤。

**`sidebar.hints.newEntry`**

> EN — Write anything down — it files itself

随便写点什么 —— 它会自己归位

**`sidebar.hints.products`**

> EN — Product plans — pricing, roadmap, launch.

产品规划——定价、路线图、发布。

**`sidebar.hints.productWorkflow`**

> EN — Your products, patterns and mentor in one view.

你的产品、模式和导师，一个视图。

**`sidebar.hints.reflection`**

> EN — A weekly summary of your progress.

每周进度小结。

**`sidebar.hints.research`**

> EN — Save research, sources and summaries.

保存研究、来源和摘要。

**`sidebar.hints.routing`**

> EN — Which model each kind of request is sent to.

每类请求会发送到哪个模型。

**`sidebar.hints.sales`**

> EN — Leads, outreach and next steps.

线索、触达和后续动作。

**`sidebar.hints.settings`**

> EN — Account, billing, language and preferences.

账户、账单、语言和偏好设置。

**`sidebar.hints.systemHealth`**

> EN — Whether the database, the queues and the providers are answering.

数据库、队列和服务商是否在响应。

**`sidebar.hints.team`**

> EN — Invite people to your workspace.

邀请他人加入你的工作区。

**`sidebar.hints.timeline`**

> EN — Everything you've done, in order.

你做过的一切，按时间排列。

**`sidebar.hints.trading`**

> EN — Trade log — symbol, direction, result, P&L.

交易日志——品种、方向、结果、盈亏。

**`sidebar.hints.tradingJournal`**

> EN — Your trades, with the reasoning you wrote at the time.

你的交易记录，以及当时写下的理由。

**`sidebar.hints.tradingWorkflow`**

> EN — Your trades, patterns and mentor in one view.

你的交易、模式和导师，一个视图。

**`sidebar.hints.websiteBuilder`**

> EN — Describe a site and AI generates the real page.

描述一个网站，AI 生成真实页面。

**`sidebar.hints.websites`**

> EN — Track sites you own — name, URL, status. No generation.

记录你拥有的网站——名称、网址、状态。不生成。

**`sidebar.items.affiliate`**

> EN — Affiliate

推广合作

**`sidebar.items.agents`**

> EN — AI Agents

AI 智能体

**`sidebar.items.analytics`**

> EN — Analytics

数据统计

**`sidebar.items.apps`**

> EN — App notes

应用记录

**`sidebar.items.automation`**

> EN — Automation

自动化

**`sidebar.items.businessHealth`**

> EN — Business health

经营健康度

**`sidebar.items.campaigns`**

> EN — Campaign notes

营销记录

**`sidebar.items.chat`**

> EN — Ionexa Chat

Ionexa 聊天

**`sidebar.items.coding`**

> EN — AI Coding

AI 编程

**`sidebar.items.competitors`**

> EN — Competitors

竞争对手

**`sidebar.items.content`**

> EN — Content

内容

**`sidebar.items.costs`**

> EN — Costs

成本

**`sidebar.items.dataAnalysis`**

> EN — Data Analysis

数据分析

**`sidebar.items.decisions`**

> EN — Decisions

决策

**`sidebar.items.deepResearch`**

> EN — Deep Research

深度研究

**`sidebar.items.documents`**

> EN — Documents

文档

**`sidebar.items.favorites`**

> EN — Favorites

收藏

**`sidebar.items.feedback`**

> EN — Feedback

反馈

**`sidebar.items.files`**

> EN — Files

文件

**`sidebar.items.finance`**

> EN — Finances

财务

**`sidebar.items.formSubmissions`**

> EN — Form submissions

表单提交

**`sidebar.items.help`**

> EN — Help Centre

帮助中心

**`sidebar.items.home`**

> EN — Home

主页

**`sidebar.items.ideas`**

> EN — Ideas

创意

**`sidebar.items.images`**

> EN — Image notes

图片记录

**`sidebar.items.integrations`**

> EN — Integrations

集成

**`sidebar.items.learning`**

> EN — Learning

学习

**`sidebar.items.library`**

> EN — My stuff

我的东西

**`sidebar.items.marketplace`**

> EN — Marketplace

市场

**`sidebar.items.memory`**

> EN — Search my records

搜索我的记录

**`sidebar.items.mine`**

> EN — Mine

我的内容

**`sidebar.items.missionControl`**

> EN — Goals & Plans

目标与计划

**`sidebar.items.newEntry`**

> EN — New entry

新记录

**`sidebar.items.posts`**

> EN — Posts

帖子

**`sidebar.items.predictions`**

> EN — Predictions

规律

**`sidebar.items.presentations`**

> EN — Presentations

演示文稿

**`sidebar.items.products`**

> EN — Products

产品

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

产品工作流

**`sidebar.items.projects`**

> EN — Projects

项目

**`sidebar.items.published`**

> EN — Live sites

已上线网站

**`sidebar.items.records`**

> EN — My records

我的记录

**`sidebar.items.reflection`**

> EN — Weekly Reflection

每周回顾

**`sidebar.items.research`**

> EN — Research

研究

**`sidebar.items.routing`**

> EN — Model routing

模型路由

**`sidebar.items.sales`**

> EN — Sales

销售

**`sidebar.items.settings`**

> EN — Settings

设置

**`sidebar.items.systemHealth`**

> EN — System Health

系统健康

**`sidebar.items.team`**

> EN — Team

团队

**`sidebar.items.timeline`**

> EN — History

历史

**`sidebar.items.trading`**

> EN — Trading

交易

**`sidebar.items.tradingJournal`**

> EN — Trading journal

交易日志

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

交易工作流

**`sidebar.items.videos`**

> EN — Video notes

视频记录

**`sidebar.items.voice`**

> EN — Voice

语音

**`sidebar.items.websiteBuilder`**

> EN — Build a site

做个网站

**`sidebar.items.websites`**

> EN — Website plans

网站计划

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

无法加载你的创意：{message}

**`dashboard.insights.title`**

> EN — What I noticed

我注意到的

**`dashboard.overview.activeMission.open`**

> EN — Open the plan

打开计划

**`dashboard.overview.activeMission.stepsLabel`**

> EN — {completed}/{total} steps completed

已完成 {completed}/{total} 步

**`dashboard.overview.aiCoach.entryCount`**

> EN — {count, plural, one {# new {module} entry} other {# new {module} entries}}

{module} 中新增 {count} 条记录

**`dashboard.overview.aiCoach.mostActiveIn`**

> EN — Most active in {module}

在 {module} 中最活跃

**`dashboard.overview.aiCoach.noActivity`**

> EN — No activity yet this week — log something to get started.

本周还没有活动——记录点什么开始吧。

**`dashboard.overview.betaFeedback.linkLabel`**

> EN — Share feedback

提交反馈

**`dashboard.overview.betaFeedback.message`**

> EN — Thanks for testing Ionexa AI. Your feedback is welcome.

感谢你测试 Ionexa AI。欢迎提供反馈。

**`dashboard.overview.healthScore.buildingMomentum`**

> EN — Building momentum

势头正在增长

**`dashboard.overview.healthScore.excellentConsistency`**

> EN — Excellent consistency

非常稳定

**`dashboard.overview.healthScore.justStarting`**

> EN — Just getting started

刚刚起步

**`dashboard.overview.healthScore.strongProgress`**

> EN — Strong progress

进展强劲

**`dashboard.overview.healthScore.suggestion.consistency`**

> EN — Try logging something every day this week.

试着这周每天都记录一些内容。

**`dashboard.overview.healthScore.suggestion.coverage`**

> EN — Try exploring a module you haven't used yet.

试试探索一个你还没用过的模块。

**`dashboard.overview.healthScore.suggestion.missionSteps`**

> EN — Complete a plan step to keep your momentum going.

完成一个计划步骤以保持你的势头。

**`dashboard.overview.healthScore.title`**

> EN — Business Health Score

业务健康分数

**`dashboard.overview.next.title`**

> EN — Next

接下来

**`dashboard.overview.nextAction.continueMission`**

> EN — Continue: {step} from your "{goal}" plan

继续：来自你的"{goal}"计划的 {step}

**`dashboard.overview.nextAction.cta`**

> EN — Go there →

前往 →

**`dashboard.overview.setupProgress.count`**

> EN — {done} of {total} steps

{total} 步中的 {done} 步

**`dashboard.overview.setupProgress.steps.firstEntry`**

> EN — Log your first entry

记录你的第一条条目

**`dashboard.overview.setupProgress.steps.mission`**

> EN — Set a goal

设定一个目标

**`dashboard.overview.setupProgress.steps.onboarding`**

> EN — Finish the welcome questions

完成欢迎问题

**`dashboard.overview.setupProgress.steps.secondModule`**

> EN — Log something in a second area

在第二个领域记录一些内容

**`dashboard.overview.setupProgress.title`**

> EN — Setup progress

设置进度

**`dashboard.overview.statRow.creditsExplain`**

> EN — What is left of this month's allowance for AI work.

本月 AI 额度的剩余部分。

**`dashboard.overview.statRow.creditsRemaining`**

> EN — Credits Remaining

剩余额度

**`dashboard.overview.statRow.fillsAfter`**

> EN — Fills in after {count} entries

记录 {count} 条后填充

**`dashboard.overview.statRow.fromEntries`**

> EN — {count, plural, one {from # entry} other {from # entries}}

{count, plural, other {来自 # 条记录}}

**`dashboard.overview.statRow.mostActive`**

> EN — Most Active

最活跃

**`dashboard.overview.statRow.ofTotal`**

> EN — {count, plural, one {of # in total} other {of # in total}}

{count, plural, other {共 # 条中的}}

**`dashboard.overview.statRow.openCredits`**

> EN — See the ledger →

查看明细 →

**`dashboard.overview.statRow.openEntries`**

> EN — See the entries →

查看条目 →

**`dashboard.overview.statRow.thisWeek`**

> EN — This Week

本周

**`dashboard.overview.statRow.totalEntries`**

> EN — Total Entries

总记录数

**`dashboard.overview.statRow.totalEntriesExplain`**

> EN — Everything you have logged, in every module, since you started.

你在所有模块中记录过的全部内容。

**`dashboard.overview.whatChanged.entries`**

> EN — new entries

条新记录

**`dashboard.overview.whatChanged.insights`**

> EN — new insights

条新洞察

**`dashboard.overview.whatChanged.since`**

> EN — since {when}

自 {when} 起

**`dashboard.overview.whatChanged.title`**

> EN — What changed

有什么变化

**`errors.boundary.section`**

> EN — This section could not be displayed.

无法显示此板块。

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

页面其余部分不受影响。刷新通常可以解决。

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

这是一个问题，因此没有记录任何内容。

**`dashboard.create.answerItInstead`**

> EN — Answer it

回答它

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

在聊天中继续

**`dashboard.create.loggedTo`**

> EN — Logged to:

已记录到：

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

仍然记录

**`dashboard.create.title`**

> EN — Create Anything

创建任何内容

**`dashboard.create.viewModule`**

> EN — View {module} →

查看 {module} →

**`dashboard.createAnything.attachImage`**

> EN — Attach image

附加图片

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

你的回答...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

继续

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

跳过，仍然记录

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

几个简短的问题：

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

详细描述你的想法...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

移除图片

**`dashboard.createAnything.send`**

> EN — Send

发送

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

有一张或多张图片上传失败。

**`dashboard.energyCheckIn.change`**

> EN — Change

更改

**`dashboard.energyCheckIn.checkedInToday`**

> EN — Today's energy: {level}/5.

今天的能量:{level}/5。

**`dashboard.energyCheckIn.levelLabel`**

> EN — Energy level {level}

能量等级 {level}

**`dashboard.energyCheckIn.logged`**

> EN — Energy logged

能量已记录

**`dashboard.energyCheckIn.notePlaceholder`**

> EN — Optional note...

可选备注...

**`dashboard.energyCheckIn.prompt`**

> EN — How's your energy today?

你今天的能量如何?

**`dashboard.energyCheckIn.scaleHigh`**

> EN — 5 = great

5 = 状态很好

**`dashboard.energyCheckIn.scaleLow`**

> EN — 1 = exhausted

1 = 精疲力尽

**`dashboard.energyCheckIn.title`**

> EN — Energy Check-In

能量签到

**`dashboard.firstScreen.build.example`**

> EN — Build a website for my shop

为我的店铺做一个网站

**`dashboard.firstScreen.build.verb`**

> EN — Build

构建

**`dashboard.firstScreen.cost.charged`**

> EN — Uses credits

消耗额度

**`dashboard.firstScreen.cost.free`**

> EN — Free

免费

**`dashboard.firstScreen.cost.freeAllowance`**

> EN — Free up to your monthly limit

在每月额度内免费

**`dashboard.firstScreen.label`**

> EN — Press one — it runs right away

点一个 — 立刻运行

**`dashboard.firstScreen.repeat.example`**

> EN — Every Monday, a summary of my sales

每周一，给我一份销售汇总

**`dashboard.firstScreen.repeat.verb`**

> EN — Repeat

重复

**`dashboard.firstScreen.understand.example`**

> EN — What do my numbers say this week?

我这周的数据说明了什么？

**`dashboard.firstScreen.understand.verb`**

> EN — Understand

理解

**`dashboard.overview.recentEntries.empty`**

> EN — No entries yet.

还没有条目。

**`dashboard.overview.recentEntries.title`**

> EN — Recent Entries

最近条目

**`errors.creditHistory`**

> EN — See credit history

查看 credits 记录

**`errors.retry`**

> EN — Try again

重试

**`sampleData.load`**

> EN — See it with sample data

用示例数据查看

**`sampleData.loadFailed`**

> EN — That did not work. Try again.

没有成功，请重试。

**`sampleData.loading`**

> EN — Loading…

加载中…

## Tier 3 — Further in — only if you have time (198)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

关闭

**`common.readMore`**

> EN — Read more

了解更多

**`common.whatIsThisPage`**

> EN — What is this page?

这个页面是什么？

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

来自你的 {count} 条记录

**`dashboard.insights.checkIt`**

> EN — Check it yourself

自己核对

**`dashboard.insights.dismiss`**

> EN — Dismiss this

忽略此项

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

无法忽略该项。

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

隐藏数据

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

查看数据

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

关闭

**`common.noNotifications`**

> EN — No new notifications.

没有新通知。

**`common.notifications`**

> EN — Notifications

通知

**`common.switchToDarkMode`**

> EN — Switch to dark mode

切换到深色主题

**`common.switchToLightMode`**

> EN — Switch to light mode

切换到浅色主题

**`common.toggleMenu`**

> EN — Toggle menu

切换菜单

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

立即充值，避免中断。

**`credits.low.none`**

> EN — No credits left this month

本月积分已用完

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

本月剩余 {count} 积分

**`credits.low.topUp`**

> EN — Top up

充值

**`language.label`**

> EN — Language

语言

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

无法保存语言设置——没有任何更改。

**`pwa.install`**

> EN — Install

安装

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

添加到主屏幕：全屏使用，通知也能真正收到。

**`pwa.installTitle`**

> EN — Install Ionexa

安装 Ionexa

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

Safari 从不会主动提示，三步即可完成。

**`pwa.iosGotIt`**

> EN — Got it

知道了

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

点按 Safari 工具栏中的“共享”按钮

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

向下滚动，点按“添加到主屏幕”

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

点按“添加”，Ionexa 就会和其他应用放在一起

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

将 Ionexa 添加到主屏幕

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

在此之前，iPhone 无法向你发送通知，Safari 也可能在 7 天未使用后清除已保存的数据。

**`pwa.notNow`**

> EN — Not now

以后再说

**`pwa.showHow`**

> EN — Show me how

看看怎么做

### first result

**`common.cancel`**

> EN — Cancel

取消

**`common.created`**

> EN — ✓ created

✓ 已创建

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

关闭建议

**`common.error`**

> EN — error

错误

**`common.notAuthenticated`**

> EN — Not authenticated.

未登录。

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

购买积分

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

此操作所需积分超过您的余额。购买积分包或升级方案即可继续。

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

您还剩 {available} 积分，此操作约需 {needed}。请购买积分包或升级方案。

**`credits.outOfCredits.title`**

> EN — You're out of credits

您的积分已用完

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

升级方案

**`dashboard.goal.change`**

> EN — Change something

改一下

**`dashboard.goal.confirm`**

> EN — Yes, do it

好，去吧

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

在那里按下按钮时会用掉 {credits} 积分。现在不收取任何费用。

**`dashboard.goal.dismiss`**

> EN — Never mind

算了

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

现在不收费，到达时也不收费。

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

再多说一点，这样才能送到正确的地方。

**`dashboard.goal.which`**

> EN — Which one do you mean?

你指的是哪一个？

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

这会带着你写的内容前往{destination}。

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

竞争对手

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

已知的竞争对手

**`dashboard.ideas.customerLabel`**

> EN — Customer

客户

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

目标客户

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

面向小企业的新服务

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

所有想法，集中一处

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

趁想法还粗糙时先写下来——这里会给它评分、与其他想法比较，即使最后放弃了也会留档。

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

市场规模

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

例如 TAM 20 亿美元

**`dashboard.ideas.mvpLabel`**

> EN — MVP

最小可行产品

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

最小可行产品是什么样子？

**`dashboard.ideas.nameLabel`**

> EN — Name

名称

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

创意名称

**`dashboard.ideas.new`**

> EN — New Idea

新建创意

**`dashboard.ideas.problemLabel`**

> EN — Problem

问题

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

它解决什么问题？

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

评分（0-100）

**`dashboard.ideas.scorePlaceholder`**

> EN — score

评分

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

结论

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

例如 推进 / 放弃 / 观望

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

请重新加载页面查看当前版本，然后重做你的修改。

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

在你操作期间，其他人或另一个标签页修改了它。

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

请拆分文件，或上传较小的版本。

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

该文件过大。

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

打开「设置 › 账单」查看哪个方案包含它。

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

你的方案不包含此功能。

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

可在「设置」中购买 credits，或等待每月重置。

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

你的 credits 不足以完成此操作。

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

请检查标记出的字段后重新提交。

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

表单中有内容未被接受。

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

请重新登录并再次执行该操作 — 你输入的内容都还在。

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

你已退出登录。

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

它可能已被删除。请返回列表另选一项。

**`errors.codes.notFound.what`**

> EN — This no longer exists.

该内容已不存在。

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

请检查网络连接后重试。

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

你的设备无法连接到我们。

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

删除不再需要的内容，或在「设置 › 账单」中升级。

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

你已达到当前方案的上限。

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

请等待约一分钟后再试一次。

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

短时间内请求过多。

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

已记录该问题。请稍后重试，若持续出现请联系客服。

**`errors.codes.serverError.what`**

> EN — This broke on our side.

我们这边出错了。

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

请重试，若再次出现请联系客服。

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

此操作未能完成。

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

请转换为 PDF、DOCX、CSV 或 TXT 后重新上传。

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

不支持该文件类型。

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

这是我们这边的问题，通常几分钟内会恢复。

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

AI 服务当前没有响应。

**`errors.credits.charged`**

> EN — This attempt used credits.

此次尝试消耗了 credits。

**`errors.credits.notCharged`**

> EN — You were not charged.

未向你收费。

**`errors.credits.refunded`**

> EN — Your credits were returned.

你的 credits 已退回。

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

我们无法在此确认是否已扣费。

**`module.exportCsv`**

> EN — Export CSV

导出 CSV

**`module.noMatches`**

> EN — No matches for “{query}”

没有找到与“{query}”匹配的结果

**`module.save`**

> EN — Save

保存

**`module.saving`**

> EN — Saving...

保存中...

**`module.searchPlaceholder`**

> EN — Search...

搜索...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

每分钟语音 {credits} 积分

**`voice.draft.discard`**

> EN — Discard

丢弃

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

还没有发送任何内容。先修改文字，再由你自己发送。

**`voice.draft.title`**

> EN — What was heard

听到的内容

**`voice.draft.use`**

> EN — Use this text

使用这段文字

**`voice.errors.bad_request`**

> EN — That request could not be read.

无法读取该请求。

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

服务当前繁忙，请稍后再试。

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

麦克风未获授权。你仍然可以打字。

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

这段录音里没有听到任何内容。

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

语音功能暂时不可用。你仍然可以打字。

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

积分不足。

**`voice.errors.no_recording`**

> EN — No recording was sent.

没有发送任何录音。

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

没有录到任何声音。

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

此部署尚未配置语音功能。

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

你的方案不包含语音功能。

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

本月的语音分钟数已用完。

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

无法连接到语音服务。

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

过去一小时内录音次数过多。请稍后再试。

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

无法为此预留积分。

**`voice.errors.too_large`**

> EN — That recording is too long.

这段录音太长了。

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

你已退出登录。请重新登录后再试。

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

此浏览器无法录音。你仍然可以打字。

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

不支持这种音频格式。

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

目前无法查询语音分钟数。

**`voice.listening`**

> EN — Listening

正在收听

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

说完后按停止。在你读过之前，什么都不会发送。

**`voice.outOfMinutes`**

> EN — No voice minutes left this month

本月的语音分钟数已用完

**`voice.permission.allow`**

> EN — Open the microphone

打开麦克风

**`voice.permission.cancel`**

> EN — Not now

暂不

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

每分钟 {credits} 积分，你的方案每月 {minutes} 分钟。

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

在发送任何内容之前，由你阅读并修改文字。

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

音频仅用于转写，不会被保存在任何地方——我们不存，之后也不存。

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

只有你按下时才开始录音，再按一次即停止。

**`voice.permission.title`**

> EN — Before the microphone opens

在打开麦克风之前

**`voice.settings.notConfigured`**

> EN — Voice is not set up on this deployment, so the microphone and Listen buttons do not appear.

此部署尚未配置语音，因此不会出现麦克风和朗读按钮。

**`voice.settings.notIncluded`**

> EN — Voice is not included on your plan. Everything here can still be typed and read.

你的方案不包含语音。这里的一切仍然可以打字和阅读。

**`voice.startListening`**

> EN — Speak instead of typing

用说的，不用打字

**`voice.stopListening`**

> EN — Stop

停止

**`common.nextPage`**

> EN — Next page

下一页

**`common.paginationNext`**

> EN — Next

下一页

**`common.paginationPage`**

> EN — Page {page} / {total}

第 {page} / {total} 页

**`common.paginationPrev`**

> EN — Prev

上一页

**`common.previousPage`**

> EN — Previous page

上一页

**`common.updated`**

> EN — ✓ updated

✓ 已更新

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

竞争对手：

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

面向：{customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

市场规模：

**`dashboard.ideas.cardMvp`**

> EN — MVP:

最小可行产品：

**`dashboard.ideas.cardProblem`**

> EN — Problem:

问题：

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

评分：{score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

确定删除此创意？此操作无法撤销。

**`dashboard.ideas.edit`**

> EN — Edit Idea

编辑创意

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

编辑创意：{name}

**`entityLinks.linked`**

> EN — Linked

已关联

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

这可能与以下内容相关: {titles}。要关联吗?

**`entityLinks.no`**

> EN — No

否

**`entityLinks.yes`**

> EN — Yes

是

**`module.edit`**

> EN — Edit

编辑

**`module.loggedAt`**

> EN — Logged {when}

记录于 {when}

**`module.sort.label`**

> EN — Sort:

排序：

**`askAi.buttonLabel`**

> EN — Ask AI

问 AI

**`common.networkError`**

> EN — Network error — please try again.

网络错误——请重试。

**`common.textActions.accept`**

> EN — Accept

采用

**`common.textActions.reject`**

> EN — Reject

放弃

**`entityLinks.buttonLabel`**

> EN — Link to...

关联到...

**`entityLinks.linkedToLabel`**

> EN — Linked to:

关联到:

**`entityLinks.unlink`**

> EN — Unlink

取消关联

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

取消与 {name} 的关联

**`favorites.add`**

> EN — Add to favorites

添加到收藏

**`favorites.remove`**

> EN — Remove from favorites

从收藏中移除

**`module.delete`**

> EN — Delete

删除

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

确定删除此{label}？此操作无法撤销。

**`module.deleted`**

> EN — Deleted

已删除

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

它还读取了关于这条记录的 {count} 条历史消息

**`askAi.close`**

> EN — Close

关闭

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

就这条记录提出一个问题——无需解释背景，AI 已经掌握了。

**`askAi.placeholder`**

> EN — Ask anything about this entry...

询问关于这条记录的任何问题...

**`askAi.send`**

> EN — Send

发送

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

连接在回复完成前中断。

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

连接已中断——上面的回复可能不完整。

**`askAi.title`**

> EN — Ask AI about this {title}

就这条 {title} 询问 AI

**`common.errorWithMessage`**

> EN — error: {message}

错误：{message}

**`common.linked`**

> EN — ✓ linked

✓ 已关联

**`common.newMessagesBelow`**

> EN — New message below

下方有新消息

**`entityLinks.modalTitle`**

> EN — Link to...

关联到...

**`entityLinks.noMatches`**

> EN — No matches.

未找到匹配项。

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

要关联到哪个模块?

**`entityLinks.searching`**

> EN — Searching...

搜索中...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

搜索{module}...

**`aiSteps.counter`**

> EN — ({step}/{total})

（{step}/{total}）
