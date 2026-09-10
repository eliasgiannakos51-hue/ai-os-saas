# The first run — ja

Everything a new person reads from the signup form to the first thing the product tells them about their own data: **610 strings**. The whole product is 3067, which is why this file exists.

**Start with tier 1. It is 46 sentences and it is the whole ask** — if you only ever read that, the round was worth doing. Tier 2 is 366 labels to skim. Tier 3 is the rest, listed so nothing is hidden.

**What to look for.** Not correctness alone — a sentence can be correct and still be wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a technical word translated that should have been left alone, or left in English when nobody would? Anything you would not say out loud is worth marking.

## Tier 1 — THE SENTENCES — read these (46)

_On the first screens, 12 words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that._

### signup

**`auth.signup.failed`**

> EN — We couldn't create the account. Check the details and try again — you have not been charged.

アカウントを作成できませんでした。入力内容をご確認のうえお試しください — 請求は発生していません。

**`auth.signup.mustAgreeToTerms`**

> EN — You must agree to the Terms of Service and Privacy Policy to create an account.

アカウントを作成するには、利用規約とプライバシーポリシーに同意する必要があります。

**`pricing.businessCardDescription`**

> EN — Start with any plan as your team's base, then invite members for +{price}/month each — everyone gets full access at your plan's tier. Perfect for teams working together.

どのプランでもチームのベースとして始められます。その後、メンバーを1人あたり+{price}/月で招待できます — 全員があなたのプランと同じレベルの完全アクセスを得られます。共同作業をするチームに最適です。

### login

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

**`sampleData.bannerDetail`**

> EN — These entries are a demo — a small design studio's last three months. They are not yours.

これらはデモの記録です。小さなデザイン事務所の 3 か月分で、あなたのものではありません。

**`sidebar.hints.apps`**

> EN — Keep track of apps you are planning or have already shipped. It does not build them.

作成予定または公開済みのアプリを記録します。アプリは作成しません。

**`sidebar.hints.coding`**

> EN — Write, explain, fix, convert and test snippets of code. It does not run code or open a repository.

コードの断片を書く・説明する・修正する・変換する・テストする。コードの実行やリポジトリの参照はしません。

**`sidebar.hints.create`**

> EN — Describe what you want in one sentence; it works out the rest.

やりたいことを一文で。あとは自動で判断します。

**`sidebar.hints.deepResearch`**

> EN — Give it a topic and it searches, cross-checks and writes a sourced report

トピックを渡すと検索・照合して出典付きのレポートを書きます

**`sidebar.hints.files`**

> EN — Upload PDFs, Word and Excel files and ask the AI questions about them

PDF・Word・Excel をアップロードして、AI に内容を質問できます

**`sidebar.hints.images`**

> EN — Keep track of images you are planning or have already made. It does not generate them.

作成予定または作成済みの画像を記録します。画像は生成しません。

**`sidebar.hints.integrations`**

> EN — Connect Gmail, Drive and Slack so the AI can work with your real data

Gmail・Drive・Slack を接続して、AI が実際のデータを扱えるようにします

**`sidebar.hints.library`**

> EN — Starred, recent and search — all your own entries in one place

お気に入り・最近・検索 — 自分のものを一か所に

**`sidebar.hints.marketplace`**

> EN — Share an agent's shape as a template, and start from one someone else shared.

エージェントの構成をテンプレートとして共有し、誰かが共有したものから始められます。

**`sidebar.hints.posts`**

> EN — Say it once and get a post per platform, each at its length and in its register. It publishes nothing — you copy and post.

一度書けば、プラットフォームごとにその長さとトーンの投稿文ができます。何も投稿はしません。コピーして、あなたが投稿します。

**`sidebar.hints.predictions`**

> EN — Patterns found in your own rows, each with the number of entries it rests on and a link to them.

あなた自身の記録から見つかった傾向。根拠となった件数と、その記録へのリンクが付きます。

**`sidebar.hints.presentations`**

> EN — Describe a deck and get the slides — PowerPoint or PDF, with photos from Unsplash or your own. It draws no charts.

