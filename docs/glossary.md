# Glossary — one name for each thing

One concept, one word, in every language. A concept with two names is not a
style problem: a person who reads "entry" on one screen and "record" on the
next has to work out whether they are the same thing, and the honest answer
is that nothing on screen tells them.

**This file is read by `scripts/tests/glossary.test.mjs`.** The tables below
are the source of truth; the gate parses them and fails on a forbidden
synonym. Editing the table changes what is enforced — which is the point:
the rule and the enforcement cannot drift apart.

## How the collision was found

Counting English words finds almost nothing. `successfully` appears 0 times,
`simply` 0, `easy` 0, `seamless` 0. English reads clean.

The collision is in the other nine languages, where one English word was
translated by different hands on different days:

| concept | Greek | Spanish | French | Italian | Japanese | Arabic |
|---|---|---|---|---|---|---|
| the unit of logged data | εγγραφή · καταχώρηση | entrada · registro | entrée · enregistrement | voce · record | エントリー · 記録 · レコード | إدخال · مدخل · سجل |

Three sentences that say the same thing in English —
`dashboard.overview.entry`, `dashboard.overview.statRow.fromEntries`,
`dashboard.insights.basedOn` — say it with three different nouns in
Japanese and Arabic, and two in Greek, Spanish, French, Italian and
Portuguese. Nobody reviewing the English could have seen it.

---

## Approved terms

Singular form. The gate matches case-insensitively and allows the
language's own inflections; what it forbids is the synonym.

<!-- APPROVED:START -->
| concept | en | el | es | fr | de | it | pt | zh | ja | ar |
|---|---|---|---|---|---|---|---|---|---|---|
| entry | entry | καταχώρηση | entrada | entrée | Eintrag | voce | entrada | 记录 | 記録 | إدخال |
| document | document | έγγραφο | documento | document | Dokument | documento | documento | 文档 | ドキュメント | مستند |
| file | file | αρχείο | archivo | fichier | Datei | file | ficheiro | 文件 | ファイル | ملف |
| plan | plan | σχέδιο | plan | plan | Plan | piano | plano | 计划 | プラン | خطة |
<!-- APPROVED:END -->

## Forbidden synonyms

A word on this list must not appear as a name for that concept. It may
still appear in its other, unrelated senses — "record" the verb, "a record,
not advice" — so the gate checks the **counted** form (`{count} X`, `# X`,
`10 X`), which is only ever the concept.

<!-- FORBIDDEN:START -->
| concept | language | forbidden |
|---|---|---|
| entry | en | record, records, log, logs, item, items, activity, activities |
| entry | el | εγγραφή, εγγραφές |
| entry | es | registro, registros |
| entry | fr | enregistrement, enregistrements |
| entry | de | Datensatz, Datensätze |
| entry | it | record |
| entry | pt | registo, registos, registro, registros |
| entry | zh | 条目 |
| entry | ja | エントリー, レコード |
| entry | ar | مدخل, مدخلات, سجل, سجلات |
<!-- FORBIDDEN:END -->

## Forbidden outright, in any form

The counted-form rule above works for a unit noun, which is always counted.
It does not work for a **name**: "Delete the mission" carries no number, so
a counted-form check would never see it come back. These words are
forbidden wherever they appear.

<!-- FORBIDDEN_ANY:START -->
| concept | language | forbidden |
|---|---|---|
| plan | en | mission, missions |
| plan | fr | mission, missions |
| plan | de | Mission, Missionen, Missionsschritt |
| plan | it | missione, missioni |
| plan | pt | missão, missões |
| plan | es | misión, misiones |
| plan | ja | ミッション |
<!-- FORBIDDEN_ANY:END -->

Three languages are **deliberately absent** from that table, and saying so
is the point of writing it down:

- **Greek** — `Αποστολή` is the ordinary word for *sending*, used by
  "Αποστολή link επαναφοράς" and five other unrelated strings. Forbidding
  it would fail the build on correct copy.
- **Chinese** (任务) and **Arabic** (مهمة) — both are the word this app
  uses for **task**, the instruction text given to an agent, which the
  glossary declares a separate concept below. The word is right; it just
  belongs to the other concept.

A gate that cannot check three of ten languages should say which three
rather than report a clean sweep.

## Exceptions

Two navigation names use "records" as a **collective** — not a count of
units, but the body of everything the account holds. They were chosen in
V4.6 #3 and approved. The gate allows them by key, so an exception is
visible here rather than hidden in a regex.

