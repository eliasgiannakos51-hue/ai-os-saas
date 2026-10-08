# The first run — ja

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **602 strings**. The whole product is 4105, which is why this file exists.

**Start with tier 1. It is 25 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 369 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (25)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.checkEmailBody`**

> EN — We sent a link to {email}. Open it to confirm your address and start using your account.

{email} にリンクを送信しました。開いてアドレスを確認し、アカウントを使い始めてください。

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

アカウントを作成できませんでした。入力内容をご確認のうえお試しください — 請求は発生していません。

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

アカウントを作成するには、利用規約とプライバシーポリシーに同意する必要があります。

**`pricing.businessCardDescription`**

> EN — Start with Professional or Ultimate as your team's base, then invite members for +{price}/month each — everyone gets your plan's tier on their own account.

Professional または Ultimate をチームの基本にして、メンバーを1人あたり +{price}/月 で招待しましょう。全員が自分のアカウントであなたのプランのレベルを利用できます。

### login

**`auth.login.emailNotConfirmed`**

> EN — Confirm your email first. We just sent a new link to your inbox.

先にメールアドレスを確認してください。新しいリンクを送信しました。

**`auth.login.failed`**

> EN — We couldn't sign you in. Check the email and password, or reset your password if you're not sure.

サインインできませんでした。メールアドレスとパスワードをご確認いただくか、不明な場合はパスワードを再設定してください。

**`auth.login.oauthFailed`**

> EN — That sign-in didn't complete. Try again, or use your email and password below.

そのサインインは完了しませんでした。もう一度お試しいただくか、下のメールアドレスとパスワードをお使いください。

### onboarding

**`dashboard.onboarding.description`**

> EN — Bring in some real data and the AI will tell you something about your business in the next two minutes.

実際のデータを取り込めば、2分以内に AI があなたのビジネスについて何かを教えてくれます。

**`dashboard.onboarding.privacyNotice`**

> EN — Your data stays yours. It is stored privately, only you can read it, and it is never used to train anything. You can delete it, or your whole account, at any time.

データはあなたのものです。非公開で保存され、読めるのはあなただけで、学習に使われることはありません。いつでもデータもアカウントも削除できます。

**`dashboard.firstTask.lead`**

> EN — Pick something to get done now. The answer arrives in a few seconds.

今すぐやりたいことを選んでください。数秒で答えが届きます。

**`dashboard.firstTask.tasks.explain.text`**

> EN — Explain in plain words what makes a good business description on Google

Google のビジネス説明文を良くするポイントを、わかりやすく説明して

**`dashboard.onboarding.analysingHint`**

> EN — Only real patterns from what you just imported. If there is not enough to be sure of anything, we will say so.

取り込んだデータに実際にあるパターンだけです。断定できるだけの材料がなければ、そう伝えます。

**`dashboard.onboarding.csvHint`**

> EN — CSV or tab-separated, up to {max}. We read it and show you what we found before anything is saved.

CSV またはタブ区切り、最大 {max}。保存する前に読み取り結果をお見せします。

**`dashboard.onboarding.dateAmbiguous`**

> EN — Your dates could be either day/month or month/day — every one falls on or before the 12th, so we cannot tell. Which is it?

日付が 日/月 か 月/日 か判別できません（すべて12日以前のため）。どちらですか？

**`dashboard.onboarding.firstFree`**

> EN — Your first import and analysis are free — they will not use any credits.

最初のインポートと分析は無料です。クレジットは消費されません。

**`dashboard.onboarding.noneNeedMore`**

> EN — There isn't enough here yet for anything to be worth calling a pattern. A few dozen rows with dates on them is usually the point where things start showing up — and we would rather say nothing than make something up.

パターンと呼べるだけの材料がまだありません。日付付きの行が数十あれば見えてくることが多いです。作り話をするより、何も言わないほうを選びます。

**`dashboard.onboarding.pasteHint`**

> EN — A business plan, meeting notes, a list of clients. We pull out what can be recorded and leave the rest alone.

事業計画、議事録、顧客リストなど。記録できる部分だけを取り出し、残りはそのままにします。

**`dashboard.onboarding.sourceCsvHint`**

> EN — A CSV export from your broker, bank or CRM. We work out what each column is.

証券会社・銀行・CRM からの CSV。各列が何かはこちらで判断します。

**`dashboard.onboarding.sourceIntro`**

> EN — Pick whichever is easiest. Nothing here is required, and you can add more later.

いちばん楽なものを選んでください。必須ではなく、あとから追加できます。

**`dashboard.onboarding.sourcePasteHint`**

> EN — A business plan, notes, a list — we pull the structured bits out.

事業計画、メモ、リストなど — 構造化できる部分を取り出します。

### dashboard chrome

**`common.searchFailed`**

> EN — Search is unavailable right now — this is not an empty result. Try again in a moment.

検索は現在利用できません。結果が0件という意味ではありません。少し経ってから再度お試しください。

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

これらはデモの記録です。小さなデザイン事務所の 3 か月分で、あなたのものではありません。

### first result

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

最新の {count, number} 件を表示しています。それより古い記録も保存されています——「記録の検索」から見つけられます。

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

これは質問のようです。答えますか、それとも記録しますか？

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

何でも書いてください — 製品のアイデア、トレード、ユーザーからのフィードバック、指標 — 自動的に適切なモジュールに入ります。

## Tier 2 — The labels — skim these (369)

_On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language._

### signup

**`auth.signup.agreeTerms`**

> EN — I agree to the

同意します：

**`auth.signup.alreadyHaveAccount`**

> EN — Already have an account?

既にアカウントをお持ちですか？

**`auth.signup.and`**

> EN — and

および

**`auth.signup.change`**

> EN — change

変更

**`auth.signup.checkEmailTitle`**

> EN — Check your email

メールを確認してください

**`auth.signup.chooseYourPlan`**

> EN — Choose your plan

プランを選択

**`auth.signup.continue`**

> EN — Continue

続ける

**`auth.signup.continueToPayment`**

> EN — Continue to Payment

支払いに進む

**`auth.signup.country`**

> EN — Country

国

**`auth.signup.countryPlaceholder`**

> EN — Select your country (optional)

国を選択（任意）

**`auth.signup.createAccount`**

> EN — Create Account

アカウントを作成

**`auth.signup.createYourAccount`**

> EN — Create your account

アカウントを作成

**`auth.signup.discountCode`**

> EN — Discount code

割引コード

**`auth.signup.discountCodePlaceholder`**

> EN — Discount code (optional)

割引コード（任意）

**`auth.signup.email`**

> EN — Email

メールアドレス

**`auth.signup.inviteCode`**

> EN — Invite code

招待コード

**`auth.signup.inviteCodePlaceholder`**

> EN — Invite code (optional)

招待コード（任意）

**`auth.signup.logIn`**

> EN — Log in

ログイン

**`auth.signup.mostPopular`**

> EN — Most Popular

一番人気

**`auth.signup.password`**

> EN — Password

パスワード

**`auth.signup.passwordRequirementsNotMet`**

> EN — Please choose a password that meets every requirement above.

上記のすべての条件を満たすパスワードを選んでください。

**`auth.signup.privacyPolicy`**

> EN — Privacy Policy

プライバシーポリシー

**`auth.signup.step`**

> EN — Step {step} of 2

ステップ {step}/2

**`auth.signup.termsOfService`**

> EN — Terms of Service

利用規約

**`auth.signup.working`**

> EN — Working...

処理中...

**`pricing.businessFeatureBase`**

> EN — Choose Professional or Ultimate as your base plan

ベースプランとしてProfessionalまたはUltimateを選択

**`pricing.businessFeatureFreeOnUltimate`**

> EN — Team seats included free on Ultimate

Ultimateではチームシートが無料付帯

**`pricing.businessFeatureFullAccess`**

> EN — Every member gets your plan's tier on their own account

各メンバーは自分のアカウントであなたのプランのレベルを利用できます

**`pricing.businessFeatureManage`**

> EN — Manage seats anytime from Team settings

チーム設定からいつでもシートを管理可能

**`pricing.businessSubtitle`**

> EN — For teams building together

チームで共に構築する

**`pricing.businessTitle`**

> EN — Business

ビジネス

**`pricing.custom`**

> EN — Custom

カスタム

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count} クレジット/月

**`pricing.features.customCredits`**

> EN — Custom credits

カスタムクレジット

**`pricing.perMonth`**

> EN — /month

/月

**`pricing.rows.accountAndPrivacy`**

> EN — Export or delete your account

アカウントの書き出しと削除

**`pricing.rows.agentRunsPerHour`**

> EN — Agent runs

エージェントの実行回数

**`pricing.rows.aiAgents`**

> EN — Scheduled web-research agents

スケジュール実行のウェブ検索エージェント

**`pricing.rows.aiChat`**

> EN — Ask me

聞いてみる

**`pricing.rows.aiMemory`**

> EN — AI Memory

AI メモリー

**`pricing.rows.askYourData`**

> EN — Ask your own records

自分の記録に質問する

**`pricing.rows.automation`**

> EN — Automation

自動化

**`pricing.rows.backgroundJobs`**

> EN — Work that runs in the background

バックグラウンドで走る処理

**`pricing.rows.buildLogs`**

> EN — Website, app, image and video logs

サイト・アプリ・画像・動画の記録

**`pricing.rows.businessLogs`**

> EN — My records

マイレコード

**`pricing.rows.chatMemory`**

> EN — Facts remembered in chat

チャットが覚える情報

**`pricing.rows.chatPins`**

> EN — Pinned conversations

固定した会話

**`pricing.rows.coding`**

> EN — AI Coding

AI コーディング

**`pricing.rows.contactSupport`**

> EN — Contact form

問い合わせフォーム

**`pricing.rows.createStudio`**

> EN — Describe it, it opens the right tool

説明すると適切なツールが開きます

**`pricing.rows.creditsPerMonth`**

> EN — Credits / month

クレジット / 月

**`pricing.rows.customAiPersona`**

> EN — Custom assistant name

アシスタント名の変更

**`pricing.rows.deepResearch`**

> EN — Deep Research runs / month

ディープリサーチ実行回数 / 月

**`pricing.rows.documents`**

> EN — Documents

ドキュメント

**`pricing.rows.fileQuestionsPerHour`**

> EN — Questions about a file

ファイルへの質問

**`pricing.rows.files`**

> EN — Files stored

保存ファイル数

**`pricing.rows.fileUploadsPerHour`**

> EN — File uploads

ファイルのアップロード回数

**`pricing.rows.freeChatMessages`**

> EN — Free chat messages / month

無料チャットメッセージ / 月

**`pricing.rows.helpCentre`**

> EN — Help Centre

ヘルプセンター

**`pricing.rows.integrationReadsPerHour`**

> EN — Reads from a connected account

連携アカウントからの読み取り

**`pricing.rows.integrations`**

> EN — Connected integrations

連携済み統合

**`pricing.rows.listRowsShown`**

> EN — Rows shown in one list

一覧に表示される行数

**`pricing.rows.meetings`**

> EN — Meetings → actions

会議 → アクション

**`pricing.rows.missionControl`**

> EN — Goals & Plans

目標とプラン

**`pricing.rows.notifications`**

> EN — Notifications and reminders

通知とリマインダー

**`pricing.rows.posts`**

> EN — Posts

投稿

**`pricing.rows.predictions`**

> EN — Predictions

傾向

**`pricing.rows.presentations`**

> EN — Presentations

プレゼンテーション

**`pricing.rows.projects`**

> EN — Projects

プロジェクト

**`pricing.rows.publishedSites`**

> EN — Published websites

公開済みウェブサイト

**`pricing.rows.recordSearch`**

> EN — Record search across modules

記録の横断検索

**`pricing.rows.siteEditsPerDay`**

> EN — Live edits per site

サイトごとの公開後の編集回数

**`pricing.rows.siteVersionsKept`**

> EN — Versions kept per site

サイトごとに残る版数

**`pricing.rows.storage`**

> EN — Storage

ストレージ

**`pricing.rows.teamCollaboration`**

> EN — Members get your plan

メンバーがあなたのプランを利用

**`pricing.rows.teamMembers`**

> EN — Team members

チームメンバー

**`pricing.rows.teamSeatsAddOn`**

> EN — Team seats

チームシート

**`pricing.rows.voiceClipLength`**

> EN — Longest recording (minutes)

1回の録音の上限（分）

**`pricing.rows.voiceMinutes`**

> EN — Voice minutes / month

音声の分数 / 月

**`pricing.rows.websiteBuilder`**

> EN — Website Builder

Website Builder

**`pricing.rows.websiteImageStorage`**

> EN — Storage for website photos

サイト写真の保存容量

**`pricing.values.custom`**

> EN — Custom

カスタム

**`pricing.values.included`**

> EN — Included

込み

**`pricing.values.minutesPerMonth`**

> EN — min/month

分/月

**`pricing.values.no`**

> EN — Not included

含まれない

**`pricing.values.perDay`**

> EN — /day

/日

**`pricing.values.perHour`**

> EN — /hour

/時間

**`pricing.values.perSeat`**

> EN — +{currency}{price}/seat

+{currency}{price}/席

**`pricing.values.unlimited`**

> EN — Unlimited

無制限

**`pricing.values.yes`**

> EN — Included

含まれる

**`auth.generateStrongPassword`**

> EN — Generate strong password

強力なパスワードを生成

**`auth.social.continueWithGoogle`**

> EN — Continue with Google

Googleで続行

**`auth.social.genericError`**

> EN — Couldn't start Google sign-in. Please try again.

Googleサインインを開始できませんでした。もう一度お試しください。

**`auth.social.orContinueWithEmail`**

> EN — or continue with email

またはメールで続行

**`common.hidePassword`**

> EN — Hide password

パスワードを非表示

**`common.showPassword`**

> EN — Show password

パスワードを表示

### login

**`auth.login.email`**

> EN — Email

メールアドレス

**`auth.login.forgotPassword`**

> EN — Forgot password?

パスワードをお忘れですか？

**`auth.login.logIn`**

> EN — Log In

ログイン

**`auth.login.noAccount`**

> EN — No account yet?

アカウントをお持ちでないですか？

**`auth.login.password`**

> EN — Password

パスワード

**`auth.login.resetSuccess`**

> EN — Password updated — sign in with your new password.

パスワードを更新しました — 新しいパスワードでログインしてください。

**`auth.login.sharedSignInFirst`**

> EN — Sign in to save what you shared.

共有した内容を保存するにはサインインしてください。

**`auth.login.signUp`**

> EN — Sign up

新規登録

**`auth.login.welcomeBack`**

> EN — Welcome back

おかえりなさい

**`auth.login.working`**

> EN — Working...

処理中...

### onboarding

**`dashboard.onboarding.title`**

> EN — Let's make this yours

あなた仕様にしましょう

**`dashboard.firstTask.cost`**

> EN — Free, within this month's free messages.

今月の無料メッセージの範囲内で無料です。

**`dashboard.firstTask.import`**

> EN — Bring your data from a CSV file

CSV ファイルからデータを取り込む

**`dashboard.firstTask.ownLabel`**

> EN — Or write what you want

または、やりたいことを書く

**`dashboard.firstTask.ownPlaceholder`**

> EN — Or write what you want done…

または、やりたいことを書いてください…

**`dashboard.firstTask.send`**

> EN — Start

始める

**`dashboard.firstTask.skip`**

> EN — Skip

スキップ

**`dashboard.firstTask.tasks.explain.label`**

> EN — Learn

学ぶ

**`dashboard.firstTask.tasks.plan.label`**

> EN — Plan

計画する

**`dashboard.firstTask.tasks.plan.text`**

> EN — Make me a plan to find my first customers this month

今月、最初のお客様を見つけるための計画を立てて

**`dashboard.firstTask.tasks.write.label`**

> EN — Write

書く

**`dashboard.firstTask.tasks.write.text`**

> EN — Write a short email asking a supplier for a quote

仕入れ先に見積もりを依頼する短いメールを書いて

**`dashboard.onboarding.analyseError`**

> EN — That file could not be read.

そのファイルを読み取れませんでした。

**`dashboard.onboarding.analysing`**

> EN — Looking for patterns in your data…

データからパターンを探しています…

**`dashboard.onboarding.chooseAnother`**

> EN — Choose a different file

別のファイルを選ぶ

**`dashboard.onboarding.chooseFile`**

> EN — Choose a file

ファイルを選択

**`dashboard.onboarding.counts`**

> EN — {ready} of {total} rows are ready to import

{total} 行中 {ready} 行を取り込めます

**`dashboard.onboarding.csvTitle`**

> EN — Upload your spreadsheet

スプレッドシートをアップロード

**`dashboard.onboarding.dateOrder.dmy`**

> EN — Day / month

日 / 月

**`dashboard.onboarding.dateOrder.mdy`**

> EN — Month / day

月 / 日

**`dashboard.onboarding.extract`**

> EN — Pull out the entries

項目を抽出

**`dashboard.onboarding.goals.agency`**

> EN — An agency or small business

代理店または小規模事業

**`dashboard.onboarding.goals.freelance`**

> EN — Freelance income and clients

フリーランスの収入と顧客

**`dashboard.onboarding.goals.other`**

> EN — Something else

その他

**`dashboard.onboarding.goals.startup`**

> EN — A startup I'm building

立ち上げ中のスタートアップ

**`dashboard.onboarding.goals.trading`**

> EN — My trading

自分のトレード

**`dashboard.onboarding.goalTitle`**

> EN — What do you mostly want to keep on top of?

主に何を把握したいですか？

**`dashboard.onboarding.goToDashboard`**

> EN — Go to your dashboard

ダッシュボードへ

**`dashboard.onboarding.ignoreColumn`**

> EN — — ignore this column —

— この列を無視 —

**`dashboard.onboarding.imported`**

> EN — {count, plural, one {# row imported} other {# rows imported}}

{count} 行を取り込みました

**`dashboard.onboarding.importedSummary`**

> EN — {count, plural, one {# row is} other {# rows are}} now in your account.

{count} 行がアカウントに入りました。

**`dashboard.onboarding.importError`**

> EN — The import did not go through.

取り込みは完了しませんでした。

**`dashboard.onboarding.importing`**

> EN — Importing…

取り込み中…

**`dashboard.onboarding.importRows`**

> EN — {count, plural, one {Import # row} other {Import # rows}}

{count} 行を取り込む

**`dashboard.onboarding.insightsError`**

> EN — The analysis did not finish.

分析は完了しませんでした。

**`dashboard.onboarding.insightsTitle`**

> EN — Here's what I found

見つかったこと

**`dashboard.onboarding.looksLike`**

> EN — This looks like: {label}.

これは次のようです: {label}。

**`dashboard.onboarding.mapColumn`**

> EN — Map the column {column}

列 {column} の割り当て

**`dashboard.onboarding.mappingTitle`**

> EN — Which column is which — change anything we got wrong

どの列が何か — 間違いがあれば変更してください

**`dashboard.onboarding.noneTitle`**

> EN — Nothing solid to report yet

まだ確かなことは言えません

**`dashboard.onboarding.noneYet`**

> EN — Add a bit more and run this again from your dashboard.

もう少しデータを追加して、ダッシュボードから再実行してください。

**`dashboard.onboarding.nothingInText`**

> EN — There was nothing in that text worth recording as an entry.

そのテキストには記録すべき内容がありませんでした。

**`dashboard.onboarding.pastePlaceholder`**

> EN — Paste your text here…

ここにテキストを貼り付け…

**`dashboard.onboarding.pasteTitle`**

> EN — Paste anything

何でも貼り付けてください

**`dashboard.onboarding.previewSource`**

> EN — From your file

あなたのファイルから

**`dashboard.onboarding.previewStored`**

> EN — Stored as

保存形式

**`dashboard.onboarding.previewTitle`**

> EN — What will actually be stored

実際に保存される内容

**`dashboard.onboarding.reading`**

> EN — Reading…

読み取り中…

**`dashboard.onboarding.skip`**

> EN — Skip for now

今はスキップ

**`dashboard.onboarding.skippedRows`**

> EN — {count} skipped

{count} 行スキップ

**`dashboard.onboarding.sourceCsv`**

> EN — Upload a spreadsheet

スプレッドシートをアップロード

**`dashboard.onboarding.sourceIntegrations`**

> EN — Connect Gmail or Drive

Gmail や Drive を接続

**`dashboard.onboarding.sourceIntegrationsHint`**

> EN — Read-only, and only what you approve.

読み取り専用で、承認した範囲だけです。

**`dashboard.onboarding.sourceManual`**

> EN — I'll add things myself

自分で入力します

**`dashboard.onboarding.sourceManualHint`**

> EN — Go straight to the dashboard and start from scratch.

ダッシュボードへ進み、ゼロから始めます。

**`dashboard.onboarding.sourcePaste`**

> EN — Paste some text

テキストを貼り付け

**`dashboard.onboarding.sourceTitle`**

> EN — Bring your data in

データを取り込む

**`dashboard.onboarding.stepLabel`**

> EN — Step {step} of {total}

ステップ {step}/{total}

**`dashboard.onboarding.tooLarge`**

> EN — Spreadsheets must be {max} or smaller.

スプレッドシートは {max} 以下にしてください。

**`dashboard.onboarding.truncated`**

> EN — only the first rows were read

先頭の行のみ読み取りました

**`promise.oneSentence`**

> EN — The AI that already knows your work. Ask it anything.

あなたの仕事をすでに知っている AI。何でも聞いてください。

### dashboard chrome

**`achievements.firstEntry.title`**

> EN — First {module} Entry

{module}への初エントリー

**`achievements.unlockedToast`**

> EN — Achievement unlocked: {achievement}

実績を解除しました: {achievement}

**`common.accountMenu`**

> EN — Account menu

アカウントメニュー

**`common.commandPalette`**

> EN — Command palette

コマンドパレット

**`common.createStudio`**

> EN — Make anything

何でもつくる

**`common.creditsTooltip`**

> EN — Credits remaining — buy more in Settings

残りクレジット — 設定から追加購入できます

**`common.creditsUnlimited`**

> EN — Unlimited

無制限

**`common.dismissToastAria`**

> EN — {message} — press Enter to dismiss

{message} — Enter キーで閉じる

**`common.jumpToPage`**

> EN — Jump to a module or page...

モジュールやページに移動...

**`common.loading`**

> EN — Loading...

読み込み中...

**`common.noMatches`**

> EN — No matches for “{query}”

「{query}」に一致する結果はありません

**`common.offline.checking`**

> EN — Checking…

確認中…

**`common.offline.retry`**

> EN — Try again

再試行

**`common.offline.showingCached`**

> EN — Nothing on this page is updating.

このページの内容は更新されません。

**`common.offline.showingCachedAge`**

> EN — Nothing here is updating — this was loaded {minutes} min ago.

ここの内容は更新されません。{minutes} 分前に読み込まれたものです。

**`common.offline.stillOffline`**

> EN — Still no connection.

まだ接続できません。

**`common.offline.title`**

> EN — You're offline.

オフラインです。

**`common.ownerAccessTooltip`**

> EN — Owner access — unlimited credits

オーナーアクセス — クレジット無制限

**`common.paletteClose`**

> EN — close

閉じる

**`common.paletteNavigate`**

> EN — navigate

移動

**`common.paletteSelect`**

> EN — select

選択

**`common.search`**

> EN — Search anything...

何でも検索...

**`credits.freeMessage`**

> EN — Free message · {count} left this month

無料メッセージ · 今月あと {count} 件

**`credits.unlimited`**

> EN — Unlimited — no credits used

無制限 — クレジット未使用

**`credits.unlimitedWouldHaveCost`**

> EN — Unlimited — would have cost {count, plural, one {# credit} other {# credits}}

無制限 — {count} クレジットかかるはずでした

**`credits.used`**

> EN — {count, plural, one {Used # credit} other {Used # credits}}

{count} クレジットを使用

**`credits.usedWithRemaining`**

> EN — {count, plural, one {Used # credit} other {Used # credits}} · {remaining} left

{count} クレジットを使用 · 残り {remaining}

**`dashboard.search.dates.30d`**

> EN — 30 days

30日間

**`dashboard.search.dates.365d`**

> EN — 1 year

1年

**`dashboard.search.dates.7d`**

> EN — 7 days

7日間

**`dashboard.search.dates.any`**

> EN — Any time

すべての期間

**`dashboard.search.filters.all`**

> EN — All

すべて

**`dashboard.search.filters.date`**

> EN — Date

日付

**`dashboard.search.filters.module`**

> EN — Module

モジュール

**`dashboard.search.filters.type`**

> EN — Type

種類

**`dashboard.search.kinds.agent`**

> EN — Agents

エージェント

**`dashboard.search.kinds.chat`**

> EN — Conversations

会話

**`dashboard.search.kinds.file`**

> EN — Files

ファイル

**`dashboard.search.kinds.help`**

> EN — Help

ヘルプ

**`dashboard.search.kinds.mission`**

> EN — Plans

プラン

**`dashboard.search.kinds.module`**

> EN — Entries

記録

**`dashboard.search.kinds.page`**

> EN — Pages

ページ

**`dashboard.search.kinds.research`**

> EN — Research

リサーチ

**`dashboard.search.kinds.website`**

> EN — Websites

ウェブサイト

**`sampleData.banner`**

> EN — Sample data

サンプルデータ

**`sampleData.clear`**

> EN — Remove the sample

サンプルを削除

**`sampleData.clearFailed`**

> EN — That did not work.

うまくいきませんでした。

**`sampleData.clearing`**

> EN — Removing…

削除中…

**`sidebar.closeMenu`**

> EN — Close menu

メニューを閉じる

**`sidebar.items.activity`**

> EN — Activity

アクティビティ

**`sidebar.items.affiliate`**

> EN — Affiliate

アフィリエイト

**`sidebar.items.agents`**

> EN — AI that works for you

あなたの代わりに働く AI

**`sidebar.items.aiMemory`**

> EN — What it remembers

覚えていること

**`sidebar.items.analytics`**

> EN — Analytics

アナリティクス

**`sidebar.items.apps`**

> EN — App ideas

アプリのアイデア

**`sidebar.items.automation`**

> EN — Automation

自動化

**`sidebar.items.browserAgent`**

> EN — Browser agent

ブラウザエージェント

**`sidebar.items.businessAccounting`**

> EN — Accounting

会計

**`sidebar.items.businessCrm`**

> EN — CRM

顧客管理

**`sidebar.items.businessFinance`**

> EN — Company Finance

企業財務

**`sidebar.items.businessHealth`**

> EN — How the business is doing

事業の調子

**`sidebar.items.businessHr`**

> EN — HR

人事

**`sidebar.items.businessInventory`**

> EN — Inventory

在庫

**`sidebar.items.businessLegal`**

> EN — Legal

法務

**`sidebar.items.businessMarketing`**

> EN — Marketing

マーケティング

**`sidebar.items.businessProcurement`**

> EN — Procurement

調達

**`sidebar.items.businessSupport`**

> EN — Customer Support

カスタマーサポート

**`sidebar.items.calendar`**

> EN — Calendar

カレンダー

**`sidebar.items.campaigns`**

> EN — Campaign ideas

キャンペーンのアイデア

**`sidebar.items.chat`**

> EN — Ask me

聞いてみる

**`sidebar.items.coding`**

> EN — Coding

コーディング

**`sidebar.items.competitors`**

> EN — Competitors

競合

**`sidebar.items.computerAgent`**

> EN — Computer agent

コンピュータエージェント

**`sidebar.items.connectApis`**

> EN — APIs

API

**`sidebar.items.connectBanking`**

> EN — Banking

銀行連携

**`sidebar.items.connectCalendar`**

> EN — Calendar Sync

カレンダー同期

**`sidebar.items.connectCrm`**

> EN — CRM Connector

CRM コネクタ

**`sidebar.items.connectDataSources`**

> EN — Data Sources

データソース

**`sidebar.items.connectDrive`**

> EN — Google Drive

Google Drive

**`sidebar.items.connectEmail`**

> EN — Email

メール

**`sidebar.items.connectGithub`**

> EN — GitHub

GitHub

**`sidebar.items.connectIot`**

> EN — IoT Devices

IoT デバイス

**`sidebar.items.connectMcp`**

> EN — MCP

MCP

**`sidebar.items.connectSlack`**

> EN — Slack

Slack

**`sidebar.items.content`**

> EN — Content

コンテンツ

**`sidebar.items.costs`**

> EN — Costs

コスト

**`sidebar.items.dataAnalysis`**

> EN — See what the numbers say

数字が語ることを見る

**`sidebar.items.decisions`**

> EN — Decisions

意思決定

**`sidebar.items.deepResearch`**

> EN — Look into it properly

じっくり調べる

**`sidebar.items.design`**

> EN — Design

デザイン

**`sidebar.items.documents`**

> EN — Documents

ドキュメント

**`sidebar.items.engCloud`**

> EN — Cloud

クラウド

**`sidebar.items.engCode`**

> EN — Code

コード

**`sidebar.items.engDatabases`**

> EN — Database Ops

データベース運用

**`sidebar.items.engDeployment`**

> EN — Deployment

デプロイ

**`sidebar.items.engDevops`**

> EN — DevOps

DevOps

**`sidebar.items.engInfrastructure`**

> EN — Infrastructure

インフラ

**`sidebar.items.engMonitoring`**

> EN — Service Monitoring

サービス監視

**`sidebar.items.engSecurity`**

> EN — Security

セキュリティ

**`sidebar.items.engTesting`**

> EN — Testing

テスト

**`sidebar.items.favorites`**

> EN — Favorites

お気に入り

**`sidebar.items.feedback`**

> EN — Feedback

フィードバック

**`sidebar.items.files`**

> EN — Files

ファイル

**`sidebar.items.finance`**

> EN — Finances

財務

**`sidebar.items.formSubmissions`**

> EN — Form submissions

フォーム送信

**`sidebar.items.help`**

> EN — Help Centre

ヘルプセンター

**`sidebar.items.home`**

> EN — Home

ホーム

**`sidebar.items.ideas`**

> EN — Ideas

アイデア

**`sidebar.items.images`**

> EN — Image ideas

画像のアイデア

**`sidebar.items.imageTool`**

> EN — Image

画像

**`sidebar.items.integrations`**

> EN — Integrations

連携

**`sidebar.items.knowledge`**

> EN — Knowledge

ナレッジ

**`sidebar.items.knowledgeGraph`**

> EN — Knowledge Graph

ナレッジグラフ

**`sidebar.items.learning`**

> EN — Learning

学習

**`sidebar.items.library`**

> EN — My stuff

わたしのもの

**`sidebar.items.marketplace`**

> EN — Ready-made helpers

すぐ使える助っ人

**`sidebar.items.meetings`**

> EN — Meetings

会議

**`sidebar.items.memory`**

> EN — Search my records

自分の記録を検索

**`sidebar.items.mine`**

> EN — Mine

自分のもの

**`sidebar.items.missionControl`**

> EN — Goals & Plans

目標とプラン

**`sidebar.items.monitoring`**

> EN — Monitoring

モニタリング

**`sidebar.items.music`**

> EN — Music

音楽

**`sidebar.items.newEntry`**

> EN — New entry

新しい記録

**`sidebar.items.operations`**

> EN — Operations

オペレーション

**`sidebar.items.personalFinance`**

> EN — Personal Finance

家計

**`sidebar.items.personalHabits`**

> EN — Habits

習慣

**`sidebar.items.personalHealth`**

> EN — Health

健康

**`sidebar.items.personalJournal`**

> EN — Journaling

ジャーナリング

**`sidebar.items.personalLifeOs`**

> EN — Life OS

ライフOS

**`sidebar.items.personalShopping`**

> EN — Shopping

買い物

**`sidebar.items.personalTravel`**

> EN — Travel

旅行

**`sidebar.items.posts`**

> EN — Posts

投稿

**`sidebar.items.predictions`**

> EN — Predictions

傾向

**`sidebar.items.presentations`**

> EN — Presentations

プレゼンテーション

**`sidebar.items.products`**

> EN — Products

プロダクト

**`sidebar.items.productWorkflow`**

> EN — Product Workflow

プロダクトワークフロー

**`sidebar.items.projects`**

> EN — Projects

プロジェクト

**`sidebar.items.published`**

> EN — Live sites

公開中のサイト

**`sidebar.items.records`**

> EN — My records

マイレコード

**`sidebar.items.reflection`**

> EN — Your week

あなたの一週間

**`sidebar.items.research`**

> EN — Research

リサーチ

**`sidebar.items.routing`**

> EN — Which AI is used

どの AI を使うか

**`sidebar.items.sales`**

> EN — Sales

営業

**`sidebar.items.scheduledJobs`**

> EN — Scheduled Jobs

定期実行ジョブ

**`sidebar.items.settings`**

> EN — Settings

設定

**`sidebar.items.systemHealth`**

> EN — System Health

システム状態

**`sidebar.items.tasks`**

> EN — Tasks

タスク

**`sidebar.items.team`**

> EN — Team

チーム

**`sidebar.items.timeline`**

> EN — History

履歴

**`sidebar.items.trading`**

> EN — Trading

トレーディング

**`sidebar.items.tradingJournal`**

> EN — Trading journal

トレード日誌

**`sidebar.items.tradingWorkflow`**

> EN — Trading Workflow

トレーディングワークフロー

**`sidebar.items.verifyCode`**

> EN — Code Verification

コード検証

**`sidebar.items.verifyData`**

> EN — Data Validation

データ検証

**`sidebar.items.verifyFacts`**

> EN — Fact Checking

ファクトチェック

**`sidebar.items.verifyOutput`**

> EN — Output Evaluation

出力評価

**`sidebar.items.verifyRedTeam`**

> EN — Red Teaming

レッドチーム演習

**`sidebar.items.verifySecurity`**

> EN — Security Testing

セキュリティテスト

**`sidebar.items.verifySources`**

> EN — Source Verification

出典検証

**`sidebar.items.videos`**

> EN — Video ideas

動画のアイデア

**`sidebar.items.voice`**

> EN — Voice

音声

**`sidebar.items.websiteBuilder`**

> EN — Build a site

サイトをつくる

**`sidebar.items.websites`**

> EN — Website plans

サイト計画

**`sidebar.items.workflows`**

> EN — Workflows

ワークフロー

**`sidebar.rail.allTools`**

> EN — All tools

すべてのツール

**`sidebar.rail.chat`**

> EN — Chat

チャット

**`sidebar.rail.coding`**

> EN — Coding

コーディング

**`sidebar.rail.collapse`**

> EN — Collapse sidebar

サイドバーを折りたたむ

**`sidebar.rail.expand`**

> EN — Expand sidebar

サイドバーを広げる

**`sidebar.rail.label`**

> EN — Main

メインメニュー

**`sidebar.rail.new`**

> EN — New

新規

**`sidebar.rail.pin`**

> EN — Pin {tool}

{tool}をピン留め

**`sidebar.rail.recentChats`**

> EN — Recent chats

最近のチャット

**`sidebar.rail.recentTools`**

> EN — Recent tools

最近使ったツール

**`sidebar.rail.remove`**

> EN — Remove {tool} from Recent tools

{tool}を最近使ったツールから外す

**`sidebar.rail.saveFailed`**

> EN — Could not save that change. Try again.

変更を保存できませんでした。もう一度お試しください。

**`sidebar.rail.settings`**

> EN — Settings

設定

**`sidebar.rail.unpin`**

> EN — Unpin {tool}

{tool}のピン留めを外す

**`sidebar.rail.untitledChat`**

> EN — New conversation

新しい会話

**`sidebar.tabs.label`**

> EN — Main navigation

メインナビゲーション

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

アイデアを読み込めませんでした: {message}

**`errors.boundary.section`**

> EN — This section could not be displayed.

このセクションを表示できませんでした。

**`errors.boundary.sectionBody`**

> EN — The rest of the page is unaffected. Reloading usually fixes it.

ページの他の部分に影響はありません。多くの場合は再読み込みで解決します。

**`dashboard.create.answeredNotFiled`**

> EN — This was a question, so nothing was filed.

これは質問だったため、何も記録していません。

**`dashboard.create.answerItInstead`**

> EN — Answer it

答える

**`dashboard.create.continueInChat`**

> EN — Continue in Chat

チャットで続ける

**`dashboard.create.loggedTo`**

> EN — Logged to:

記録先:

**`dashboard.create.recordItAnyway`**

> EN — Record it anyway

それでも記録する

**`dashboard.create.title`**

> EN — Create Anything

何でも作成

**`dashboard.create.viewModule`**

> EN — View {module} →

{module} を開く →

**`dashboard.createAnything.accomplishPlaceholder`**

> EN — What do you want to accomplish?

何を達成したいですか？

**`dashboard.createAnything.attachImage`**

> EN — Attach image

画像を添付

**`dashboard.createAnything.clarifyAnswerPlaceholder`**

> EN — Your answer...

あなたの回答...

**`dashboard.createAnything.clarifyContinue`**

> EN — Continue

続ける

**`dashboard.createAnything.clarifySkip`**

> EN — Skip, log it anyway

スキップしてこのまま記録

**`dashboard.createAnything.clarifyTitle`**

> EN — A couple of quick questions:

簡単な質問がいくつかあります:

**`dashboard.createAnything.describePlaceholder`**

> EN — Describe your idea in detail...

アイデアを詳しく書いてください...

**`dashboard.createAnything.removeImage`**

> EN — Remove image

画像を削除

**`dashboard.createAnything.send`**

> EN — Send

送信

**`dashboard.createAnything.uploadError`**

> EN — Could not upload one or more images.

1枚以上の画像をアップロードできませんでした。

**`errors.creditHistory`**

> EN — See credit history

credits の履歴を見る

**`errors.retry`**

> EN — Try again

もう一度試す

## Tier 3 — Further in — only if you have time (208)

_Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour._

### onboarding

**`common.close`**

> EN — Close

閉じる

**`common.readMore`**

> EN — Read more

詳しく読む

**`common.whatIsThisPage`**

> EN — What is this page?

このページは何ですか？

**`dashboard.insights.basedOn`**

> EN — from {count, plural, one {# of your entries} other {# of your entries}}

あなたの {count} 件の記録から

**`dashboard.insights.checkIt`**

> EN — Check it yourself

自分で確認する

**`dashboard.insights.dismiss`**

> EN — Dismiss this

閉じる

**`dashboard.insights.dismissError`**

> EN — That could not be dismissed.

閉じられませんでした。

**`dashboard.insights.hideNumbers`**

> EN — Hide the numbers

数値を隠す

**`dashboard.insights.showNumbers`**

> EN — Show the numbers

数値を表示

**`promise.greeting.afternoon`**

> EN — Good afternoon

こんにちは

**`promise.greeting.evening`**

> EN — Good evening

こんばんは

**`promise.greeting.morning`**

> EN — Good morning

おはようございます

### dashboard chrome

**`common.dismiss`**

> EN — Dismiss

閉じる

**`common.noNotifications`**

> EN — No new notifications.

新しい通知はありません。

**`common.notifications`**

> EN — Notifications

通知

**`common.toggleMenu`**

> EN — Toggle menu

メニューの表示を切り替える

**`credits.low.hint`**

> EN — top up now so nothing interrupts you.

今すぐ補充して中断を防ぎましょう。

**`credits.low.none`**

> EN — No credits left this month

今月のクレジットはありません

**`credits.low.remaining`**

> EN — {count, plural, one {# credit left} other {# credits left}} this month

今月の残り {count} クレジット

**`credits.low.topUp`**

> EN — Top up

補充

**`language.label`**

> EN — Language

言語

**`language.saveFailed`**

> EN — Couldn't save your language — nothing was changed.

言語を保存できませんでした。変更は行われていません。

**`pwa.install`**

> EN — Install

インストール

**`pwa.installBody`**

> EN — Add it to your home screen — full screen, and notifications that actually reach you.

ホーム画面に追加すると、全画面表示と通知が使えます。

**`pwa.installTitle`**

> EN — Install Ionexa

Ionexa をインストール

**`pwa.iosBody`**

> EN — Safari never offers this on its own — it takes three taps.

Safari からは案内されません。3 タップで完了します。

**`pwa.iosGotIt`**

> EN — Got it

わかりました

**`pwa.iosStep1`**

> EN — Tap the Share button in Safari's toolbar

Safari のツールバーで共有ボタンをタップ

**`pwa.iosStep2`**

> EN — Scroll down and tap “Add to Home Screen”

下にスクロールして「ホーム画面に追加」をタップ

**`pwa.iosStep3`**

> EN — Tap Add — Ionexa appears with your other apps

「追加」をタップすると、他のアプリと並びます

**`pwa.iosTitle`**

> EN — Add Ionexa to your Home Screen

Ionexa をホーム画面に追加

**`pwa.iosWhy`**

> EN — Until you do, iPhone cannot send you notifications, and Safari may clear your saved work after 7 unused days.

追加するまで iPhone に通知は届かず、7 日間使わないと Safari が保存データを消すことがあります。

**`pwa.notNow`**

> EN — Not now

後で

**`pwa.showHow`**

> EN — Show me how

手順を見る

### first result

**`common.cancel`**

> EN — Cancel

キャンセル

**`common.created`**

> EN — ✓ created

✓ 作成しました

**`common.dismissSuggestion`**

> EN — Dismiss suggestion

提案を閉じる

**`common.error`**

> EN — error

エラー

**`common.notAuthenticated`**

> EN — Not authenticated.

認証されていません。

**`credits.outOfCredits.buyCredits`**

> EN — Buy credits

クレジット購入

**`credits.outOfCredits.detail`**

> EN — This action needs more credits than you have left. Buy a credit pack or upgrade your plan to continue.

この操作には残高より多くのクレジットが必要です。クレジットパックを購入するか、プランをアップグレードしてください。

**`credits.outOfCredits.detailWithNumbers`**

> EN — You have {available} credits left and this needs about {needed}. Buy a credit pack or upgrade your plan to continue.

残り {available} クレジット、この操作には約 {needed} 必要です。クレジットパックの購入かプランのアップグレードをご検討ください。

**`credits.outOfCredits.title`**

> EN — You're out of credits

クレジットが不足しています

**`credits.outOfCredits.upgradePlan`**

> EN — Upgrade plan

プランをアップグレード

**`dashboard.goal.change`**

> EN — Change something

少し変える

**`dashboard.goal.confirm`**

> EN — Yes, do it

はい、実行

**`dashboard.goal.costsNow`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press Yes. Nothing is charged until then.

「はい」を押すと {credits} クレジットかかります。それまでは何も請求されません。

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

向こうでボタンを押すと {credits} クレジットかかります。今は何も請求されません。

**`dashboard.goal.dismiss`**

> EN — Never mind

やめておく

**`dashboard.goal.fix`**

> EN — Fix the text

テキストを直す

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

今は何も請求されませんし、移動しても請求されません。

**`dashboard.goal.goingTo`**

> EN — Going to

開く先

**`dashboard.goal.heard`**

> EN — I heard: “{heard}”

聞き取った内容：「{heard}」

**`dashboard.goal.routeAsk`**

> EN — Ionexa will read it

Ionexa が読み取ります

**`dashboard.goal.routeChange`**

> EN — change

変更

**`dashboard.goal.routeCostNow`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} on send

送信時に約 {credits} クレジット

**`dashboard.goal.routeCostThere`**

> EN — ≈ {credits, plural, one {# credit} other {# credits}} there

そこで約 {credits} クレジット

**`dashboard.goal.sendIt`**

> EN — Yes, send it

はい、送信する

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

もう少し詳しく書いてください。正しい場所に送るためです。

**`dashboard.goal.which`**

> EN — Which one do you mean?

どちらのことですか？

**`dashboard.goal.willHandle`**

> EN — No tool is named, so Ionexa will read it — it may answer it or save it as an entry.

ツールの指定がないため、Ionexa が読み取ります。回答するか、記録として保存することがあります。

**`dashboard.goal.willOpen`**

> EN — This goes to {destination}, with what you wrote.

入力された内容を持って{destination}へ移動します。

**`dashboard.ideas.competitorsLabel`**

> EN — Competitors

競合

**`dashboard.ideas.competitorsPlaceholder`**

> EN — known competitors

把握している競合

**`dashboard.ideas.customerLabel`**

> EN — Customer

顧客

**`dashboard.ideas.customerPlaceholder`**

> EN — target customer

想定する顧客

**`dashboard.ideas.empty.example`**

> EN — A new service for small businesses

小規模事業者向けの新サービス

**`dashboard.ideas.empty.title`**

> EN — Every idea, in one place

アイデアをひとつの場所に

**`dashboard.ideas.empty.why`**

> EN — Write it down while it is still rough — this page scores it, compares it against the others, and remembers the ones you decided against.

粗いうちに書き留めておきましょう。ここで採点し、他のアイデアと比較し、見送ったものも記録として残ります。

**`dashboard.ideas.marketSizeLabel`**

> EN — Market Size

市場規模

**`dashboard.ideas.marketSizePlaceholder`**

> EN — e.g. $2B TAM

例: TAM 20億ドル

**`dashboard.ideas.mvpLabel`**

> EN — MVP

実用最小限の製品

**`dashboard.ideas.mvpPlaceholder`**

> EN — what does the MVP look like?

実用最小限の製品はどんなもの？

**`dashboard.ideas.nameLabel`**

> EN — Name

名前

**`dashboard.ideas.namePlaceholder`**

> EN — idea name

アイデア名

**`dashboard.ideas.new`**

> EN — New Idea

新しいアイデア

**`dashboard.ideas.problemLabel`**

> EN — Problem

課題

**`dashboard.ideas.problemPlaceholder`**

> EN — what problem does this solve?

どんな課題を解決する？

**`dashboard.ideas.scoreLabel`**

> EN — Score (0-100)

スコア（0〜100）

**`dashboard.ideas.scorePlaceholder`**

> EN — score

スコア

**`dashboard.ideas.verdictLabel`**

> EN — Verdict

判定

**`dashboard.ideas.verdictPlaceholder`**

> EN — e.g. pursue / kill / watch

例: 進める / 中止 / 様子見

**`errors.codes.conflict.next`**

> EN — Reload the page to see the current version, then redo your change.

ページを再読み込みして最新の状態を確認し、変更をやり直してください。

**`errors.codes.conflict.what`**

> EN — Someone — or another tab — changed this while you were working on it.

作業中に、他の人または別のタブがこれを変更しました。

**`errors.codes.fileTooLarge.next`**

> EN — Split it, or upload a smaller version.

分割するか、より小さいものをアップロードしてください。

**`errors.codes.fileTooLarge.what`**

> EN — That file is too big.

このファイルは大きすぎます。

**`errors.codes.forbidden.next`**

> EN — Open Settings › Billing to see which plan covers it.

「設定 › お支払い」でどのプランに含まれるか確認してください。

**`errors.codes.forbidden.what`**

> EN — Your plan doesn't include this.

現在のプランには含まれていません。

**`errors.codes.insufficientCredits.next`**

> EN — Buy credits in Settings, or wait for your monthly reset.

「設定」から credits を購入するか、毎月のリセットをお待ちください。

**`errors.codes.insufficientCredits.what`**

> EN — You don't have enough credits for this.

この操作に必要な credits が足りません。

**`errors.codes.invalidInput.next`**

> EN — Check the highlighted fields and send it again.

指摘された項目を確認して、もう一度送信してください。

**`errors.codes.invalidInput.what`**

> EN — Something in the form wasn't accepted.

フォームの内容が受け付けられませんでした。

**`errors.codes.notAuthenticated.next`**

> EN — Sign in again and repeat the action — nothing you had entered is lost.

もう一度サインインして操作をやり直してください。入力した内容は失われていません。

**`errors.codes.notAuthenticated.what`**

> EN — You're signed out.

サインアウトされています。

**`errors.codes.notFound.next`**

> EN — It was probably deleted. Go back to the list and pick another one.

削除された可能性があります。一覧に戻って別のものを選んでください。

**`errors.codes.notFound.what`**

> EN — This no longer exists.

これはもう存在しません。

**`errors.codes.offline.next`**

> EN — Check your connection and try again.

接続を確認して、もう一度お試しください。

**`errors.codes.offline.what`**

> EN — Your device couldn't reach us.

お使いの端末から接続できませんでした。

**`errors.codes.planLimit.next`**

> EN — Delete something you no longer need, or upgrade in Settings › Billing.

不要なものを削除するか、「設定 › お支払い」でアップグレードしてください。

**`errors.codes.planLimit.what`**

> EN — You've reached the limit of your plan.

プランの上限に達しました。

**`errors.codes.rateLimited.next`**

> EN — Wait about a minute, then try once more.

1分ほど待ってから、もう一度お試しください。

**`errors.codes.rateLimited.what`**

> EN — Too many requests in a short time.

短時間にリクエストが多すぎます。

**`errors.codes.serverError.next`**

> EN — It's been logged. Try again in a moment, and contact support if it keeps happening.

記録されました。少し待ってからもう一度お試しいただき、続く場合はサポートにご連絡ください。

**`errors.codes.serverError.what`**

> EN — This broke on our side.

こちら側で問題が発生しました。

**`errors.codes.unknown.next`**

> EN — Try again, and contact support if it happens twice.

もう一度お試しいただき、再発する場合はサポートにご連絡ください。

**`errors.codes.unknown.what`**

> EN — This action didn't complete.

この操作は完了しませんでした。

**`errors.codes.unsupportedType.next`**

> EN — Convert it to PDF, DOCX, CSV or TXT and upload it again.

PDF、DOCX、CSV、TXT のいずれかに変換して、もう一度アップロードしてください。

**`errors.codes.unsupportedType.what`**

> EN — That file type isn't supported.

このファイル形式には対応していません。

**`errors.codes.upstreamUnavailable.next`**

> EN — This is on our side and usually clears within a few minutes.

こちら側の問題で、通常は数分で復旧します。

**`errors.codes.upstreamUnavailable.what`**

> EN — The AI service isn't responding right now.

AI サービスが現在応答していません。

**`errors.credits.charged`**

> EN — This attempt used credits.

この試行で credits を消費しました。

**`errors.credits.notCharged`**

> EN — You were not charged.

請求は発生していません。

**`errors.credits.refunded`**

> EN — Your credits were returned.

credits は返却されました。

**`errors.credits.unverified`**

> EN — We can't confirm from here whether this was charged.

ここからは請求されたかどうかを確認できません。

**`module.exportCsv`**

> EN — Export CSV

CSV をエクスポート

**`module.noMatches`**

> EN — No matches for “{query}”

「{query}」に一致する結果はありません

**`module.save`**

> EN — Save

保存

**`module.saving`**

> EN — Saving...

保存中...

**`module.searchPlaceholder`**

> EN — Search...

検索...

**`voice.costPerMinute`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute of speech

音声1分あたり {credits} クレジット

**`voice.draft.discard`**

> EN — Discard

破棄

**`voice.draft.notSent`**

> EN — Nothing has been sent. Correct the text first, then send it yourself.

まだ何も送信されていません。文章を直してから、ご自身で送ってください。

**`voice.draft.title`**

> EN — What was heard

聞き取った内容

**`voice.draft.use`**

> EN — Use this text

この文章を使う

**`voice.errors.bad_request`**

> EN — That request could not be read.

そのリクエストを読み取れませんでした。

**`voice.errors.capacity`**

> EN — The service is busy right now. Try again shortly.

ただいま混み合っています。少し待ってからお試しください。

**`voice.errors.denied`**

> EN — The microphone was not allowed. You can still type.

マイクが許可されませんでした。入力はこれまでどおり使えます。

**`voice.errors.empty`**

> EN — Nothing could be heard in that recording.

その録音からは何も聞き取れませんでした。

**`voice.errors.failed`**

> EN — Voice is unavailable right now. You can still type.

音声は現在利用できません。入力はこれまでどおり使えます。

**`voice.errors.insufficient_credits`**

> EN — Not enough credits.

クレジットが足りません。

**`voice.errors.no_recording`**

> EN — No recording was sent.

録音が送信されていません。

**`voice.errors.no_speech`**

> EN — Nothing was recorded.

何も録音されませんでした。

**`voice.errors.not_configured`**

> EN — Voice is not set up on this deployment.

この環境では音声が設定されていません。

**`voice.errors.not_included`**

> EN — Voice is not included on your plan.

お使いのプランに音声は含まれていません。

**`voice.errors.out_of_minutes`**

> EN — This month's voice minutes are used up.

今月の音声の残り時間を使い切りました。

**`voice.errors.provider_error`**

> EN — The voice service could not be reached.

音声サービスに接続できませんでした。

**`voice.errors.rate_limited`**

> EN — Too many recordings in the last hour. Try again shortly.

直近1時間の録音が多すぎます。少し待ってからお試しください。

**`voice.errors.reserve_failed`**

> EN — Credits could not be held for this.

この処理のためにクレジットを確保できませんでした。

**`voice.errors.streamInterrupted`**

> EN — The connection dropped before the reply finished.

返信が終わる前に接続が切れました。

**`voice.errors.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