プレゼンの内容を説明するとスライドができます。PowerPoint か PDF で、写真は Unsplash か自分のものから。グラフは描きません。

**`sidebar.hints.projects`**

> EN — A folder with a goal. What you put in is what is in it — nothing is dragged in with it.

目標のあるフォルダー。入れたものだけが入っています。

**`sidebar.hints.published`**

> EN — Every site you have live on the web, with its traffic and version history

公開中のすべてのサイトと、その閲覧数・バージョン履歴

**`sidebar.hints.records`**

> EN — Every log in one place — filter by type instead of hunting the menu

すべての記録を一か所に。メニューを探さず種類で絞り込めます

**`sidebar.hints.videos`**

> EN — Keep track of videos you are planning or have already made. It does not generate them.

作成予定または作成済みの動画を記録します。動画は生成しません。

**`sidebar.hints.voice`**

> EN — Have text read out loud, or speak and have it written down. Minutes are metered and the price per minute is on the page.

文章を読み上げさせる、または話した内容を書き起こす。分単位で計測され、1分あたりの料金はページに表示されます。

### first result

**`dashboard.overview.healthScore.suggestion.recency`**

> EN — You haven't logged anything in a while — add a new entry to pick things back up.

しばらく記録がありません — 新しいエントリを追加して再開しましょう。

**`dashboard.overview.nextAction.revisitLink`**

> EN — You linked "{source}" to "{target}" a few days ago — worth revisiting?

数日前に "{source}" を "{target}" にリンクしました — 見直す価値があるかも?

**`dashboard.overview.nextAction.startNew`**

> EN — No new activity in the last 3 days — ready to start something new?

過去3日間新しい活動がありません — 何か新しいことを始めませんか?

**`dashboard.overview.setupProgress.suggestion`**

> EN — Your activity score appears once you have logged {count} entries — enough that no single one decides it.

{count} 件記録すると活動スコアが表示されます。1 件で決まってしまわない程度の数です。

**`dashboard.overview.statRow.mostActiveExplain`**

> EN — The module you have written in most. Where your attention has gone.

いちばん書いているモジュール。注意が向いている場所です。

**`dashboard.overview.statRow.thisWeekExplain`**

> EN — Logged in the last seven days — how active this week has been.

直近 7 日間の記録——今週どれだけ動いたか。

**`common.betaExpiry`**

