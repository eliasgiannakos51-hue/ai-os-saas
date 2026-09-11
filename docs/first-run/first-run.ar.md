# The first run — ar

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **597 strings**. The whole product is 3072, which is why this file exists.

**Start with tier 1. It is 46 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 353 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (46)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

تعذّر إنشاء الحساب. تحقّق من البيانات وحاول مرة أخرى — لم يتم خصم أي مبلغ.

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

يجب الموافقة على شروط الخدمة وسياسة الخصوصية لإنشاء حساب.

**`pricing.businessCardDescription`**

> EN — Start with any plan as your team's base, then invite members for +{price}/month each — everyone gets full access at your plan's tier. Perfect for teams working together.

ابدأ بأي خطة كأساس لفريقك، ثم ادعُ الأعضاء مقابل +{price}/شهريًا لكل عضو — يحصل الجميع على وصول كامل بمستوى خطتك. مثالي للفرق التي تعمل معًا.

### login

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

تعذّر تسجيل دخولك. تحقّق من البريد وكلمة المرور، أو أعد تعيين كلمة المرور إن لم تكن متأكدًا.

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

لم يكتمل تسجيل الدخول هذا. حاول مرة أخرى أو استخدم بريدك الإلكتروني وكلمة المرور بالأسفل.

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

أحضر بيانات حقيقية وسيخبرك الذكاء الاصطناعي بشيء عن عملك خلال دقيقتين.

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

بياناتك تبقى ملكك. تُخزَّن بشكل خاص، وأنت وحدك من يقرأها، ولا تُستخدم أبدًا لتدريب أي شيء. يمكنك حذفها أو حذف حسابك بالكامل في أي وقت.

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

أنماط حقيقية فقط مما استوردته للتو. وإن لم تكفِ البيانات للتأكد، سنقول ذلك.

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV أو مفصول بعلامات جدولة، حتى {max}. نقرؤه ونعرض عليك ما وجدناه قبل حفظ أي شيء.

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

قد تكون تواريخك يوم/شهر أو شهر/يوم — جميعها في اليوم 12 أو قبله، لذا لا نستطيع التمييز. أيّهما؟

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

أول عملية استيراد وتحليل مجانية — ولن تستهلك أي رصيد.

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

لا توجد بيانات كافية بعد للحديث عن نمط. عادةً ما تبدأ الأمور بالظهور عند بضع عشرات من الصفوف المؤرَّخة — ونفضّل ألا نقول شيئًا على أن نختلق شيئًا.

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

خطة عمل أو ملاحظات اجتماع أو قائمة عملاء. نستخرج ما يمكن تسجيله ونترك الباقي.

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

ملف CSV مُصدَّر من وسيطك أو بنكك أو نظام CRM. نحدّد ما يمثّله كل عمود.

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

اختر الأسهل. لا شيء إلزامي، ويمكنك الإضافة لاحقًا.

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

خطة عمل أو ملاحظات أو قائمة — نستخرج منها الأجزاء المنظّمة.

### dashboard chrome

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

هذه المدخلات عرض توضيحي — ثلاثة أشهر من عمل استوديو تصميم صغير. ليست بياناتك.

**`sidebar.hints.apps`**

> EN — Keep track of apps you are planning or have already shipped. It does not build them.

تتبَّع التطبيقات التي تخطط لها أو أطلقتها بالفعل. لا يبنيها.

**`sidebar.hints.coding`**

> EN — Write, explain, fix, convert and test snippets of code. It does not run code or open a repository.

اكتب مقاطع الشفرة واشرحها وأصلحها وحوِّلها واختبرها. لا يشغِّل الشفرة ولا يفتح مستودعًا.

**`sidebar.hints.create`**

> EN — Describe what you want in one sentence; it works out the rest.

صِف ما تريد في جملة واحدة، والباقي يستنتجه.

**`sidebar.hints.deepResearch`**

> EN — Give it a topic and it searches, cross-checks and writes a sourced report

أعطه موضوعًا فيبحث ويقارن المصادر ويكتب تقريرًا موثّقًا

**`sidebar.hints.files`**

> EN — Upload PDFs, Word and Excel files and ask the AI questions about them

ارفع ملفات PDF وWord وExcel واسأل الذكاء الاصطناعي عنها

**`sidebar.hints.images`**

> EN — Keep track of images you are planning or have already made. It does not generate them.

تتبَّع الصور التي تخطط لها أو أنجزتها بالفعل. لا يُنشئها.

**`sidebar.hints.integrations`**

> EN — Connect Gmail, Drive and Slack so the AI can work with your real data

اربط Gmail وDrive وSlack ليعمل الذكاء الاصطناعي على بياناتك الحقيقية

**`sidebar.hints.library`**

> EN — Starred, recent and search — all your own entries in one place

المفضلة والأحدث والبحث — كل ما هو لك في مكان واحد

**`sidebar.hints.marketplace`**

> EN — Share an agent's shape as a template, and start from one someone else shared.

شارك بنية وكيل كقالب، وابدأ من قالب شاركه شخص آخر.

**`sidebar.hints.posts`**

> EN — Say it once and get a post per platform, each at its length and in its register. It publishes nothing — you copy and post.

قله مرة واحدة واحصل على منشور لكل منصة بطولها وأسلوبها. لا ينشر شيئًا — تنسخ وتنشر بنفسك.

**`sidebar.hints.predictions`**

> EN — Patterns found in your own rows, each with the number of entries it rests on and a link to them.

أنماط في سجلاتك أنت، مع عدد المدخلات التي يستند إليها كل نمط ورابط إليها.

**`sidebar.hints.presentations`**

> EN — Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts.

صف عرضًا تقديميًا واحصل على الشرائح — PowerPoint أو PDF، مع صور من Unsplash أو من صورك. لا يرسم مخططات.

**`sidebar.hints.projects`**

> EN — A folder with a goal. What you put in is what is in it — nothing is dragged in with it.

مجلّد له هدف. ما تضعه هو ما فيه — لا شيء يدخل وحده.

**`sidebar.hints.published`**

> EN — Every site you have live on the web, with its traffic and version history

كل مواقعك المنشورة، مع عدد الزيارات وسجل الإصدارات

**`sidebar.hints.records`**

> EN — Every log in one place — filter by type instead of hunting the menu

كل السجلات في مكان واحد — رشِّح حسب النوع بدل البحث في القائمة

**`sidebar.hints.videos`**

> EN — Keep track of videos you are planning or have already made. It does not generate them.

تتبَّع مقاطع الفيديو التي تخطط لها أو أنجزتها بالفعل. لا يُنشئها.

**`sidebar.hints.voice`**

> EN — Have text read out loud, or speak and have it written down. Minutes are metered and the price per minute is on the page.

استمع إلى نص يُقرأ بصوت عالٍ، أو تحدّث فيُكتب ما تقوله. تُحتسب الدقائق وسعر الدقيقة معروض في الصفحة.

### first result

**`dashboard.overview.healthScore.suggestion.recency`**

> EN — You haven't logged anything in a while — add a new entry to pick things back up.

لم تسجل شيئًا منذ فترة — أضف إدخالًا جديدًا لاستئناف النشاط.

**`dashboard.overview.nextAction.revisitLink`**

> EN — You linked "{source}" to "{target}" a few days ago — worth revisiting?

قمت بربط "{source}" بـ "{target}" قبل بضعة أيام — هل يستحق إعادة النظر؟

**`dashboard.overview.nextAction.startNew`**