接続が切れました — 上の返信は途中までかもしれません。

**`voice.errors.too_large`**

> EN — That recording is too long.

その録音は長すぎます。

**`voice.errors.unauthenticated`**

> EN — You are signed out. Sign in and try again.

サインアウトしています。サインインしてからお試しください。

**`voice.errors.unsupported`**

> EN — This browser cannot record audio. You can still type.

このブラウザーは録音できません。入力はこれまでどおり使えます。

**`voice.errors.unsupported_type`**

> EN — That audio format is not supported.

その音声形式には対応していません。

**`voice.errors.usage_unavailable`**

> EN — Voice minutes could not be checked right now.

音声の残り時間を今は確認できませんでした。

**`voice.listening`**

> EN — Listening

聞いています

**`voice.listeningHint`**

> EN — Speak, then press Stop. Nothing is sent until you have read it.

話し終えたら停止を押してください。読み終えるまで何も送信されません。

**`voice.permission.allow`**

> EN — Open the microphone

マイクを開く

**`voice.permission.cancel`**

> EN — Not now

今はしない

**`voice.permission.cost`**

> EN — {credits, plural, one {# credit} other {# credits}} per minute, {minutes, plural, one {# minute} other {# minutes}} a month on your plan.

1分あたり {credits} クレジット、あなたのプランでは月 {minutes} 分。

**`voice.permission.editFirst`**

> EN — You read and correct the text before anything is sent.

何かが送信される前に、あなたが文章を読んで直します。

**`voice.permission.notStored`**

> EN — The audio is sent for transcription and stored nowhere — not by us, not afterwards.

音声は文字起こしのために送られ、どこにも保存されません — 当方でも、その後も。

**`voice.permission.pressToStart`**

> EN — Recording starts only when you press, and stops when you press again.

録音は押したときだけ始まり、もう一度押すと止まります。

**`voice.permission.title`**

> EN — Before the microphone opens

マイクを開く前に

**`voice.startListening`**

> EN — Speak instead of typing

入力せずに話す

**`voice.stopListening`**

> EN — Stop

停止

**`common.nextPage`**

> EN — Next page

次のページ

**`common.paginationNext`**

> EN — Next

次へ

**`common.paginationPage`**

> EN — Page {page} / {total}

{page} / {total} ページ

**`common.paginationPrev`**

> EN — Prev

前へ

**`common.previousPage`**

> EN — Previous page

前のページ

**`common.updated`**

> EN — ✓ updated

✓ 更新しました

**`dashboard.ideas.cardCompetitors`**

> EN — Competitors:

競合:

**`dashboard.ideas.cardFor`**

> EN — for: {customer}

対象: {customer}

**`dashboard.ideas.cardMarketSize`**

> EN — Market Size:

市場規模:

**`dashboard.ideas.cardMvp`**

> EN — MVP:

実用最小限の製品:

**`dashboard.ideas.cardProblem`**

> EN — Problem:

課題:

**`dashboard.ideas.cardScore`**

> EN — Score: {score}

スコア: {score}

**`dashboard.ideas.deleteConfirm`**

> EN — Delete this idea? This can't be undone.

このアイデアを削除しますか？元に戻せません。

**`dashboard.ideas.edit`**

> EN — Edit Idea

アイデアを編集

**`dashboard.ideas.editAria`**

> EN — Edit idea: {name}

アイデアを編集: {name}

**`entityLinks.linked`**

> EN — Linked

リンク済み

**`entityLinks.mightBeRelated`**

> EN — This might be related to: {titles}. Link them?

関連している可能性があります: {titles}。リンクしますか?

**`entityLinks.no`**

> EN — No

いいえ

**`entityLinks.yes`**

> EN — Yes

はい

**`module.edit`**

> EN — Edit

編集

**`module.loggedAt`**

> EN — Logged {when}

{when}に記録

**`module.sort.label`**

> EN — Sort:

並び替え:

**`askAi.buttonLabel`**

> EN — Ask AI

AI に質問

**`common.networkError`**

> EN — Network error — please try again.

ネットワークエラー — もう一度お試しください。

**`common.textActions.accept`**

> EN — Accept

採用する

**`common.textActions.reject`**

> EN — Reject

破棄する

**`entityLinks.buttonLabel`**

> EN — Link to...

リンク...

**`entityLinks.linkedToLabel`**

> EN — Linked to:

リンク先:

**`entityLinks.unlink`**

> EN — Unlink

リンクを解除

**`entityLinks.unlinkAria`**

> EN — Unlink {name}

{name} のリンクを解除

**`favorites.add`**

> EN — Add to favorites

お気に入りに追加

**`favorites.remove`**

> EN — Remove from favorites

お気に入りから削除

**`module.delete`**

> EN — Delete

削除

**`module.deleteConfirm`**

> EN — Delete this {label}? This can't be undone.

この{label}を削除しますか？元に戻せません。

**`module.deleted`**

> EN — Deleted

削除しました

**`askAi.alsoRead`**

> EN — It also read {count, plural, one {# past message} other {# past messages}} about this entry

この記録に関する過去のメッセージ {count} 件も読み込みました

**`askAi.close`**

> EN — Close

閉じる

**`askAi.emptyState`**

> EN — Ask a question about this entry — no need to explain the context, the AI already has it.

このエントリーについて質問してください — 背景を説明する必要はありません。AI は既に把握しています。

**`askAi.placeholder`**

> EN — Ask anything about this entry...

このエントリーについて何でも質問してください...

**`askAi.send`**

> EN — Send

送信

**`askAi.streamInterrupted`**

> EN — The connection dropped before the reply finished.

応答が完了する前に接続が切断されました。

**`askAi.streamInterruptedPartial`**

> EN — The connection dropped — the reply above may be incomplete.

接続が切断されました。上記の応答は不完全な可能性があります。

**`askAi.title`**

> EN — Ask AI about this {title}

この{title}について AI に質問

**`common.errorWithMessage`**

> EN — error: {message}

エラー: {message}

**`common.linked`**

> EN — ✓ linked

✓ リンクしました

**`common.newMessagesBelow`**

> EN — New message below

下に新しいメッセージ

**`entityLinks.modalTitle`**

> EN — Link to...

リンク先を選択

**`entityLinks.noMatches`**

> EN — No matches.

一致するものがありません。

**`entityLinks.pickModulePrompt`**

> EN — Which module do you want to link to?

どのモジュールにリンクしますか?

**`entityLinks.searching`**

> EN — Searching...

検索中...

**`entityLinks.searchPlaceholder`**

> EN — Search {module}...

{module}を検索...

**`aiSteps.counter`**

> EN — ({step}/{total})

（{step}/{total}）
