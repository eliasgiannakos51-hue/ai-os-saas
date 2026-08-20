// A QUESTION IS NOT A THING TO FILE.
//
// "τι ξέρεις για μένα" ("what do you know about me") came back as:
//   "Θέλεις να καταγράψεις ή να εξερευνήσεις τι είναι γνωστό για σένα.
//    Type: Document"
//
// The model was never asked. route_entry's tool schema offered a module
// slug or "none" — "this is a question" had nowhere to go, so the nearest
// module won. The fix is in two layers and this file tests the cheap one:
// a deterministic read of the text that runs in the browser, before a
// credit is spent.
//
// CROSS-PRODUCT, NOT SAMPLING: every question shape against every
// language, and every command shape against every language. A detector
// that works in English and Greek and nowhere else is the bug in a new
// coat — \b does not mean "word boundary" outside [A-Za-z0-9_], which is
// exactly how the accent-search bug happened.
//
// Run: node scripts/tests/create-intent.test.mjs
let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const { classifyTextIntent, shouldAskBeforeCreating } = await loadTs("src/lib/create-studio/intent-signals.ts");

const LOCALES = ["en", "el", "de", "es", "fr", "it", "pt", "ar", "ja", "zh"];

// TEN REAL QUESTIONS a user of this product would actually type, in each
// of the ten languages. Not translations of one sentence — the shapes
// differ per language on purpose (leading interrogative, no question
// mark, polite prefix, and so on).
const QUESTIONS = {
  en: ["what do you know about me", "how many credits do I have?", "how are sales going", "what did I do last week", "who is my best customer", "how much did I spend in March", "do you remember my pricing", "can you tell me about my competitors", "when is my next agent run", "why did that website fail?"],
  el: ["τι ξέρεις για μένα", "πόσα credits έχω;", "πώς πάνε οι πωλήσεις", "τι έκανα την προηγούμενη βδομάδα", "ποιος είναι ο καλύτερος πελάτης μου", "πόσα ξόδεψα τον Μάρτιο", "θυμάσαι την τιμολόγησή μου", "μπορείς να μου πεις για τους ανταγωνιστές", "πότε τρέχει ο επόμενος agent", "γιατί απέτυχε το site;"],
  de: ["was weißt du über mich", "wie viele Credits habe ich?", "wie laufen die Verkäufe", "was habe ich letzte Woche gemacht", "wer ist mein bester Kunde", "wie viel habe ich im März ausgegeben", "erinnerst du dich an meine Preise", "kannst du mir etwas über meine Konkurrenten sagen", "wann läuft mein nächster Agent", "warum ist die Website fehlgeschlagen?"],
  es: ["qué sabes sobre mí", "cuántos créditos tengo?", "cómo van las ventas", "qué hice la semana pasada", "quién es mi mejor cliente", "cuánto gasté en marzo", "recuerdas mis precios", "puedes decirme sobre mis competidores", "cuándo se ejecuta mi próximo agente", "por qué falló el sitio?"],
  fr: ["que sais-tu sur moi", "combien de crédits ai-je ?", "comment vont les ventes", "qu'est-ce que j'ai fait la semaine dernière", "qui est mon meilleur client", "combien ai-je dépensé en mars", "te souviens-tu de mes tarifs", "peux-tu me dire pour mes concurrents", "quand tourne mon prochain agent", "pourquoi le site a échoué ?"],
  it: ["cosa sai di me", "quanti crediti ho?", "come vanno le vendite", "che cosa ho fatto la settimana scorsa", "chi è il mio miglior cliente", "quanto ho speso a marzo", "ricordi i miei prezzi", "puoi dirmi dei miei concorrenti", "quando parte il prossimo agente", "perché il sito è fallito?"],
  pt: ["o que sabes sobre mim", "quantos créditos tenho?", "como vão as vendas", "que fiz na semana passada", "quem é o meu melhor cliente", "quanto gastei em março", "lembras dos meus preços", "podes dizer-me sobre os concorrentes", "quando corre o próximo agente", "por que falhou o site?"],
  ar: ["ما الذي تعرفه عني", "كم رصيدي من النقاط؟", "كيف تسير المبيعات", "ماذا فعلت الأسبوع الماضي", "من هو أفضل عميل لدي", "كم أنفقت في مارس", "هل تتذكر أسعاري", "أخبرني عن منافسي", "متى يعمل الوكيل التالي", "لماذا فشل الموقع؟"],
  ja: ["何を知っていますか", "クレジットはいくつありますか？", "どう売上は伸びていますか", "先週は何をしましたか", "誰が一番の顧客ですか", "いくら3月に使いましたか", "覚えていますか私の価格を", "教えて競合について", "いつ次のエージェントが動きますか", "なぜサイトは失敗したのですか？"],
  zh: ["什么是你知道的关于我", "多少积分我还有？", "怎么样销售情况", "什么时候我做了上周的事", "谁是我最好的客户", "多少钱我在三月花了", "记得吗我的定价", "告诉我关于竞争对手", "什么时候下一个代理运行", "为什么网站失败了？"],
};

