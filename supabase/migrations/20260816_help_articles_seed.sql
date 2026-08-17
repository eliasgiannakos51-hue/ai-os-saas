-- Help Centre seed. GENERATED — do not edit by hand.
--
-- Source: scripts/help-articles/{en,el,core-1,core-2}.mjs
-- Regenerate: node scripts/help-articles/generate.mjs
--
-- IDEMPOTENT. Every row is an UPSERT on (slug, locale), which is the
-- unique index created by 20260816_help_articles.sql. Running this twice
-- updates in place and inserts nothing twice. No DELETE, no TRUNCATE — a
-- translation removed from the source files stays in the table until
-- somebody removes it deliberately, because silently deleting published
-- content from a seed is how a Help Centre loses an article nobody
-- noticed was gone.
--
-- ROWS: 166 total — en=27, el=27, es=14, fr=14, de=14, it=14, pt=14, zh=14, ja=14, ar=14
--
-- en is COMPLETE (all 27 slugs) because it is the fallback and there is
-- nothing behind it. el is complete because it already existed. The other
-- eight carry the 14 core articles and fall back to English for the
-- rest — visibly, with a marker and a lang attribute, never silently.
--
-- NO NUMBERS THAT MOVE: the generator refuses to emit a body containing a
-- digit, so a price cannot be baked into an answer by accident.

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'en', 'How much does Ionexa cost?', 'There is a free plan to try it with, and paid plans as your needs grow. Current prices and what each one includes are always on the /pricing page — they are not written here because they change and a stale number is worse than no number.', 'billing', 0, true, array['how much', 'how much does it cost', 'cost', 'price', 'pricing', 'what does it cost', 'plans', 'what plans', 'subscription', 'how much is it']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'en', 'How do I change plan?', 'Settings > Billing. Pick the plan you want and the change takes effect immediately. On an upgrade you pay only the difference for the rest of the period; on a downgrade you keep your current plan until the period you have already paid for ends.', 'billing', 1, true, array['change plan', 'upgrade', 'downgrade', 'switch plan', 'change subscription', 'move to a bigger plan']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'en', 'How do I cancel my subscription?', 'Settings > Billing > Cancel subscription. You do not lose access straight away: your plan runs to the end of the period you have already paid for, and the account then drops to the free plan. Your data stays — cancelling deletes nothing.', 'billing', 2, true, array['cancel', 'cancel subscription', 'unsubscribe', 'stop my subscription', 'how do i cancel', 'end subscription']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invoices', 'en', 'Where do I find my receipts?', 'Settings > Billing > Payment history. Every charge has a PDF receipt you can download from there. Payments run through Stripe and we never store your card details.', 'billing', 3, true, array['receipt', 'receipts', 'invoice', 'invoices', 'billing history', 'payment history']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('refund', 'en', 'Can I ask for a refund?', 'Yes — tell us what happened and we will look at it. If you were charged by mistake, or something did not work as it should have, we put it right. Message us from Settings > Support with the charge reference.', 'billing', 4, true, array['refund', 'money back', 'charged by mistake', 'wrong charge', 'get my money back']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'en', 'What are credits?', 'Credits are the currency you pay for AI actions with: a chat message, generating a website, an agent run. Each plan comes with a monthly allowance that renews, and you can buy extra packs if you run out sooner. How much each plan includes is on /pricing.', 'credits', 0, true, array['what are credits', 'credits', 'what is a credit', 'how do credits work', 'units']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credit-cost-per-action', 'en', 'How many credits does each action cost?', 'The charge is not fixed per action — it is worked out from what the call actually cost, so a short message costs less than a long one. Before every expensive action you see an estimate, and once it finishes you see the real charge in your history.', 'credits', 1, true, array['how many credits', 'credit cost', 'cost per action', 'how much does it charge', 'what does an action cost']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'en', 'I have run out of credits — what now?', 'Two options: wait for the next monthly renewal, or buy a credit pack, which is added immediately and does not expire at the end of the month. Both are in Settings > Billing.', 'credits', 2, true, array['ran out of credits', 'no credits', 'out of credits', 'buy credits', 'get more credits', 'credits finished']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-rollover', 'en', 'Do credits roll over to the next month?', 'A plan''s monthly credits renew each month and do not accumulate. Credits you buy in a pack are different: they stay on your account until you use them.', 'credits', 3, true, array['roll over', 'rollover', 'do credits expire', 'do credits carry over', 'lose my credits']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'en', 'How do I make a website?', 'Open Website Builder from the sidebar, write in plain words what you want — what your business does, who it is for, what style you like — and press create. You can upload reference images too, a logo or product photos, so it follows your look. When it is ready you publish it to its own address in one click.', 'websites', 0, true, array['make a website', 'create website', 'build a website', 'website builder', 'i want a site', 'new website']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('publish-website', 'en', 'How do I publish my website?', 'In Website Builder, open the site and press Publish. You choose a name for the address and the site goes live immediately. Every publish is kept as a version, so you can roll back to an earlier one if you need to.', 'websites', 1, true, array['publish', 'how do i publish', 'put it live', 'go live', 'make my site public']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'en', 'How do I make an agent?', 'In the Agents menu, describe in one sentence what you want done and how often — for example "every morning send me a summary of news in my industry". Ionexa builds the agent itself, runs it on time and sends you the result. You can pause or change it whenever you like.', 'agents', 0, true, array['make an agent', 'create agent', 'agents', 'automation', 'i want an agent', 'automate something']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'en', 'How do I make a mission?', 'In Mission Control you write a goal the way you would say it to a person — "I want more customers by spring". Ionexa breaks it into concrete steps, and you can then work through them yourself or hand some of them to an agent.', 'missions', 0, true, array['make a mission', 'mission control', 'goal', 'goals', 'create mission', 'missions']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invite-code', 'en', 'Where do I enter an invite code?', 'There is a field for an invite code on the sign-up form. If you already have an account you enter it in Settings > Account. Once it is accepted, whatever it grants is active on your account straight away.', 'account', 0, true, array['invite code', 'beta code', 'where do i put the code', 'invitation', 'promo code']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'en', 'Does the chat remember earlier conversations?', 'Within one conversation it always remembers the earlier messages. Between conversations it keeps only lastingly useful details — your name, what you do, your preferences — and that is on the paid plans. You can see everything it has kept, and delete it, in Settings > Memory.', 'chat', 0, true, array['remember', 'memory', 'previous conversations', 'does it forget', 'chat history', 'it does not remember']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'en', 'Can I upload files?', 'Yes — PDF, Word, Excel, CSV, text and Markdown. You upload them in Files, Ionexa reads what is in them, and then you can ask questions about them. Your files are private: nobody else has access and every download uses a temporary link.', 'files', 0, true, array['upload a file', 'upload', 'pdf', 'files', 'documents', 'can i upload']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'en', 'How do I connect Gmail or Google Drive?', 'Settings > Integrations. Pick the service and approve access in Google''s own window. You see exactly what it will read before you approve, and you can disconnect whenever you like — the access keys are deleted immediately when you do.', 'integrations', 0, true, array['gmail', 'google drive', 'connect', 'integration', 'slack', 'how do i connect', 'link my email']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('languages', 'en', 'What languages does it work in?', 'The interface is available in ten languages and you change it in Settings. The AI replies in whatever language you write to it in, regardless of the interface language.', 'getting-started', 0, true, array['language', 'languages', 'english', 'greek', 'translation', 'change language']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'en', 'How do I delete my account?', 'Settings > Account > Delete account. You will be asked to confirm, and then everything goes: conversations, files, websites, agents, history. It cannot be undone. If you want a copy first, download your data from the same page.', 'privacy', 0, true, array['delete account', 'delete my account', 'close my account', 'remove my account']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('export-data', 'en', 'Can I download my data?', 'Yes. Settings > Account > Export data. You get a file with everything you have made — conversations, missions, websites, files, billing history. The access keys for connected accounts are left out for security reasons.', 'privacy', 1, true, array['download my data', 'export', 'export data', 'gdpr', 'copy of my data']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'en', 'What do you do with my data?', 'Your data is yours. We do not sell it, we do not use it to train models, and every account sees only its own — that is enforced in the database, not just in the application. You can download it or delete it whenever you want.', 'privacy', 2, true, array['my data', 'privacy', 'security', 'do you sell my data', 'train models', 'is my data safe']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('password-reset', 'en', 'I have forgotten my password.', 'On the sign-in page press "Forgot my password" and enter your email. A reset link will be sent to you. If it does not arrive, check your spam folder as well.', 'account', 1, true, array['forgot my password', 'password', 'reset password', 'cannot log in', 'cannot sign in']::text[], '/login')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('team-members', 'en', 'Can I add people from my team?', 'Yes, on the plans that include a team. Settings > Team, invite by email and that person joins the same workspace. Which plans include it and how many seats they give is on /pricing.', 'account', 2, true, array['team', 'colleagues', 'invite a member', 'collaboration', 'add users', 'share my workspace']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('notifications', 'en', 'How do I set up notifications?', 'Settings > Notifications. Separately for email and for phone notifications, and per type — agent results, reminders, low credits. Critical security notifications cannot be switched off.', 'account', 3, true, array['notifications', 'email notifications', 'push', 'stop emailing me', 'turn off notifications']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('mobile-app', 'en', 'Is there a mobile app?', 'There is no app in the stores, but Ionexa installs on your phone from the browser: open it, choose "Add to Home Screen", and it behaves like an app with its own icon and notifications. It works on the phone''s browser without installing anything too.', 'getting-started', 1, true, array['mobile app', 'app', 'android', 'iphone', 'ios', 'is there an app', 'on my phone']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'en', 'What is Ionexa?', 'A workspace where the AI does the work rather than only advising you: it makes your website, runs agents on a schedule, breaks your goals into steps, reads your files and answers questions about them, and keeps everything you have logged in one searchable place.', 'getting-started', 2, true, array['what is ionexa', 'what is this', 'what does it do', 'what can it do', 'how does it work']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('contact-support', 'en', 'How do I contact you?', 'Settings > Support, or reply to any email we have sent you. A person reads it — say what you were trying to do and what happened instead, and we will come back to you.', 'account', 4, true, array['contact', 'support', 'help', 'talk to a human', 'customer service', 'email you']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'el', 'Πόσο κοστίζει το Ionexa;', 'Υπάρχει δωρεάν πλάνο για να δοκιμάσεις, και επί πληρωμή πλάνα καθώς μεγαλώνουν οι ανάγκες σου. Οι τρέχουσες τιμές και το τι περιλαμβάνει το καθένα είναι πάντα στη σελίδα /pricing — δεν τις γράφω εδώ γιατί αλλάζουν και δεν θέλω να σου δώσω παλιό νούμερο.', 'billing', 0, true, array['ποσο κοστιζει', 'τιμη', 'τιμες', 'κοστος', 'ποσο κανει', 'how much', 'pricing', 'price', 'τι πακετα υπαρχουν', 'ποια πακετα', 'πλανα', 'plans', 'συνδρομη', 'subscription']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'el', 'Πώς αλλάζω πλάνο;', 'Από τις Ρυθμίσεις > Χρέωση. Επιλέγεις το πλάνο που θέλεις και η αλλαγή ισχύει αμέσως. Σε αναβάθμιση πληρώνεις μόνο τη διαφορά για το υπόλοιπο της περιόδου· σε υποβάθμιση κρατάς το τρέχον πλάνο μέχρι να τελειώσει η περίοδος που έχεις ήδη πληρώσει.', 'billing', 1, true, array['πως αλλαζω πλανο', 'αλλαγη πλανου', 'αναβαθμιση', 'upgrade', 'downgrade', 'υποβαθμιση', 'change plan', 'αλλαξω συνδρομη']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'el', 'Πώς ακυρώνω τη συνδρομή μου;', 'Ρυθμίσεις > Χρέωση > Ακύρωση συνδρομής. Δεν χάνεις αμέσως την πρόσβαση: το πλάνο σου συνεχίζει μέχρι το τέλος της περιόδου που έχεις ήδη πληρώσει και μετά ο λογαριασμός πέφτει στο δωρεάν πλάνο. Τα δεδομένα σου μένουν — δεν διαγράφεται τίποτα με την ακύρωση.', 'billing', 2, true, array['πως ακυρωνω', 'ακυρωση', 'να ακυρωσω', 'cancel', 'unsubscribe', 'διακοπη συνδρομης', 'σταματησω τη συνδρομη']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invoices', 'el', 'Πού βρίσκω τις αποδείξεις μου;', 'Ρυθμίσεις > Χρέωση > Ιστορικό πληρωμών. Κάθε χρέωση έχει απόδειξη σε PDF που κατεβάζεις από εκεί. Οι πληρωμές γίνονται μέσω Stripe και δεν αποθηκεύουμε ποτέ τα στοιχεία της κάρτας σου.', 'billing', 3, true, array['αποδειξη', 'αποδειξεις', 'τιμολογιο', 'invoice', 'receipt', 'ιστορικο πληρωμων']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('refund', 'el', 'Μπορώ να ζητήσω επιστροφή χρημάτων;', 'Ναι — γράψε μας τι έγινε και θα το δούμε. Αν χρεώθηκες κατά λάθος ή κάτι δεν δούλεψε όπως έπρεπε, το διορθώνουμε. Στείλε μήνυμα από τις Ρυθμίσεις > Υποστήριξη με τον αριθμό της χρέωσης.', 'billing', 4, true, array['επιστροφη χρηματων', 'refund', 'να μου επιστρεψετε', 'χρεωθηκα λαθος']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'el', 'Τι είναι τα credits;', 'Τα credits είναι το νόμισμα με το οποίο πληρώνεις τις ενέργειες AI: ένα μήνυμα στο chat, μια δημιουργία website, μια εκτέλεση agent. Κάθε πλάνο δίνει ένα μηνιαίο απόθεμα που ανανεώνεται, και μπορείς να αγοράσεις έξτρα πακέτα αν τελειώσουν νωρίτερα. Πόσα δίνει το κάθε πλάνο θα το δεις στο /pricing.', 'credits', 0, true, array['τι ειναι τα credits', 'τι ειναι credits', 'credits', 'μοναδες', 'what are credits', 'πως δουλευουν τα credits']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credit-cost-per-action', 'el', 'Πόσα credits κοστίζει κάθε ενέργεια;', 'Η χρέωση δεν είναι σταθερή ανά ενέργεια — υπολογίζεται από το πραγματικό κόστος της κάθε κλήσης, οπότε ένα σύντομο μήνυμα κοστίζει λιγότερο από ένα μεγάλο. Πριν από κάθε ακριβή ενέργεια βλέπεις εκτίμηση, και μετά την ολοκλήρωση βλέπεις την πραγματική χρέωση στο ιστορικό σου.', 'credits', 1, true, array['ποσα credits κοστιζει', 'ποσο χρεωνει', 'ποσα credits χρειαζονται', 'χρεωση ανα', 'how many credits', 'credit cost']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'el', 'Τελείωσαν τα credits μου — τι κάνω;', 'Δύο επιλογές: περιμένεις την επόμενη μηνιαία ανανέωση, ή αγοράζεις ένα πακέτο credits που προστίθεται αμέσως και δεν λήγει στο τέλος του μήνα. Και τα δύο γίνονται από τις Ρυθμίσεις > Χρέωση.', 'credits', 2, true, array['τελειωσαν τα credits', 'δεν εχω credits', 'εξαντληθηκαν', 'ran out of credits', 'πως αγοραζω credits', 'να παρω credits']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-rollover', 'el', 'Μεταφέρονται τα credits στον επόμενο μήνα;', 'Τα μηνιαία credits του πλάνου ανανεώνονται κάθε μήνα και δεν συσσωρεύονται. Τα credits που αγοράζεις σε πακέτο είναι διαφορετικά: μένουν στον λογαριασμό σου μέχρι να τα χρησιμοποιήσεις.', 'credits', 3, true, array['μεταφερονται', 'rollover', 'χανονται τα credits', 'συσσωρευονται', 'expire credits']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'el', 'Πώς φτιάχνω website;', 'Πήγαινε στο Website Builder από το πλαϊνό μενού, γράψε με απλά λόγια τι θέλεις (τι κάνει η επιχείρησή σου, σε ποιον απευθύνεται, τι ύφος θες) και πάτα δημιουργία. Μπορείς να ανεβάσεις και εικόνες αναφοράς — λογότυπο, φωτογραφίες προϊόντων — για να ακολουθήσει το στυλ σου. Όταν είναι έτοιμο, το δημοσιεύεις σε δική του διεύθυνση με ένα κλικ.', 'websites', 0, true, array['πως φτιαχνω website', 'πως φτιαχνω ιστοσελιδα', 'δημιουργια website', 'create website', 'θελω ενα site', 'website builder', 'ιστοσελιδα']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('publish-website', 'el', 'Πώς δημοσιεύω το website μου;', 'Από το Website Builder, άνοιξε το site και πάτα Δημοσίευση. Διαλέγεις ένα όνομα για τη διεύθυνση και το site γίνεται αμέσως ζωντανό. Κάθε δημοσίευση κρατιέται σαν έκδοση, οπότε μπορείς να γυρίσεις πίσω σε προηγούμενη αν χρειαστεί.', 'websites', 1, true, array['πως δημοσιευω', 'publish', 'να το ανεβασω', 'live site', 'δημοσιευση site']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'el', 'Πώς φτιάχνω agent;', 'Στο μενού Agents, περίγραψε σε μία πρόταση τι θέλεις να κάνει και κάθε πότε — π.χ. «κάθε πρωί στείλε μου περίληψη των νέων του κλάδου μου». Το Ionexa φτιάχνει τον agent μόνο του, τον τρέχει στην ώρα του και σου στέλνει το αποτέλεσμα. Μπορείς να τον σταματήσεις ή να τον αλλάξεις όποτε θες.', 'agents', 0, true, array['πως φτιαχνω agent', 'δημιουργια agent', 'create agent', 'αυτοματοποιηση', 'agents', 'θελω εναν agent']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'el', 'Πώς φτιάχνω mission;', 'Στο Mission Control γράφεις έναν στόχο όπως θα τον έλεγες σε άνθρωπο — «θέλω περισσότερους πελάτες μέχρι την άνοιξη». Το Ionexa τον σπάει σε συγκεκριμένα βήματα, και μετά μπορείς να τα δουλέψεις μόνος σου ή να αναθέσεις κάποια σε agent.', 'missions', 0, true, array['πως φτιαχνω mission', 'mission control', 'στοχος', 'στοχους', 'create mission', 'missions']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invite-code', 'el', 'Πού βάζω τον κωδικό πρόσκλησης;', 'Στη φόρμα εγγραφής υπάρχει πεδίο για κωδικό πρόσκλησης. Αν έχεις ήδη λογαριασμό, τον καταχωρείς από τις Ρυθμίσεις > Λογαριασμός. Μόλις περάσει, τα προνόμια που δίνει ενεργοποιούνται αμέσως στον λογαριασμό σου.', 'account', 0, true, array['κωδικος προσκλησης', 'invite code', 'beta code', 'κωδικο beta', 'που βαζω τον κωδικο', 'προσκληση']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'el', 'Θυμάται το chat προηγούμενες συνομιλίες;', 'Μέσα στην ίδια συνομιλία θυμάται πάντα τα προηγούμενα μηνύματα. Ανάμεσα σε διαφορετικές συνομιλίες κρατά μόνο μόνιμα χρήσιμα στοιχεία — όνομα, επάγγελμα, προτιμήσεις — και αυτό υπάρχει στα επί πληρωμή πλάνα. Μπορείς να δεις ό,τι έχει κρατήσει, και να το σβήσεις, από τις Ρυθμίσεις > Μνήμη.', 'chat', 0, true, array['θυμαται', 'μνημη', 'memory', 'προηγουμενες συνομιλιες', 'ξεχναει', 'δεν θυμαται']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'el', 'Μπορώ να ανεβάσω αρχεία;', 'Ναι — PDF, Word, Excel, CSV, κείμενο και Markdown. Τα ανεβάζεις στο Files, το Ionexa διαβάζει το περιεχόμενό τους και μετά μπορείς να κάνεις ερωτήσεις πάνω σε αυτά. Τα αρχεία σου είναι ιδιωτικά: κανείς άλλος δεν έχει πρόσβαση και κάθε κατέβασμα γίνεται με προσωρινό σύνδεσμο.', 'files', 0, true, array['ανεβασω αρχειο', 'upload', 'pdf', 'αρχεια', 'files', 'εγγραφα']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'el', 'Πώς συνδέω Gmail ή Google Drive;', 'Ρυθμίσεις > Συνδέσεις. Διαλέγεις την υπηρεσία και εγκρίνεις την πρόσβαση στο παράθυρο της Google. Βλέπεις ακριβώς τι θα διαβάζει πριν το εγκρίνεις, και μπορείς να αποσυνδέσεις όποτε θες — τότε τα κλειδιά πρόσβασης διαγράφονται αμέσως.', 'integrations', 0, true, array['gmail', 'google drive', 'συνδεση', 'integration', 'slack', 'πως συνδεω', 'connect']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('languages', 'el', 'Σε ποιες γλώσσες δουλεύει;', 'Το περιβάλλον υπάρχει σε δέκα γλώσσες και το αλλάζεις από τις Ρυθμίσεις. Το AI απαντά στη γλώσσα που του γράφεις, ανεξάρτητα από τη γλώσσα του περιβάλλοντος.', 'getting-started', 0, true, array['γλωσσα', 'γλωσσες', 'language', 'αγγλικα', 'ελληνικα', 'μεταφραση']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'el', 'Πώς διαγράφω τον λογαριασμό μου;', 'Ρυθμίσεις > Λογαριασμός > Διαγραφή λογαριασμού. Θα σου ζητηθεί επιβεβαίωση, και μετά διαγράφονται όλα: συνομιλίες, αρχεία, websites, agents, ιστορικό. Δεν είναι αναστρέψιμο. Αν θέλεις πρώτα αντίγραφο, κατέβασε τα δεδομένα σου από την ίδια σελίδα.', 'privacy', 0, true, array['διαγραφη λογαριασμου', 'delete account', 'να σβησω τον λογαριασμο', 'κλεισιμο λογαριασμου']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('export-data', 'el', 'Μπορώ να κατεβάσω τα δεδομένα μου;', 'Ναι. Ρυθμίσεις > Λογαριασμός > Εξαγωγή δεδομένων. Παίρνεις ένα αρχείο με όλα όσα έχεις δημιουργήσει — συνομιλίες, missions, websites, αρχεία, ιστορικό χρεώσεων. Τα κλειδιά πρόσβασης των συνδεδεμένων λογαριασμών εξαιρούνται για λόγους ασφάλειας.', 'privacy', 1, true, array['κατεβασω τα δεδομενα', 'export', 'εξαγωγη', 'gdpr', 'αντιγραφο δεδομενων']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'el', 'Τι κάνετε με τα δεδομένα μου;', 'Τα δεδομένα σου είναι δικά σου. Δεν τα πουλάμε, δεν τα χρησιμοποιούμε για εκπαίδευση μοντέλων, και κάθε λογαριασμός βλέπει μόνο τα δικά του — αυτό επιβάλλεται στη βάση, όχι μόνο στην εφαρμογή. Μπορείς να τα κατεβάσεις ή να τα διαγράψεις όποτε θες.', 'privacy', 2, true, array['δεδομενα μου', 'ιδιωτικοτητα', 'privacy', 'ασφαλεια', 'τα πουλατε', 'εκπαιδευση μοντελων']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('password-reset', 'el', 'Ξέχασα τον κωδικό μου.', 'Στη σελίδα σύνδεσης πάτα «Ξέχασα τον κωδικό μου» και βάλε το email σου. Θα σου έρθει σύνδεσμος επαναφοράς. Αν δεν φτάνει, κοίτα και στα ανεπιθύμητα.', 'account', 1, true, array['ξεχασα τον κωδικο', 'password', 'reset password', 'επαναφορα κωδικου', 'δεν μπορω να μπω']::text[], '/login')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('team-members', 'el', 'Μπορώ να προσθέσω άτομα από την ομάδα μου;', 'Ναι, στα πλάνα που περιλαμβάνουν ομάδα. Ρυθμίσεις > Ομάδα, προσκαλείς με email και το άτομο μπαίνει στον ίδιο χώρο εργασίας. Ποια πλάνα το έχουν και πόσες θέσεις δίνουν θα το δεις στο /pricing.', 'account', 2, true, array['ομαδα', 'team', 'συνεργατες', 'προσκληση μελους', 'collaboration', 'χρηστες']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('notifications', 'el', 'Πώς ρυθμίζω τις ειδοποιήσεις;', 'Ρυθμίσεις > Ειδοποιήσεις. Ξεχωριστά για email και για ειδοποιήσεις στο κινητό, και ανά τύπο — αποτελέσματα agent, υπενθυμίσεις, χαμηλά credits. Οι κρίσιμες ειδοποιήσεις ασφαλείας δεν απενεργοποιούνται.', 'account', 3, true, array['ειδοποιησεις', 'notifications', 'email ειδοποιησεις', 'push', 'να μη μου στελνετε']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('mobile-app', 'el', 'Υπάρχει εφαρμογή για κινητό;', 'Το Ionexa εγκαθίσταται στο κινητό σου απευθείας από τον browser — άνοιξέ το και διάλεξε «Προσθήκη στην αρχική οθόνη». Λειτουργεί σαν κανονική εφαρμογή, με εικονίδιο και ειδοποιήσεις, χωρίς να περάσεις από app store.', 'getting-started', 1, true, array['εφαρμογη κινητου', 'mobile app', 'android', 'iphone', 'ios', 'κινητο', 'app']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'el', 'Τι είναι το Ionexa;', 'Ένας χώρος εργασίας όπου λες τι θέλεις και γίνεται: φτιάχνει websites, τρέχει agents που δουλεύουν μόνοι τους σε πρόγραμμα, σπάει στόχους σε βήματα, διαβάζει τα αρχεία σου και απαντά πάνω σε αυτά. Αντί για δέκα ξεχωριστά εργαλεία που δεν μιλάνε μεταξύ τους, ένα που τα ξέρει όλα.', 'getting-started', 2, true, array['τι ειναι το ionexa', 'what is ionexa', 'τι κανει', 'τι προσφερετε', 'about']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('contact-support', 'el', 'Πώς επικοινωνώ με άνθρωπο;', 'Ρυθμίσεις > Υποστήριξη, και γράψε μας. Αν το θέμα αφορά χρέωση, βάλε και τον αριθμό της χρέωσης για να το βρούμε γρήγορα.', 'account', 4, true, array['επικοινωνια', 'support', 'ανθρωπο', 'υποστηριξη', 'contact', 'να μιλησω με καποιον']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'es', '¿Qué es Ionexa?', 'Un espacio de trabajo donde la IA hace el trabajo en vez de solo aconsejarle: crea su web, ejecuta agentes con una periodicidad fija, divide sus objetivos en pasos, lee sus archivos y responde sobre ellos, y guarda todo lo que registra en un único sitio donde se puede buscar.', 'getting-started', 2, true, array['qué es ionexa', 'qué es esto', 'para qué sirve', 'qué hace', 'cómo funciona']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'es', '¿Cuánto cuesta Ionexa?', 'Hay un plan gratuito para probarlo y planes de pago según crecen sus necesidades. Los precios actuales y lo que incluye cada uno están siempre en la página /pricing: no se escriben aquí porque cambian y una cifra obsoleta es peor que ninguna.', 'billing', 0, true, array['cuánto cuesta', 'precio', 'precios', 'planes', 'suscripción']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'es', '¿Qué son los créditos?', 'Los créditos son la moneda con la que se pagan las acciones de IA: un mensaje de chat, generar una web, la ejecución de un agente. Cada plan incluye una asignación mensual que se renueva, y puede comprar paquetes extra si se le acaban antes. Cuánto incluye cada plan está en /pricing.', 'credits', 0, true, array['qué son los créditos', 'créditos', 'cómo funcionan los créditos', 'unidades']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'es', 'Me he quedado sin créditos, ¿y ahora?', 'Dos opciones: esperar a la renovación mensual, o comprar un paquete de créditos, que se añade al momento y no caduca a fin de mes. Ambas están en Ajustes > Facturación.', 'credits', 2, true, array['sin créditos', 'se me acabaron los créditos', 'comprar créditos', 'más créditos']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'es', '¿Cómo cambio de plan?', 'Ajustes > Facturación. Elija el plan que quiera y el cambio se aplica de inmediato. En una mejora paga solo la diferencia del resto del periodo; en una bajada mantiene el plan actual hasta que termine el periodo ya pagado.', 'billing', 1, true, array['cambiar de plan', 'mejorar plan', 'bajar de plan', 'cambiar suscripción']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'es', '¿Cómo cancelo mi suscripción?', 'Ajustes > Facturación > Cancelar suscripción. No pierde el acceso al instante: su plan sigue hasta el final del periodo ya pagado y luego la cuenta pasa al plan gratuito. Sus datos se quedan; cancelar no borra nada.', 'billing', 2, true, array['cancelar', 'cancelar suscripción', 'darme de baja', 'anular suscripción']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'es', '¿Cómo hago una web?', 'Abra Website Builder en el menú lateral, escriba con palabras normales qué quiere —a qué se dedica su negocio, a quién se dirige, qué estilo le gusta— y pulse crear. También puede subir imágenes de referencia, un logotipo o fotos de producto, para que siga su estilo. Cuando esté lista la publica en su propia dirección con un clic.', 'websites', 0, true, array['hacer una web', 'crear web', 'página web', 'quiero un sitio', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'es', '¿Cómo creo un agente?', 'En el menú Agentes, describa en una frase qué quiere que se haga y cada cuánto: por ejemplo «cada mañana envíame un resumen de las noticias de mi sector». Ionexa construye el agente solo, lo ejecuta a su hora y le envía el resultado. Puede pausarlo o cambiarlo cuando quiera.', 'agents', 0, true, array['crear agente', 'hacer un agente', 'agentes', 'automatizar', 'automatización']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'es', '¿Cómo creo una misión?', 'En Mission Control escribe un objetivo como se lo diría a una persona: «quiero más clientes para la primavera». Ionexa lo divide en pasos concretos, y luego puede trabajarlos usted o encargar alguno a un agente.', 'missions', 0, true, array['crear misión', 'mission control', 'objetivo', 'objetivos', 'misiones']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'es', '¿Puedo subir archivos?', 'Sí: PDF, Word, Excel, CSV, texto y Markdown. Los sube en Archivos, Ionexa lee su contenido y después puede hacer preguntas sobre ellos. Sus archivos son privados: nadie más tiene acceso y cada descarga usa un enlace temporal.', 'files', 0, true, array['subir archivo', 'subir', 'pdf', 'archivos', 'documentos']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'es', '¿Cómo conecto Gmail o Google Drive?', 'Ajustes > Conexiones. Elija el servicio y apruebe el acceso en la ventana de Google. Ve exactamente qué va a leer antes de aprobarlo, y puede desconectarlo cuando quiera: las claves de acceso se borran de inmediato.', 'integrations', 0, true, array['gmail', 'google drive', 'conectar', 'conexión', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'es', '¿Qué hacen con mis datos?', 'Sus datos son suyos. No los vendemos, no los usamos para entrenar modelos, y cada cuenta ve solo los suyos: eso se aplica en la base de datos, no solo en la aplicación. Puede descargarlos o borrarlos cuando quiera.', 'privacy', 2, true, array['mis datos', 'privacidad', 'seguridad', 'venden mis datos', 'entrenar modelos']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'es', '¿Cómo borro mi cuenta?', 'Ajustes > Cuenta > Eliminar cuenta. Se le pedirá confirmación y después se borra todo: conversaciones, archivos, webs, agentes, historial. No tiene vuelta atrás. Si quiere una copia antes, descargue sus datos desde la misma página.', 'privacy', 0, true, array['borrar cuenta', 'eliminar cuenta', 'cerrar cuenta', 'darme de baja del todo']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'es', '¿El chat recuerda conversaciones anteriores?', 'Dentro de una misma conversación siempre recuerda los mensajes anteriores. Entre conversaciones distintas guarda solo lo que sigue siendo útil — su nombre, a qué se dedica, sus preferencias — y eso está en los planes de pago. Puede ver todo lo que ha guardado, y borrarlo, en Ajustes > Memoria.', 'chat', 0, true, array['recuerda', 'memoria', 'conversaciones anteriores', 'se olvida', 'no recuerda', 'historial del chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'fr', 'Qu''est-ce qu''Ionexa ?', 'Un espace de travail où l''IA fait le travail au lieu de seulement conseiller : elle crée votre site, exécute des agents selon un calendrier, découpe vos objectifs en étapes, lit vos fichiers et répond à vos questions dessus, et conserve tout ce que vous consignez en un seul endroit consultable.', 'getting-started', 2, true, array['qu''est-ce qu''ionexa', 'c''est quoi', 'à quoi ça sert', 'que fait-il', 'comment ça marche']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'fr', 'Combien coûte Ionexa ?', 'Il y a une formule gratuite pour essayer, et des formules payantes à mesure que vos besoins grandissent. Les tarifs actuels et ce que chacune comprend sont toujours sur la page /pricing : ils ne sont pas écrits ici parce qu''ils changent, et un chiffre périmé vaut moins que pas de chiffre.', 'billing', 0, true, array['combien ça coûte', 'prix', 'tarif', 'tarifs', 'formules', 'abonnement']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'fr', 'Que sont les crédits ?', 'Les crédits sont la monnaie avec laquelle vous payez les actions d''IA : un message de chat, la génération d''un site, l''exécution d''un agent. Chaque formule comprend une allocation mensuelle qui se renouvelle, et vous pouvez acheter des packs si elle s''épuise plus tôt. Ce que comprend chaque formule est sur /pricing.', 'credits', 0, true, array['que sont les crédits', 'crédits', 'comment marchent les crédits', 'unités']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'fr', 'Je n''ai plus de crédits, que faire ?', 'Deux possibilités : attendre le renouvellement mensuel, ou acheter un pack de crédits, ajouté immédiatement et qui n''expire pas en fin de mois. Les deux se font dans Paramètres > Facturation.', 'credits', 2, true, array['plus de crédits', 'crédits épuisés', 'acheter des crédits', 'recharger']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'fr', 'Comment changer de formule ?', 'Paramètres > Facturation. Choisissez la formule voulue et le changement prend effet immédiatement. En montée de gamme vous ne payez que la différence pour le reste de la période ; en descente vous gardez la formule actuelle jusqu''à la fin de la période déjà payée.', 'billing', 1, true, array['changer de formule', 'changer d''offre', 'passer au supérieur', 'rétrograder']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'fr', 'Comment résilier mon abonnement ?', 'Paramètres > Facturation > Résilier l''abonnement. Vous ne perdez pas l''accès tout de suite : votre formule court jusqu''à la fin de la période déjà payée, puis le compte passe à la formule gratuite. Vos données restent — résilier ne supprime rien.', 'billing', 2, true, array['résilier', 'annuler l''abonnement', 'me désabonner', 'arrêter l''abonnement']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'fr', 'Comment créer un site ?', 'Ouvrez Website Builder dans le menu latéral, écrivez en langage courant ce que vous voulez — ce que fait votre activité, à qui elle s''adresse, quel style vous plaît — et lancez la création. Vous pouvez aussi téléverser des images de référence, un logo ou des photos de produits, pour qu''il suive votre identité. Une fois prêt, vous le publiez à sa propre adresse en un clic.', 'websites', 0, true, array['créer un site', 'faire un site', 'site web', 'je veux un site', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'fr', 'Comment créer un agent ?', 'Dans le menu Agents, décrivez en une phrase ce que vous voulez faire faire et à quelle fréquence — par exemple « chaque matin, envoie-moi un résumé de l''actualité de mon secteur ». Ionexa construit l''agent lui-même, l''exécute à l''heure dite et vous envoie le résultat. Vous pouvez le mettre en pause ou le modifier quand vous voulez.', 'agents', 0, true, array['créer un agent', 'faire un agent', 'agents', 'automatiser', 'automatisation']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'fr', 'Comment créer une mission ?', 'Dans Mission Control, vous écrivez un objectif comme vous le diriez à quelqu''un : « je veux plus de clients d''ici le printemps ». Ionexa le découpe en étapes concrètes, et vous pouvez ensuite les traiter vous-même ou en confier certaines à un agent.', 'missions', 0, true, array['créer une mission', 'mission control', 'objectif', 'objectifs', 'missions']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'fr', 'Puis-je téléverser des fichiers ?', 'Oui : PDF, Word, Excel, CSV, texte et Markdown. Vous les déposez dans Fichiers, Ionexa lit leur contenu, puis vous pouvez poser des questions dessus. Vos fichiers sont privés : personne d''autre n''y a accès et chaque téléchargement passe par un lien temporaire.', 'files', 0, true, array['téléverser', 'importer un fichier', 'pdf', 'fichiers', 'documents']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'fr', 'Comment connecter Gmail ou Google Drive ?', 'Paramètres > Connexions. Choisissez le service et approuvez l''accès dans la fenêtre de Google. Vous voyez exactement ce qui sera lu avant d''approuver, et vous pouvez déconnecter quand vous voulez — les clés d''accès sont alors supprimées immédiatement.', 'integrations', 0, true, array['gmail', 'google drive', 'connecter', 'connexion', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'fr', 'Que faites-vous de mes données ?', 'Vos données sont à vous. Nous ne les vendons pas, nous ne nous en servons pas pour entraîner des modèles, et chaque compte ne voit que les siennes — c''est imposé dans la base de données, pas seulement dans l''application. Vous pouvez les télécharger ou les supprimer quand vous voulez.', 'privacy', 2, true, array['mes données', 'confidentialité', 'sécurité', 'vous vendez mes données', 'entraîner des modèles']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'fr', 'Comment supprimer mon compte ?', 'Paramètres > Compte > Supprimer le compte. Une confirmation vous est demandée, puis tout est supprimé : conversations, fichiers, sites, agents, historique. C''est irréversible. Si vous voulez une copie avant, téléchargez vos données depuis la même page.', 'privacy', 0, true, array['supprimer mon compte', 'effacer mon compte', 'fermer mon compte', 'supprimer le compte']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'fr', 'Le chat se souvient-il des conversations précédentes ?', 'À l''intérieur d''une même conversation, il se souvient toujours des messages précédents. D''une conversation à l''autre, il ne garde que ce qui reste durablement utile — votre nom, votre métier, vos préférences — et cela existe sur les formules payantes. Vous pouvez voir tout ce qu''il a gardé, et le supprimer, dans Paramètres > Mémoire.', 'chat', 0, true, array['se souvient', 'mémoire', 'conversations précédentes', 'il oublie', 'il ne se souvient pas', 'historique du chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'de', 'Was ist Ionexa?', 'Ein Arbeitsbereich, in dem die KI die Arbeit macht statt nur zu beraten: sie baut deine Website, lässt Agents nach Zeitplan laufen, zerlegt deine Ziele in Schritte, liest deine Dateien und beantwortet Fragen dazu, und hält alles Erfasste an einem durchsuchbaren Ort.', 'getting-started', 2, true, array['was ist ionexa', 'was ist das', 'wofür ist das', 'was macht das', 'wie funktioniert das']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'de', 'Was kostet Ionexa?', 'Es gibt einen kostenlosen Tarif zum Ausprobieren und bezahlte Tarife, wenn die Anforderungen wachsen. Die aktuellen Preise und was jeder Tarif enthält stehen immer auf /pricing — hier nicht, weil sie sich ändern und eine veraltete Zahl schlechter ist als keine.', 'billing', 0, true, array['was kostet', 'preis', 'preise', 'tarife', 'abo', 'abonnement']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'de', 'Was sind Credits?', 'Credits sind die Währung, mit der du KI-Aktionen bezahlst: eine Chat-Nachricht, das Erzeugen einer Website, ein Agent-Lauf. Jeder Tarif enthält ein monatliches Kontingent, das sich erneuert, und du kannst Pakete nachkaufen, wenn es früher aufgebraucht ist. Wie viel jeder Tarif enthält, steht auf /pricing.', 'credits', 0, true, array['was sind credits', 'credits', 'wie funktionieren credits', 'einheiten']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'de', 'Meine Credits sind aufgebraucht — was jetzt?', 'Zwei Möglichkeiten: auf die monatliche Erneuerung warten oder ein Credit-Paket kaufen, das sofort gutgeschrieben wird und zum Monatsende nicht verfällt. Beides in Einstellungen > Abrechnung.', 'credits', 2, true, array['keine credits mehr', 'credits aufgebraucht', 'credits kaufen', 'mehr credits']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'de', 'Wie wechsle ich den Tarif?', 'Einstellungen > Abrechnung. Wähl den gewünschten Tarif, die Änderung gilt sofort. Beim Upgrade zahlst du nur die Differenz für den Rest der Periode; beim Downgrade behältst du den aktuellen Tarif bis zum Ende der bereits bezahlten Periode.', 'billing', 1, true, array['tarif wechseln', 'upgrade', 'downgrade', 'abo ändern']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'de', 'Wie kündige ich mein Abo?', 'Einstellungen > Abrechnung > Abo kündigen. Du verlierst den Zugang nicht sofort: dein Tarif läuft bis zum Ende der bereits bezahlten Periode, danach fällt das Konto auf den kostenlosen Tarif. Deine Daten bleiben — Kündigen löscht nichts.', 'billing', 2, true, array['kündigen', 'abo kündigen', 'abbestellen', 'abo beenden']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'de', 'Wie baue ich eine Website?', 'Öffne Website Builder in der Seitenleiste, schreib in normalen Worten, was du willst — was dein Geschäft macht, für wen es ist, welcher Stil dir gefällt — und starte die Erzeugung. Du kannst auch Referenzbilder hochladen, ein Logo oder Produktfotos, damit sie deinem Look folgt. Wenn sie fertig ist, veröffentlichst du sie mit einem Klick unter eigener Adresse.', 'websites', 0, true, array['website bauen', 'website erstellen', 'homepage', 'ich will eine seite', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'de', 'Wie erstelle ich einen Agent?', 'Im Menü Agents beschreibst du in einem Satz, was getan werden soll und wie oft — zum Beispiel "schick mir jeden Morgen eine Zusammenfassung der Branchennews". Ionexa baut den Agent selbst, lässt ihn pünktlich laufen und schickt dir das Ergebnis. Du kannst ihn jederzeit pausieren oder ändern.', 'agents', 0, true, array['agent erstellen', 'agent bauen', 'agents', 'automatisieren', 'automatisierung']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'de', 'Wie erstelle ich eine Mission?', 'In Mission Control schreibst du ein Ziel so, wie du es einem Menschen sagen würdest: "ich will bis zum Frühjahr mehr Kunden". Ionexa zerlegt es in konkrete Schritte, und du kannst sie dann selbst abarbeiten oder einzelne an einen Agent übergeben.', 'missions', 0, true, array['mission erstellen', 'mission control', 'ziel', 'ziele', 'missionen']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'de', 'Kann ich Dateien hochladen?', 'Ja — PDF, Word, Excel, CSV, Text und Markdown. Du lädst sie unter Dateien hoch, Ionexa liest ihren Inhalt, und danach kannst du Fragen dazu stellen. Deine Dateien sind privat: niemand sonst hat Zugriff, und jeder Download läuft über einen temporären Link.', 'files', 0, true, array['datei hochladen', 'hochladen', 'pdf', 'dateien', 'dokumente']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'de', 'Wie verbinde ich Gmail oder Google Drive?', 'Einstellungen > Verbindungen. Wähl den Dienst und bestätige den Zugriff in Googles eigenem Fenster. Du siehst vor der Bestätigung genau, was gelesen wird, und kannst jederzeit trennen — die Zugriffsschlüssel werden dann sofort gelöscht.', 'integrations', 0, true, array['gmail', 'google drive', 'verbinden', 'integration', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'de', 'Was macht ihr mit meinen Daten?', 'Deine Daten gehören dir. Wir verkaufen sie nicht, wir trainieren keine Modelle damit, und jedes Konto sieht nur die eigenen — das wird in der Datenbank erzwungen, nicht bloß in der Anwendung. Du kannst sie jederzeit herunterladen oder löschen.', 'privacy', 2, true, array['meine daten', 'datenschutz', 'sicherheit', 'verkauft ihr meine daten', 'modelle trainieren']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'de', 'Wie lösche ich mein Konto?', 'Einstellungen > Konto > Konto löschen. Du wirst um Bestätigung gebeten, danach ist alles weg: Unterhaltungen, Dateien, Websites, Agents, Verlauf. Das lässt sich nicht rückgängig machen. Wenn du vorher eine Kopie willst, lad deine Daten auf derselben Seite herunter.', 'privacy', 0, true, array['konto löschen', 'account löschen', 'konto schließen', 'profil löschen']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'de', 'Merkt sich der Chat frühere Unterhaltungen?', 'Innerhalb einer Unterhaltung merkt er sich die früheren Nachrichten immer. Zwischen verschiedenen Unterhaltungen behält er nur dauerhaft Nützliches — deinen Namen, was du machst, deine Vorlieben — und das gibt es in den bezahlten Tarifen. Was er behalten hat, kannst du unter Einstellungen > Erinnerung ansehen und löschen.', 'chat', 0, true, array['merkt sich', 'erinnert sich', 'gedächtnis', 'frühere unterhaltungen', 'vergisst', 'chatverlauf']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'it', 'Che cos''è Ionexa?', 'Uno spazio di lavoro dove l''AI fa il lavoro invece di limitarsi a consigliare: crea il tuo sito, esegue agent secondo una pianificazione, divide i tuoi obiettivi in passi, legge i tuoi file e risponde su di essi, e tiene tutto ciò che registri in un unico posto ricercabile.', 'getting-started', 2, true, array['cos''è ionexa', 'che cos''è', 'a cosa serve', 'cosa fa', 'come funziona']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'it', 'Quanto costa Ionexa?', 'C''è un piano gratuito per provarlo e piani a pagamento man mano che le esigenze crescono. I prezzi attuali e cosa include ciascuno sono sempre sulla pagina /pricing: non li scriviamo qui perché cambiano e un numero vecchio è peggio di nessun numero.', 'billing', 0, true, array['quanto costa', 'prezzo', 'prezzi', 'piani', 'abbonamento']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'it', 'Cosa sono i credits?', 'I credits sono la moneta con cui paghi le azioni AI: un messaggio in chat, la generazione di un sito, l''esecuzione di un agent. Ogni piano include una dotazione mensile che si rinnova, e puoi comprare pacchetti extra se finisce prima. Quanto include ogni piano è su /pricing.', 'credits', 0, true, array['cosa sono i credits', 'credits', 'come funzionano i credits', 'unità']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'it', 'Ho finito i credits, e adesso?', 'Due possibilità: aspettare il rinnovo mensile, oppure comprare un pacchetto di credits, che viene aggiunto subito e non scade a fine mese. Entrambe si trovano in Impostazioni > Fatturazione.', 'credits', 2, true, array['finiti i credits', 'senza credits', 'comprare credits', 'altri credits']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'it', 'Come cambio piano?', 'Impostazioni > Fatturazione. Scegli il piano che vuoi e il cambio ha effetto subito. In caso di passaggio superiore paghi solo la differenza per il resto del periodo; scendendo mantieni il piano attuale fino alla fine del periodo già pagato.', 'billing', 1, true, array['cambiare piano', 'passare a un piano superiore', 'downgrade', 'cambiare abbonamento']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'it', 'Come annullo l''abbonamento?', 'Impostazioni > Fatturazione > Annulla abbonamento. Non perdi subito l''accesso: il piano prosegue fino alla fine del periodo già pagato e poi l''account passa al piano gratuito. I tuoi dati restano — annullare non cancella niente.', 'billing', 2, true, array['annullare', 'disdire l''abbonamento', 'cancellare abbonamento', 'disiscrivermi']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'it', 'Come faccio un sito?', 'Apri Website Builder dal menù laterale, scrivi a parole tue cosa vuoi — cosa fa la tua attività, a chi si rivolge, che stile ti piace — e avvia la creazione. Puoi anche caricare immagini di riferimento, un logo o foto di prodotto, così segue il tuo stile. Quando è pronto lo pubblichi a un indirizzo suo con un clic.', 'websites', 0, true, array['fare un sito', 'creare sito', 'sito web', 'voglio un sito', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'it', 'Come creo un agent?', 'Nel menù Agent, descrivi in una frase cosa vuoi che venga fatto e ogni quanto — per esempio «ogni mattina mandami un riassunto delle notizie del mio settore». Ionexa costruisce l''agent da sé, lo esegue in orario e ti manda il risultato. Puoi metterlo in pausa o modificarlo quando vuoi.', 'agents', 0, true, array['creare agent', 'fare un agent', 'agent', 'automatizzare', 'automazione']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'it', 'Come creo una mission?', 'In Mission Control scrivi un obiettivo come lo diresti a una persona: «voglio più clienti entro la primavera». Ionexa lo divide in passi concreti, e poi puoi lavorarli tu o affidarne qualcuno a un agent.', 'missions', 0, true, array['creare mission', 'mission control', 'obiettivo', 'obiettivi', 'mission']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'it', 'Posso caricare file?', 'Sì — PDF, Word, Excel, CSV, testo e Markdown. Li carichi in File, Ionexa ne legge il contenuto e poi puoi fare domande su di essi. I tuoi file sono privati: nessun altro vi ha accesso e ogni download usa un link temporaneo.', 'files', 0, true, array['caricare file', 'caricare', 'pdf', 'file', 'documenti']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'it', 'Come collego Gmail o Google Drive?', 'Impostazioni > Connessioni. Scegli il servizio e approva l''accesso nella finestra di Google. Vedi esattamente cosa verrà letto prima di approvare, e puoi scollegare quando vuoi — le chiavi di accesso vengono cancellate subito.', 'integrations', 0, true, array['gmail', 'google drive', 'collegare', 'connessione', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'it', 'Cosa fate con i miei dati?', 'I tuoi dati sono tuoi. Non li vendiamo, non li usiamo per addestrare modelli, e ogni account vede solo i propri — è imposto nel database, non solo nell''applicazione. Puoi scaricarli o cancellarli quando vuoi.', 'privacy', 2, true, array['i miei dati', 'privacy', 'sicurezza', 'vendete i miei dati', 'addestrare modelli']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'it', 'Come cancello il mio account?', 'Impostazioni > Account > Elimina account. Ti verrà chiesta conferma, poi viene cancellato tutto: conversazioni, file, siti, agent, cronologia. Non è reversibile. Se prima vuoi una copia, scarica i tuoi dati dalla stessa pagina.', 'privacy', 0, true, array['cancellare account', 'eliminare account', 'chiudere l''account', 'cancellare profilo']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'it', 'La chat ricorda le conversazioni precedenti?', 'All''interno della stessa conversazione ricorda sempre i messaggi precedenti. Tra conversazioni diverse conserva solo ciò che resta utile a lungo — il suo nome, di cosa si occupa, le sue preferenze — e questo è disponibile nei piani a pagamento. Può vedere tutto ciò che ha conservato, ed eliminarlo, in Impostazioni > Memoria.', 'chat', 0, true, array['ricorda', 'memoria', 'conversazioni precedenti', 'dimentica', 'non ricorda', 'cronologia della chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'pt', 'O que é o Ionexa?', 'Um espaço de trabalho onde a IA faz o trabalho em vez de apenas aconselhar: cria o seu site, corre agentes segundo um horário, divide os seus objetivos em passos, lê os seus ficheiros e responde sobre eles, e guarda tudo o que regista num único sítio pesquisável.', 'getting-started', 2, true, array['o que é o ionexa', 'o que é isto', 'para que serve', 'o que faz', 'como funciona']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'pt', 'Quanto custa o Ionexa?', 'Há um plano gratuito para experimentar e planos pagos à medida que as necessidades crescem. Os preços atuais e o que cada um inclui estão sempre na página /pricing — não são escritos aqui porque mudam, e um número desatualizado é pior do que número nenhum.', 'billing', 0, true, array['quanto custa', 'preço', 'preços', 'planos', 'subscrição']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'pt', 'O que são os créditos?', 'Os créditos são a moeda com que paga as ações de IA: uma mensagem no chat, gerar um site, a execução de um agente. Cada plano inclui uma dotação mensal que se renova, e pode comprar pacotes extra se acabarem antes. Quanto inclui cada plano está em /pricing.', 'credits', 0, true, array['o que são créditos', 'créditos', 'como funcionam os créditos', 'unidades']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'pt', 'Fiquei sem créditos — e agora?', 'Duas opções: esperar pela renovação mensal, ou comprar um pacote de créditos, que é adicionado de imediato e não expira no fim do mês. Ambas em Definições > Faturação.', 'credits', 2, true, array['sem créditos', 'créditos acabaram', 'comprar créditos', 'mais créditos']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'pt', 'Como mudo de plano?', 'Definições > Faturação. Escolha o plano que quer e a mudança aplica-se de imediato. Numa subida paga apenas a diferença do resto do período; numa descida mantém o plano atual até terminar o período já pago.', 'billing', 1, true, array['mudar de plano', 'subir de plano', 'descer de plano', 'mudar subscrição']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'pt', 'Como cancelo a minha subscrição?', 'Definições > Faturação > Cancelar subscrição. Não perde o acesso de imediato: o plano segue até ao fim do período já pago e depois a conta passa ao plano gratuito. Os seus dados ficam — cancelar não apaga nada.', 'billing', 2, true, array['cancelar', 'cancelar subscrição', 'anular subscrição', 'terminar subscrição']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'pt', 'Como faço um site?', 'Abra o Website Builder no menu lateral, escreva por palavras suas o que quer — o que faz o seu negócio, a quem se dirige, que estilo gosta — e carregue em criar. Também pode carregar imagens de referência, um logótipo ou fotografias de produto, para seguir o seu estilo. Quando estiver pronto publica-o num endereço próprio com um clique.', 'websites', 0, true, array['fazer um site', 'criar site', 'página web', 'quero um site', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'pt', 'Como crio um agente?', 'No menu Agentes, descreva numa frase o que quer que seja feito e com que frequência — por exemplo «todas as manhãs envia-me um resumo das notícias do meu setor». O Ionexa constrói o agente sozinho, corre-o à hora certa e envia-lhe o resultado. Pode pausá-lo ou alterá-lo quando quiser.', 'agents', 0, true, array['criar agente', 'fazer um agente', 'agentes', 'automatizar', 'automatização']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'pt', 'Como crio uma missão?', 'No Mission Control escreve um objetivo como o diria a uma pessoa: «quero mais clientes até à primavera». O Ionexa divide-o em passos concretos, e depois pode trabalhá-los você ou entregar alguns a um agente.', 'missions', 0, true, array['criar missão', 'mission control', 'objetivo', 'objetivos', 'missões']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'pt', 'Posso carregar ficheiros?', 'Sim — PDF, Word, Excel, CSV, texto e Markdown. Carrega-os em Ficheiros, o Ionexa lê o conteúdo e depois pode fazer perguntas sobre eles. Os seus ficheiros são privados: mais ninguém tem acesso e cada descarga usa uma ligação temporária.', 'files', 0, true, array['carregar ficheiro', 'carregar', 'pdf', 'ficheiros', 'documentos']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'pt', 'Como ligo o Gmail ou o Google Drive?', 'Definições > Ligações. Escolha o serviço e aprove o acesso na janela da Google. Vê exatamente o que vai ser lido antes de aprovar, e pode desligar quando quiser — as chaves de acesso são apagadas de imediato.', 'integrations', 0, true, array['gmail', 'google drive', 'ligar', 'ligação', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'pt', 'O que fazem com os meus dados?', 'Os seus dados são seus. Não os vendemos, não os usamos para treinar modelos, e cada conta vê apenas os seus — isso é imposto na base de dados, não só na aplicação. Pode descarregá-los ou apagá-los quando quiser.', 'privacy', 2, true, array['os meus dados', 'privacidade', 'segurança', 'vendem os meus dados', 'treinar modelos']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'pt', 'Como apago a minha conta?', 'Definições > Conta > Eliminar conta. Ser-lhe-á pedida confirmação e depois apaga-se tudo: conversas, ficheiros, sites, agentes, histórico. Não é reversível. Se quiser uma cópia antes, descarregue os seus dados na mesma página.', 'privacy', 0, true, array['apagar conta', 'eliminar conta', 'fechar conta', 'apagar perfil']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'pt', 'O chat lembra-se de conversas anteriores?', 'Dentro da mesma conversa lembra-se sempre das mensagens anteriores. Entre conversas diferentes guarda apenas o que continua a ser útil — o seu nome, o que faz, as suas preferências — e isso existe nos planos pagos. Pode ver tudo o que guardou, e apagá-lo, em Definições > Memória.', 'chat', 0, true, array['lembra', 'memória', 'conversas anteriores', 'esquece', 'não se lembra', 'histórico do chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'zh', 'Ionexa 是什么？', '一个由 AI 直接干活、而不只是给建议的工作空间：它替你做网站、按时运行 agent、把目标拆成步骤、读你的文件并回答相关问题，还把你记录过的一切放在一个可搜索的地方。', 'getting-started', 2, true, array['ionexa是什么', '这是什么', '有什么用', '能做什么', '怎么用']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'zh', 'Ionexa 多少钱？', '有免费套餐可以先试，需求变大后再上付费套餐。当前价格和各套餐包含的内容始终在 /pricing 页面——这里不写具体数字，因为价格会变，写过时的数字比不写更糟。', 'billing', 0, true, array['多少钱', '价格', '收费', '套餐', '订阅']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'zh', '什么是额度（credits）？', '额度是你为 AI 操作付费的方式：一条聊天消息、生成一个网站、一次 agent 运行。每个套餐都含每月自动续的额度，用得快也可以另外买加量包。各套餐含多少，见 /pricing。', 'credits', 0, true, array['什么是额度', 'credits', '额度怎么算', '点数']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'zh', '额度用完了怎么办？', '两个选择：等下个月自动续，或者买一个额度包——立刻到账，而且月底不会清零。两者都在「设置 > 账单」里。', 'credits', 2, true, array['额度用完', '没额度了', '买额度', '加额度']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'zh', '怎么换套餐？', '设置 > 账单。选你想要的套餐，立即生效。升级时只补本周期剩余部分的差价；降级时保留当前套餐直到已付费的周期结束。', 'billing', 1, true, array['换套餐', '升级', '降级', '改订阅']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'zh', '怎么取消订阅？', '设置 > 账单 > 取消订阅。不会立刻失去权限：套餐会用到已付费周期结束，之后账号转为免费套餐。你的数据都在——取消不会删除任何东西。', 'billing', 2, true, array['取消', '取消订阅', '退订', '停止订阅']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'zh', '怎么做一个网站？', '从侧边栏打开 Website Builder，用大白话写清你要什么——你的生意做什么、面向谁、喜欢什么风格——然后点生成。你也可以上传参考图，比如 logo 或产品照片，让它贴合你的视觉。做好之后，一键发布到它自己的地址。', 'websites', 0, true, array['做网站', '建网站', '网页', '我想要个网站', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'zh', '怎么创建 agent？', '在 Agents 菜单里，用一句话说明要做什么、多久做一次——比如「每天早上给我发一份行业新闻摘要」。Ionexa 会自己搭好这个 agent，按时运行，并把结果发给你。你随时可以暂停或修改。', 'agents', 0, true, array['创建agent', '做一个agent', 'agents', '自动化', '定时任务']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'zh', '怎么创建 mission？', '在 Mission Control 里，像对人说话那样写下目标：「我想在春天前多拿些客户」。Ionexa 会把它拆成具体步骤，之后你可以自己做，也可以把其中几步交给 agent。', 'missions', 0, true, array['创建mission', 'mission control', '目标', '定目标', '任务']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'zh', '可以上传文件吗？', '可以——PDF、Word、Excel、CSV、纯文本和 Markdown。在「文件」里上传，Ionexa 读取其中内容，之后你就能针对这些文件提问。你的文件是私有的：别人无法访问，每次下载都用临时链接。', 'files', 0, true, array['上传文件', '上传', 'pdf', '文件', '文档']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'zh', '怎么连接 Gmail 或 Google Drive？', '设置 > 连接。选择服务，在 Google 自己的窗口里授权。授权之前你能看清它将读取什么，而且随时可以断开——断开时访问密钥立刻删除。', 'integrations', 0, true, array['gmail', 'google drive', '连接', '集成', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'zh', '你们拿我的数据做什么？', '你的数据是你的。我们不卖，也不拿来训练模型，而且每个账号只能看到自己的——这一点在数据库层面强制执行，不只是在应用里。你随时可以下载或删除。', 'privacy', 2, true, array['我的数据', '隐私', '安全', '会卖我的数据吗', '训练模型']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'zh', '怎么注销账号？', '设置 > 账号 > 删除账号。会要求你确认，之后全部删除：对话、文件、网站、agent、历史记录。不可恢复。如果想先留一份备份，在同一页面下载你的数据。', 'privacy', 0, true, array['删除账号', '注销账号', '关闭账号', '销号']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'zh', '聊天会记得之前的对话吗？', '在同一个对话里，它始终记得前面的消息。在不同对话之间，它只保留长期有用的信息——你的名字、你的工作、你的偏好——这项功能属于付费方案。它保留的全部内容都可以在「设置 > 记忆」里查看，也可以随时删除。', 'chat', 0, true, array['记得', '记忆', '之前的对话', '会忘记吗', '不记得', '聊天记录']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'ja', 'Ionexaとは？', 'AIが助言するだけでなく実際に作業するワークスペースです。サイトを作り、エージェントを決めた頻度で走らせ、目標を手順に分け、ファイルを読んでそれについて答え、記録したすべてを検索できる一か所にまとめます。', 'getting-started', 2, true, array['ionexaとは', 'これは何', '何ができる', '何をするもの', '使い方']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'ja', 'Ionexaの料金は？', 'まず試せる無料プランがあり、必要に応じて有料プランに移れます。現在の価格と各プランの内容は常に /pricing にあります。ここに数字を書かないのは、変わるからです。古い数字は書かないより悪いものです。', 'billing', 0, true, array['いくら', '料金', '価格', 'プラン', 'サブスク']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'ja', 'クレジットとは？', 'クレジットはAIの処理に対して支払う通貨です。チャットのメッセージ、サイトの生成、エージェントの実行などに使います。各プランには毎月更新される割り当てがあり、早く使い切った場合は追加パックを購入できます。プランごとの量は /pricing にあります。', 'credits', 0, true, array['クレジットとは', 'クレジット', 'クレジットの仕組み', 'ポイント']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'ja', 'クレジットがなくなりました', '方法はふたつです。翌月の更新を待つか、クレジットパックを購入するか。パックはすぐ反映され、月末で失効しません。どちらも「設定 > 請求」から行えます。', 'credits', 2, true, array['クレジットがない', 'クレジット切れ', 'クレジットを買う', '追加したい']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'ja', 'プランはどう変更しますか？', '設定 > 請求。希望のプランを選ぶと、変更はすぐ反映されます。上位に変える場合は残り期間の差額のみ、下位に変える場合は支払い済み期間の終わりまで現在のプランのままです。', 'billing', 1, true, array['プラン変更', 'アップグレード', 'ダウングレード', '契約を変える']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'ja', '解約はどうしますか？', '設定 > 請求 > 解約。すぐに使えなくなるわけではありません。支払い済み期間の終わりまでは現在のプランが続き、その後は無料プランに切り替わります。データはそのまま残り、解約で削除されるものはありません。', 'billing', 2, true, array['解約', 'キャンセル', '退会したい', '契約をやめる']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'ja', 'サイトはどう作りますか？', 'サイドバーからWebsite Builderを開き、ふつうの言葉で書いてください。事業の内容、対象、好みの雰囲気などです。参考画像（ロゴや商品写真）も追加でき、見た目を合わせられます。完成したら、ワンクリックで専用のアドレスに公開できます。', 'websites', 0, true, array['サイトを作る', 'ホームページ', 'ウェブサイト作成', 'サイトが欲しい', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'ja', 'エージェントはどう作りますか？', 'Agentsメニューで、やってほしいことと頻度を一文で書きます。たとえば「毎朝、業界ニュースの要約を送って」。Ionexaがエージェントを組み立て、時刻どおりに実行し、結果を届けます。いつでも停止・変更できます。', 'agents', 0, true, array['エージェントを作る', 'agent作成', 'エージェント', '自動化', '定期実行']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'ja', 'ミッションはどう作りますか？', 'Mission Controlで、人に話すように目標を書きます。「春までに顧客を増やしたい」のように。Ionexaがそれを具体的な手順に分解し、そのあとは自分で進めても、いくつかをエージェントに任せてもかまいません。', 'missions', 0, true, array['ミッションを作る', 'mission control', '目標', 'ゴール', 'ミッション']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'ja', 'ファイルはアップロードできますか？', 'はい。PDF、Word、Excel、CSV、テキスト、Markdownに対応しています。Filesにアップロードすると内容が読み取られ、そのファイルについて質問できます。ファイルは非公開で、他の人はアクセスできず、ダウンロードは毎回一時リンク経由です。', 'files', 0, true, array['ファイルをアップロード', 'アップロード', 'pdf', 'ファイル', '資料']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'ja', 'GmailやGoogle Driveはどう接続しますか？', '設定 > 連携。サービスを選び、Google自身の画面で許可します。許可の前に何を読むのかが正確に表示され、いつでも接続を解除できます。解除すると、アクセスキーはただちに削除されます。', 'integrations', 0, true, array['gmail', 'google drive', '接続', '連携', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'ja', 'データはどう扱われますか？', 'あなたのデータはあなたのものです。販売しません。モデルの学習にも使いません。各アカウントは自分のデータしか見られず、それはアプリだけでなくデータベース側で強制されています。いつでもダウンロードも削除もできます。', 'privacy', 2, true, array['私のデータ', 'プライバシー', 'セキュリティ', 'データを売る', '学習に使う']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'ja', 'アカウントはどう削除しますか？', '設定 > アカウント > アカウント削除。確認を求められ、そのあとすべて削除されます。会話、ファイル、サイト、エージェント、履歴。取り消せません。先に控えが必要なら、同じページからデータを書き出してください。', 'privacy', 0, true, array['アカウント削除', '退会', 'アカウントを消す', '解約して消したい']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'ja', 'チャットは前の会話を覚えていますか？', '同じ会話の中では、前のメッセージを常に覚えています。別々の会話のあいだでは、長く役に立つことだけ——お名前、お仕事、好み——を保持します。これは有料プランの機能です。保持している内容は「設定 > メモリー」ですべて確認でき、削除もできます。', 'chat', 0, true, array['覚えている', '記憶', '前の会話', '忘れる', '覚えていない', 'チャット履歴']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'ar', 'ما هو Ionexa؟', 'مساحة عمل ينفّذ فيها الذكاء الاصطناعي العمل بدل أن يكتفي بالنصيحة: يبني موقعك، ويشغّل الوكلاء وفق جدول زمني، ويقسّم أهدافك إلى خطوات، ويقرأ ملفاتك ويجيب عنها، ويحفظ كل ما سجّلته في مكان واحد قابل للبحث.', 'getting-started', 2, true, array['ما هو ionexa', 'ما هذا', 'ما فائدته', 'ماذا يفعل', 'كيف يعمل']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'ar', 'كم يكلّف Ionexa؟', 'هناك خطة مجانية للتجربة، وخطط مدفوعة كلما كبرت احتياجاتك. الأسعار الحالية وما تتضمّنه كل خطة موجودة دائمًا في صفحة ‎/pricing‎ — ولا نكتبها هنا لأنها تتغيّر، ورقم قديم أسوأ من لا رقم.', 'billing', 0, true, array['كم التكلفة', 'السعر', 'الأسعار', 'الخطط', 'الاشتراك']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'ar', 'ما هي الـcredits؟', 'الـcredits هي العملة التي تدفع بها مقابل عمليات الذكاء الاصطناعي: رسالة في الدردشة، توليد موقع، تشغيل وكيل. كل خطة تتضمّن حصة شهرية تتجدّد، ويمكنك شراء باقات إضافية إن نفدت مبكرًا. ما تتضمّنه كل خطة موجود في ‎/pricing‎.', 'credits', 0, true, array['ما هي credits', 'الرصيد', 'كيف تعمل credits', 'النقاط']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'ar', 'نفدت الـcredits، ماذا أفعل؟', 'خياران: انتظار التجديد الشهري، أو شراء باقة credits تُضاف فورًا ولا تنتهي في آخر الشهر. كلاهما من الإعدادات > الفوترة.', 'credits', 2, true, array['نفدت الcredits', 'لا يوجد رصيد', 'شراء credits', 'أريد المزيد']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'ar', 'كيف أغيّر الخطة؟', 'الإعدادات > الفوترة. اختر الخطة التي تريدها ويسري التغيير فورًا. عند الترقية تدفع الفارق فقط لبقية الفترة؛ وعند النزول تحتفظ بخطتك الحالية حتى تنتهي الفترة المدفوعة.', 'billing', 1, true, array['تغيير الخطة', 'ترقية', 'تخفيض الخطة', 'تغيير الاشتراك']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'ar', 'كيف ألغي اشتراكي؟', 'الإعدادات > الفوترة > إلغاء الاشتراك. لا تفقد الوصول فورًا: تستمر خطتك حتى نهاية الفترة المدفوعة، ثم يتحوّل الحساب إلى الخطة المجانية. بياناتك تبقى — الإلغاء لا يحذف شيئًا.', 'billing', 2, true, array['إلغاء', 'إلغاء الاشتراك', 'إيقاف الاشتراك', 'أريد الإلغاء']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'ar', 'كيف أنشئ موقعًا؟', 'افتح Website Builder من القائمة الجانبية، واكتب بكلماتك ما تريد — ماذا يعمل نشاطك، ولمن، وأي أسلوب تفضّل — ثم اضغط إنشاء. يمكنك أيضًا رفع صور مرجعية، شعارًا أو صور منتجات، ليتبع هويتك. وعندما يجهز تنشره على عنوان خاص به بنقرة واحدة.', 'websites', 0, true, array['إنشاء موقع', 'عمل موقع', 'صفحة ويب', 'أريد موقعًا', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'ar', 'كيف أنشئ وكيلًا؟', 'في قائمة الوكلاء، صِف في جملة واحدة ما تريد إنجازه وكل كم مرة — مثلًا «كل صباح أرسل لي ملخّصًا لأخبار قطاعي». يبني Ionexa الوكيل بنفسه، ويشغّله في موعده، ويرسل لك النتيجة. ويمكنك إيقافه أو تعديله متى شئت.', 'agents', 0, true, array['إنشاء وكيل', 'عمل agent', 'الوكلاء', 'أتمتة', 'مهمة متكررة']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'ar', 'كيف أنشئ مهمة؟', 'في Mission Control تكتب هدفًا كما تقوله لإنسان: «أريد عملاء أكثر قبل الربيع». يقسّمه Ionexa إلى خطوات محدّدة، ثم تنفّذها بنفسك أو تُسنِد بعضها إلى وكيل.', 'missions', 0, true, array['إنشاء مهمة', 'mission control', 'هدف', 'أهداف', 'المهام']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'ar', 'هل يمكنني رفع ملفات؟', 'نعم — PDF وWord وExcel وCSV والنصوص وMarkdown. ترفعها في Files، فيقرأ Ionexa محتواها، ثم تستطيع طرح أسئلة عليها. ملفاتك خاصة: لا يصل إليها أحد غيرك، وكل تنزيل يتم عبر رابط مؤقّت.', 'files', 0, true, array['رفع ملف', 'تحميل ملف', 'pdf', 'الملفات', 'مستندات']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'ar', 'كيف أربط Gmail أو Google Drive؟', 'الإعدادات > الاتصالات. اختر الخدمة ووافق على الوصول في نافذة Google نفسها. ترى بالضبط ما الذي سيُقرأ قبل الموافقة، ويمكنك فصل الاتصال متى شئت — وعندها تُحذف مفاتيح الوصول فورًا.', 'integrations', 0, true, array['gmail', 'google drive', 'ربط', 'اتصال', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'ar', 'ماذا تفعلون ببياناتي؟', 'بياناتك ملكك. لا نبيعها، ولا نستخدمها لتدريب النماذج، وكل حساب لا يرى إلا بياناته — وهذا مفروض في قاعدة البيانات لا في التطبيق وحده. ويمكنك تنزيلها أو حذفها متى شئت.', 'privacy', 2, true, array['بياناتي', 'الخصوصية', 'الأمان', 'هل تبيعون بياناتي', 'تدريب النماذج']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'ar', 'كيف أحذف حسابي؟', 'الإعدادات > الحساب > حذف الحساب. سيُطلب منك التأكيد، ثم يُحذف كل شيء: المحادثات والملفات والمواقع والوكلاء والسجل. ولا يمكن التراجع. وإن أردت نسخة أولًا، نزّل بياناتك من الصفحة نفسها.', 'privacy', 0, true, array['حذف الحساب', 'إلغاء الحساب', 'إغلاق الحساب', 'أريد حذف حسابي']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'ar', 'هل تتذكر المحادثة ما دار سابقًا؟', 'داخل المحادثة الواحدة يتذكّر الرسائل السابقة دائمًا. أما بين محادثة وأخرى فيحتفظ فقط بما يظل مفيدًا — اسمك، وما تعمل به، وتفضيلاتك — وهذا متاح في الخطط المدفوعة. يمكنك رؤية كل ما احتفظ به، وحذفه، من الإعدادات > الذاكرة.', 'chat', 0, true, array['يتذكر', 'الذاكرة', 'المحادثات السابقة', 'ينسى', 'لا يتذكر', 'سجل المحادثة']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
