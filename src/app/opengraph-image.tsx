import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#090909",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#f97316" }}>
          Veron AI //
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 96,
            fontWeight: 700,
            color: "#e5e5e5",
          }}
        >
          Veron AI
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 28,
            color: "#8a8a8a",
            maxWidth: 820,
            textAlign: "center",
          }}
        >
          One platform. Every AI capability.
        </div>
      </div>
    ),
    { ...size }
  );
}
