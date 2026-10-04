# The first run — ar

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **586 strings**. The whole product is 3480, which is why this file exists.

**Start with tier 1. It is 21 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 357 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (21)

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

**`common.searchFailed`**

> EN — Search is unavailable right now — this is not an empty result. Try again in a moment.

البحث غير متاح حاليًا — هذه ليست نتيجة فارغة. أعد المحاولة بعد قليل.

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

هذه المدخلات عرض توضيحي — ثلاثة أشهر من عمل استوديو تصميم صغير. ليست بياناتك.

### first result

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

تُعرض أحدث {count, number}. الإدخالات الأقدم ما زالت محفوظة — استخدم البحث في سجلاتي للعثور عليها.

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

يبدو هذا سؤالًا. هل أجيب عنه أم أسجله؟

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

صف أي شيء — فكرة منتج، صفقة، ملاحظة من مستخدم، مؤشرًا — وسيصل تلقائيًا إلى الوحدة الصحيحة.

## Tier 2 — The labels — skim these (357)

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

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count, plural, zero {لا أرصدة} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}}/شهر

**`pricing.features.customCredits`**

> EN — Custom credits

أرصدة مخصصة

**`pricing.perMonth`**

> EN — /month

/شهريًا

**`pricing.rows.accountAndPrivacy`**

> EN — Export or delete your account

تصدير حسابك أو حذفه

**`pricing.rows.agentRunsPerHour`**

> EN — Agent runs

عمليات تشغيل الوكلاء

**`pricing.rows.aiAgents`**

> EN — AI agents

وكلاء الذكاء الاصطناعي

**`pricing.rows.aiChat`**

> EN — Ask me

اسألني

**`pricing.rows.aiMemory`**

> EN — AI Memory

ذاكرة الذكاء الاصطناعي

**`pricing.rows.askYourData`**

> EN — Ask your own records

اسأل سجلاتك الخاصة

**`pricing.rows.automation`**

> EN — Automation

الأتمتة

**`pricing.rows.backgroundJobs`**

> EN — Work that runs in the background

مهام تعمل في الخلفية

**`pricing.rows.buildLogs`**

> EN — Website, app, image and video logs

سجلات المواقع والتطبيقات والصور والفيديو

**`pricing.rows.businessLogs`**

> EN — My records

سجلاتي

**`pricing.rows.chatMemory`**

> EN — Facts remembered in chat

المعلومات التي تتذكرها المحادثة

**`pricing.rows.chatPins`**

> EN — Pinned conversations

المحادثات المثبّتة

**`pricing.rows.coding`**

> EN — AI Coding

البرمجة بالذكاء الاصطناعي

**`pricing.rows.contactSupport`**

> EN — Contact form

نموذج التواصل

**`pricing.rows.createStudio`**

> EN — Make anything

أنشئ أي شيء

**`pricing.rows.creditsPerMonth`**

> EN — Credits / month

الرصيد / شهريًا

**`pricing.rows.customAiPersona`**

> EN — Custom assistant name

اسم مخصص للمساعد

**`pricing.rows.deepResearch`**

> EN — Deep Research runs / month

عمليات البحث المعمّق / شهريًا

**`pricing.rows.documents`**

> EN — Documents

المستندات

**`pricing.rows.fileQuestionsPerHour`**

> EN — Questions about a file

أسئلة عن ملف

**`pricing.rows.files`**

> EN — Files stored

الملفات المخزّنة

**`pricing.rows.fileUploadsPerHour`**

> EN — File uploads

عمليات رفع الملفات

**`pricing.rows.freeChatMessages`**

> EN — Free chat messages / month

رسائل محادثة مجانية / شهريًا

**`pricing.rows.helpCentre`**

> EN — Help Centre

مركز المساعدة

**`pricing.rows.integrationReadsPerHour`**

> EN — Reads from a connected account

عمليات القراءة من حساب مرتبط

**`pricing.rows.integrations`**

> EN — Connected integrations

التكاملات المتصلة

**`pricing.rows.listRowsShown`**

> EN — Rows shown in one list

الصفوف المعروضة في القائمة

**`pricing.rows.meetings`**

> EN — Meetings → actions

الاجتماعات ← الإجراءات

**`pricing.rows.missionControl`**

> EN — Goals & Plans

