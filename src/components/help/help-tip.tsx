import { getLocale, getTranslations } from "next-intl/server";
import { loadHelpArticle } from "@/lib/support/help-articles";
import { HelpTipPopover } from "@/components/help/help-tip-popover";

// The contextual "?" — the decision half.
//
// A SERVER component on purpose. The requirement is "if the article is
// missing, the question mark does not appear", and there is exactly one
// way to honour that without a flicker: decide before anything renders. A
// client component that fetched on mount would paint a "?" , wait, and
// then take it away again — which is worse than never showing it, because
// the reader saw help and then watched it vanish.
//
// It also means a missing article costs nothing on the client: no fetch,
// no bundle, no state.
//
// USAGE, from any server component:
//     <HelpTip slug="what-are-credits" />
//
// The slug must exist in content/help/manifest.json.
// scripts/tests/help-articles.test.mjs fails on a <HelpTip slug="..."/>
// naming an article that does not exist, so a typo is a red build rather
// than a question mark that quietly never appears.

export async function HelpTip({ slug }: { slug: string }) {
  const locale = await getLocale();
  const [article, t] = await Promise.all([
    loadHelpArticle(slug, locale),
    getTranslations("help"),
  ]);

  if (!article) return null;

  // ONE paragraph. The article's first paragraph is written to stand
  // alone — what the thing is — and the rest is detail that belongs on
  // /help. Splitting on the blank line the content format already uses
  // means nothing has to be authored twice.
  const paragraph = article.body.split(/\n{2,}/)[0]?.trim() || article.body.trim();

  return (
    <HelpTipPopover
      slug={article.slug}
      title={article.title}
      paragraph={paragraph}
      href={article.href}
      label={t("tipLabel")}
      readMore={t("tipReadMore")}
      fallbackNotice={article.isFallback ? t("fallbackNotice") : null}
      contentLocale={article.isFallback ? article.locale : null}
    />
  );
}
