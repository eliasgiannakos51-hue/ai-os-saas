"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Clock, Download, ImageIcon, Trash2, X } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CopyButton } from "@/components/ui/copy-button";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  ACCEPTED_ATTACHMENT_IMAGE_TYPES,
  CREATE_ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_IMAGE_BYTES,
  buildAttachmentImagePath,
} from "@/lib/create-attachment-image";
import { POST_IMAGE_SIZES, type PostImageSource } from "@/lib/posts/post-images";
import { UNSPLASH_HOME_URL, withUnsplashUtm } from "@/lib/website-image-placeholders";
import {
  MAX_DESCRIPTION_CHARS,
  PLATFORMS,
  POST_PLATFORMS,
  postClipboardText,
  postsEstimateInputChars,
  type PostPlatform,
  type PostRow,
  type PostSet,
} from "@/lib/posts/platforms";

type Shown = { id: string | null; set: PostSet; platforms: PostPlatform[] };

/**
 * POSTS IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes as components/posts/posts-workspace.tsx,
 * which stays the page for everybody the switch is off for:
 * /api/posts/generate writes, generated_posts keeps the history.
 *
 * What is said in the field is the brief; the posts open on the right, one
 * per platform, each with its copy button. Two options under the field:
 * the platforms, and what was written before. What it does NOT do is one
 * line under the field, not a box.
 *
 * A PICTURE ON EVERY POST (package 15), behind the switch "posts-images":
 * a third option, none / the person's own photo (added with the field's
 * «+») / one from Unsplash, which the posts' own words find. Each post then
 * shows its picture at its platform's size, cut by api/posts/[id]/image,
 * with its own download button and, for Unsplash, the photographer's credit.
 */
