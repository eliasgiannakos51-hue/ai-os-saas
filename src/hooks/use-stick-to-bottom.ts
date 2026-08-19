"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Auto-scroll that respects the reader.
 *
 * WHAT WAS REPORTED. "When I send a message the page goes down and DOES
 * NOT LET ME scroll up to read the earlier ones. It throws me back down."
 * The cause was an effect that scrolled to the bottom on every change of
 * `streamingText` — during a streamed reply that is every chunk, several
 * times a second, so any attempt to scroll up was undone within
 * milliseconds. A scroll view the reader cannot control is not a scroll
 * view.
 *
 * The contract, exactly as specified:
 *   1. new content auto-scrolls ONLY while the reader is already at the
 *      bottom (within STICK_THRESHOLD_PX);
 *   2. the moment they scroll up, following STOPS — including mid-stream;
 *   3. content that arrives while they are up shows a "new message ↓"
 *      affordance instead of moving them;
 *   4. pressing it, or scrolling back down, resumes following.
 *
 * Attach `containerRef` + `onScroll` to the scrollable element, call
 * `follow()` whenever content changes (messages, stream chunks), render
 * the jump button when `newBelow` is true.
 *
 * Intent lives in a ref, not state: the scroll handler runs at scroll
 * frequency and must not re-render the thread it is watching — that
 * would be the input-latency bug wearing a different hat.
 */

const STICK_THRESHOLD_PX = 96;

export function useStickToBottom() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [newBelow, setNewBelow] = useState(false);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    stickRef.current = atBottom;
    if (atBottom) setNewBelow(false);
  }, []);

  /** Call when content below may have grown. Instant, not smooth: a
   *  smooth animation re-triggered on every stream chunk never settles,
   *  and its intermediate positions read as "not at bottom". */
  const follow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight > STICK_THRESHOLD_PX) {
      setNewBelow(true);
    }
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    stickRef.current = true;
    setNewBelow(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  /** For switching to a different thread: a NEW conversation opens at its
   *  latest message regardless of where the reader was in the old one. */
  const resetToBottom = useCallback(() => {
    stickRef.current = true;
    setNewBelow(false);
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Stay pinned when the container itself resizes (images load, the
  // composer grows) while the reader is at the bottom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current && el) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { containerRef, onScroll, follow, jumpToBottom, resetToBottom, newBelow };
}