الأهداف والخطط

**`pricing.rows.notifications`**

> EN — Notifications and reminders

الإشعارات والتذكيرات

**`pricing.rows.posts`**

> EN — Posts

المنشورات

**`pricing.rows.predictions`**

> EN — Predictions

الأنماط

**`pricing.rows.presentations`**

> EN — Presentations

العروض التقديمية

**`pricing.rows.projects`**

> EN — Projects

المشاريع

**`pricing.rows.publishedSites`**

> EN — Published websites

المواقع المنشورة

**`pricing.rows.recordSearch`**

> EN — Record search across modules

البحث في كل السجلات

**`pricing.rows.siteEditsPerDay`**

> EN — Live edits per site

التعديلات المباشرة لكل موقع

**`pricing.rows.siteVersionsKept`**

> EN — Versions kept per site

النسخ المحفوظة لكل موقع

**`pricing.rows.storage`**

> EN — Storage

مساحة التخزين

**`pricing.rows.teamCollaboration`**

> EN — Team collaboration

تعاون الفريق

**`pricing.rows.teamMembers`**

> EN — Team members

أعضاء الفريق

**`pricing.rows.teamSeatsAddOn`**

> EN — Team seats

مقاعد الفريق

**`pricing.rows.voiceClipLength`**

> EN — Longest recording (minutes)

أطول تسجيل (بالدقائق)

**`pricing.rows.voiceMinutes`**

> EN — Voice minutes / month

دقائق الصوت / شهريًا

**`pricing.rows.websiteBuilder`**

> EN — Website & Automation Builder

منشئ المواقع والأتمتة

**`pricing.rows.websiteImageStorage`**

> EN — Storage for website photos

مساحة صور الموقع

**`pricing.values.custom`**

> EN — Custom

مخصّص

**`pricing.values.included`**

> EN — Included

مشمول

**`pricing.values.minutesPerMonth`**

> EN — min/month

دقيقة/شهر

**`pricing.values.no`**

> EN — Not included

غير مشمول

**`pricing.values.perDay`**

> EN — /day

/يوم

**`pricing.values.perHour`**

> EN — /hour

/ساعة

**`pricing.values.perSeat`**

> EN — +{currency}{price}/seat

+{currency}{price}/مقعد

**`pricing.values.unlimited`**

> EN — Unlimited

غير محدود

**`pricing.values.yes`**

> EN — Included

مشمول

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

**`sidebar.items.activity`**

> EN — Activity

النشاط

**`sidebar.items.affiliate`**

> EN — Affiliate

برنامج الشركاء

**`sidebar.items.agents`**

> EN — AI that works for you

ذكاء اصطناعي يعمل من أجلك

**`sidebar.items.aiMemory`**

> EN — What it remembers

ما الذي يتذكره

**`sidebar.items.analytics`**

> EN — Analytics

التحليلات

**`sidebar.items.apps`**

> EN — App ideas

أفكار تطبيقات

**`sidebar.items.automation`**

> EN — Automation

الأتمتة

**`sidebar.items.browserAgent`**

> EN — Browser agent

وكيل المتصفّح

**`sidebar.items.businessAccounting`**

> EN — Accounting

المحاسبة

**`sidebar.items.businessCrm`**

> EN — CRM

إدارة العملاء

**`sidebar.items.businessFinance`**

> EN — Company Finance

مالية الشركة

**`sidebar.items.businessHealth`**

> EN — How the business is doing

كيف تسير الأعمال

**`sidebar.items.businessHr`**

> EN — HR

الموارد البشرية

**`sidebar.items.businessInventory`**

> EN — Inventory

المخزون

**`sidebar.items.businessLegal`**

> EN — Legal

الشؤون القانونية

**`sidebar.items.businessMarketing`**

> EN — Marketing

التسويق

**`sidebar.items.businessProcurement`**

> EN — Procurement

المشتريات

**`sidebar.items.businessSupport`**

> EN — Customer Support

دعم العملاء

**`sidebar.items.calendar`**

> EN — Calendar

التقويم

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

**`sidebar.items.computerAgent`**

> EN — Computer agent

وكيل الحاسوب

**`sidebar.items.connectApis`**

> EN — APIs

واجهات API

**`sidebar.items.connectBanking`**

