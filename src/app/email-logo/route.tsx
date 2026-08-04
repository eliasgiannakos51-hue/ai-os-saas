import { ImageResponse } from "next/og";

// Dedicated raster logo for transactional email, separate from
// /apple-icon on purpose.
//
// /apple-icon is built for a home-screen tile: the mark sits at 112px
// inside a 180px canvas with 2-3px strokes, which is right at that size
// but scales down to an almost invisible hairline once an email client
// renders it at 48px. This route draws the same mark with proportionally
// much heavier strokes on a tighter canvas, so it stays clearly legible
// at email display sizes.
//
// PNG, not SVG: most email clients (Outlook desktop especially) refuse to
// render inline or linked SVG at all, which is also why the mark can't
// just be dropped into templates.ts as markup.
export const runtime = "edge";

const SIZE = 256;

// viewBox is cropped tight around the mark and every stroke-width is
// roughly 3x the apple-icon values — that ratio is what survives the
// downscale to 56px in an inbox.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="272 97 136 136">
  <circle cx="340" cy="167" r="46" fill="none" stroke="#f5a623" stroke-width="9"/>
  <circle cx="340" cy="115" r="11" fill="#f5a623"/>
  <ellipse cx="340" cy="167" rx="64" ry="24" fill="none" stroke="#f5a623" stroke-width="7" opacity="0.85" transform="rotate(-20 340 167)"/>
</svg>`;

const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Opaque, matching the email body background — email clients
          // that ignore transparency would otherwise composite this onto
          // white and blow out the dark-on-dark design.
          background: "#0a0a0a",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_DATA_URI} width={232} height={232} alt="" />
      </div>
    ),
    { width: SIZE, height: SIZE }
  );
}