> EN — No new activity in the last 3 days — ready to start something new?

لا يوجد نشاط جديد في آخر 3 أيام — مستعد لبدء شيء جديد؟

**`dashboard.overview.setupProgress.suggestion`**

> EN — Your activity score appears once you have logged {count} entries — enough that no single one decides it.

تظهر درجة نشاطك بعد تسجيل {count} إدخالات — عدد يكفي ألّا يحدّدها إدخال واحد.

**`dashboard.overview.statRow.mostActiveExplain`**

> EN — The module you have written in most. Where your attention has gone.

الوحدة التي تكتب فيها أكثر. حيث يذهب انتباهك.

**`dashboard.overview.statRow.thisWeekExplain`**

> EN — Logged in the last seven days — how active this week has been.

ما سُجّل في آخر سبعة أيام — مدى نشاط هذا الأسبوع.

**`common.betaExpiry`**

> EN — Your beta access expires in {days, plural, one {# day} other {# days}}. <link>Upgrade to keep full access</link>.

ينتهي وصولك التجريبي خلال {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}. <link>رقِّ خطتك للاحتفاظ بالوصول الكامل</link>.

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

تُعرض أحدث {count, number}. الإدخالات الأقدم ما زالت محفوظة — استخدم البحث في سجلاتي للعثور عليها.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

يبدو هذا سؤالًا. هل أجيب عنه أم أسجله؟

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

صف أي شيء — فكرة منتج، صفقة، ملاحظة من مستخدم، مؤشرًا — وسيصل تلقائيًا إلى الوحدة الصحيحة.

**`dashboard.energyCheckIn.whatItDoes`**

> EN — Ionexa uses this to pick which plan step to suggest next — lighter work when you're low, demanding work when you're not.

يستخدم Ionexa هذا لاختيار خطوة الخطة التالية المقترحة — عمل خفيف عندما تكون طاقتك منخفضة، وعمل يتطلب جهدًا عندما لا تكون كذلك.

**`sampleData.loadFree`**

> EN — Free — nothing is generated, and you can remove it in one click

مجانًا — لا يُولَّد شيء، ويمكنك إزالته بنقرة واحدة

## Tier 2 — The labels — skim these (353)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

أوافق على

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

لديك حساب بالفعل؟

**`auth.signup.and`**

> EN — and

و

**`auth.signup.change`**

> EN — change

تغيير

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

اختر خطتك

**`auth.signup.continue`**

> EN — Continue

متابعة

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

المتابعة إلى الدفع

**`auth.signup.country`**

> EN — Country

الدولة

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

اختر دولتك (اختياري)

**`auth.signup.createAccount`**

> EN — Create Account

إنشاء الحساب

**`auth.signup.createYourAccount`**

> EN — Create your account

أنشئ حسابك

**`auth.signup.discountCode`**

> EN — Discount code

رمز الخصم

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

رمز الخصم (اختياري)

**`auth.signup.email`**

> EN — Email

البريد الإلكتروني

**`auth.signup.inviteCode`**

> EN — Invite code

رمز الدعوة

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

رمز الدعوة (اختياري)

**`auth.signup.logIn`**

> EN — Log in

تسجيل الدخول

**`auth.signup.mostPopular`**

> EN — Most Popular

الأكثر شيوعًا

**`auth.signup.password`**

> EN — Password

كلمة المرور

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

يرجى اختيار كلمة مرور تستوفي جميع الشروط أعلاه.

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

سياسة الخصوصية

**`auth.signup.step`**

> EN — Step {step} of 2

الخطوة {step} من 2

**`auth.signup.termsOfService`**

> EN — Terms of Service

شروط الخدمة

**`auth.signup.working`**

> EN — Working...

جارٍ المعالجة...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

اختر Professional أو Ultimate كخطتك الأساسية

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

مقاعد الفريق مجانية ضمن Ultimate

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets full access at your plan's tier

يحصل كل عضو على وصول كامل بمستوى خطتك

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

أدر المقاعد في أي وقت من إعدادات الفريق

**`pricing.businessSubtitle`**

> EN — For teams building together

للفرق التي تبني معًا

**`pricing.businessTitle`**

> EN — Business

الأعمال

**`pricing.custom`**

> EN — Custom

مخصص

**`pricing.features.aiMemory`**

> EN — AI Memory

ذاكرة الذكاء الاصطناعي

**`pricing.features.basicAiChat`**

> EN — Basic AI chat

محادثة ذكاء اصطناعي أساسية

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, zero {لا أرصدة} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}}/شهر

**`pricing.features.customAiPersonaNameInIonexaChat`**

> EN — Custom AI persona name in Ionexa Chat

اسم مخصص للمساعد في Ionexa Chat

**`pricing.features.customCredits`**

> EN — Custom credits

أرصدة مخصصة

**`pricing.features.everythingInGrowth`**

> EN — Everything in Growth

كل ما في باقة Growth

**`pricing.features.everythingInProfessional`**

> EN — Everything in Professional

كل ما في باقة Professional

**`pricing.features.everythingInStarter`**

> EN — Everything in Starter

كل ما في باقة Starter

**`pricing.features.everythingInUltimate`**

> EN — Everything in Ultimate

كل ما في باقة Ultimate

**`pricing.features.extendedChatMemoryRetention100Vs20RecentFact`**

> EN — Extended chat memory retention (100 vs 20 recent facts)

احتفاظ موسّع بذاكرة المحادثة (100 مقابل 20 معلومة حديثة)

**`pricing.features.teamCollaboration`**

> EN — Team collaboration

تعاون الفريق

**`pricing.features.unlimitedMembers`**

> EN — Unlimited members

أعضاء غير محدودين

**`pricing.features.unlimitedTeamSeatsIncludedNoPerMemberCharge`**

> EN — Unlimited team seats included — no per-member charge

مقاعد فريق غير محدودة مشمولة — دون رسوم لكل عضو

**`pricing.features.upTo100AiAgents`**

> EN — Up to 100 AI agents

حتى 100 وكيل ذكي

**`pricing.features.upTo15AiAgentsTeams`**

> EN — Up to 15 AI agents & teams

حتى 15 وكيلاً ذكياً وفرق

**`pricing.features.upTo2AiAgents`**

> EN — Up to 2 AI agents

حتى وكيلين ذكيين

**`pricing.features.upTo50AiAgents`**

> EN — Up to 50 AI agents

حتى 50 وكيلاً ذكياً

**`pricing.features.upTo5AiAgents`**

> EN — Up to 5 AI agents

حتى 5 وكلاء أذكياء

**`pricing.features.websiteAutomationBuilderAccess`**

> EN — Website & Automation Builder access

الوصول إلى منشئ المواقع والأتمتة

**`pricing.perMonth`**

> EN — /month

/شهريًا

**`auth.generateStrongPassword`**

> EN — Generate strong password

إنشاء كلمة مرور قوية

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

المتابعة باستخدام Google

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

تعذر بدء تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

أو المتابعة بالبريد الإلكتروني

**`common.hidePassword`**

> EN — Hide password

إخفاء كلمة المرور

**`common.showPassword`**

> EN — Show password

إظهار كلمة المرور

### login

**`auth.login.email`**

> EN — Email

البريد الإلكتروني

**`auth.login.forgotPassword`**

> EN — Forgot password?

هل نسيت كلمة المرور؟

**`auth.login.logIn`**

> EN — Log In

تسجيل الدخول

**`auth.login.noAccount`**

> EN — No account yet?

ليس لديك حساب بعد؟

