# The emails — ja

Every line of every email the product sends: **108 strings**. The interface has its own pack, `first-run.ja.md`, beside this one.

**Start with tier 1. It is 37 sentences and it is the whole ask.** Tier 2 is 26 more sentences from emails fewer people get. Tier 3 is 45 short lines to skim.

**What to look for.** An email is read when the product is not on screen, often on a phone, sometimes as the only thing a person reads from us that week. Does it sound like a person wrote it? Is it the right register — the same "you" as the app? Would you send it to a customer under your own name? `{name}`-style placeholders are filled in when it is sent.

## Tier 1 — THE SENTENCES — read these (37)

_From the emails a person is sure or likely to receive, 5 words or more._

### welcome — every account gets it, minutes after signing up

**`email.welcome.body`**

> EN — Your account is ready — no email confirmation needed, you can log in right away. Ionexa AI is 13 modules for running a startup, plus a free-text inbox that files anything you type into the right one.

アカウントの準備ができました。メール確認は不要で、すぐにログインできます。Ionexa AI はスタートアップ運営のための 13 のモジュールと、書いた内容を適切なモジュールへ振り分ける自由入力欄でできています。

**`email.welcome.tip`**

> EN — Tip: on {path} you can just describe what happened in plain English and it'll land in the right module automatically.

ヒント：{path} では起きたことを自分の言葉で書くだけで、自動的に正しいモジュールに入ります。

**`email.welcome.preheader`**

> EN — Your Ionexa AI account is ready.

Ionexa AI のアカウントが使えるようになりました。

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.title`**

> EN — new sign-in to your account

アカウントへの新しいログイン

**`email.newDevice.body`**

> EN — We noticed a sign-in to your Ionexa AI account from a device or browser we haven't seen before.

これまでに見たことのない端末またはブラウザから、Ionexa AI のアカウントへのログインを検知しました。

**`email.newDevice.ifYou`**

> EN — If this was you, no action is needed. If you don't recognize this sign-in, please reset your password immediately.

ご本人であれば何もする必要はありません。心当たりがない場合は、すぐにパスワードを変更してください。

**`email.newDevice.preheader`**

> EN — New sign-in to your Ionexa AI account from {device}.

{device} から Ionexa AI アカウントへの新しいログインがありました。

### stuck — a website generation that did not finish

**`email.stuck.body`**

> EN — This generation has been running for over 24 hours without finishing — that's not normal, and it's likely stuck rather than still working. No credits were charged for it. Open it below to retry or delete it.

この生成は24時間以上終わらずに動き続けています。通常ではなく、作業中というより止まっている可能性が高い状態です。この生成でクレジットは消費されていません。下から開いて、やり直すか削除してください。

**`email.stuck.preheader`**

> EN — “{name}” has been stuck generating for over 24 hours.

「{name}」の生成が24時間以上止まっています。

**`email.stuck.subject`**

> EN — “{name}” seems stuck — Ionexa AI

「{name}」が止まっているようです — Ionexa AI

### scheduledRun — a scheduled job finished

**`email.scheduledRun.titleDone`**

> EN — your scheduled task is done

予約したタスクが完了しました

**`email.scheduledRun.titleFailed`**

> EN — your scheduled task couldn't run

予約したタスクを実行できませんでした

**`email.scheduledRun.preheaderDone`**

> EN — Your scheduled task “{step}” is done.

予約したタスク「{step}」が完了しました。

**`email.scheduledRun.preheaderFailed`**

> EN — Your scheduled task “{step}” couldn't run.

予約したタスク「{step}」を実行できませんでした。

**`email.scheduledRun.subjectDone`**

> EN — Your scheduled task is done — Ionexa AI

予約したタスクが完了しました — Ionexa AI

**`email.scheduledRun.subjectFailed`**

> EN — Your scheduled task couldn't run — Ionexa AI

予約したタスクを実行できませんでした — Ionexa AI

**`email.scheduledRun.details.noCreditsOnce`**

> EN — Not enough credits — top up or upgrade your plan, then schedule it again.

クレジットが足りません。チャージするかプランをアップグレードしてから、もう一度予約してください。

**`email.scheduledRun.details.noCreditsRecurring`**

> EN — Not enough credits — top up or upgrade your plan. This automation will try again next cycle.

クレジットが足りません。チャージするかプランをアップグレードしてください。この自動処理は次のサイクルで再試行します。

### agent — an agent's result or failure

**`email.agent.disabledTitle`**

> EN — “{name}” has been switched off

「{name}」を停止しました

**`email.agent.disabledBody`**

> EN — It failed {count} times in a row, so it has stopped running rather than keep failing and keep costing you credits.

{count} 回連続で失敗したため、失敗を繰り返してクレジットを消費し続けないよう、実行を止めました。

**`email.agent.disabledHint`**

> EN — Open it below to check the task and turn it back on.

下から開いてタスクを確認し、もう一度オンにしてください。

**`email.agent.disabledPreheader`**

> EN — “{name}” stopped running after {count} failures.

「{name}」は {count} 回の失敗のあと停止しました。

**`email.agent.disabledSubject`**

> EN — “{name}” has been switched off — Ionexa AI

「{name}」を停止しました — Ionexa AI

**`email.agent.pausedBody`**

> EN — It couldn't run because your account is out of credits. Nothing was charged, and nothing has been lost — top up or upgrade and turn it back on, and it picks up its normal schedule again.

アカウントのクレジットが尽きたため実行できませんでした。課金は発生しておらず、失われたものもありません。チャージまたはアップグレードしてからもう一度オンにすれば、いつもの予定どおりに再開します。

**`email.agent.pausedPreheader`**

> EN — “{name}” is paused — your account is out of credits.

「{name}」は一時停止中です — アカウントのクレジットが尽きました。

**`email.agent.pausedSubject`**

> EN — “{name}” is paused — Ionexa AI

「{name}」は一時停止中です — Ionexa AI

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.title`**