> EN — Your beta access expires in {days, plural, one {# day} other {# days}}. <link>Upgrade to keep full access</link>.

ベータ利用はあと{days, plural, other {#日}}で終了します。<link>アップグレードすれば全機能を使い続けられます</link>。

**`common.listCapped`**

> EN — Showing the most recent {count, number}. Older entries are still saved — use Search my records to find them.

最新の {count, number} 件を表示しています。それより古い記録も保存されています——「記録の検索」から見つけられます。

**`dashboard.create.looksLikeQuestion`**

> EN — That looks like a question. Should I answer it, or record it?

これは質問のようです。答えますか、それとも記録しますか？

**`dashboard.create.subtitle`**

> EN — Describe anything — a product idea, a trade, feedback from a user, a metric — and it lands in the right module automatically.

何でも書いてください — 製品のアイデア、トレード、ユーザーからのフィードバック、指標 — 自動的に適切なモジュールに入ります。

**`dashboard.energyCheckIn.whatItDoes`**

> EN — Ionexa uses this to pick which plan step to suggest next — lighter work when you're low, demanding work when you're not.

Ionexa はこれをもとに次に提案するプランのステップを選びます。調子が低いときは軽い作業、そうでなければ手応えのある作業を。

**`sampleData.loadFree`**

> EN — Free — nothing is generated, and you can remove it in one click

無料。何も生成されず、ワンクリックで削除できます

## Tier 2 — The labels — skim these (366)

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

> EN — Every member gets full access at your plan's tier

各メンバーはあなたのプランと同じレベルの完全アクセスを取得

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

**`pricing.features.aiMemory`**

> EN — AI Memory

AIメモリ

**`pricing.features.basicAiChat`**

> EN — Basic AI chat

基本のAIチャット

**`pricing.features.creditsPerMonth`**

> EN — {count, plural, one {# credit} other {# credits}}/month

{count} クレジット/月

**`pricing.features.customAiPersonaNameInIonexaChat`**

> EN — Custom AI persona name in Ionexa Chat

Ionexa ChatでのAIペルソナ名のカスタマイズ

**`pricing.features.customCredits`**

> EN — Custom credits

カスタムクレジット

**`pricing.features.everythingInGrowth`**

> EN — Everything in Growth

Growthのすべて

**`pricing.features.everythingInProfessional`**

> EN — Everything in Professional

Professionalのすべて

**`pricing.features.everythingInStarter`**

> EN — Everything in Starter

Starterのすべて

**`pricing.features.everythingInUltimate`**

> EN — Everything in Ultimate

Ultimateのすべて

**`pricing.features.extendedChatMemoryRetention100Vs20RecentFact`**

> EN — Extended chat memory retention (100 vs 20 recent facts)

チャットメモリの保持拡張（直近100件、通常は20件）

**`pricing.features.teamCollaboration`**

> EN — Team collaboration

チームコラボレーション

**`pricing.features.unlimitedMembers`**

> EN — Unlimited members

メンバー無制限

**`pricing.features.unlimitedTeamSeatsIncludedNoPerMemberCharge`**

> EN — Unlimited team seats included — no per-member charge

チーム席数無制限（メンバーごとの追加料金なし）

**`pricing.features.upTo100AiAgents`**

> EN — Up to 100 AI agents

AIエージェント最大100体

**`pricing.features.upTo15AiAgentsTeams`**

> EN — Up to 15 AI agents & teams

AIエージェント最大15体・チーム

**`pricing.features.upTo2AiAgents`**

> EN — Up to 2 AI agents

AIエージェント最大2体

**`pricing.features.upTo50AiAgents`**

> EN — Up to 50 AI agents

AIエージェント最大50体

**`pricing.features.upTo5AiAgents`**

> EN — Up to 5 AI agents

AIエージェント最大5体

**`pricing.features.websiteAutomationBuilderAccess`**

> EN — Website & Automation Builder access

ウェブサイト＆自動化ビルダーへのアクセス

**`pricing.perMonth`**

> EN — /month

/月

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

**`sidebar.groups.ask`**

> EN — Ask

きく

**`sidebar.groups.build`**

> EN — Build

つくる

**`sidebar.groups.business`**

> EN — Business

ビジネス

**`sidebar.groups.create`**

> EN — Create

つくる

**`sidebar.groups.daily`**

> EN — Daily

毎日

**`sidebar.groups.insights`**

> EN — What I noticed

気づいたこと

**`sidebar.groups.make`**

> EN — Make

つくる

**`sidebar.groups.marketplace`**

> EN — Marketplace

マーケットプレイス

**`sidebar.groups.myBusiness`**

> EN — My business

わたしのビジネス

**`sidebar.groups.operations`**

> EN — Operations

運用

**`sidebar.groups.organise`**

> EN — Organise

ととのえる

**`sidebar.groups.run`**

> EN — Run

うごかす

**`sidebar.groups.see`**

> EN — See

見る

**`sidebar.groups.settings`**

> EN — Settings

設定

**`sidebar.groups.strategy`**

> EN — Strategy

戦略

**`sidebar.groups.track`**

> EN — Track

記録する

**`sidebar.groups.tracking`**

> EN — Tracking

記録

**`sidebar.groups.work`**

> EN — Work

作業

**`sidebar.groups.workspace`**

> EN — Workspace

ワークスペース

**`sidebar.hints.affiliate`**

> EN — Your referral link, what you've earned, and how you get paid.

紹介リンク、これまでの報酬、受け取り方法。

**`sidebar.hints.agents`**

> EN — Plan the agents you want. A tracker, not a runtime.

欲しいエージェントを計画。記録であり実行環境ではありません。

**`sidebar.hints.analytics`**

> EN — Metrics you're watching.

追いかけている指標。

**`sidebar.hints.automation`**

> EN — Things that run on a schedule.

スケジュールで動くもの。

**`sidebar.hints.businessHealth`**

> EN — MRR, margin, churn and runway. Owner only.

MRR、粗利、解約、手元資金。オーナー専用。

**`sidebar.hints.campaigns`**

> EN — Plan campaigns — channel, budget, status.

キャンペーンを計画 — チャネル、予算、状態。

**`sidebar.hints.chat`**

> EN — Ask anything — not tied to any module.

何でも聞けます — どのモジュールにも紐づきません。

**`sidebar.hints.competitors`**

> EN — Track rival products, pricing and positioning.

競合製品・価格・ポジショニングを追う。

**`sidebar.hints.content`**

> EN — Content ideas, captions and threads.

コンテンツ案・キャプション・スレッド。

**`sidebar.hints.costs`**

> EN — What every AI call has cost, per model and per day.

AI呼び出しごとのコストを、モデル別・日別に表示します。

**`sidebar.hints.dataAnalysis`**

> EN — Analysis requests and what you found.

分析の依頼と、わかったこと。

**`sidebar.hints.decisions`**

> EN — Weigh the options before you decide.

決める前に選択肢を比べる。

**`sidebar.hints.documents`**

> EN — Freeform notes and documents you write yourself.

自分で書く自由形式のメモと文書。

**`sidebar.hints.favorites`**

> EN — Everything you've starred.

スターを付けたすべて。

**`sidebar.hints.feedback`**

> EN — What users told you, in one place.

ユーザーの声を一か所に。

**`sidebar.hints.finance`**

> EN — Log income and expenses.

収入と支出を記録。

**`sidebar.hints.formSubmissions`**

> EN — Everything visitors sent through a form on your published sites

公開サイトのフォームから訪問者が送った内容のすべて

**`sidebar.hints.help`**

> EN — Answers to the questions people ask most — no credits used.

よくある質問への回答です。クレジットは消費しません。

**`sidebar.hints.home`**

> EN — Your dashboard — activity, stats and quick actions.

ダッシュボード — アクティビティ、統計、クイック操作。

**`sidebar.hints.ideas`**

> EN — Capture new ideas before you forget them.

忘れる前に新しいアイデアを残す。

**`sidebar.hints.learning`**

> EN — Track what you're studying.

学んでいることを記録。

**`sidebar.hints.memory`**

> EN — What the AI remembers about you.

AI があなたについて覚えていること。

**`sidebar.hints.mine`**

> EN — Everything you have made, newest first — with a starred-only tab

作成したものすべてを新しい順に。お気に入りだけのタブもあります

**`sidebar.hints.missionControl`**

> EN — Set a goal, AI breaks it into steps.

目標を決めると AI がステップに分解します。

**`sidebar.hints.newEntry`**

> EN — Write anything down — it files itself

何でも書いてください — 自動で仕分けされます

**`sidebar.hints.products`**

> EN — Product plans — pricing, roadmap, launch.

プロダクト計画 — 価格、ロードマップ、ローンチ。

**`sidebar.hints.productWorkflow`**

> EN — Your products, patterns and mentor in one view.

プロダクト・パターン・メンターを一画面で。

**`sidebar.hints.reflection`**

> EN — A weekly summary of your progress.

週ごとの進捗サマリー。

**`sidebar.hints.research`**

> EN — Save research, sources and summaries.

調査・出典・要約を保存。

**`sidebar.hints.routing`**

> EN — Which model each kind of request is sent to.

どの種類のリクエストがどのモデルに送られるか。

**`sidebar.hints.sales`**

> EN — Leads, outreach and next steps.

リード、アプローチ、次の一手。

**`sidebar.hints.settings`**

> EN — Account, billing, language and preferences.

アカウント、請求、言語、設定。

**`sidebar.hints.systemHealth`**

> EN — Whether the database, the queues and the providers are answering.

データベース、キュー、プロバイダーが応答しているか。

**`sidebar.hints.team`**

> EN — Invite people to your workspace.

ワークスペースに人を招待。

**`sidebar.hints.timeline`**

> EN — Everything you've done, in order.

やってきたことを時系列で。

**`sidebar.hints.trading`**

> EN — Trade log — symbol, direction, result, P&L.

トレード記録 — 銘柄、方向、結果、損益。

**`sidebar.hints.tradingJournal`**

> EN — Your trades, with the reasoning you wrote at the time.

あなたの取引と、そのとき書いた根拠。

**`sidebar.hints.tradingWorkflow`**

> EN — Your trades, patterns and mentor in one view.

トレード・パターン・メンターを一画面で。

**`sidebar.hints.websiteBuilder`**

> EN — Describe a site and AI generates the real page.

サイトを説明すると AI が実際のページを生成します。

**`sidebar.hints.websites`**

> EN — Track sites you own — name, URL, status. No generation.

持っているサイトを記録 — 名前・URL・状態。生成はしません。

**`sidebar.items.affiliate`**

> EN — Affiliate

アフィリエイト

**`sidebar.items.agents`**

> EN — AI Agents

AI エージェント

**`sidebar.items.analytics`**

> EN — Analytics

アナリティクス

**`sidebar.items.apps`**

> EN — App notes

アプリメモ

**`sidebar.items.automation`**

> EN — Automation

自動化

**`sidebar.items.businessHealth`**

> EN — Business health

事業の健康状態

**`sidebar.items.campaigns`**

> EN — Campaign notes

キャンペーンメモ

**`sidebar.items.chat`**

> EN — Ionexa Chat

Ionexa チャット

**`sidebar.items.coding`**

> EN — AI Coding

AI コーディング

**`sidebar.items.competitors`**

> EN — Competitors

競合

**`sidebar.items.content`**

> EN — Content

コンテンツ

**`sidebar.items.costs`**

> EN — Costs

コスト

**`sidebar.items.dataAnalysis`**

> EN — Data Analysis

データ分析

**`sidebar.items.decisions`**

> EN — Decisions

意思決定

**`sidebar.items.deepResearch`**

> EN — Deep Research

ディープリサーチ

**`sidebar.items.documents`**

> EN — Documents

ドキュメント

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

> EN — Image notes

画像メモ

**`sidebar.items.integrations`**

> EN — Integrations

連携

**`sidebar.items.learning`**

> EN — Learning

学習

**`sidebar.items.library`**

> EN — My stuff

わたしのもの

**`sidebar.items.marketplace`**

> EN — Marketplace

マーケットプレイス

**`sidebar.items.memory`**

> EN — Search my records

自分の記録を検索

**`sidebar.items.mine`**

> EN — Mine

自分のもの

**`sidebar.items.missionControl`**

> EN — Goals & Plans

目標とプラン

**`sidebar.items.newEntry`**

> EN — New entry

新しい記録

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

> EN — Weekly Reflection

週次振り返り

**`sidebar.items.research`**

> EN — Research

リサーチ

**`sidebar.items.routing`**

> EN — Model routing

モデルルーティング

**`sidebar.items.sales`**

> EN — Sales

営業

**`sidebar.items.settings`**

> EN — Settings

設定

**`sidebar.items.systemHealth`**

> EN — System Health

システム状態

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

**`sidebar.items.videos`**

> EN — Video notes

動画メモ

**`sidebar.items.voice`**

> EN — Voice

音声

**`sidebar.items.websiteBuilder`**

> EN — Build a site

サイトをつくる

**`sidebar.items.websites`**

> EN — Website plans

サイト計画

### first result

**`dashboard.ideas.loadError`**

> EN — Could not load your ideas: {message}

アイデアを読み込めませんでした: {message}

**`dashboard.insights.title`**

> EN — What I noticed

気づいたこと

**`dashboard.overview.activeMission.open`**

> EN — Open the plan

プランを開く

**`dashboard.overview.activeMission.stepsLabel`**

> EN — {completed}/{total} steps completed

{completed}/{total} ステップ完了

**`dashboard.overview.aiCoach.entryCount`**

> EN — {count, plural, one {# new {module} entry} other {# new {module} entries}}

{module} に {count} 件の新しいエントリー

**`dashboard.overview.aiCoach.mostActiveIn`**

> EN — Most active in {module}

{module} で最もアクティブ

**`dashboard.overview.aiCoach.noActivity`**

> EN — No activity yet this week — log something to get started.

今週はまだアクティビティがありません — 何か記録して始めましょう。

**`dashboard.overview.betaFeedback.linkLabel`**

> EN — Share feedback

フィードバックを送る

**`dashboard.overview.betaFeedback.message`**

> EN — Thanks for testing Ionexa AI. Your feedback is welcome.

Ionexa AI をお試しいただきありがとうございます。ご意見をお待ちしています。

**`dashboard.overview.healthScore.buildingMomentum`**

> EN — Building momentum

勢いがついてきた

**`dashboard.overview.healthScore.excellentConsistency`**

> EN — Excellent consistency

優れた継続性

**`dashboard.overview.healthScore.justStarting`**

> EN — Just getting started

始めたばかり

**`dashboard.overview.healthScore.strongProgress`**

> EN — Strong progress

順調に進行中

**`dashboard.overview.healthScore.suggestion.consistency`**

> EN — Try logging something every day this week.

今週は毎日何かを記録してみましょう。

**`dashboard.overview.healthScore.suggestion.coverage`**

> EN — Try exploring a module you haven't used yet.

まだ使っていないモジュールを試してみましょう。

**`dashboard.overview.healthScore.suggestion.missionSteps`**

> EN — Complete a plan step to keep your momentum going.

プランのステップを完了して勢いを維持しましょう。

**`dashboard.overview.healthScore.title`**

> EN — Business Health Score

ビジネスヘルススコア

**`dashboard.overview.next.title`**

> EN — Next

次にやること

**`dashboard.overview.nextAction.continueMission`**

> EN — Continue: {step} from your "{goal}" plan

続ける: 「{goal}」プランの {step}

**`dashboard.overview.nextAction.cta`**

> EN — Go there →

移動する →

**`dashboard.overview.setupProgress.count`**

> EN — {done} of {total} steps

{total} 件中 {done} 件

**`dashboard.overview.setupProgress.steps.firstEntry`**

> EN — Log your first entry

最初の記録をつける

**`dashboard.overview.setupProgress.steps.mission`**

> EN — Set a goal

目標を設定する

**`dashboard.overview.setupProgress.steps.onboarding`**

> EN — Finish the welcome questions

ようこそ質問に答える

**`dashboard.overview.setupProgress.steps.secondModule`**

> EN — Log something in a second area

2 つ目の領域にも記録する

**`dashboard.overview.setupProgress.title`**

> EN — Setup progress

セットアップの進捗

**`dashboard.overview.statRow.creditsExplain`**

> EN — What is left of this month's allowance for AI work.

今月の AI 利用枠の残りです。

**`dashboard.overview.statRow.creditsRemaining`**

> EN — Credits Remaining

残りクレジット

**`dashboard.overview.statRow.fillsAfter`**

> EN — Fills in after {count} entries

{count} 件記録すると表示されます

**`dashboard.overview.statRow.fromEntries`**

> EN — {count, plural, one {from # entry} other {from # entries}}

{count, plural, other {# 件の記録から}}

**`dashboard.overview.statRow.mostActive`**

> EN — Most Active

最も活発

**`dashboard.overview.statRow.ofTotal`**

> EN — {count, plural, one {of # in total} other {of # in total}}

{count, plural, other {全 # 件中}}

**`dashboard.overview.statRow.openCredits`**

> EN — See the ledger →

明細を見る →

**`dashboard.overview.statRow.openEntries`**

> EN — See the entries →

記録を見る →

**`dashboard.overview.statRow.thisWeek`**

> EN — This Week

今週

**`dashboard.overview.statRow.totalEntries`**

> EN — Total Entries

合計エントリー数

**`dashboard.overview.statRow.totalEntriesExplain`**

> EN — Everything you have logged, in every module, since you started.

これまでに全モジュールで記録したものすべて。

**`dashboard.overview.whatChanged.entries`**

> EN — new entries

件の新しい記録

**`dashboard.overview.whatChanged.insights`**

> EN — new insights

件の新しい発見

**`dashboard.overview.whatChanged.since`**

> EN — since {when}

{when}から

**`dashboard.overview.whatChanged.title`**

> EN — What changed

変わったこと

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

**`dashboard.energyCheckIn.change`**

> EN — Change

変更

**`dashboard.energyCheckIn.checkedInToday`**

> EN — Today's energy: {level}/5.

今日のエネルギー: {level}/5。

**`dashboard.energyCheckIn.levelLabel`**

> EN — Energy level {level}

エネルギーレベル {level}

**`dashboard.energyCheckIn.logged`**

> EN — Energy logged

エネルギーを記録しました

**`dashboard.energyCheckIn.notePlaceholder`**

> EN — Optional note...

任意のメモ...

**`dashboard.energyCheckIn.prompt`**

> EN — How's your energy today?

今日のエネルギーはどうですか?

**`dashboard.energyCheckIn.scaleHigh`**

> EN — 5 = great

5 = 絶好調

**`dashboard.energyCheckIn.scaleLow`**

> EN — 1 = exhausted

1 = 疲れきっている

**`dashboard.energyCheckIn.title`**

> EN — Energy Check-In

エネルギーチェックイン

**`dashboard.firstScreen.build.example`**

> EN — Build a website for my shop

私の店のウェブサイトを作って

**`dashboard.firstScreen.build.verb`**

> EN — Build

作る

**`dashboard.firstScreen.cost.charged`**

> EN — Uses credits

クレジットを消費

**`dashboard.firstScreen.cost.free`**

> EN — Free

無料

**`dashboard.firstScreen.cost.freeAllowance`**

> EN — Free up to your monthly limit

月の無料枠まで無料

**`dashboard.firstScreen.label`**

> EN — Press one — it runs right away

ひとつ押すと、すぐ動きます

**`dashboard.firstScreen.repeat.example`**

> EN — Every Monday, a summary of my sales

毎週月曜日に、売上のまとめを

**`dashboard.firstScreen.repeat.verb`**

> EN — Repeat

繰り返す

**`dashboard.firstScreen.understand.example`**

> EN — What do my numbers say this week?

今週の私の数字は何を示している？

**`dashboard.firstScreen.understand.verb`**

> EN — Understand

わかる

**`dashboard.overview.recentEntries.empty`**

> EN — No entries yet.

まだ項目がありません。

**`dashboard.overview.recentEntries.title`**

> EN — Recent Entries

最近の項目

**`errors.creditHistory`**

> EN — See credit history

credits の履歴を見る

**`errors.retry`**

> EN — Try again

もう一度試す

**`sampleData.load`**

> EN — See it with sample data

サンプルデータで見る

**`sampleData.loadFailed`**

> EN — That did not work. Try again.

うまくいきませんでした。もう一度お試しください。

**`sampleData.loading`**

> EN — Loading…

読み込み中…

## Tier 3 — Further in — only if you have time (198)

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

**`common.switchToDarkMode`**

> EN — Switch to dark mode

ダークテーマに切り替える

**`common.switchToLightMode`**

> EN — Switch to light mode

ライトテーマに切り替える

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

**`dashboard.goal.costsThere`**

> EN — {credits, plural, one {# credit} other {# credits}} when you press the button there. Nothing is charged now.

向こうでボタンを押すと {credits} クレジットかかります。今は何も請求されません。

**`dashboard.goal.dismiss`**

> EN — Never mind

やめておく

**`dashboard.goal.freeThere`**

> EN — Nothing is charged now, and nothing is charged on arrival.

今は何も請求されませんし、移動しても請求されません。

**`dashboard.goal.vague`**

> EN — Say a little more, so this goes to the right place.

もう少し詳しく書いてください。正しい場所に送るためです。

**`dashboard.goal.which`**

> EN — Which one do you mean?

どちらのことですか？

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

**`voice.outOfMinutes`**

> EN — No voice minutes left this month

今月の音声の残り時間がありません

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

**`voice.settings.notConfigured`**

> EN — Voice is not set up on this deployment, so the microphone and Listen buttons do not appear.

この環境では音声が設定されていないため、マイクと「聞く」のボタンは表示されません。

**`voice.settings.notIncluded`**

> EN — Voice is not included on your plan. Everything here can still be typed and read.

お使いのプランに音声は含まれていません。ここにあるものはすべて、これまでどおり入力して読めます。

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