<!-- EXCEPTIONS:START -->
| key | why |
|---|---|
| sidebar.items.records | "My records" — the collective, the approved nav name |
| sidebar.items.memory | "Search my records" — the same collective |
| dashboard.records.title | the page heading, which must match the nav row |
| dashboard.memory.title | the page heading, which must match the nav row |
| common.listCapped | points the reader at "Search my records" by its name |
<!-- EXCEPTIONS:END -->

## Distinct concepts that look like synonyms

These are NOT the same thing and must not be unified:

- **file** vs **document** — a file is uploaded, a document is written here.
  `/dashboard/files` holds the first, `/dashboard/documents` the second.
- **agent** vs **automation** — an agent runs an AI task on a schedule;
  Automation is a tracking module where a person writes down a process they
  repeat. Different features, different pages.
- **task** — the instruction text given to an agent. Not a to-do item;
  there is no to-do feature.
- **goal** vs **plan** — the goal is the sentence a person writes; the plan
  is what the system produces from it. Both are needed, and the nav names
  the pair: "Goals & Plans".

  The object used to be called a **mission** everywhere inside the feature
  the nav called "Goals & Plans" — 28 strings, in ten languages. The nav
  name was already approved, so the rename propagated it inward rather
  than deciding anything new. `achievements.firstMission.title` lost a pun
  ("Mission Accomplished") in the process; a pun that names the thing
  wrongly is worse than no pun.

## Words that are banned outright

| word | why |
|---|---|
| successfully | the result already says it succeeded |
| simply, just, easy | tells the reader their difficulty is their fault |
| seamless, effortless | a claim, not information |
| unlock | a payment described as a reward |
| ! in system copy | the product is not excited |

Present count in `messages/en.json` at the time of writing: `successfully` 0,
`simply` 0, `easy` 0, `seamless` 0, `effortless` 0, `unlock` 1, `!` 2. The
gate holds those at zero.

`just` appears 16 times, of which 15 are the contrastive sense ("not just
snippets", "just now") and are fine. The banned sense is the minimising one
("just click here"). The gate cannot tell them apart, so it checks the
minimising patterns only.

## Voice

- The product says **"your"**, never "my", when labelling the reader's own
  things: "Ask your documents", not "Ask my documents".
- The product does not say **"I"**. Only the chat does.
- Strings the *user* speaks — example prompts, placeholders showing what to
  type — keep "my", because the user is the one talking.

Which strings those are is a list, not a count. The gate holds the set: a
new first-person string outside this list fails, and it fails by name, so
the message says which string and the reviewer can judge who is speaking.
Removing one from the product is always allowed.

<!-- USERVOICE:START -->
| key | who is speaking |
|---|---|
| aiExamples.createStudio.e1 | an example prompt the reader would type |
| aiExamples.agents.e2 | an example prompt the reader would type |
| aiExamples.agents.e3 | an example prompt the reader would type |
| aiExamples.mission.e1 | an example prompt the reader would type |
| aiExamples.research.e1 | an example prompt the reader would type |
| dashboard.createStudio.inputPlaceholder | a placeholder showing what to type |
| dashboard.websiteBuilder.descriptionPlaceholder | a placeholder showing what to type |
| dashboard.tradingWorkflow.mentorChatPrefill | text prefilled into the reader's own input |
| dashboard.tradingWorkflow.missionGoal | text prefilled into the reader's own input |
| dashboard.productWorkflow.mentorChatPrefill | text prefilled into the reader's own input |
| dashboard.agents.capability.tryInstead | quotes an example prompt |
| dashboard.websiteBuilder.design.logoChoices.uploaded | a choice the reader makes, in their words |
| dashboard.websiteBuilder.design.logoChoices.wordmark | a choice the reader makes, in their words |
| dashboard.websiteBuilder.design.photoSourceChoices.own | a choice the reader makes, in their words |
| dashboard.onboarding.goals.startup | a choice the reader makes, in their words |
| dashboard.onboarding.sourceManual | a choice the reader makes, in their words |
| settings.billing.cancel.reasons.not_using | a choice the reader makes, in their words |
| sidebar.items.memory | "Search my records" — the approved nav name |
| dashboard.memory.title | the page heading, which must match that nav row |
| common.listCapped | points the reader at "Search my records" by its name |
| help.businessModule.does | names "Search my records" by its name |
<!-- USERVOICE:END -->