// TEN REAL INSTRUCTIONS, per language.
const COMMANDS = {
  en: ["make me a website for my bakery", "write an email to the landlord", "log this idea: subscription boxes", "create an agent for daily news", "build a landing page", "add a competitor called Blend", "note that the rent went up", "save this decision about pricing", "track today's revenue of 340 euros", "generate a summary of the quarter"],
  el: ["φτιάξε μου ένα site για το φούρνο", "γράψε ένα email στον ιδιοκτήτη", "κατέγραψε αυτή την ιδέα: κουτιά συνδρομής", "δημιούργησε agent για καθημερινά νέα", "χτίσε μια landing page", "πρόσθεσε ανταγωνιστή με όνομα Blend", "σημείωσε ότι ανέβηκε το ενοίκιο", "αποθήκευσε αυτή την απόφαση για τιμολόγηση", "καταχώρησε έσοδα 340 ευρώ σήμερα", "ετοίμασε σύνοψη του τριμήνου"],
  de: ["mach mir eine Website für die Bäckerei", "schreibe eine E-Mail an den Vermieter", "notiere diese Idee: Abo-Boxen", "erstelle einen Agenten für tägliche Nachrichten", "baue eine Landingpage", "füge einen Konkurrenten namens Blend hinzu", "speichere diese Entscheidung zur Preisgestaltung", "erfasse Einnahmen von 340 Euro", "lege ein neues Produkt an", "generiere eine Quartalszusammenfassung"],
  es: ["haz un sitio web para mi panadería", "escribe un correo al propietario", "anota esta idea: cajas de suscripción", "crea un agente para noticias diarias", "construye una landing page", "añade un competidor llamado Blend", "guarda esta decisión sobre precios", "registra ingresos de 340 euros", "genera un resumen del trimestre", "haz una nota sobre el alquiler"],
  fr: ["fais-moi un site pour la boulangerie", "écris un email au propriétaire", "note cette idée : box par abonnement", "crée un agent pour les actualités", "construis une landing page", "ajoute un concurrent nommé Blend", "enregistre cette décision sur les prix", "génère un résumé du trimestre", "sauvegarde ce contact", "fais une note sur le loyer"],
  it: ["fai un sito per la panetteria", "scrivi un'email al proprietario", "annota questa idea: box in abbonamento", "crea un agente per le notizie", "costruisci una landing page", "aggiungi un concorrente chiamato Blend", "salva questa decisione sui prezzi", "registra ricavi di 340 euro", "genera un riassunto del trimestre", "fai una nota sull'affitto"],
  pt: ["faz um site para a padaria", "escreve um email ao senhorio", "anota esta ideia: caixas de subscrição", "cria um agente para notícias diárias", "constrói uma landing page", "adiciona um concorrente chamado Blend", "guarda esta decisão sobre preços", "regista receitas de 340 euros", "gera um resumo do trimestre", "faz uma nota sobre a renda"],
  ar: ["أنشئ موقعًا لمخبزي", "اكتب رسالة إلى المالك", "سجل هذه الفكرة: صناديق الاشتراك", "أنشئ وكيلًا للأخبار اليومية", "اصنع صفحة هبوط", "أضف منافسًا باسم Blend", "احفظ هذا القرار حول التسعير", "سجل إيرادات 340 يورو", "ولّد ملخصًا للربع", "جهز تقريرًا"],
  ja: ["作ってパン屋のウェブサイトを", "書いて大家へのメールを", "記録してこのアイデアを", "作成して毎日のニュース用エージェントを", "追加して競合のBlendを", "保存してこの価格決定を", "登録して340ユーロの売上を", "生成して四半期のまとめを", "作って新しいページを", "書いて今日のメモを"],
  zh: ["做一个面包店网站", "写一封给房东的邮件", "记录这个想法：订阅盒", "创建一个每日新闻代理", "建立一个落地页", "添加一个叫Blend的竞争对手", "保存这个定价决定", "登记340欧元的收入", "生成季度总结", "写一条今天的备注"],
};

