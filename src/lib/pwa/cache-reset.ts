"use client";

/**
 * Throw away everything the service worker cached for the signed-in app.
 *
 * WHY THIS HAS TO EXIST. The offline shell works by storing the HTML of
 * pages you have visited — and on this product those pages are your
 * dashboard: your figures, your entries, your name. That is a deliberate
 * trade (see public/sw.js), and it holds only while the cache belongs to
 * the person who filled it. Signing out is exactly the moment it stops
 * belonging to them: on a shared laptop the next person could otherwise
 * pull the previous account's dashboard out of the cache by going offline.
 *
 * The page cache is the one that must go. Static assets are hashed,
 * public, and identical for everyone, so they stay — clearing them would
 * make the next sign-in slow for no gain.
 */
export async function clearPrivatePwaCaches(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const names = await caches.keys();
    const personal = names.filter((name) => name.includes("-pages"));
    await Promise.all(personal.map((name) => caches.delete(name)));
    return personal.length;
  } catch {
    // A browser that refuses cache access (private mode, storage
    // disabled) has nothing stored to leak.
    return 0;
  }
}
