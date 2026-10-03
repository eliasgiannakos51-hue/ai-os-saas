# The emails — ar

Every line of every email the product sends: **108 strings**. The interface has its own pack, `first-run.ar.md`, beside this one.

**Start with tier 1. It is 37 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 45 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (37)

_From the emails a person is sure or likely to receive, 5 words or more._

### welcome — every account gets it, minutes after signing up

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

حسابك جاهز — لا حاجة لتأكيد البريد، يمكنك تسجيل الدخول الآن. يتكوّن Ionexa AI من ١٣ وحدة لإدارة شركة ناشئة، إضافة إلى حقل نص حر يضع ما تكتبه في الوحدة الصحيحة تلقائيًا.

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

نصيحة: في {path} يكفي أن تصف ما حدث بكلماتك، وسيصل تلقائيًا إلى الوحدة الصحيحة.

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

حسابك في Ionexa AI جاهز.

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

تسجيل دخول جديد إلى حسابك

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

لاحظنا تسجيل دخول إلى حسابك في Ionexa AI من جهاز أو متصفّح لم نره من قبل.

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

إن كنت أنت، فلا حاجة لأي إجراء. وإن لم تتعرّف على هذا الدخول، غيّر كلمة المرور فورًا.

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

تسجيل دخول جديد إلى حسابك في Ionexa AI من {device}.

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

هذا الإنشاء يعمل منذ أكثر من 24 ساعة دون أن ينتهي — وهذا ليس طبيعيًا، والأرجح أنه متوقف لا أنه ما زال يعمل. لم يُخصم أي رصيد مقابله. افتحه بالأسفل لإعادة المحاولة أو لحذفه.

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

“{name}” متوقف في الإنشاء منذ أكثر من 24 ساعة.

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

يبدو أن “{name}” متوقف — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

انتهت مهمتك المجدولة

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

تعذّر تشغيل مهمتك المجدولة

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

انتهت مهمتك المجدولة “{step}”.

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

تعذّر تشغيل مهمتك المجدولة “{step}”.

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

انتهت مهمتك المجدولة — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

تعذّر تشغيل مهمتك المجدولة — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

الرصيد غير كافٍ — اشحن رصيدك أو ارفع خطتك ثم أعد جدولتها.

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

الرصيد غير كافٍ — اشحن رصيدك أو ارفع خطتك. ستعيد هذه الأتمتة المحاولة في الدورة القادمة.

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

تم إيقاف “{name}”

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

أخفق {count} مرات متتالية، فتوقّف عن العمل بدلًا من أن يستمر في الإخفاق ويستمر في استهلاك رصيدك.

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

افتحه بالأسفل لمراجعة المهمة ثم أعد تشغيله.

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

توقّف “{name}” عن العمل بعد {count} حالات إخفاق.

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

تم إيقاف “{name}” — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

لم يتمكن من العمل لأن رصيد حسابك نفد. لم يُخصم شيء ولم يُفقد شيء — اشحن رصيدك أو ارفع خطتك ثم أعد تشغيله، وسيعود إلى جدوله المعتاد.

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

“{name}” متوقف مؤقتًا — رصيد حسابك نفد.

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

“{name}” متوقف مؤقتًا — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

اشتراكك على وشك الانتهاء

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

ستحتفظ بالوصول الكامل حتى {date}. لا شيء يتغيّر قبل ذلك — أرصدتك المتبقية تبقى قابلة للاستخدام ولا تُحذف أي من بياناتك.

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

ستحتفظ بالوصول الكامل حتى نهاية الفترة التي دفعت ثمنها بالفعل. لا شيء يتغيّر قبل ذلك — أرصدتك المتبقية تبقى قابلة للاستخدام ولا تُحذف أي من بياناتك.

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

بعد ذلك ينتقل الحساب إلى الخطة المجانية. تبقى مدخلاتك وملفاتك ومحادثاتك في مكانها تمامًا.

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

غيّرت رأيك؟ أعد تفعيله

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

يمكنك إعادة تفعيل الاشتراك في أي وقت قبل انتهائه دون رسوم إضافية — فقد دفعت ثمن هذه الفترة بالفعل.

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

ينتهي اشتراكك في Ionexa AI بتاريخ {date}. تحتفظ بالوصول حتى ذلك الحين.

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

اشتراكك في Ionexa AI على وشك الانتهاء. تحتفظ بالوصول حتى تنتهي الفترة المدفوعة.

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

وصلنا طلب بحذف حسابك في Ionexa AI نهائيًا مع كل ما سُجّل في جميع الوحدات. لا يمكن التراجع عن ذلك.

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

ينتهي هذا الرابط خلال ساعة واحدة. إن لم تكن أنت من طلب ذلك، تجاهل هذه الرسالة وسيبقى حسابك كما هو تمامًا.

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