> EN — Banking

الخدمات المصرفية

**`sidebar.items.connectCalendar`**

> EN — Calendar Sync

مزامنة التقويم

**`sidebar.items.connectCrm`**

> EN — CRM Connector

موصّل CRM

**`sidebar.items.connectDataSources`**

> EN — Data Sources

مصادر البيانات

**`sidebar.items.connectDrive`**

> EN — Google Drive

Google Drive

**`sidebar.items.connectEmail`**

> EN — Email

البريد

**`sidebar.items.connectGithub`**

> EN — GitHub

GitHub

**`sidebar.items.connectIot`**

> EN — IoT Devices

أجهزة إنترنت الأشياء

**`sidebar.items.connectMcp`**

> EN — MCP

MCP

**`sidebar.items.connectSlack`**

> EN — Slack

Slack

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

**`sidebar.items.design`**

> EN — Design

تصميم

**`sidebar.items.documents`**

> EN — Documents

المستندات

**`sidebar.items.engCloud`**

> EN — Cloud

السحابة

**`sidebar.items.engCode`**

> EN — Code

الشفرة

**`sidebar.items.engDatabases`**

> EN — Database Ops

تشغيل قواعد البيانات

**`sidebar.items.engDeployment`**

> EN — Deployment

النشر

**`sidebar.items.engDevops`**

> EN — DevOps

DevOps

**`sidebar.items.engInfrastructure`**

> EN — Infrastructure

البنية التحتية

**`sidebar.items.engMonitoring`**

> EN — Service Monitoring

مراقبة الخدمات

**`sidebar.items.engSecurity`**

> EN — Security

الأمان

**`sidebar.items.engTesting`**

> EN — Testing

الاختبار

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

**`sidebar.items.knowledge`**

> EN — Knowledge

المعرفة

**`sidebar.items.knowledgeGraph`**

> EN — Knowledge Graph

رسم المعرفة

**`sidebar.items.learning`**

> EN — Learning

التعلّم

**`sidebar.items.library`**

> EN — My stuff

أشيائي

**`sidebar.items.marketplace`**

> EN — Ready-made helpers

مساعدون جاهزون

**`sidebar.items.meetings`**

> EN — Meetings

الاجتماعات

**`sidebar.items.memory`**

> EN — Search my records

ابحث في سجلاتي

**`sidebar.items.mine`**

> EN — Mine

ما أنشأته

**`sidebar.items.missionControl`**

> EN — Goals & Plans

الأهداف والخطط

**`sidebar.items.monitoring`**

> EN — Monitoring

المراقبة

**`sidebar.items.music`**

> EN — Music

موسيقى

**`sidebar.items.newEntry`**

> EN — New entry

إدخال جديد

**`sidebar.items.operations`**

> EN — Operations

العمليات

**`sidebar.items.personalFinance`**

> EN — Personal Finance

المالية الشخصية

**`sidebar.items.personalHabits`**

> EN — Habits

العادات

**`sidebar.items.personalHealth`**

> EN — Health

الصحة

**`sidebar.items.personalJournal`**

> EN — Journaling

التدوين اليومي

**`sidebar.items.personalLifeOs`**

> EN — Life OS

نظام الحياة

**`sidebar.items.personalShopping`**

> EN — Shopping

التسوّق

**`sidebar.items.personalTravel`**

> EN — Travel

السفر

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

**`sidebar.items.scheduledJobs`**

> EN — Scheduled Jobs

المهام المجدولة

**`sidebar.items.settings`**

> EN — Settings

الإعدادات

**`sidebar.items.systemHealth`**

> EN — System Health

حالة النظام

**`sidebar.items.tasks`**

> EN — Tasks

المهام

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

**`sidebar.items.verifyCode`**

> EN — Code Verification

التحقق من الشفرة

**`sidebar.items.verifyData`**

> EN — Data Validation

التحقق من البيانات

**`sidebar.items.verifyFacts`**

> EN — Fact Checking

تدقيق الحقائق

**`sidebar.items.verifyOutput`**

> EN — Output Evaluation

تقييم المخرجات

**`sidebar.items.verifyRedTeam`**

> EN — Red Teaming

اختبار الفريق الأحمر

**`sidebar.items.verifySecurity`**

> EN — Security Testing

