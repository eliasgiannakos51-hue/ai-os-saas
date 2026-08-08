import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("help_articles")
    .select("title")
    .eq("slug", params.slug)
    .maybeSingle();
  return { title: data?.title ? `${data.title} — Help` : "Help" };
}

/**
 * One help article, rendered from markdown. Unpublished slugs 404 via
 * RLS (the row is simply invisible), so there is no draft-leak path to
 * get wrong here.
 */
export default async function HelpArticlePage({ params }: { params: { slug: string } }) {
  const t = await getTranslations("help");
  const supabase = createClient();

  const slug = (params.slug ?? "").slice(0, 100);
  const { data: article } = await supabase
    .from("help_articles")
    .select("slug, title, content, category")
    .eq("slug", slug)
    .maybeSingle();

  if (!article) notFound();

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background px-4 py-12">
      <AppBackground />
      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo iconOnly className="h-7 w-7" />
            <span className="text-sm font-bold text-foreground">IONEXA</span>
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("backToHelp")}
          </Link>
        </div>

        <article className="rounded-2xl border border-border bg-panel/60 p-6">
          <h1 className="text-2xl font-bold text-foreground">{article.title}</h1>
          <div className="prose-help mt-4 space-y-3 text-sm leading-relaxed text-muted [&_a]:text-orange-400 [&_a]:underline [&_code]:rounded [&_code]:bg-input [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-foreground [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
          </div>
        </article>
      </div>
    </main>
  );
}