export function PostsShell({
  history,
  initialDescription,
  initialOpenId = null,
  pictures = false,
  unsplashConfigured = false,
}: {
  history: PostRow[];
  initialDescription?: string;
  /** Posts to open on arrival — `?record=` from the Library. */
  initialOpenId?: string | null;
  /** The switch "posts-images" is on for this person. */
  pictures?: boolean;
  /** UNSPLASH_ACCESS_KEY is set: the Unsplash choice is offered only then. */
  unsplashConfigured?: boolean;
}) {
  const t = useTranslations("posts");
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const composerRef = useRef<ChatComposerHandle>(null);

  const [platforms, setPlatforms] = useState<PostPlatform[]>([...POST_PLATFORMS]);
  const [choosing, setChoosing] = useState<"platforms" | "picture" | null>(null);
  const [pictureSource, setPictureSource] = useState<PostImageSource>("none");
  const [ownPhoto, setOwnPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [length, setLength] = useState(initialDescription?.length ?? 0);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; shown?: Shown }[]>([]);
  const asked = initialOpenId ? history.find((row) => row.id === initialOpenId && row.set) : undefined;
  const [open, setOpen] = useState<"posts" | "recent" | null>(asked ? "posts" : null);
  const [shown, setShown] = useState<Shown | null>(asked?.set ? { id: asked.id, set: asked.set, platforms: asked.platforms } : null);

  const estimate = useCostEstimate("postsGenerate", { inputChars: postsEstimateInputChars(length, platforms) });

  const abortRef = useRef<AbortController | null>(null);

  // The preview's object URL is let go when the photo is.
  useEffect(() => () => {
    if (ownPhoto) URL.revokeObjectURL(ownPhoto.preview);
  }, [ownPhoto]);

  const pictureSources: PostImageSource[] = unsplashConfigured ? ["none", "own", "unsplash"] : ["none", "own"];
  const pictureNames: Record<PostImageSource, string> = {
    none: t("picture.none"),
    own: t("picture.own"),
    unsplash: t("picture.unsplash"),
  };

  function addOwnPhoto(files: File[]) {
    const file = files[0];
    if (!file) return;
    if (!(ACCEPTED_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(file.type) || file.size > MAX_ATTACHMENT_IMAGE_BYTES) {
      addToast(t("picture.rejected"), "error");
      return;
    }
    setOwnPhoto({ file, preview: URL.createObjectURL(file) });
  }

  /** The person's photo, put in their own folder; its path, or null. */
  async function uploadOwnPhoto(): Promise<string | null> {
    if (!ownPhoto) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const path = buildAttachmentImagePath(user.id, ownPhoto.file.name);
    const { error } = await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).upload(path, ownPhoto.file, { contentType: ownPhoto.file.type });
    if (error) {
      addToast(getErrorMessage(error, t("picture.failed")), "error");
      return null;
    }
    return path;
  }

  function togglePlatform(p: PostPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : POST_PLATFORMS.filter((x) => x === p || prev.includes(x))));
  }

  async function write(description: string) {
    // Every platform when none is chosen, as on the old page.
    const chosen = platforms.length > 0 ? platforms : [...POST_PLATFORMS];
    if (running) return;
    const source: PostImageSource = pictures ? pictureSource : "none";
    if (source === "own" && !ownPhoto) {
      addToast(t("picture.needPhoto"), "error");
      return;
    }
    const text = description.slice(0, MAX_DESCRIPTION_CHARS);
    setTurns((prev) => [...prev, { id: `u${prev.length}`, role: "user", text }]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // THE PHOTO IS UNDONE IF NO POSTS COME BACK TO HOLD IT, as in Slides:
    // every exit that is not a saved set removes what was put in
    // create-attachments for it.
    let uploaded: string | null = null;
    const discardUpload = async () => {
      if (!uploaded) return;
      const path = uploaded;
      uploaded = null;
      try {
        await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).remove([path]);
      } catch {
        /* the run has already failed; a cleanup message would be noise */
      }
    };
    try {
      if (source === "own") {
        uploaded = await uploadOwnPhoto();
        if (!uploaded) {
          setTurns((prev) => [...prev, { id: `t${prev.length}`, role: "tool", text: t("picture.failed") }]);
          return;
        }
      }
      const response = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          description: text,
          platforms: chosen,
          locale,
          ...(source === "none" ? {} : { image: { source, ...(uploaded ? { path: uploaded } : {}) } }),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        await discardUpload();
        const code = String(body?.error ?? "");
        const message =
          code === "too_long"
            ? t("errors.tooLong", { limit: MAX_DESCRIPTION_CHARS })
            : code === "too_short"
              ? t("errors.tooShort")
              : code === "insufficient_credits" || code === "reserve_failed"
                ? t("errors.insufficient")
                : code === "rate_limited" || code === "bypass_ceiling"
                  ? t("errors.rateLimited")
                  : code === "ai_unavailable" || code === "not_configured"
                    ? t("errors.unavailable")
                    : code === "unusable"
                      ? t("errors.unusable")
                      : t("errors.failed");
        setTurns((prev) => [...prev, { id: `t${prev.length}`, role: "tool", text: message }]);
        return;
      }
      uploaded = null;
      const made: Shown = { id: (body?.id as string | null) ?? null, set: body.set as PostSet, platforms: chosen };
      setTurns((prev) => [
        ...prev,
        { id: `t${prev.length}`, role: "tool", text: tShell("posts.done", { count: made.set.posts.length }), shown: made },
        ...(source === "unsplash" && !made.set.image ? [{ id: `n${prev.length}`, role: "tool" as const, text: t("picture.noneFound") }] : []),
      ]);
      // The photo went with these posts; the next ones start without it.
      if (source === "own") setOwnPhoto(null);
      setShown(made);
      setOpen("posts");
      router.refresh();
    } catch {
      await discardUpload();
      setTurns((prev) => [
        ...prev,
        { id: `t${prev.length}`, role: "tool", text: controller.signal.aborted ? tSteps("stopped") : t("errors.failed") },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("history.deleteConfirm"))) return;
    const { error } = await supabase.from("generated_posts").delete().eq("id", id);
    if (error) {
      addToast(getErrorMessage(error, t("errors.failed")), "error");
      return;
    }
    // THE PERSON'S OWN PHOTO GOES WITH THE POSTS THAT HELD IT: nothing
    // else points at it (it was put there for this set), so leaving it
    // would keep a picture nobody can reach from the app.
    const image = history.find((row) => row.id === id)?.set?.image;
    if (image?.kind === "own") {
      try {
        await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).remove([image.path]);
      } catch {
        /* the posts are gone; a stray photo is not worth an error */
      }
    }
    if (shown?.id === id) setShown(null);
    router.refresh();
  }

  const shellTurns: ShellTurn[] = turns.map((turn) =>
    turn.shown
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: {
            title: t("result.title"),
            open: open === "posts" && shown === turn.shown,
            onOpen: () => {
              setShown(turn.shown!);
              setOpen("posts");
            },
          },
        }
      : { id: turn.id, role: turn.role, text: turn.text }
  );

  const allText = shown
    ? shown.set.posts.map((p) => `${PLATFORMS[p.platform].label}\n${postClipboardText(p)}`).join("\n\n---\n\n")
    : "";
  const missing = shown ? shown.platforms.filter((p) => !shown.set.posts.some((post) => post.platform === p)) : [];

  const work =
    open === "posts" && shown
      ? {
          title: t("result.title"),
          actions: <CopyButton text={allText} label={tShell("posts.copyAll")} variant="icon" />,
          body: (
            <ol data-testid="posts-result" className="space-y-6">
              {shown.set.posts.map((post) => {
                const spec = PLATFORMS[post.platform];
                const clipboard = postClipboardText(post);
                return (
                  <li key={post.platform}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{spec.label}</h3>
                      <span className="text-[11px] text-muted">{t("result.chars", { count: clipboard.length, max: spec.maxChars })}</span>
                    </div>
                    {shown.id && shown.set.image && (
                      <PostPicture id={shown.id} platform={post.platform} image={shown.set.image} label={spec.label} />
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-body">{post.text}</p>
                    {post.hashtags.length > 0 && <p className="mt-2 text-xs text-muted">{post.hashtags.join(" ")}</p>}
                    <CopyButton text={clipboard} label={tShell("posts.copyOne", { platform: spec.label })} variant="icon" />
                  </li>
                );
              })}
              {missing.map((p) => (
                <li key={p} className="text-xs text-muted">
                  {t("result.missing", { platform: PLATFORMS[p].label })}
                </li>
              ))}
            </ol>
          ),
        }
      : open === "recent"
        ? {
            title: t("history.title"),
            body:
              history.length === 0 ? (
                <p className="text-xs text-muted">{t("history.empty")}</p>
              ) : (
                <ul className="row-list">
                  {history.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                      <button
                        type="button"
                        disabled={!row.set}
                        onClick={() => {
                          if (!row.set) return;
                          setShown({ id: row.id, set: row.set, platforms: row.platforms });
                          setOpen("posts");
                        }}
                        className="min-w-0 flex-1 text-start disabled:cursor-default"
                      >
                        <p className="break-words text-sm text-foreground">{row.description}</p>
                        <p className="text-[11px] text-muted">
                          {row.set ? row.platforms.map((p) => PLATFORMS[p].label).join(" · ") : t("history.failed")}
                          {" · "}
                          {new Date(row.createdAt).toLocaleDateString(locale)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        aria-label={t("history.delete")}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-item text-muted hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          }
        : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("posts")}
      turns={shellTurns}
      working={
        running ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("form.generating")}
          </span>
        ) : null
      }
      placeholder={t("form.descriptionPlaceholder")}
      sending={running}
      onSend={(text) => void write(text)}
      onStop={() => abortRef.current?.abort()}
      initialText={initialDescription}
      onLengthChange={setLength}
      attach={
        pictures && pictureSource === "own"
          ? { accept: ACCEPTED_ATTACHMENT_IMAGE_TYPES.join(","), label: t("picture.attach"), onFiles: addOwnPhoto }
          : undefined
      }
      tray={
        pictures && pictureSource === "own" ? (
          ownPhoto ? (
            <p data-testid="posts-photo-chip" className="mb-2 flex min-h-[44px] max-w-full items-center gap-2 rounded-item bg-panel px-2 py-1 text-xs text-foreground">
              <Image src={ownPhoto.preview} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-item object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block max-w-[16rem] truncate">{ownPhoto.file.name}</span>
                <span className="block text-[11px] text-muted">{t("picture.ready")}</span>
              </span>
              <button
                type="button"
                onClick={() => setOwnPhoto(null)}
                aria-label={t("picture.none")}
                data-testid="posts-photo-remove"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </p>
          ) : (
            <p className="mb-2 text-[11px] text-muted">{t("picture.needPhoto")}</p>
          )
        ) : undefined
      }
      options={[
        <span key="platforms" className="relative">
          <button
            type="button"
            onClick={() => setChoosing((v) => (v === "platforms" ? null : "platforms"))}
            aria-expanded={choosing === "platforms"}
            data-testid="posts-platforms"
            className={OPTION}
          >
            {tShell("posts.platforms", { count: platforms.length > 0 ? platforms.length : POST_PLATFORMS.length })}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosing === "platforms" && (
            <fieldset className="surface absolute bottom-full start-0 z-10 mb-2 w-64 space-y-1">
              <legend className="sr-only">{t("form.platforms")}</legend>
              {POST_PLATFORMS.map((p) => (
                <label key={p} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />
                  <span className="flex-1">{PLATFORMS[p].label}</span>
                  <span className="text-[11px] text-muted">{t("form.upTo", { max: PLATFORMS[p].maxChars })}</span>
                </label>
              ))}
            </fieldset>
          )}
        </span>,
        ...(pictures
          ? [
              <span key="picture" className="relative">
                <button
                  type="button"
                  onClick={() => setChoosing((v) => (v === "picture" ? null : "picture"))}
                  aria-expanded={choosing === "picture"}
                  data-testid="posts-picture"
                  className={OPTION}
                >
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {pictureSource === "none" ? t("picture.option") : pictureNames[pictureSource]}
                </button>
                {choosing === "picture" && (
                  <fieldset className="surface absolute bottom-full start-0 z-10 mb-2 w-72 space-y-1">
                    <legend className="sr-only">{t("picture.option")}</legend>
                    {pictureSources.map((s) => (
                      <label key={s} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
                        <input
                          type="radio"
                          name="posts-picture-source"
                          checked={pictureSource === s}
                          onChange={() => setPictureSource(s)}
                          // A press on the choice already made closes the
                          // list too: no change event fires for it, and an
                          // open list sits over the send button.
                          onClick={() => setChoosing(null)}
                        />
                        {pictureNames[s]}
                      </label>
                    ))}
                  </fieldset>
                )}
              </span>,
            ]
          : []),
        <button
          key="recent"
          type="button"
          onClick={() => setOpen((v) => (v === "recent" ? null : "recent"))}
          aria-pressed={open === "recent"}
          data-testid="posts-recent"
          className={OPTION}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("history.title")}
        </button>,
      ]}
      footer={
        <>
          {!running && length > 0 && <CostEstimateHint credits={estimate.credits} />}
          <p className="mt-1.5 text-[11px] text-muted">{t("limits.no_publish")}</p>
        </>
      }
      work={work}
      onCloseWork={() => setOpen(null)}
    />
  );
}