اختبار الأمان

**`sidebar.items.verifySources`**

> EN — Source Verification

التحقق من المصادر

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

**`sidebar.items.workflows`**

> EN — Workflows

سير العمل

**`sidebar.rail.allTools`**

> EN — All tools

كل الأدوات

**`sidebar.rail.chat`**

> EN — Chat

محادثة

**`sidebar.rail.coding`**

> EN — Coding

البرمجة

**`sidebar.rail.collapse`**

> EN — Collapse sidebar

طي الشريط الجانبي

**`sidebar.rail.expand`**

> EN — Expand sidebar

توسيع الشريط الجانبي

**`sidebar.rail.label`**

> EN — Main

القائمة الرئيسية

**`sidebar.rail.new`**

> EN — New

جديد

**`sidebar.rail.pin`**

> EN — Pin {tool}

تثبيت {tool}

**`sidebar.rail.recentTools`**

> EN — Recent tools

الأدوات الأخيرة

**`sidebar.rail.remove`**

> EN — Remove {tool} from Recent tools

إزالة {tool} من الأدوات الأخيرة

**`sidebar.rail.saveFailed`**

> EN — Could not save that change. Try again.

تعذّر حفظ التغيير. حاول مرة أخرى.

**`sidebar.rail.settings`**

> EN — Settings

الإعدادات

**`sidebar.rail.unpin`**

> EN — Unpin {tool}

إلغاء تثبيت {tool}

**`sidebar.tabs.label`**

> EN — Main navigation

التنقل الرئيسي

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

تعذّر تحميل أفكارك: {message}

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

**`dashboard.createAnything.accomplishPlaceholder`**

> EN — What do you want to accomplish?

ما الذي تريد إنجازه؟

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

**`errors.creditHistory`**

> EN — See credit history

عرض سجل الـ credits

**`errors.retry`**

> EN — Try again

حاول مرة أخرى

**`promise.greeting.afternoon`**

> EN — Good afternoon

مساء الخير

**`promise.greeting.evening`**

> EN — Good evening

مساء الخير

**`promise.greeting.morning`**

> EN — Good morning

صباح الخير

## Tier 3 — Further in — only if you have time (208)

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

**`dashboard.goal.costsNow`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press Yes. Nothing is charged until then.

{credits, plural, zero {بدون رصيد} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} عند الضغط على «نعم». لا يُخصم شيء قبل ذلك.

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

{credits, plural, zero {بدون رصيد} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} عند الضغط على الزر هناك. لا يُخصم شيء الآن.

**`dashboard.goal.dismiss`**

> EN — Never mind

لا يهم

**`dashboard.goal.fix`**

> EN — Fix the text

صحّح النص

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

لا يُخصم شيء الآن، ولا عند الوصول.

**`dashboard.goal.goingTo`**

> EN — Going to

سيفتح

**`dashboard.goal.heard`**

> EN — I heard: “{heard}”

فهمت: «{heard}»

**`dashboard.goal.routeAsk`**

> EN — Ionexa will read it

سيقرؤه Ionexa

**`dashboard.goal.routeChange`**

> EN — change

تغيير

**`dashboard.goal.routeCostNow`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} on send

≈ {credits, plural, zero {# رصيد} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} عند الإرسال

**`dashboard.goal.routeCostThere`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} there

≈ {credits, plural, zero {# رصيد} one {رصيد واحد} two {رصيدان} few {# أرصدة} many {# رصيدًا} other {# رصيد}} هناك

**`dashboard.goal.sendIt`**

> EN — Yes, send it

نعم، أرسله

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

قل المزيد قليلًا، حتى يصل هذا إلى المكان الصحيح.

**`dashboard.goal.which`**

> EN — Which one do you mean?

أيّهما تقصد؟

**`dashboard.goal.willHandle`**

> EN — No tool is named, so Ionexa will read it — it may answer it or save it as an entry.

لم تُذكر أداة، لذا سيقرأه Ionexa — قد يجيب عنه أو يحفظه كإدخال.

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

**`voice.errors.streamInterrupted`**

> EN — The connection dropped before the reply finished.

انقطع الاتصال قبل اكتمال الرد.

**`voice.errors.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

انقطع الاتصال — قد يكون الرد أعلاه غير مكتمل.

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