console.log("== 1. every question, in every language, reads as a question ==");
let qTotal = 0;
const qMisses = [];
for (const locale of LOCALES) {
  for (const text of QUESTIONS[locale]) {
    qTotal++;
    // The UI locale is deliberately varied: a Greek sentence typed while
    // the interface is in Japanese is still a Greek question.
    for (const uiLocale of [locale, "en", "ja"]) {
      if (classifyTextIntent(text, uiLocale) !== "question") {
        qMisses.push(`[${locale} ui=${uiLocale}] ${text}`);
        break;
      }
    }
  }
}
check(
  `all ${qTotal} questions across ${LOCALES.length} languages x 3 UI locales`,
  qMisses.length === 0,
  qMisses.slice(0, 10).join("\n        ")
);

console.log("\n== 2. every instruction still reads as an instruction ==");
// This is the half that must not regress: a false "question" interrupts
// somebody who was doing exactly what the feature is for.
let cTotal = 0;
const cMisses = [];
for (const locale of LOCALES) {
  for (const text of COMMANDS[locale]) {
    cTotal++;
    for (const uiLocale of [locale, "en", "ja"]) {
      if (classifyTextIntent(text, uiLocale) !== "command") {
        cMisses.push(`[${locale} ui=${uiLocale}] ${text} -> ${classifyTextIntent(text, uiLocale)}`);
        break;
      }
    }
  }
}
check(
  `all ${cTotal} instructions across ${LOCALES.length} languages x 3 UI locales`,
  cMisses.length === 0,
  cMisses.slice(0, 10).join("\n        ")
);

console.log("\n== 3. the traps that a substring match would fall into ==");
// Every one of these CONTAINS an interrogative as a substring and is not
// a question. This is the accent-search bug's shape: \b is defined on
// [A-Za-z0-9_], so it does not mark a boundary in Greek, Arabic or CJK.
const TRAPS = [
  ["el", "τιμή 50 ευρώ για το νέο προϊόν"],          // τι inside τιμή
  ["el", "ποιότητα κατασκευής, πολύ καλή"],           // ποιο inside ποιότητα
  ["en", "washing machine repair service, 120 euros"],// was inside washing
  ["en", "whatsapp campaign results for March"],      // what inside whatsapp
  ["de", "Waschmaschine gekauft für 300 Euro"],       // was inside Waschmaschine
  ["es", "queso manchego, coste 12 euros el kilo"],   // que inside queso
  ["it", "comestibili acquistati oggi"],              // come inside comestibili
  ["fr", "questionnaire client envoyé"],              // que inside questionnaire
];
const trapMisses = TRAPS.filter(([locale, text]) => classifyTextIntent(text, locale) === "question").map(
  ([locale, text]) => `[${locale}] ${text}`
);
check(
  `${TRAPS.length} substring traps are not read as questions`,
  trapMisses.length === 0,
  trapMisses.join("\n        ")
);

console.log("\n== 4. an instruction wins over a trailing question mark ==");
// "φτιάξε μου ένα site;" is an instruction asked politely — creating the
// site is right, interrogating the user is not.
for (const [locale, text] of [
  ["el", "φτιάξε μου ένα site;"],
  ["en", "make me a website?"],
  ["de", "erstelle mir eine Website?"],
]) {
  check(`[${locale}] "${text}" is still an instruction`, classifyTextIntent(text, locale) === "command");
}