> EN — your subscription is set to end

サブスクリプションは終了予定です

**`email.cancelled.untilDate`**

> EN — You'll keep full access until {date}. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

{date} まではこれまでどおりすべてお使いいただけます。それまでは何も変わりません。残りのクレジットもそのまま使え、データが消えることもありません。

**`email.cancelled.untilPeriodEnd`**

> EN — You'll keep full access until the end of the period you've already paid for. Nothing changes before then — your remaining credits stay usable, and none of your data is deleted.

すでにお支払い済みの期間が終わるまでは、これまでどおりすべてお使いいただけます。それまでは何も変わりません。残りのクレジットもそのまま使え、データが消えることもありません。

**`email.cancelled.afterwards`**

> EN — After that the account moves to the free plan. Your entries, files and conversations stay exactly where they are.

そのあとアカウントは無料プランに移ります。入力した内容、ファイル、会話はそのままの場所に残ります。

**`email.cancelled.cta`**

> EN — Changed your mind? Restore it

気が変わりましたか？ 元に戻す

**`email.cancelled.noCharge`**

> EN — You can restore the subscription any time before it ends, at no extra charge — you have already paid for this period.

終了前であればいつでも、追加料金なしで元に戻せます。この期間分はすでにお支払い済みです。

**`email.cancelled.preheaderDate`**

> EN — Your Ionexa AI subscription ends on {date}. You keep access until then.

Ionexa AI のサブスクリプションは {date} に終了します。それまではご利用いただけます。

**`email.cancelled.preheader`**

> EN — Your Ionexa AI subscription is set to end. You keep access until the period you paid for runs out.

Ionexa AI のサブスクリプションは終了予定です。お支払い済みの期間が終わるまではご利用いただけます。

### deletion — confirming that an account is being deleted

**`email.deletion.body`**

> EN — We received a request to permanently delete your Ionexa AI account and every record logged across all modules. This can't be undone.

Ionexa AI のアカウントと、すべてのモジュールに記録されたデータを完全に削除する依頼を受け取りました。これは元に戻せません。

**`email.deletion.expiry`**

> EN — This link expires in 1 hour. If you didn't request this, ignore this email and your account will stay exactly as it is.

このリンクは 1 時間で期限切れになります。心当たりがなければこのメールは無視してください。アカウントはそのまま残ります。

**`email.deletion.preheader`**

> EN — Confirm permanent deletion of your Ionexa AI account.

Ionexa AI アカウントの完全削除を確認してください。

## Tier 2 — The other emails' sentences — if you have time (26)

