import type { MyStuffKind } from "@/lib/my-stuff/sources";

/** Shared between the workspace (list+details, the primary screen) and
 *  the Q&A field it hosts — kept here, not in either component file, so
 *  neither has to import the other just for a type. */
export type MyStuffCitation = { kind: MyStuffKind; id: string; title: string; href: string };
export type MyStuffSessionTurn = { role: "user" | "tool"; text: string; citations?: MyStuffCitation[] };
export type MyStuffSession = { id: string; title: string; turns: MyStuffSessionTurn[] };
