"use client";

import { getTheme, themeCssVariables } from "@/lib/presentations/themes";
import type { Slide } from "@/lib/presentations/slides";

/**
 * One slide, rendered.
 *
 * ONE component for every size it is ever shown at: the thumbnail strip,
 * the editor canvas, full-screen presenting, the print sheet and the
 * public share page. That is possible because nothing here is sized in
 * pixels — every length is in `cqw`, a percentage of the slide's own
 * width, and the wrapper declares `container-type: inline-size`. A slide
 * at 160px wide and the same slide at 1600px are the same layout, not
 * two layouts that have to be kept looking alike.
 *
 * The alternative — render at a fixed 1280x720 and CSS-transform it down
 * — needs JavaScript to measure its container, breaks in print (where
 * there is no layout pass to measure), and puts a scale factor between
 * what the user edits and what they see.
 *
 * `next/image` is deliberately not used for the photos. They are remote
 * Unsplash URLs on an arbitrary host, and routing them through the
 * optimiser would mean either allowlisting that host in next.config or a
 * broken image; a plain <img> with object-cover matches what the PPTX
 * writer does with srcRect, which is the point — the export has to look
 * like this.
 */
export function SlideView({
  slide,
  themeId,
  className = "",
}: {
  slide: Slide;
  themeId: string;
  className?: string;
}) {
  const theme = getTheme(themeId);
  const vars = themeCssVariables(theme);
  const c = theme.colors;

  const isSection = slide.layout === "section";
  const sectionFilled = isSection && theme.boldSections;

  return (
    <div
      className={`slide-surface relative overflow-hidden ${className}`}
      style={{
        ...vars,
        containerType: "inline-size",
        aspectRatio: "16 / 9",
        background: sectionFilled ? `#${c.accent}` : "var(--slide-bg)",
        color: "var(--slide-body)",
        fontFamily: "var(--slide-font-body)",
      }}
    >
      <SlideBody slide={slide} sectionFilled={sectionFilled} />
    </div>
  );
}

function SlideBody({ slide, sectionFilled }: { slide: Slide; sectionFilled: boolean }) {
  const pad = { padding: "7cqw" };

  const heading = (text: string, size: string) => (
    <h2
      style={{
        fontFamily: "var(--slide-font-heading)",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.15,
        color: sectionFilled ? "var(--slide-accent-text)" : "var(--slide-heading)",
        margin: 0,
      }}
    >
      {text}
    </h2>
  );

  const bulletList = (items: string[]) => (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "2.2cqw" }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: "1.8cqw", alignItems: "flex-start" }}>
          <span
            aria-hidden="true"
            style={{
              marginTop: "1.1cqw",
              flex: "none",
              width: "1.1cqw",
              height: "1.1cqw",
              borderRadius: "999px",
              background: "var(--slide-accent)",
            }}
          />
          <span style={{ fontSize: "2.5cqw", lineHeight: 1.4 }}>{item}</span>
        </li>
      ))}
    </ul>
  );

  switch (slide.layout) {
    case "title":
      return (
        <div style={{ ...pad, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            aria-hidden="true"
            style={{ width: "12cqw", height: "0.6cqw", background: "var(--slide-accent)", marginBottom: "3cqw" }}
          />
          {heading(slide.title, "6cqw")}
          {slide.bullets[0] ? (
            <p style={{ fontSize: "2.6cqw", color: "var(--slide-muted)", marginTop: "2.5cqw" }}>
              {slide.bullets[0]}
            </p>
          ) : null}
        </div>
      );

    case "section":
      return (
        <div style={{ ...pad, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {!sectionFilled ? (
            <div
              aria-hidden="true"
              style={{ width: "9cqw", height: "0.4cqw", background: "var(--slide-accent)", marginBottom: "2.5cqw" }}
            />
          ) : null}
          {heading(slide.title, "5.4cqw")}
        </div>
      );

    case "quote":
      return (
        <div style={{ ...pad, height: "100%", display: "flex", alignItems: "center" }}>
          <blockquote
            style={{
              margin: 0,
              width: "100%",
              background: "var(--slide-surface)",
              borderLeft: "0.8cqw solid var(--slide-accent)",
              padding: "5cqw",
            }}
          >
            <p
              style={{
                fontFamily: "var(--slide-font-heading)",
                fontSize: "3.6cqw",
                fontStyle: "italic",
                lineHeight: 1.35,
                color: "var(--slide-heading)",
                margin: 0,
              }}
            >
              {slide.bullets[0] ?? slide.title}
            </p>
            {slide.bullets[1] ? (
              <footer style={{ fontSize: "2cqw", color: "var(--slide-muted)", marginTop: "2.5cqw" }}>
                — {slide.bullets[1]}
              </footer>
            ) : null}
          </blockquote>
        </div>
      );

    case "image":
      return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {slide.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={slide.imageUrl}
              alt={slide.imageSuggestion ?? ""}
              style={{ width: "100%", height: "64%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "64%", background: "var(--slide-surface)" }} />
          )}
          <div style={{ padding: "4cqw 7cqw", flex: 1 }}>
            {heading(slide.title, "3.6cqw")}
            {slide.bullets[0] ? (
              <p style={{ fontSize: "2.1cqw", color: "var(--slide-muted)", marginTop: "1.5cqw" }}>
                {slide.bullets[0]}
              </p>
            ) : null}
          </div>
        </div>
      );

    case "image_bullets":
      return (
        <div style={{ ...pad, height: "100%", display: "flex", flexDirection: "column" }}>
          {heading(slide.title, "4.2cqw")}
          <div
            style={{
              marginTop: "3.5cqw",
              flex: 1,
              display: "grid",
              gridTemplateColumns: slide.imageUrl ? "1fr 1fr" : "1fr",
              gap: "4cqw",
              alignItems: "start",
              minHeight: 0,
            }}
          >
            {bulletList(slide.bullets)}
            {slide.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={slide.imageUrl}
                alt={slide.imageSuggestion ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </div>
        </div>
      );

    case "two_column": {
      const half = Math.ceil(slide.bullets.length / 2);
      return (
        <div style={{ ...pad, height: "100%", display: "flex", flexDirection: "column" }}>
          {heading(slide.title, "4.2cqw")}
          <div
            style={{
              marginTop: "3.5cqw",
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4cqw",
              alignItems: "start",
            }}
          >
            {bulletList(slide.bullets.slice(0, half))}
            {bulletList(slide.bullets.slice(half))}
          </div>
        </div>
      );
    }

    case "closing":
      return (
        <div style={{ ...pad, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            aria-hidden="true"
            style={{ width: "12cqw", height: "0.6cqw", background: "var(--slide-accent)", marginBottom: "3cqw" }}
          />
          {heading(slide.title, "5cqw")}
          <div style={{ marginTop: "3cqw" }}>{bulletList(slide.bullets)}</div>
        </div>
      );

    case "bullets":
    default:
      return (
        <div style={{ ...pad, height: "100%", display: "flex", flexDirection: "column" }}>
          {heading(slide.title, "4.2cqw")}
          <div
            aria-hidden="true"
            style={{ width: "7cqw", height: "0.4cqw", background: "var(--slide-accent)", marginTop: "1.8cqw" }}
          />
          <div style={{ marginTop: "3.5cqw", flex: 1, minHeight: 0 }}>{bulletList(slide.bullets)}</div>
        </div>
      );
  }
}