أكّد الحذف النهائي لحسابك في Ionexa AI.

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

أسبوعك في Ionexa AI

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

تشغيل واحد للوكيل، {found} منه بنتيجة

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

{runs} تشغيل للوكلاء، {found} منها بنتيجة

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

رصيد واحد مستهلك (متوسطك: {average})

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} رصيد مستهلك (متوسطك: {average})

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

عميل محتمل واحد دون متابعة مسجّلة

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

{count} عميل محتمل دون متابعة مسجّلة

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

الإنفاق أعلى من متوسطك بنسبة {percent}%

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

الإنفاق أقل من متوسطك بنسبة {percent}%

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

زيارات الموقع ارتفعت بنسبة {percent}%

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

زيارات الموقع انخفضت بنسبة {percent}%

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

تواصل معك أحدهم عبر “{name}”

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

إرسال جديد من النموذج على “{name}” — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

سجّل أفكار المنتجات أو المشاريع الجديدة وقيّمها.

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

تابع منتجات المنافسين وأسعارهم وموقعهم في السوق.

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

ملاحظات وملخّصات لكل ما تبحث فيه.

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

المواضيع التي تدرسها، مع مصادر واختبارات.

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

سجل التداول — الرمز، الاتجاه، النتيجة، الربح والخسارة.

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

وازن بين الخيارات وسجّل التوصية.

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

خطط المنتج — التسعير وخارطة الطريق وخطة الإطلاق.

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

أفكار المحتوى والتعليقات والسلاسل.

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

العملاء المحتملون ورسائل التواصل والخطوات التالية.

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

ملاحظات المستخدمين، مرتّبة حسب النبرة والأولوية.

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

أي مقياس يستحق المتابعة عبر الزمن.

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

المسارات التي تستحق الأتمتة، والوقت الموفّر.

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

تصلك هذه الرسالة لأن لديك حسابًا في Ionexa AI.

## Tier 3 — Subjects, labels and the footer — skim (45)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### welcome — every account gets it, minutes after signing up

**`email.welcome.label`**

> EN — signup

التسجيل

**`email.welcome.title`**

> EN — welcome to Ionexa AI

أهلًا بك في Ionexa AI

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

الأمان

**`email.newDevice.when`**

> EN — When

الوقت

**`email.newDevice.device`**

> EN — Device

الجهاز

**`email.newDevice.ip`**

> EN — IP address

عنوان IP

**`email.newDevice.cta`**

> EN — Reset password

تغيير كلمة المرور

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

منشئ المواقع

**`email.stuck.title`**

> EN — “{name}” seems stuck

يبدو أن “{name}” متوقف

**`email.stuck.cta`**

> EN — Open Website Builder

افتح منشئ المواقع

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

تشغيل مجدول للوكيل

**`email.scheduledRun.cta`**

> EN — Open {name}

افتح {name}

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

وكيلك

**`email.agent.resultCta`**

> EN — Manage your agents

أدر وكلاءك

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — نتيجتك المجدولة.

**`email.agent.disabledLastError`**

> EN — Last error: {error}

آخر خطأ: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

افتح وكلاءك

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

“{name}” متوقف مؤقتًا

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

اشحن رصيدك

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

افتح وكلاءك

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

الاشتراك

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

حذف الحساب

**`email.deletion.title`**

> EN — confirm account deletion

تأكيد حذف الحساب

**`email.deletion.cta`**

> EN — Confirm deletion

تأكيد الحذف

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

الملخص

**`email.digest.title`**

> EN — this week

هذا الأسبوع

**`email.digest.noticed`**

> EN — what I noticed

ما لاحظته

**`email.digest.cta`**

> EN — Open your dashboard

افتح لوحتك

**`email.digest.subject`**

> EN — this week: {first}

هذا الأسبوع: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

إدخال جديد واحد

**`email.digest.lines.records.other`**

> EN — {count} new entries

{count} إدخال جديد

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

موقعك: زيارة واحدة

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

موقعك: {count} زيارة

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

رصيد واحد مستهلك

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} رصيد مستهلك

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

تشغيل واحد للوكيل أخفق

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

{count} تشغيل للوكلاء أخفق

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

إرسال جديد من النموذج

**`email.formSubmission.cta`**

> EN — View your websites

اعرض مواقعك

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

إرسال جديد من النموذج على {name}

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

اهتمام حقيقي على الأرجح

**`email.formSubmission.badges.question`**

> EN — General question

سؤال عام

**`email.formSubmission.badges.spam`**

> EN — Possible spam

قد يكون رسالة مزعجة

**`email.formSubmission.badges.unclear`**

> EN — Unclear

غير واضح

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

سجّل الإيرادات والمصروفات.
