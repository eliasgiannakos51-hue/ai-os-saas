import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icons need an opaque background, so the underlying <rect>
// from the icon-only mark is kept here (unlike icon.svg's siblings, which
// can rely on their own container for contrast). satori (ImageResponse's
// renderer) only accepts div/span/img/text as input elements, not raw
// <svg>/<path> — so the mark is embedded as a base64 data URI <img> instead
// of being reproduced as inline satori-JSX paths.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="270 95 140 140">
  <circle cx="340" cy="165" r="42" fill="none" stroke="#f5a623" stroke-width="3"/>
  <circle cx="340" cy="123" r="6" fill="#f5a623"/>
  <ellipse cx="340" cy="165" rx="60" ry="22" fill="none" stroke="#f5a623" stroke-width="2" opacity="0.5" transform="rotate(-20 340 165)"/>
</svg>`;

const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_DATA_URI} width={112} height={112} alt="" />
      </div>
    ),
    { ...size }
  );
}
