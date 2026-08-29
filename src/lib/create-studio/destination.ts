/**
 * WHERE A CREATION WENT, NAMED THE WAY THE NAV NAMES IT.
 *
 * Create Studio results carry a `destinationKey` — a full path into the
 * message catalogue, e.g. "sidebar.items.missionControl". A full path is
 * the right thing to store: it is greppable, it is the same string the
 * modules table already keeps in `titleKey`, and it cannot drift from the
 * nav because it IS the nav's key.
 *
 * It is the wrong thing to hand to a translator. Reading it needs a
 * translator, and the obvious one — `useTranslations()` with no namespace
 * — makes the component unbounded: a component that can reach any key in
 * the catalogue disqualifies its whole route group from ever being
 * message-sliced. message-slices.test.mjs counts those, and the count is a
 * ratchet. So the path is split here instead: the namespace is declared
 * once, statically, and what the component resolves inside it is bounded
 * by the same namespace the sidebar itself already asks for.
 *
 * React-free on purpose so the gate can load it.
 */
export const DESTINATION_NAMESPACE = "sidebar";

/**
 * The part of `destinationKey` that is a key inside DESTINATION_NAMESPACE,
 * or null if the key does not live there.
 *
 * Null is not a failure to translate — it is the honest answer for a
 * destination this namespace cannot name, and the caller falls back to a
 * generic label rather than rendering a raw key path at a user.
 */
export function destinationLabelKey(destinationKey: string | null | undefined): string | null {
  if (typeof destinationKey !== "string") return null;
  const prefix = `${DESTINATION_NAMESPACE}.`;
  if (!destinationKey.startsWith(prefix)) return null;
  const rest = destinationKey.slice(prefix.length);
  return rest.length > 0 ? rest : null;
}