_The digest, form submissions and shared lines. Fewer people get them._

### digest — the weekly digest, for those who opt in

**`email.digest.subjectFallback`**

> EN — your week on Ionexa AI

Ionexa AI でのあなたの一週間

**`email.digest.lines.agents.one`**

> EN — {runs} agent run, {found} with a result

エージェント実行 {runs} 回、うち {found} 回に結果あり

**`email.digest.lines.agents.other`**

> EN — {runs} agent runs, {found} with a result

エージェント実行 {runs} 回、うち {found} 回に結果あり

**`email.digest.lines.creditsWithAverage.one`**

> EN — {count} credit spent (your average: {average})

{count} クレジットを使用（平均: {average}）

**`email.digest.lines.creditsWithAverage.other`**

> EN — {count} credits spent (your average: {average})

{count} クレジットを使用（平均: {average}）

**`email.digest.lines.leads.one`**

> EN — {count} lead with no follow-up recorded

フォローアップが記録されていない見込み客 {count} 件

**`email.digest.lines.leads.other`**

> EN — {count} leads with no follow-up recorded

フォローアップが記録されていない見込み客 {count} 件

**`email.digest.lines.spendUp`**

> EN — spending is up {percent}% on your average

支出は平均より {percent}% 多くなっています

**`email.digest.lines.spendDown`**

> EN — spending is down {percent}% on your average

支出は平均より {percent}% 少なくなっています

**`email.digest.lines.trafficUp`**

> EN — site traffic is up {percent}%

サイトの訪問数が {percent}% 増えました

**`email.digest.lines.trafficDown`**

> EN — site traffic is down {percent}%