**`auth.login.password`**

> EN — Password

كلمة المرور

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

تم تحديث كلمة المرور — سجّل الدخول بكلمة المرور الجديدة.

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

سجّل الدخول لحفظ ما شاركته.

**`auth.login.signUp`**

> EN — Sign up

إنشاء حساب

**`auth.login.welcomeBack`**

> EN — Welcome back

مرحبًا بعودتك

**`auth.login.working`**

> EN — Working...

جارٍ المعالجة...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

لنجعله خاصًا بك

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

تعذّرت قراءة هذا الملف.

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

نبحث عن أنماط في بياناتك…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

اختر ملفًا آخر

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

اختر ملفًا

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{ready} من {total} صفًا جاهزة للاستيراد

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

ارفع جدول بياناتك

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

يوم / شهر

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

شهر / يوم

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

استخرج الإدخالات

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

وكالة أو شركة صغيرة

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

دخل وعملاء العمل الحر

**`dashboard.onboarding.goals.other`**

> EN — Something else

شيء آخر

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

شركة ناشئة أبنيها

**`dashboard.onboarding.goals.trading`**

> EN — My trading

تداولاتي

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

ما الذي تريد متابعته بالدرجة الأولى؟

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

اذهب إلى لوحة التحكم

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— تجاهل هذا العمود —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