console.log("\n== 5. a plain entry is left alone ==");
// The overwhelming majority of real input: neither shape. Silence must
// mean "carry on", or the feature interrogates everybody.
for (const [locale, text] of [
  ["en", "Coffee shop in Athens, 40k revenue, 3 staff"],
  ["el", "Καφετέρια στα Λαδάδικα, τζίρος 40 χιλιάδες"],
  ["ja", "アテネのコーヒーショップ、売上4万ユーロ"],
  ["ar", "مقهى في أثينا، إيرادات 40 ألف"],
]) {
  check(`[${locale}] a plain entry is not interrogated`, classifyTextIntent(text, locale) === "command");
}

console.log("\n== 6. empty input is not a confident anything ==");
check("empty text is ambiguous", classifyTextIntent("", "en") === "ambiguous");
check("whitespace only is ambiguous", classifyTextIntent("   \n ", "el") === "ambiguous");

console.log("\n== 7. the gate the UI uses ==");
check("a question asks first", shouldAskBeforeCreating("τι ξέρεις για μένα", "el") === true);
check("an instruction does not", shouldAskBeforeCreating("φτιάξε μου site", "el") === false);
check("a plain entry does not", shouldAskBeforeCreating("Καφετέρια, τζίρος 40k", "el") === false);

console.log("\n== 8. the model is ASKED, not just nudged ==");
// The deterministic layer above is a courtesy. This is the structural
// half: before the fix, route_entry's schema offered a module slug or
// "none" — "this is a question" had nowhere to go, so the nearest module
// always won. A prompt sentence alone would not have fixed that.
{
  const { readFileSync } = await import("node:fs");
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const tool = readFileSync("src/lib/create-studio/route-entry.ts", "utf8");
  const handler = strip(readFileSync("src/lib/jobs/handlers/create.ts", "utf8"));
  const viaJob = strip(readFileSync("src/lib/create-studio/create-via-job.ts", "utf8"));
  const hook = strip(readFileSync("src/lib/use-create-anything.ts", "utf8"));
  const ui = strip(readFileSync("src/components/create/create-chat.tsx", "utf8"));

  check("the tool has an intent field", /intent: \{[\s\S]{0,200}?enum: \["record", "question", "ambiguous"\]/.test(tool));
  check("and it is required, so the model cannot skip it", /required: \["intent", "module", "fields", "message"\]/.test(tool));
  check("there is somewhere to put an answer", /answer: \{/.test(tool));
  check("the prompt teaches the distinction first", /FIRST DECIDE WHAT THE MESSAGE IS/.test(tool));
  check("with the signals, in more than one language", /τι, πώς, πόσα/.test(tool) && /什么, 怎么/.test(tool));
  check("an imperative with a question mark is still a record", /polite instruction, not a question/.test(tool));
  check("and the answer may not invent anything", /never invent a number, a date or a name/.test(tool));

  // Wired all the way through — a field the model fills and nobody reads
  // is the same bug in a different place.
  check("the handler acts on intent=question", /toolInput\.intent === "question"/.test(handler));
  check("and files nothing when it does", /answered: true,/.test(handler));
  check("the handler asks when it is ambiguous", /toolInput\.intent === "ambiguous"/.test(handler));
  check("the outcome carries answered through", /answered: true,/.test(viaJob));
  check("...and ambiguous", /ambiguous: true/.test(viaJob));
  check("the hook exposes both", /type: "answered"/.test(hook) && /type: "ambiguous"/.test(hook));
  check("the UI renders the answer", /data-testid="create-answer"/.test(ui));
  check("and says nothing was filed", /answeredNotFiled/.test(ui));
  check("the UI asks when unclear", /data-testid="create-ambiguous"/.test(ui));
  check("offering both choices", /answerItInstead/.test(ui) && /data-testid="create-record-anyway"/.test(ui));
}

console.log("\n== 9. every new sentence exists in all ten locales ==");
{
  const { readFileSync } = await import("node:fs");
  const missing = [];
  for (const locale of LOCALES) {
    const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.create;
    for (const key of ["answeredNotFiled", "continueInChat", "looksLikeQuestion", "answerItInstead", "recordItAnyway"]) {
      if (typeof m[key] !== "string" || m[key].length < 2) missing.push(`${locale}.${key}`);
    }
  }
  check("all five, all ten", missing.length === 0, missing.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