サイトの訪問数が {percent}% 減りました

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.title`**

> EN — Someone contacted you via “{name}”

「{name}」から連絡がありました

**`email.formSubmission.subject`**

> EN — New form submission on “{name}” — Ionexa AI

「{name}」に新しいフォーム送信 — Ionexa AI

### blurbs — short lines shared by several emails

**`email.blurbs.ideas`**

> EN — Capture and score new product or business ideas.

新しい製品や事業のアイデアを記録して評価します。

**`email.blurbs.competitors`**

> EN — Track rival products, pricing, and positioning.

競合製品、価格、ポジショニングを追いかけます。

**`email.blurbs.research`**

> EN — Notes and summaries from anything you're researching.

調べていることのメモと要約。

**`email.blurbs.learning`**

> EN — Topics you're studying, with resources and quizzes.

学んでいるテーマを、資料とクイズつきで。

**`email.blurbs.trading`**

> EN — Trade log — symbol, direction, result, profit and loss.

取引記録——銘柄、方向、結果、損益。

**`email.blurbs.decisions`**

> EN — Weigh options and record the recommendation.

選択肢を比べ、結論を書き残します。

**`email.blurbs.products`**

> EN — Product plans — pricing, roadmap, launch plan.

製品計画——価格、ロードマップ、ローンチ計画。

**`email.blurbs.content`**

> EN — Content ideas, captions, and threads.

コンテンツのアイデア、キャプション、連投。

**`email.blurbs.sales`**

> EN — Leads, outreach emails, and next steps.

見込み客、アプローチのメール、次の一手。

**`email.blurbs.feedback`**

> EN — User feedback, triaged by sentiment and priority.

ユーザーの声を、トーンと優先度で仕分けします。

**`email.blurbs.analytics`**

> EN — Any metric worth tracking over time.

時系列で追う価値のあるあらゆる指標。

**`email.blurbs.automation`**

> EN — Workflows worth automating, and time saved.

自動化する価値のある流れと、節約できた時間。

### footer — the footer under every email

**`email.footer`**

> EN — You're receiving this because you have a Ionexa AI account.

このメールは、Ionexa AI のアカウントをお持ちの方にお送りしています。

## Tier 3 — Subjects, labels and the footer — skim (45)

_Short lines. A wrong one is usually obvious; look for the one that means something else in your language._

### welcome — every account gets it, minutes after signing up

**`email.welcome.label`**

> EN — signup

サインアップ

**`email.welcome.title`**

> EN — welcome to Ionexa AI

Ionexa AI へようこそ

### newDevice — a sign-in from a new device — a security email, read closely

**`email.newDevice.label`**

> EN — security

セキュリティ

**`email.newDevice.when`**

> EN — When

日時

**`email.newDevice.device`**

> EN — Device

端末

**`email.newDevice.ip`**

> EN — IP address

IP アドレス

**`email.newDevice.cta`**

> EN — Reset password

パスワードを変更

### stuck — a website generation that did not finish

**`email.stuck.label`**

> EN — website builder

ウェブサイトビルダー

**`email.stuck.title`**

> EN — “{name}” seems stuck

「{name}」が止まっているようです

**`email.stuck.cta`**

> EN — Open Website Builder

ウェブサイトビルダーを開く

### scheduledRun — a scheduled job finished

**`email.scheduledRun.label`**

> EN — scheduled agent run

予約されたエージェント実行

**`email.scheduledRun.cta`**

> EN — Open {name}

{name} を開く

### agent — an agent's result or failure

**`email.agent.label`**

> EN — your agent

あなたのエージェント

**`email.agent.resultCta`**

> EN — Manage your agents

エージェントを管理する

**`email.agent.resultPreheader`**

> EN — {name} — your scheduled result.

{name} — 予約していた結果です。

**`email.agent.disabledLastError`**

> EN — Last error: {error}

最後のエラー: {error}

**`email.agent.disabledCta`**

> EN — Open your agents

エージェントを開く

**`email.agent.pausedTitle`**

> EN — “{name}” is paused

「{name}」は一時停止中です

**`email.agent.pausedCtaTopUp`**

> EN — Top up credits

クレジットをチャージ

**`email.agent.pausedCtaAgents`**

> EN — Open your agents

エージェントを開く

### cancelled — the subscription was cancelled — the last thing a leaving customer reads

**`email.cancelled.label`**

> EN — subscription

サブスクリプション

### deletion — confirming that an account is being deleted

**`email.deletion.label`**

> EN — account deletion

アカウント削除

**`email.deletion.title`**

> EN — confirm account deletion

アカウント削除の確認

**`email.deletion.cta`**

> EN — Confirm deletion

削除を確定する

### digest — the weekly digest, for those who opt in

**`email.digest.label`**

> EN — digest

まとめ

**`email.digest.title`**

> EN — this week

今週

**`email.digest.noticed`**

> EN — what I noticed

気づいたこと

**`email.digest.cta`**

> EN — Open your dashboard

ダッシュボードを開く

**`email.digest.subject`**

> EN — this week: {first}

今週: {first}

**`email.digest.lines.records.one`**

> EN — {count} new entry

新しい記録 {count} 件

**`email.digest.lines.records.other`**

> EN — {count} new entries

新しい記録 {count} 件

**`email.digest.lines.site.one`**

> EN — your site: {count} visit

あなたのサイト: {count} 件の訪問

**`email.digest.lines.site.other`**

> EN — your site: {count} visits

あなたのサイト: {count} 件の訪問

**`email.digest.lines.credits.one`**

> EN — {count} credit spent

{count} クレジットを使用

**`email.digest.lines.credits.other`**

> EN — {count} credits spent

{count} クレジットを使用

**`email.digest.lines.agentFailures.one`**

> EN — {count} agent run failed

エージェント実行 {count} 回が失敗

**`email.digest.lines.agentFailures.other`**

> EN — {count} agent runs failed

エージェント実行 {count} 回が失敗

### formSubmission — somebody filled in a form on a published site

**`email.formSubmission.label`**

> EN — new form submission

新しいフォーム送信

**`email.formSubmission.cta`**

> EN — View your websites

自分のサイトを見る

**`email.formSubmission.preheader`**

> EN — New form submission on {name}

{name} に新しいフォーム送信があります

**`email.formSubmission.badges.genuine_interest`**

> EN — Likely genuine lead

本物の見込み客の可能性

**`email.formSubmission.badges.question`**

> EN — General question

一般的な質問

**`email.formSubmission.badges.spam`**

> EN — Possible spam

迷惑メールの可能性

**`email.formSubmission.badges.unclear`**

> EN — Unclear

判断できません

### blurbs — short lines shared by several emails

**`email.blurbs.finance`**

> EN — Log income and expenses.

収入と支出を記録します。
