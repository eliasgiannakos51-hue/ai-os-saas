// EU AI Act, Article 50 — transparency.
//
// Content produced by an AI system has to be recognisable as such to the
// person receiving it. An agent's output is the case in this app where
// that is least obvious: it arrives as an email, on a schedule, with no
// interface around it, weeks after the user set it up. Nothing else in
// that message says a model wrote it.
//
// So every agent email carries the notice below, in the agent's own
// output language rather than the app's UI language — the email is not
// rendered by next-intl and has no locale context, and a Greek user
// receiving a Greek briefing should not find one English sentence at the
// bottom of it.
//
// These are NOT in messages/*.json on purpose: they are sent from a cron
// with no request, no locale cookie and no i18n provider, and the set of
// languages an agent can write in is not the set of UI locales (the
// builder picks the language the user wrote their request in, which can
// be any language at all). The English fallback is used for anything not
// listed, which is honest — an English notice is still a notice.

const NOTICES: Record<string, string> = {
  en: "This message was generated automatically by an AI agent you created on Ionexa AI. Check anything important before acting on it.",
  el: "Αυτό το μήνυμα δημιουργήθηκε αυτόματα από έναν AI agent που έφτιαξες στο Ionexa AI. Έλεγξε ό,τι είναι σημαντικό πριν βασιστείς σε αυτό.",
  es: "Este mensaje ha sido generado automáticamente por un agente de IA que creaste en Ionexa AI. Verifica cualquier dato importante antes de actuar.",
  fr: "Ce message a été généré automatiquement par un agent IA que vous avez créé sur Ionexa AI. Vérifiez toute information importante avant d'agir.",
  de: "Diese Nachricht wurde automatisch von einem KI-Agenten erstellt, den Sie in Ionexa AI angelegt haben. Prüfen Sie Wichtiges, bevor Sie danach handeln.",
  it: "Questo messaggio è stato generato automaticamente da un agente IA che hai creato su Ionexa AI. Verifica le informazioni importanti prima di agire.",
  pt: "Esta mensagem foi gerada automaticamente por um agente de IA que criou no Ionexa AI. Confirme qualquer informação importante antes de agir.",
  zh: "本邮件由您在 Ionexa AI 上创建的 AI 智能体自动生成。在据此采取行动前，请核实重要信息。",
  ja: "このメッセージは、Ionexa AI で作成した AI エージェントが自動生成したものです。重要な内容は行動する前にご確認ください。",
  ar: "أُنشئت هذه الرسالة تلقائيًا بواسطة وكيل ذكاء اصطناعي أنشأته في Ionexa AI. تحقق من أي معلومة مهمة قبل التصرف بناءً عليها.",
};

/**
 * The AI-generated notice for a language tag. Accepts full BCP-47 tags
 * ("pt-BR", "zh-Hans") and matches on the primary subtag, so the builder's
 * language detection does not have to produce exactly one of these keys.
 */
export function aiGeneratedNotice(language: string | null | undefined): string {
  const primary = String(language ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return NOTICES[primary] ?? NOTICES.en;
}