{count, plural, zero {لم يتم استيراد أي صف} one {تم استيراد صف واحد} two {تم استيراد صفين} few {تم استيراد # صفوف} many {تم استيراد # صفًا} other {تم استيراد # صف}}

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

{count, plural, zero {لا صفوف في حسابك} one {أصبح لديك صف واحد في حسابك} two {أصبح لديك صفان في حسابك} few {أصبح لديك # صفوف في حسابك} many {أصبح لديك # صفًا في حسابك} other {أصبح لديك # صف في حسابك}}.

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

لم تكتمل عملية الاستيراد.

**`dashboard.onboarding.importing`**

> EN — Importing…

جارٍ الاستيراد…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

{count, plural, zero {لا صفوف للاستيراد} one {استورد صفًا واحدًا} two {استورد صفين} few {استورد # صفوف} many {استورد # صفًا} other {استورد # صف}}

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

لم يكتمل التحليل.

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

إليك ما وجدته

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

يبدو أن هذا: {label}.

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

تعيين العمود {column}

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

ما الذي يمثّله كل عمود — عدّل ما أخطأنا فيه

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

لا يوجد ما يُذكر بثقة بعد

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

أضف المزيد ثم أعد التشغيل من لوحة التحكم.

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

لم يكن في هذا النص ما يستحق التسجيل كإدخال.

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

الصق نصك هنا…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

الصق أي شيء

**`dashboard.onboarding.previewSource`**

> EN — From your file

من ملفك

**`dashboard.onboarding.previewStored`**

> EN — Stored as

يُحفظ كـ

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

ما الذي سيُحفَظ فعليًا

**`dashboard.onboarding.reading`**

> EN — Reading…

جارٍ القراءة…

**`dashboard.onboarding.skip`**

> EN — Skip for now

تخطَّ الآن

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

تم تخطّي {count}

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

ارفع جدول بيانات

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

اربط Gmail أو Drive

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

للقراءة فقط، وبما توافق عليه أنت.

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

سأضيف بنفسي

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

انتقل مباشرة إلى لوحة التحكم وابدأ من الصفر.

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

الصق نصًا

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

أحضر بياناتك

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

الخطوة {step} من {total}

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

يجب ألا يتجاوز حجم جدول البيانات {max}.

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

قُرئت الصفوف الأولى فقط

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

الذكاء الاصطناعي الذي يعرف عملك بالفعل. اسأله أي شيء.

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

أول إدخال في {module}

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

تم فتح إنجاز: {achievement}

**`common.accountMenu`**

> EN — Account menu

قائمة الحساب

**`common.commandPalette`**

> EN — Command palette

لوحة الأوامر

**`common.createStudio`**

> EN — Make anything

أنشئ أي شيء

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

الأرصدة المتبقية — اشترِ المزيد من الإعدادات

**`common.creditsUnlimited`**

> EN — Unlimited

غير محدودة

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — اضغط Enter للتجاهل

**`common.jumpToPage`**

> EN — Jump to a module or page...

الانتقال إلى وحدة أو صفحة...

**`common.loading`**

> EN — Loading...

جارٍ التحميل...

**`common.noMatches`**

> EN — No matches for “{query}”

لا توجد نتائج لـ «{query}»

**`common.offline.checking`**

> EN — Checking…

جارٍ التحقق…

**`common.offline.retry`**

> EN — Try again

حاول مجددًا

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

لا شيء في هذه الصفحة يتحدّث.

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

لا شيء هنا يتحدّث — جرى تحميله قبل {minutes, plural, zero {أقل من دقيقة} one {دقيقة واحدة} two {دقيقتين} few {# دقائق} many {# دقيقة} other {# دقيقة}}.

**`common.offline.stillOffline`**

> EN — Still no connection.

لا يزال بلا اتصال.

**`common.offline.title`**

> EN — You're offline.

أنت غير متصل.

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

وصول المالك — أرصدة غير محدودة

**`common.paletteClose`**

> EN — close

إغلاق

**`common.paletteNavigate`**

> EN — navigate

تنقّل

**`common.paletteSelect`**

> EN — select

اختيار

**`common.search`**

> EN — Search anything...

ابحث عن أي شيء...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

رسالة مجانية · متبقٍ {count} هذا الشهر

**`credits.unlimited`**

> EN — Unlimited — no credits used

غير محدود — لم تُستخدم أرصدة

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

غير محدود — كان سيكلف {count, plural, zero {لا شيء} one {رصيدًا واحدًا} two {رصيدين} few {# أرصدة} many {# رصيدًا} other {# رصيد}}

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

{count, plural, zero {لم يُستخدم أي رصيد} one {تم استخدام رصيد واحد} two {تم استخدام رصيدين} few {تم استخدام # أرصدة} many {تم استخدام # رصيدًا} other {تم استخدام # رصيد}}

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

{count, plural, zero {لم يُستخدم أي رصيد} one {تم استخدام رصيد واحد} two {تم استخدام رصيدين} few {تم استخدام # أرصدة} many {تم استخدام # رصيدًا} other {تم استخدام # رصيد}} · متبقٍ {remaining}

**`dashboard.search.dates.30d`**

> EN — 30 days

30 يومًا

**`dashboard.search.dates.365d`**

> EN — 1 year

سنة واحدة

**`dashboard.search.dates.7d`**

> EN — 7 days

7 أيام

**`dashboard.search.dates.any`**

> EN — Any time

أي وقت

**`dashboard.search.filters.all`**

> EN — All

الكل

**`dashboard.search.filters.date`**

> EN — Date

التاريخ

**`dashboard.search.filters.module`**

> EN — Module

الوحدة

**`dashboard.search.filters.type`**

> EN — Type

النوع

**`dashboard.search.kinds.agent`**

> EN — Agents

الوكلاء

**`dashboard.search.kinds.chat`**

> EN — Conversations

المحادثات

**`dashboard.search.kinds.file`**

> EN — Files

الملفات

**`dashboard.search.kinds.help`**

> EN — Help

المساعدة

**`dashboard.search.kinds.mission`**

> EN — Plans

الخطط

**`dashboard.search.kinds.module`**

> EN — Entries

الإدخالات

**`dashboard.search.kinds.page`**

> EN — Pages

الصفحات

**`dashboard.search.kinds.research`**

> EN — Research

البحث

**`dashboard.search.kinds.website`**

> EN — Websites

المواقع

**`sampleData.banner`**

> EN — Sample data

بيانات تجريبية

**`sampleData.clear`**

> EN — Remove the sample

أزل العيّنة

**`sampleData.clearFailed`**

> EN — That did not work.

لم ينجح ذلك.

**`sampleData.clearing`**

> EN — Removing…

جارٍ الإزالة…

**`sidebar.closeMenu`**

> EN — Close menu

إغلاق القائمة

**`sidebar.groups.ask`**

> EN — Ask

اسأل

**`sidebar.groups.make`**

> EN — Make

أنشئ

**`sidebar.groups.organise`**

> EN — Organise

نظّم

**`sidebar.groups.run`**

> EN — Run

شغّل

**`sidebar.groups.see`**

> EN — See

اعرض

**`sidebar.groups.settings`**

> EN — Settings

الإعدادات

**`sidebar.hints.affiliate`**

> EN — Your referral link, what you've earned, and how you get paid.

رابط الإحالة الخاص بك، وما كسبته، وكيف تُدفع لك.

**`sidebar.hints.agents`**

> EN — Plan the agents you want. A tracker, not a runtime.

خطّط للوكلاء الذين تريدهم. سجل، وليس بيئة تشغيل.

**`sidebar.hints.analytics`**

> EN — Metrics you're watching.

المؤشرات التي تتابعها.

**`sidebar.hints.automation`**

> EN — Things that run on a schedule.

أشياء تعمل وفق جدول زمني.

**`sidebar.hints.businessHealth`**

> EN — MRR, margin, churn and runway. Owner only.

الإيراد الشهري والهامش وفقدان المشتركين والسيولة. للمالك وحده.

**`sidebar.hints.campaigns`**

> EN — Plan campaigns — channel, budget, status.

خطّط الحملات — القناة والميزانية والحالة.

**`sidebar.hints.chat`**

> EN — Ask anything — not tied to any module.

اسأل أي شيء — غير مرتبط بأي وحدة.

**`sidebar.hints.competitors`**

> EN — Track rival products, pricing and positioning.

تابع منتجات المنافسين وأسعارهم وتموضعهم.

**`sidebar.hints.content`**

> EN — Content ideas, captions and threads.

أفكار المحتوى والتعليقات والسلاسل.

**`sidebar.hints.costs`**

> EN — What every AI call has cost, per model and per day.

تكلفة كل استدعاء للذكاء الاصطناعي، حسب النموذج واليوم.

**`sidebar.hints.dataAnalysis`**

> EN — Analysis requests and what you found.

طلبات التحليل وما توصّلت إليه.

**`sidebar.hints.decisions`**

> EN — Weigh the options before you decide.

وازن الخيارات قبل أن تقرر.

**`sidebar.hints.documents`**

> EN — Freeform notes and documents you write yourself.

ملاحظات ومستندات حرة تكتبها بنفسك.

**`sidebar.hints.favorites`**

> EN — Everything you've starred.

كل ما وضعت له نجمة.

**`sidebar.hints.feedback`**

> EN — What users told you, in one place.

ما قاله المستخدمون، في مكان واحد.

**`sidebar.hints.finance`**

> EN — Log income and expenses.

سجّل الدخل والمصروفات.

**`sidebar.hints.formSubmissions`**

> EN — Everything visitors sent through a form on your published sites

كل ما أرسله الزوار عبر نموذج في مواقعك المنشورة

**`sidebar.hints.help`**

> EN — Answers to the questions people ask most — no credits used.

إجابات عن الأسئلة الأكثر شيوعًا — دون استهلاك رصيد.

**`sidebar.hints.home`**

> EN — Your dashboard — activity, stats and quick actions.

لوحتك — النشاط والإحصاءات والإجراءات السريعة.

**`sidebar.hints.ideas`**

> EN — Capture new ideas before you forget them.

سجّل الأفكار الجديدة قبل أن تنساها.

**`sidebar.hints.learning`**

> EN — Track what you're studying.

تابع ما تدرسه.

**`sidebar.hints.memory`**

> EN — What the AI remembers about you.

ما يتذكره الذكاء الاصطناعي عنك.

**`sidebar.hints.mine`**

> EN — Everything you have made, newest first — with a starred-only tab

كل ما أنشأته، الأحدث أولًا، مع تبويب للمفضّلة فقط

**`sidebar.hints.missionControl`**

> EN — Set a goal, AI breaks it into steps.

حدّد هدفًا وسيقسّمه الذكاء الاصطناعي إلى خطوات.

**`sidebar.hints.newEntry`**

> EN — Write anything down — it files itself

اكتب أي شيء — يُصنَّف تلقائيًا

**`sidebar.hints.products`**

> EN — Product plans — pricing, roadmap, launch.

خطط المنتج — التسعير وخارطة الطريق والإطلاق.

**`sidebar.hints.productWorkflow`**

> EN — Your products, patterns and mentor in one view.

منتجاتك وأنماطك ومرشدك في عرض واحد.

**`sidebar.hints.reflection`**

> EN — A weekly summary of your progress.

ملخص أسبوعي لتقدّمك.

**`sidebar.hints.research`**

> EN — Save research, sources and summaries.

احفظ الأبحاث والمصادر والملخصات.

**`sidebar.hints.routing`**

> EN — Which model each kind of request is sent to.

إلى أي نموذج يُرسل كل نوع من الطلبات.

**`sidebar.hints.sales`**

> EN — Leads, outreach and next steps.

العملاء المحتملون والتواصل والخطوات التالية.

**`sidebar.hints.settings`**

> EN — Account, billing, language and preferences.

الحساب والفوترة واللغة والتفضيلات.

**`sidebar.hints.systemHealth`**

> EN — Whether the database, the queues and the providers are answering.

ما إذا كانت قاعدة البيانات والطوابير والمزودون يستجيبون.

**`sidebar.hints.team`**

> EN — Invite people to your workspace.

ادعُ أشخاصًا إلى مساحة عملك.

**`sidebar.hints.timeline`**

> EN — Everything you've done, in order.

كل ما فعلته، بالترتيب.

**`sidebar.hints.trading`**

> EN — Trade log — symbol, direction, result, P&L.

سجل الصفقات — الرمز والاتجاه والنتيجة والأرباح.

**`sidebar.hints.tradingJournal`**

> EN — Your trades, with the reasoning you wrote at the time.

صفقاتك، مع السبب الذي كتبته حينها.

**`sidebar.hints.tradingWorkflow`**

> EN — Your trades, patterns and mentor in one view.

صفقاتك وأنماطك ومرشدك في عرض واحد.

**`sidebar.hints.websiteBuilder`**

> EN — Describe a site and AI generates the real page.

صِف موقعًا وينشئ الذكاء الاصطناعي الصفحة الفعلية.

**`sidebar.hints.websites`**

> EN — Track sites you own — name, URL, status. No generation.

تابع المواقع التي تملكها — الاسم والرابط والحالة. بلا إنشاء.

**`sidebar.items.affiliate`**

> EN — Affiliate

برنامج الشركاء

**`sidebar.items.agents`**

> EN — AI that works for you

ذكاء اصطناعي يعمل من أجلك

**`sidebar.items.analytics`**

> EN — Analytics

التحليلات

**`sidebar.items.apps`**

> EN — App ideas

أفكار تطبيقات

**`sidebar.items.automation`**

> EN — Automation

الأتمتة

**`sidebar.items.businessHealth`**

> EN — How the business is doing

كيف تسير الأعمال

**`sidebar.items.campaigns`**

> EN — Campaign ideas

أفكار حملات

**`sidebar.items.chat`**

> EN — Ask me

اسألني

**`sidebar.items.coding`**

> EN — AI Coding

البرمجة بالذكاء الاصطناعي

**`sidebar.items.competitors`**

> EN — Competitors

المنافسون

**`sidebar.items.content`**

> EN — Content

المحتوى

**`sidebar.items.costs`**

> EN — Costs

التكاليف

**`sidebar.items.dataAnalysis`**

> EN — See what the numbers say

انظر ماذا تقول الأرقام

**`sidebar.items.decisions`**

> EN — Decisions

القرارات

**`sidebar.items.deepResearch`**

> EN — Look into it properly

ابحث فيها جيدًا

**`sidebar.items.documents`**

> EN — Documents

المستندات

**`sidebar.items.favorites`**

> EN — Favorites

المفضلة

**`sidebar.items.feedback`**

> EN — Feedback

الملاحظات

**`sidebar.items.files`**

> EN — Files

الملفات

**`sidebar.items.finance`**

> EN — Finances

المالية

**`sidebar.items.formSubmissions`**

> EN — Form submissions

إرسالات النماذج

**`sidebar.items.help`**

> EN — Help Centre

مركز المساعدة

**`sidebar.items.home`**

> EN — Home

الرئيسية

**`sidebar.items.ideas`**

> EN — Ideas

الأفكار

**`sidebar.items.images`**

> EN — Image ideas

أفكار صور

**`sidebar.items.integrations`**

> EN — Integrations

التكاملات

**`sidebar.items.learning`**

> EN — Learning

التعلّم

**`sidebar.items.library`**

> EN — My stuff

أشيائي

**`sidebar.items.marketplace`**

> EN — Ready-made helpers

مساعدون جاهزون

**`sidebar.items.memory`**

> EN — Search my records

ابحث في سجلاتي

**`sidebar.items.mine`**

> EN — Mine

ما أنشأته

**`sidebar.items.missionControl`**

> EN — Goals & Plans

الأهداف والخطط

**`sidebar.items.newEntry`**

> EN — New entry

إدخال جديد

**`sidebar.items.posts`**

> EN — Posts

المنشورات

**`sidebar.items.predictions`**

> EN — Predictions

الأنماط

**`sidebar.items.presentations`**

> EN — Presentations

العروض التقديمية

**`sidebar.items.products`**

> EN — Products

المنتجات

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

سير عمل المنتج

**`sidebar.items.projects`**

> EN — Projects

المشاريع

**`sidebar.items.published`**

> EN — Live sites

المواقع المنشورة

**`sidebar.items.records`**

> EN — My records

سجلاتي

**`sidebar.items.reflection`**

> EN — Your week

أسبوعك

**`sidebar.items.research`**

> EN — Research

البحث

**`sidebar.items.routing`**

> EN — Which AI is used

أي ذكاء اصطناعي يُستخدم

**`sidebar.items.sales`**

> EN — Sales

المبيعات

**`sidebar.items.settings`**

> EN — Settings

الإعدادات

**`sidebar.items.systemHealth`**

> EN — System Health

حالة النظام

**`sidebar.items.team`**

> EN — Team

الفريق

**`sidebar.items.timeline`**

> EN — History

السجل

**`sidebar.items.trading`**

> EN — Trading

التداول

**`sidebar.items.tradingJournal`**

> EN — Trading journal

سجلّ التداول

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

سير عمل التداول

**`sidebar.items.videos`**

> EN — Video ideas

أفكار فيديو

**`sidebar.items.voice`**

> EN — Voice

الصوت

**`sidebar.items.websiteBuilder`**

> EN — Build a site

أنشئ موقعًا

**`sidebar.items.websites`**

> EN — Website plans

خطط المواقع

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

تعذّر تحميل أفكارك: {message}

**`dashboard.insights.title`**

> EN — What I noticed

ما لاحظته

**`dashboard.overview.activeMission.open`**

> EN — Open the plan

افتح الخطة

**`dashboard.overview.activeMission.stepsLabel`**

> EN — {completed}/{total} steps completed

اكتمل {completed}/{total} خطوات

**`dashboard.overview.aiCoach.entryCount`**

> EN — {count, plural, one {# new {module} entry} other {# new {module} entries}}

{count, plural, zero {لا إدخالات جديدة في {module}} one {إدخال جديد واحد في {module}} two {إدخالان جديدان في {module}} few {# إدخالات جديدة في {module}} many {# إدخالًا جديدًا في {module}} other {# إدخال جديد في {module}}}

**`dashboard.overview.aiCoach.mostActiveIn`**

> EN — Most active in {module}

الأكثر نشاطًا في {module}

**`dashboard.overview.aiCoach.noActivity`**

> EN — No activity yet this week — log something to get started.

لا يوجد نشاط بعد هذا الأسبوع — سجّل شيئًا للبدء.

**`dashboard.overview.betaFeedback.linkLabel`**

> EN — Share feedback

إرسال ملاحظات

**`dashboard.overview.betaFeedback.message`**

> EN — Thanks for testing Ionexa AI. Your feedback is welcome.

شكرًا لتجربتك Ionexa AI. رأيك موضع ترحيب.

**`dashboard.overview.healthScore.buildingMomentum`**

> EN — Building momentum

تكتسب زخمًا

**`dashboard.overview.healthScore.excellentConsistency`**

> EN — Excellent consistency

انتظام ممتاز

**`dashboard.overview.healthScore.justStarting`**

> EN — Just getting started

بداية جديدة

**`dashboard.overview.healthScore.strongProgress`**

> EN — Strong progress

تقدم قوي

**`dashboard.overview.healthScore.suggestion.consistency`**

> EN — Try logging something every day this week.

حاول تسجيل شيء ما كل يوم هذا الأسبوع.

**`dashboard.overview.healthScore.suggestion.coverage`**

> EN — Try exploring a module you haven't used yet.

جرّب استكشاف وحدة لم تستخدمها بعد.

**`dashboard.overview.healthScore.suggestion.missionSteps`**

> EN — Complete a plan step to keep your momentum going.

أكمل خطوة من الخطة للحفاظ على زخمك.

**`dashboard.overview.healthScore.title`**

> EN — Business Health Score

مؤشر صحة العمل

**`dashboard.overview.next.title`**

> EN — Next

التالي

**`dashboard.overview.nextAction.continueMission`**

> EN — Continue: {step} from your "{goal}" plan

تابع: {step} من خطة "{goal}"

**`dashboard.overview.nextAction.cta`**

> EN — Go there →

اذهب إلى هناك ←

**`dashboard.overview.setupProgress.count`**

> EN — {done} of {total} steps

{done} من {total} خطوات

**`dashboard.overview.setupProgress.steps.firstEntry`**

> EN — Log your first entry

سجّل مدخلك الأول

**`dashboard.overview.setupProgress.steps.mission`**

> EN — Set a goal

حدّد هدفًا

**`dashboard.overview.setupProgress.steps.onboarding`**

> EN — Finish the welcome questions

أكمل أسئلة الترحيب

**`dashboard.overview.setupProgress.steps.secondModule`**

> EN — Log something in a second area

سجّل شيئًا في مجال ثانٍ

**`dashboard.overview.setupProgress.title`**

> EN — Setup progress

تقدّم الإعداد

**`dashboard.overview.statRow.creditsExplain`**

> EN — What is left of this month's allowance for AI work.

ما تبقّى من حصتك الشهرية لعمل الذكاء الاصطناعي.

**`dashboard.overview.statRow.creditsRemaining`**

> EN — Credits Remaining

الرصيد المتبقي

**`dashboard.overview.statRow.fillsAfter`**

> EN — Fills in after {count} entries

يمتلئ بعد {count} إدخالات

**`dashboard.overview.statRow.fromEntries`**

> EN — {count, plural, one {from # entry} other {from # entries}}

{count, plural, zero {من # إدخال} one {من # إدخال} two {من # إدخالين} few {من # إدخالات} many {من # إدخالًا} other {من # إدخال}}

**`dashboard.overview.statRow.mostActive`**

> EN — Most Active

الأكثر نشاطًا

**`dashboard.overview.statRow.ofTotal`**

> EN — {count, plural, one {of # in total} other {of # in total}}

{count, plural, zero {من # إجمالًا} one {من # إجمالًا} two {من # إجمالًا} few {من # إجمالًا} many {من # إجمالًا} other {من # إجمالًا}}

**`dashboard.overview.statRow.openCredits`**

> EN — See the ledger →

اعرض السجل ←

**`dashboard.overview.statRow.openEntries`**

> EN — See the entries →

اعرض المدخلات ←

**`dashboard.overview.statRow.thisWeek`**

> EN — This Week

هذا الأسبوع

**`dashboard.overview.statRow.totalEntries`**

> EN — Total Entries

إجمالي الإدخالات

**`dashboard.overview.statRow.totalEntriesExplain`**

> EN — Everything you have logged, in every module, since you started.

كل ما سجّلته، في كل وحدة، منذ البداية.

**`dashboard.overview.whatChanged.entries`**

> EN — new entries

إدخالات جديدة

**`dashboard.overview.whatChanged.insights`**

> EN — new insights

ملاحظات جديدة

**`dashboard.overview.whatChanged.since`**

> EN — since {when}

منذ {when}

**`dashboard.overview.whatChanged.title`**

> EN — What changed

ما الذي تغيّر

**`errors.boundary.section`**

> EN — This section could not be displayed.

تعذّر عرض هذا القسم.

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

بقية الصفحة غير متأثرة. إعادة التحميل تحلّ المشكلة عادةً.

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

كان هذا سؤالًا، لذلك لم يُسجَّل شيء.

**`dashboard.create.answerItInstead`**

> EN — Answer it

أجب عنه

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

تابع في الدردشة

**`dashboard.create.loggedTo`**

> EN — Logged to:

سُجّل في:

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

سجّله على أي حال

**`dashboard.create.title`**

> EN — Create Anything

إنشاء أي شيء

**`dashboard.create.viewModule`**

> EN — View {module} →

عرض {module} ←

**`dashboard.createAnything.attachImage`**

> EN — Attach image

إرفاق صورة

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

إجابتك...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

متابعة

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

تخطَّ وسجّلها على أي حال

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

سؤالان سريعان:

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

صف فكرتك بالتفصيل...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

إزالة الصورة

**`dashboard.createAnything.send`**

> EN — Send

إرسال

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

تعذّر رفع صورة أو أكثر.

**`dashboard.energyCheckIn.change`**

> EN — Change

تغيير

**`dashboard.energyCheckIn.checkedInToday`**

> EN — Today's energy: {level}/5.

طاقة اليوم: {level}/5.

**`dashboard.energyCheckIn.levelLabel`**

> EN — Energy level {level}

مستوى الطاقة {level}

**`dashboard.energyCheckIn.logged`**

> EN — Energy logged

تم تسجيل الطاقة

**`dashboard.energyCheckIn.notePlaceholder`**

> EN — Optional note...

ملاحظة اختيارية...

**`dashboard.energyCheckIn.prompt`**

> EN — How's your energy today?

كيف هي طاقتك اليوم؟

**`dashboard.energyCheckIn.scaleHigh`**

> EN — 5 = great

٥ = ممتاز

**`dashboard.energyCheckIn.scaleLow`**

> EN — 1 = exhausted

١ = منهك

**`dashboard.energyCheckIn.title`**

> EN — Energy Check-In

تسجيل الطاقة

**`dashboard.firstScreen.build.example`**

> EN — Build a website for my shop

ابنِ موقعًا لمتجري

**`dashboard.firstScreen.build.verb`**

> EN — Build

ابنِ

**`dashboard.firstScreen.cost.charged`**

> EN — Uses credits

يستهلك رصيدًا

**`dashboard.firstScreen.cost.free`**

> EN — Free

مجانًا

**`dashboard.firstScreen.cost.freeAllowance`**

> EN — Free up to your monthly limit

مجانًا ضمن حدك الشهري

**`dashboard.firstScreen.label`**

> EN — Press one — it runs right away

اضغط واحدًا — يبدأ فورًا

**`dashboard.firstScreen.repeat.example`**

> EN — Every Monday, a summary of my sales

كل يوم اثنين، ملخص مبيعاتي

**`dashboard.firstScreen.repeat.verb`**

> EN — Repeat

كرّر

**`dashboard.firstScreen.understand.example`**

> EN — What do my numbers say this week?

ماذا تقول أرقامي هذا الأسبوع؟

**`dashboard.firstScreen.understand.verb`**

> EN — Understand

افهم

**`dashboard.overview.recentEntries.empty`**

> EN — No entries yet.

لا توجد إدخالات بعد.

**`dashboard.overview.recentEntries.title`**

> EN — Recent Entries

الإدخالات الأخيرة

**`errors.creditHistory`**

> EN — See credit history

عرض سجل الـ credits

**`errors.retry`**

> EN — Try again

حاول مرة أخرى

**`sampleData.load`**

> EN — See it with sample data

شاهده ببيانات تجريبية

**`sampleData.loadFailed`**

> EN — That did not work. Try again.

لم ينجح ذلك. حاول مرة أخرى.

**`sampleData.loading`**

> EN — Loading…

جارٍ التحميل…

## Tier 3 — Further in — only if you have time (198)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

إغلاق

**`common.readMore`**

> EN — Read more

اقرأ المزيد

**`common.whatIsThisPage`**

> EN — What is this page?

ما هذه الصفحة؟

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

من {count, plural, zero {لا إدخالات} one {إدخال واحد من إدخالاتك} two {إدخالين من إدخالاتك} few {# إدخالات من إدخالاتك} many {# إدخالًا من إدخالاتك} other {# إدخال من إدخالاتك}}

**`dashboard.insights.checkIt`**

> EN — Check it yourself

تحقّق بنفسك

**`dashboard.insights.dismiss`**

> EN — Dismiss this

تجاهل هذا

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

تعذّر تجاهل ذلك.

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

أخفِ الأرقام

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

اعرض الأرقام

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

تجاهل

**`common.noNotifications`**

> EN — No new notifications.

لا توجد إشعارات جديدة.

**`common.notifications`**

> EN — Notifications

الإشعارات

**`common.switchToDarkMode`**

> EN — Switch to dark mode

التبديل إلى المظهر الداكن

**`common.switchToLightMode`**

> EN — Switch to light mode

التبديل إلى المظهر الفاتح

**`common.toggleMenu`**

> EN — Toggle menu

إظهار القائمة أو إخفاؤها

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

أعد الشحن الآن حتى لا ينقطع عملك.

**`credits.low.none`**

> EN — No credits left this month

لا توجد أرصدة متبقية هذا الشهر

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

{count, plural, zero {لم يتبقَّ أي رصيد} one {تبقّى رصيد واحد} two {تبقّى رصيدان} few {تبقّت # أرصدة} many {تبقّى # رصيدًا} other {تبقّى # رصيد}} هذا الشهر

**`credits.low.topUp`**

> EN — Top up

إعادة الشحن

**`language.label`**

> EN — Language

اللغة

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

تعذّر حفظ اللغة — لم يتغيّر شيء.

**`pwa.install`**

> EN — Install

تثبيت

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

أضِفه إلى الشاشة الرئيسية: شاشة كاملة وإشعارات تصلك فعلاً.

**`pwa.installTitle`**

> EN — Install Ionexa

تثبيت Ionexa

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

لا يقترح Safari ذلك من تلقاء نفسه — ثلاث نقرات فقط.

**`pwa.iosGotIt`**

> EN — Got it

فهمت

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

اضغط زر المشاركة في شريط Safari

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

مرّر للأسفل واضغط «إضافة إلى الشاشة الرئيسية»

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

اضغط إضافة — سيظهر Ionexa مع بقية تطبيقاتك

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

أضف Ionexa إلى الشاشة الرئيسية

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

قبل ذلك لا يستطيع الـ iPhone إرسال الإشعارات، وقد يمسح Safari بياناتك المحفوظة بعد 7 أيام دون استخدام.

**`pwa.notNow`**

> EN — Not now

ليس الآن

**`pwa.showHow`**

> EN — Show me how

أرِني الطريقة

### first result

**`common.cancel`**

> EN — Cancel

إلغاء

**`common.created`**

> EN — ✓ created

✓ تم الإنشاء

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

تجاهل الاقتراح

**`common.error`**

> EN — error

خطأ

**`common.notAuthenticated`**

> EN — Not authenticated.

غير مُصادَق عليه.

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

شراء أرصدة

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

يتطلب هذا الإجراء أرصدة أكثر مما لديك. اشترِ حزمة أرصدة أو رقِّ خطتك للمتابعة.

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

لديك {available} رصيد متبقٍ ويحتاج هذا نحو {needed}. اشترِ حزمة أرصدة أو رقِّ خطتك.

**`credits.outOfCredits.title`**

> EN — You're out of credits

لقد نفدت أرصدتك

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

ترقية الخطة

**`dashboard.goal.change`**

> EN — Change something

غيّر شيئًا

**`dashboard.goal.confirm`**

> EN — Yes, do it

نعم، نفّذ

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

{credits, plural, zero {بدون رصيد} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} عند الضغط على الزر هناك. لا يُخصم شيء الآن.

**`dashboard.goal.dismiss`**

> EN — Never mind

لا يهم

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

لا يُخصم شيء الآن، ولا عند الوصول.

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

قل المزيد قليلًا، حتى يصل هذا إلى المكان الصحيح.

**`dashboard.goal.which`**

> EN — Which one do you mean?

أيّهما تقصد؟

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

ينتقل هذا إلى {destination} بما كتبته.

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

المنافسون

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

المنافسون المعروفون

**`dashboard.ideas.customerLabel`**

> EN — Customer

العميل

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

العميل المستهدف

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

خدمة جديدة للشركات الصغيرة

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

كل فكرة في مكان واحد

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

اكتبها وهي ما زالت خامًا — هنا تُقيَّم وتُقارن بغيرها وتبقى محفوظة حتى لو استبعدتها.

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

حجم السوق

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

مثال: حجم السوق ملياران من الدولارات

**`dashboard.ideas.mvpLabel`**

> EN — MVP

المنتج الأولي

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

كيف يبدو المنتج الأولي؟

**`dashboard.ideas.nameLabel`**

> EN — Name

الاسم

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

اسم الفكرة

**`dashboard.ideas.new`**

> EN — New Idea

فكرة جديدة

**`dashboard.ideas.problemLabel`**

> EN — Problem

المشكلة

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

ما المشكلة التي تحلها؟

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

التقييم (0-100)

**`dashboard.ideas.scorePlaceholder`**

> EN — score

التقييم

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

الحكم

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

مثال: المتابعة / الإلغاء / المراقبة

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

أعد تحميل الصفحة لترى النسخة الحالية، ثم أعد تطبيق تغييرك.

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

شخص ما — أو تبويب آخر — غيّر هذا أثناء عملك عليه.

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

قسّمه أو ارفع نسخة أصغر.

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

هذا الملف كبير جدًا.

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

افتح الإعدادات › الفوترة لمعرفة الخطة التي تشمله.

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

خطتك الحالية لا تشمل هذا.

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

اشترِ credits من الإعدادات أو انتظر التجديد الشهري.

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

ليس لديك ما يكفي من الـ credits لهذا.

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

راجع الحقول المحددة ثم أرسله مرة أخرى.

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

هناك شيء في النموذج لم يُقبل.

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

سجّل الدخول مرة أخرى وأعد المحاولة — لم يُفقد شيء مما أدخلته.

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

تم تسجيل خروجك.

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

على الأرجح تم حذفه. عُد إلى القائمة واختر عنصرًا آخر.

**`errors.codes.notFound.what`**

> EN — This no longer exists.

هذا العنصر لم يعد موجودًا.

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

تحقق من اتصالك ثم حاول مرة أخرى.

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

لم يتمكن جهازك من الوصول إلينا.

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

احذف ما لم تعد بحاجة إليه، أو قم بالترقية من الإعدادات › الفوترة.

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

لقد بلغت حد خطتك.

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

انتظر دقيقة تقريبًا ثم حاول مرة أخرى.

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

طلبات كثيرة جدًا خلال وقت قصير.

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

تم تسجيل ذلك. حاول بعد قليل، وتواصل مع الدعم إذا استمر.

**`errors.codes.serverError.what`**

> EN — This broke on our side.

حدث خلل من جهتنا.

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

حاول مرة أخرى، وتواصل مع الدعم إذا تكرر الأمر.

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

لم تكتمل هذه العملية.

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

حوّله إلى PDF أو DOCX أو CSV أو TXT ثم ارفعه مجددًا.

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

نوع الملف هذا غير مدعوم.

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

المشكلة من جهتنا وعادةً ما تُحل خلال بضع دقائق.

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

خدمة الذكاء الاصطناعي لا تستجيب حاليًا.

**`errors.credits.charged`**

> EN — This attempt used credits.

استهلكت هذه المحاولة بعض الـ credits.

**`errors.credits.notCharged`**

> EN — You were not charged.

لم يتم خصم أي مبلغ.

**`errors.credits.refunded`**

> EN — Your credits were returned.

تمت إعادة الـ credits الخاصة بك.

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

لا يمكننا التأكد من هنا ما إذا تم الخصم.

**`module.exportCsv`**

> EN — Export CSV

تصدير CSV

**`module.noMatches`**

> EN — No matches for “{query}”

لا توجد نتائج لـ «{query}»

**`module.save`**

> EN — Save

حفظ

**`module.saving`**

> EN — Saving...

جارٍ الحفظ...

**`module.searchPlaceholder`**

> EN — Search...

بحث...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

{credits, plural, zero {لا أرصدة} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} لكل دقيقة كلام

**`voice.draft.discard`**

> EN — Discard

تجاهل

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

لم يُرسل شيء بعد. صحّح النص ثم أرسله بنفسك.

**`voice.draft.title`**

> EN — What was heard

ما تمّ سماعه

**`voice.draft.use`**

> EN — Use this text

استخدم هذا النص

**`voice.errors.bad_request`**

> EN — That request could not be read.

تعذّرت قراءة هذا الطلب.

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

الخدمة مزدحمة الآن. حاول بعد قليل.

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

لم يُسمح باستخدام الميكروفون. تستطيع الكتابة كالمعتاد.

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

لم يُسمع أي شيء في ذلك التسجيل.

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

الصوت غير متاح الآن. تستطيع الكتابة كالمعتاد.

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

الرصيد غير كافٍ.

**`voice.errors.no_recording`**

> EN — No recording was sent.

لم يُرسل أي تسجيل.

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

لم يُسجَّل أي شيء.

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

الصوت غير مُعدّ في هذا التثبيت.

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

الصوت غير مشمول في خطتك.

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

انتهت دقائق الصوت لهذا الشهر.

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

تعذّر الوصول إلى خدمة الصوت.

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

عدد التسجيلات كبير جدًا في الساعة الأخيرة. حاول بعد قليل.

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

تعذّر حجز الرصيد لهذه العملية.

**`voice.errors.too_large`**

> EN — That recording is too long.

هذا التسجيل طويل أكثر من اللازم.

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

لقد سجّلت الخروج. سجّل الدخول وحاول مرة أخرى.

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

هذا المتصفّح لا يستطيع التسجيل. تستطيع الكتابة كالمعتاد.

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

صيغة الصوت هذه غير مدعومة.

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

تعذّر التحقّق من دقائق الصوت في الوقت الحالي.

**`voice.listening`**

> EN — Listening

يستمع

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

تحدّث ثم اضغط إيقاف. لا يُرسل شيء قبل أن تقرأه.

**`voice.outOfMinutes`**

> EN — No voice minutes left this month

لم تتبقّ دقائق صوتية هذا الشهر

**`voice.permission.allow`**

> EN — Open the microphone

افتح الميكروفون

**`voice.permission.cancel`**

> EN — Not now

ليس الآن

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

{credits, plural, zero {لا أرصدة} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} لكل دقيقة، و{minutes, plural, zero {لا دقائق} one {دقيقة واحدة} two {دقيقتان} few {# دقائق} many {# دقيقة} other {# دقيقة}} شهريًا في خطتك.

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

تقرأ النص وتصحّحه قبل إرسال أي شيء.

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

يُرسل الصوت لتحويله إلى نص ولا يُحفظ في أي مكان — لا لدينا ولا بعد ذلك.

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

لا يبدأ التسجيل إلا عند الضغط، ويتوقّف عند الضغط مرة أخرى.

**`voice.permission.title`**

> EN — Before the microphone opens

قبل فتح الميكروفون

**`voice.settings.notConfigured`**

> EN — Voice is not set up on this deployment, so the microphone and Listen buttons do not appear.

الصوت غير مُعدّ في هذا التثبيت، لذلك لا يظهر زر الميكروفون ولا زر الاستماع.

**`voice.settings.notIncluded`**

> EN — Voice is not included on your plan. Everything here can still be typed and read.

الصوت غير مشمول في خطتك. كل ما هنا يمكن كتابته وقراءته كالمعتاد.

**`voice.startListening`**

> EN — Speak instead of typing

تحدّث بدل الكتابة

**`voice.stopListening`**

> EN — Stop

إيقاف

**`common.nextPage`**

> EN — Next page

الصفحة التالية

**`common.paginationNext`**

> EN — Next

التالي

**`common.paginationPage`**

> EN — Page {page} / {total}

صفحة {page} / {total}

**`common.paginationPrev`**

> EN — Prev

السابق

**`common.previousPage`**

> EN — Previous page

الصفحة السابقة

**`common.updated`**

> EN — ✓ updated

✓ تم التحديث

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

المنافسون:

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

لـ: {customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

حجم السوق:

**`dashboard.ideas.cardMvp`**

> EN — MVP:

المنتج الأولي:

**`dashboard.ideas.cardProblem`**

> EN — Problem:

المشكلة:

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

التقييم: {score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

هل تريد حذف هذه الفكرة؟ لا يمكن التراجع عن ذلك.

**`dashboard.ideas.edit`**

> EN — Edit Idea

تعديل الفكرة

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

تعديل الفكرة: {name}

**`entityLinks.linked`**

> EN — Linked

تم الربط

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

قد يكون هذا مرتبطًا بـ: {titles}. هل تريد ربطها؟

**`entityLinks.no`**

> EN — No

لا

**`entityLinks.yes`**

> EN — Yes

نعم

**`module.edit`**

> EN — Edit

تعديل

**`module.loggedAt`**

> EN — Logged {when}

سُجّل {when}

**`module.sort.label`**

> EN — Sort:

ترتيب:

**`askAi.buttonLabel`**

> EN — Ask AI

اسأل الذكاء الاصطناعي

**`common.networkError`**

> EN — Network error — please try again.

خطأ في الشبكة — يرجى المحاولة مرة أخرى.

**`common.textActions.accept`**

> EN — Accept

قبول

**`common.textActions.reject`**

> EN — Reject

رفض

**`entityLinks.buttonLabel`**

> EN — Link to...

ربط بـ...

**`entityLinks.linkedToLabel`**

> EN — Linked to:

مرتبط بـ:

**`entityLinks.unlink`**

> EN — Unlink

إلغاء الربط

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

إلغاء الربط بـ {name}

**`favorites.add`**

> EN — Add to favorites

إضافة إلى المفضلة

**`favorites.remove`**

> EN — Remove from favorites

إزالة من المفضلة

**`module.delete`**

> EN — Delete

حذف

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

هل تريد حذف هذا العنصر ({label})؟ لا يمكن التراجع عن ذلك.

**`module.deleted`**

> EN — Deleted

تم الحذف

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

كما قرأ {count, plural, zero {لا رسائل سابقة} one {رسالة سابقة واحدة} two {رسالتين سابقتين} few {# رسائل سابقة} many {# رسالة سابقة} other {# رسالة سابقة}} عن هذا الإدخال

**`askAi.close`**

> EN — Close

إغلاق

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

اطرح سؤالاً عن هذا الإدخال — لا حاجة لشرح السياق، فالذكاء الاصطناعي يعرفه بالفعل.

**`askAi.placeholder`**

> EN — Ask anything about this entry...

اسأل أي شيء عن هذا الإدخال...

**`askAi.send`**

> EN — Send

إرسال

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

انقطع الاتصال قبل اكتمال الرد.

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

انقطع الاتصال — قد يكون الرد أعلاه غير مكتمل.

**`askAi.title`**

> EN — Ask AI about this {title}

اسأل الذكاء الاصطناعي عن هذا {title}

**`common.errorWithMessage`**

> EN — error: {message}

خطأ: {message}

**`common.linked`**

> EN — ✓ linked

✓ تم الربط

**`common.newMessagesBelow`**

> EN — New message below

رسالة جديدة بالأسفل

**`entityLinks.modalTitle`**

> EN — Link to...

ربط بـ...

**`entityLinks.noMatches`**

> EN — No matches.

لا توجد نتائج مطابقة.

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

بأي وحدة تريد الربط؟

**`entityLinks.searching`**

> EN — Searching...

جارٍ البحث...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

البحث في {module}...

**`aiSteps.counter`**

> EN — ({step}/{total})

({step}/{total})
