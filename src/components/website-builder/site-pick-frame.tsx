"use client";

import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { PICK_MESSAGE, PICKER_SANDBOX, pickablePreview, readPickMessage } from "@/lib/website-builder/preview-picker";

/**
 * THE SITE'S LIVE PREVIEW IN THE EDITOR LAYOUT (the switch "editor-shell",
 * docs/design/approved/08-Site.png): a part of the page is pressed in the
 * page itself — hover shows it can be, the chosen one has the 2px white
 * outline and «<part> · selected» over its edge. What runs inside the
 * frame, and why only that, is lib/website-builder/preview-picker.ts.
 *
 * The page is written into the frame once per page: choosing a part is a
 * message to the frame, not a new document, so the page keeps its scroll
 * when a part lower down is pressed (the old preview reloaded on every
 * choice, lib/website-boxes.ts, outlineBoxes).
 *
 * The app listens only to this frame's own window, and takes from it only
 * what readPickMessage admits: "ready", or a whole, non-negative index —
 * which the caller then checks against the parts it has.
 */
export function SitePickFrame({
  html,
  chosen,
  chosenLabel,
  onPick,
  title,
  hint,
}: {
  html: string;
  chosen: number | null;
  /** «Hero · selected», in the reader's language. */
  chosenLabel: string;
  onPick: (index: number) => void;
  title: string;
  /** How a part is chosen, said to a screen reader (the frame's description). */
  hint: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const hintId = useId();
  const srcDoc = useMemo(() => pickablePreview(html), [html]);
  const latest = useRef({ chosen, chosenLabel, onPick });
  latest.current = { chosen, chosenLabel, onPick };

  // The frame's origin is opaque, so "*" is the only address a message to
  // it can carry; what it carries is an index and a label the page itself
  // already shows.
  const tell = useCallback(() => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    target.postMessage({ source: PICK_MESSAGE, type: "select", index: latest.current.chosen, label: latest.current.chosenLabel }, "*");
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = readPickMessage(event.data);
      if (!message) return;
      if (message.type === "ready") tell();
      else latest.current.onPick(message.index);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tell]);

  useEffect(() => {
    tell();
  }, [chosen, chosenLabel, tell]);

  return (
    <>
      <p id={hintId} className="sr-only">
        {hint}
      </p>
      <iframe
        ref={frame}
        srcDoc={srcDoc}
        sandbox={PICKER_SANDBOX}
        title={title}
        aria-describedby={hintId}
        data-testid="site-live-preview"
        data-pickable=""
        // 480px from a computer up rather than 60vh: the page then ends
        // above the field that floats over the stage's last 140px, with its
        // AI line, instead of running under them (08-Site.png's 600px frame).
        className="h-full min-h-[60vh] w-full flex-1 bg-paper lg:min-h-[480px]"
      />
    </>
  );
}