/**
 * One post's picture at its platform's own size: drawn at that aspect ratio
 * (POST_IMAGE_SIZES), fetched cut from api/posts/[id]/image, with a button
 * that downloads exactly that file and, for an Unsplash photo, its credit.
 */
function PostPicture({
  id,
  platform,
  image,
  label,
}: {
  id: string;
  platform: PostPlatform;
  image: NonNullable<PostSet["image"]>;
  label: string;
}) {
  const t = useTranslations("posts");
  const { width, height } = POST_IMAGE_SIZES[platform];
  const src = `/api/posts/${id}/image?platform=${platform}`;
  return (
    <figure className="mt-2" data-testid="post-picture" data-platform={platform}>
      <Image
        src={src}
        alt=""
        width={width}
        height={height}
        unoptimized
        loading="lazy"
        className="h-auto w-full max-w-sm rounded-item bg-panel object-cover"
      />
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          {width} × {height}
          {image.kind === "unsplash" && (
            <>
              {" · "}
              {t.rich("picture.credit", {
                name: image.photographerName,
                author: (chunks) => (
                  <a href={withUnsplashUtm(image.photographerUrl)} target="_blank" rel="noreferrer" className="underline">
                    {chunks}
                  </a>
                ),
                unsplash: (chunks) => (
                  <a href={UNSPLASH_HOME_URL} target="_blank" rel="noreferrer" className="underline">
                    {chunks}
                  </a>
                ),
              })}
            </>
          )}
        </span>
        <a
          href={`${src}&download=1`}
          download
          data-testid="post-picture-download"
          className="inline-flex min-h-[44px] items-center gap-1 text-foreground hover:underline"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {t("picture.download", { platform: label })}
        </a>
      </figcaption>
    </figure>
  );
}
