"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Hash, Lock, MessageSquare, Shield, Undo2, Volume2, X, AlertTriangle, Megaphone, Folder, Users } from "lucide-react";
import { ToolShell, ChosenBox, type ShellTurn } from "@/components/shell/tool-shell";
import { PanelGroup } from "@/components/shell/editor-shell";
import { Earth } from "@/components/brand/earth";
import { readNdjsonStream } from "@/lib/ndjson-stream";
import { messageBoxKey, planBoxes, type Blueprint, type BoxKind, type ChannelPlan, type Overwrite } from "@/lib/discord/blueprint";
import { ROLE_ELEVATED, type ElevatedPermission, type PermissionName } from "@/lib/discord/permissions";
import type { DiscordScreen } from "@/lib/discord/screen";

type BoxState = "made" | "failed" | "deleted";
type Build = NonNullable<DiscordScreen["build"]>;

/**
 * DISCORD ON THE SHARED SHELL (the owner's Discord directive, 2026-11-05).
 *
 * Three screens, in the order a person meets them:
 *   1. a value missing on the deployment: what is missing, and nothing to press;
 *   2. no server connected: one line on making an empty server, and «Σύνδεσε
 *      το Ionexa» (api/discord/connect, the bot invite);
 *   3. a server connected: the field, and once there is a plan, the plan
 *      as boxes — roles, categories with their channels, the two messages,
 *      AutoMod — each pressable to change with words, each deletable
 *      before it is made, a role's elevated permissions as ticks only the
 *      person can set. ONE white primary, «Φτιάξ' το στο Discord»; after it,
 *      every box says made or failed as Discord answers, and «Αναίρεση»
 *      deletes only what was made.
 */
export function DiscordShell({ initial, flash, botPermissions }: { initial: DiscordScreen; flash: string | null; botPermissions: PermissionName[] }) {
  const t = useTranslations("dashboard.discord");
  const tNames = useTranslations("dashboard.tools.names");
  const router = useRouter();
  const [build, setBuild] = useState<Build | null>(initial.build);
  const [items, setItems] = useState(initial.items);
  const [guildId, setGuildId] = useState(initial.build?.guildId ?? initial.guilds[0]?.id ?? "");
  const [turns, setTurns] = useState<ShellTurn[]>(() => (flash ? [{ id: "flash", role: "tool", text: t(`flash.${flash}`) }] : []));
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"plan" | "apply" | "undo" | "edit" | null>(null);
  const [live, setLive] = useState<Record<string, BoxState>>({});
  const abortRef = useRef<AbortController | null>(null);

  const say = (text: string) => setTurns((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, role: "tool", text }]);
  const errorText = (code: string, extra: Record<string, unknown> = {}) => (t.has(`errors.${code}`) ? t(`errors.${code}`, { needed: String(extra.needed ?? "") }) : t("errors.failed"));

  const states = useMemo(() => {
    const out: Record<string, BoxState> = {};
    for (const i of items) out[i.boxKey] = i.deleted ? "deleted" : "made";
    return { ...out, ...live };
  }, [items, live]);
  const notes = useMemo(() => Object.fromEntries(items.filter((i) => i.note).map((i) => [i.boxKey, i.note!])), [items]);
  const madeCount = items.filter((i) => !i.deleted).length + Object.values(live).filter((s) => s === "made").length;
  const anyLive = Object.values(states).some((s) => s === "made");

  // ---- 1. a value missing -------------------------------------------------
  if (initial.missing.length > 0 || initial.unreadable) {
    return (
      <Landing heading={t("notConfigured.heading")} why={initial.unreadable ? t("notConfigured.unreadable") : t("notConfigured.why", { names: initial.missing.join(", ") })} testid="discord-not-configured" />
    );
  }
  // ---- 2. no server -------------------------------------------------------
  if (initial.guilds.length === 0) {
    return (
      <Landing heading={t("connect.heading")} why={t("connect.why")} testid="discord-connect" flash={flash ? t(`flash.${flash}`) : null}>
        <a href="/api/discord/connect" data-testid="discord-connect-button" className="inline-flex min-h-[44px] items-center rounded-item bg-button px-5 text-sm font-semibold text-button-ink">
          {t("connect.button")}
        </a>
        <p className="max-w-sm text-xs leading-relaxed text-muted">{t("connect.permissions", { list: botPermissions.map((p) => t(`perm.${p}`)).join(", ") })}</p>
      </Landing>
    );
  }

  // ---- 3. the plan ----------------------------------------------------------
  const bp = build?.blueprint ?? null;
  const editable = build?.status === "planned" && !anyLive;
  const boxName = (key: string): string => {
    if (!bp) return key;
    const found = [...bp.roles, ...bp.categories, ...bp.channels, ...bp.automod].find((b) => b.key === key);
    if (found) return found.name;
    const msg = bp.messages.find((m) => messageBoxKey(m.key) === key);
    return msg ? t(`message.${msg.key}`) : key;
  };

  async function post(path: string, payload: Record<string, unknown>) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: abortRef.current?.signal });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok && body?.ok === true, body: body ?? {} };
  }

  async function send(text: string) {
    if (busy) return;
    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
    abortRef.current = new AbortController();
    setBusy("plan");
    try {
      const change = Boolean(build && editable);
      const { ok, body } = await post("/api/discord/plan", change ? { action: "change", build: build!.id, said: text, box: selected } : { action: "plan", guild: guildId, said: text });
      if (!ok) return say(errorText(String(body.code ?? "failed"), body));
      if (typeof body.question === "string") return say(body.question);
      const next = body.build as Build;
      setBuild(next);
      if (!change) {
        setItems([]);
        setLive({});
      }
      say(change ? (selected ? t("changedOne", { name: boxName(selected) }) : t("changed")) : t("planned", { roles: next.blueprint.roles.length, channels: next.blueprint.channels.length }));
    } catch {
      say(t("errors.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function edit(payload: Record<string, unknown>) {
    if (!build || busy) return;
    setBusy("edit");
    try {
      const { ok, body } = await post("/api/discord/plan", { build: build.id, ...payload });
      if (!ok) return say(errorText(String(body.code ?? "failed")));
      const next = body.build as Build;
      setBuild({ ...build, blueprint: next.blueprint, version: next.version });
      if (payload.action === "remove" && selected === payload.box) setSelected(null);
    } finally {
      setBusy(null);
    }
  }

  async function run(action: "apply" | "undo") {
    if (!build || busy) return;
    if (action === "undo" && !window.confirm(t("undoConfirm"))) return;
    setBusy(action);
    setSelected(null);
    try {
      const res = await fetch("/api/discord/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ build: build.id, action }) });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return say(errorText(String(body.code ?? "failed")));
      }
      let done: Record<string, unknown> | null = null;
      let madeAny = false;
      const { interrupted } = await readNdjsonStream(res.body, (event) => {
        const box = String(event.box ?? "");
        if (event.type === "made") {
          madeAny = true;
          setLive((p) => ({ ...p, [box]: "made" }));
        } else if (event.type === "failed") setLive((p) => ({ ...p, [box]: "failed" }));
        else if (event.type === "deleted") setLive((p) => ({ ...p, [box]: "deleted" }));
        else if (event.type === "done") done = event;
      });
      const finished = done as Record<string, unknown> | null;
      // A DROPPED CONNECTION IS NOT A REFUSAL. Without this branch a lost
      // connection fell straight to errors.failed below — the same "Try
      // again" a server actually refusing something gets — even when
      // several boxes HAD already been made in Discord (madeAny), which
      // would then be remade or double-charged on a retry the person had
      // no reason to think was necessary.
      if (interrupted) say(madeAny ? t("streamInterruptedPartial") : t("streamInterrupted"));
      else if (finished?.status === "applied") say(t("applied"));
      else if (action === "undo" && finished?.status === "planned") say(t("undone"));
      else say(finished?.failedBox ? t("stoppedAt", { name: boxName(String(finished.failedBox)) }) : t("errors.failed"));
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function disconnect() {
    if (!window.confirm(t("disconnectConfirm"))) return;
    const res = await fetch(`/api/discord?guild=${encodeURIComponent(guildId)}`, { method: "DELETE" });
    if (!res.ok) return say(t("errors.failed"));
    router.refresh();
  }

  const status = build ? t(`status.${busy === "apply" ? "applying" : busy === "undo" ? "undoing" : anyLive && build.status === "planned" ? "applied" : build.status}`) : null;
  const guildName = initial.guilds.find((g) => g.id === guildId)?.name ?? "";

  const work = bp
    ? {
        title: bp.title,
        status,
        primary: editable ? { label: t("primary"), onClick: () => void run("apply"), busy: busy === "apply", disabled: busy !== null } : null,
        actions: anyLive ? (
          <button type="button" onClick={() => void run("undo")} disabled={busy !== null} data-testid="discord-undo" className="inline-flex min-h-[44px] items-center gap-2 rounded-item border border-border px-3 text-sm text-foreground hover:bg-panel-hover disabled:opacity-50">
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            {t("undo")}
          </button>
        ) : null,
        panel: (
          <div className="space-y-5">
            <PanelGroup label={t("server")}>
              <p className="break-words text-sm text-foreground">{guildName}</p>
              <button type="button" onClick={() => void disconnect()} data-testid="discord-disconnect" className="mt-2 min-h-[44px] text-xs text-muted underline underline-offset-2 hover:text-foreground">
                {t("disconnect")}
              </button>
            </PanelGroup>
            <PanelGroup label={t("priceLabel")}>
              <p className="text-xs leading-relaxed text-body">{t("price", { credits: initial.price })}</p>
            </PanelGroup>
            <PanelGroup label={t("slashLabel")}>
              <p className="text-xs leading-relaxed text-body">{t("slash")}</p>
            </PanelGroup>
          </div>
        ),
        body: (
          <PlanBoxes
            bp={bp}
            states={states}
            notes={notes}
            selected={selected}
            editable={editable && busy === null}
            onSelect={(k) => setSelected((cur) => (cur === k ? null : k))}
            onRemove={(k) => void edit({ action: "remove", box: k })}
            onTick={(role, permission, on) => void edit({ action: "tick", role, permission, on })}
          />
        ),
      }
    : null;

  return (
    <ToolShell
      name={tNames("discord")}
      turns={turns}
      working={busy === "plan" ? <span className="text-xs text-muted">{build && editable ? t("changing") : t("planning")}</span> : busy === "apply" ? <span className="text-xs text-muted">{t("making", { n: madeCount })}</span> : null}
      placeholder={selected ? t("boxPlaceholder", { name: boxName(selected) }) : build && editable ? t("changePlaceholder") : t("placeholder")}
      sending={busy === "plan"}
      onSend={(text) => void send(text)}
      onStop={() => abortRef.current?.abort()}
      holdSend={busy !== null && busy !== "plan"}
      options={
        initial.guilds.length > 1 && !build
          ? [
              <select key="guild" value={guildId} onChange={(e) => setGuildId(e.target.value)} aria-label={t("server")} data-testid="discord-guild" className="chip-link min-h-[44px] bg-transparent">
                {initial.guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>,
            ]
          : []
      }
      empty={{
        heading: t("empty.heading"),
        why: t("empty.why", { server: guildName }),
        examples: [
          { key: "bakery", label: t("empty.examples.bakery") },
          { key: "club", label: t("empty.examples.club") },
          { key: "class", label: t("empty.examples.class") },
        ],
      }}
      selection={selected ? { label: boxName(selected), onClear: () => setSelected(null) } : null}
      cost={t("cost", { credits: initial.price })}
      footer={
        <>
          {selected && <ChosenBox label={boxName(selected)} onClear={() => setSelected(null)} />}
          <p className="text-[11px] text-muted">{t("cost", { credits: initial.price })}</p>
        </>
      }
      work={work}
    />
  );
}

function Landing({ heading, why, testid, flash, children }: { heading: string; why: string; testid: string; flash?: string | null; children?: React.ReactNode }) {
  return (
    <div data-testid={testid} className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Earth variant="small" px={96} />
      <h1 className="text-2xl font-medium tracking-tight text-foreground">{heading}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{why}</p>
      {flash && (
        <p role="status" data-testid="discord-flash" className="text-sm text-foreground">
          {flash}
        </p>
      )}
      {children}
    </div>
  );
}

const KIND_ICON: Record<ChannelPlan["kind"], typeof Hash> = { text: Hash, voice: Volume2, forum: MessageSquare, announcement: Megaphone };

function StateMark({ state }: { state: BoxState | undefined }) {
  const t = useTranslations("dashboard.discord");
  if (!state) return null;
  const Icon = state === "made" ? Check : state === "failed" ? AlertTriangle : Undo2;
  return (
    <span data-testid="discord-box-state" data-state={state} className={`inline-flex shrink-0 items-center gap-1 text-[11px] ${state === "made" ? "text-success" : state === "failed" ? "text-danger" : "text-muted"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {t(`state.${state}`)}
    </span>
  );
}

function PlanBoxes(props: {
  bp: Blueprint;
  states: Record<string, BoxState>;
  notes: Record<string, string>;
  selected: string | null;
  editable: boolean;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onTick: (role: string, permission: ElevatedPermission, on: boolean) => void;
}) {
  const t = useTranslations("dashboard.discord");
  const { bp, states, notes, selected, editable } = props;
  const roleName = (k: string) => (k === "everyone" ? "@everyone" : (bp.roles.find((r) => r.key === k)?.name ?? k));
  const access = (ows: Overwrite[]) => {
    const hidden = ows.some((o) => o.target === "everyone" && o.deny.includes("view_channel"));
    if (hidden) return t("private", { roles: ows.filter((o) => o.target !== "everyone" && o.allow.includes("view_channel")).map((o) => roleName(o.target)).join(", ") || "—" });
    if (ows.some((o) => o.target === "everyone" && o.deny.includes("send_messages"))) return t("readOnly");
    return null;
  };

  const common = (k: string) => ({ selected: selected === k, editable, state: states[k], note: notes[k] ?? null, onSelect: props.onSelect, onRemove: props.onRemove });

  const channelBox = (c: ChannelPlan) => {
    const Icon = KIND_ICON[c.kind];
    return <PlanBox key={c.key} {...common(c.key)} k={c.key} kind="channel" icon={<Icon className="h-4 w-4" aria-hidden="true" />} title={c.name} lines={[t(`kind.${c.kind}`), c.topic, access(c.overwrites)]} />;
  };

  const loose = bp.channels.filter((c) => c.category === null);
  return (
    <div data-testid="discord-plan" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <p className="text-xs text-muted">{t("boxCount", { n: planBoxes(bp).length })}</p>
      {bp.roles.length > 0 && (
        <section aria-label={t("section.roles")}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("section.roles")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {bp.roles.map((r) => (
              <PlanBox key={r.key} {...common(r.key)} k={r.key} kind="role" icon={<Shield className="h-4 w-4" aria-hidden="true" style={r.colour ? { color: r.colour } : undefined} />} title={r.name} lines={[r.hoist ? t("hoist") : null]}>
                {(r.ask.length > 0 || r.granted.length > 0) && (
                  <div className="space-y-2 border-t border-border px-3 py-2">
                    <p className="text-[11px] text-muted">{t("tickTitle")}</p>
                    {ROLE_ELEVATED.filter((p) => r.ask.includes(p) || r.granted.includes(p)).map((p) => (
                      <label key={p} className="flex min-h-[44px] items-start gap-2 text-xs text-body">
                        <input type="checkbox" checked={r.granted.includes(p)} disabled={!editable} onChange={(e) => props.onTick(r.key, p, e.target.checked)} data-testid="discord-tick" className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t(`elevated.${p}`)}</span>
                      </label>
                    ))}
                    <p className="text-[11px] text-muted">{t("refusedNote")}</p>
                  </div>
                )}
              </PlanBox>
            ))}
          </ul>
        </section>
      )}
      <section aria-label={t("section.channels")}>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("section.channels")}</h2>
        <ul className="space-y-3">
          {bp.categories.map((cat) => (
            <PlanBox key={cat.key} {...common(cat.key)} k={cat.key} kind="category" icon={<Folder className="h-4 w-4" aria-hidden="true" />} title={cat.name} lines={[t("kind.category"), access(cat.overwrites)]}>
              <ul className="space-y-2 px-3 pb-3">{bp.channels.filter((c) => c.category === cat.key).map(channelBox)}</ul>
            </PlanBox>
          ))}
          {loose.map(channelBox)}
        </ul>
      </section>
      {bp.messages.length > 0 && (
        <section aria-label={t("section.messages")}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("section.messages")}</h2>
          <ul className="space-y-2">
            {bp.messages.map((m) => (
              <PlanBox key={m.key} {...common(messageBoxKey(m.key))} k={messageBoxKey(m.key)} kind="message" icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />} title={t(`message.${m.key}`)} lines={[`#${bp.channels.find((c) => c.key === m.channel)?.name ?? m.channel}`]}>
                <p className="whitespace-pre-wrap break-words border-t border-border px-3 py-2 text-xs leading-relaxed text-body">{m.text}</p>
              </PlanBox>
            ))}
          </ul>
        </section>
      )}
      {bp.automod.length > 0 && (
        <section aria-label={t("section.automod")}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("section.automod")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {bp.automod.map((a) => (
              <PlanBox key={a.key} {...common(a.key)} k={a.key}
                kind="automod"
                icon={a.kind === "mentions" ? <Users className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                title={a.name}
                lines={[
                  a.kind === "keywords"
                    ? t("automod.keywords", { n: a.keywords.length })
                    : a.kind === "preset"
                      ? t("automod.preset", { list: a.presets.map((p) => t(`preset.${p}`)).join(", ") })
                      : a.kind === "mentions"
                        ? t("automod.mentions", { n: a.limit })
                        : t("automod.spam"),
                ]}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanBox(p: {
  k: string;
  kind: BoxKind;
  icon: React.ReactNode;
  title: string;
  lines: (string | null)[];
  children?: React.ReactNode;
  selected: boolean;
  editable: boolean;
  state: BoxState | undefined;
  note: string | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const t = useTranslations("dashboard.discord");
  return (
    <li data-testid="discord-box" data-kind={p.kind} data-key={p.k} className={`rounded-card border bg-panel transition-colors duration-150 ${p.selected ? "border-foreground" : "border-border"}`}>
      <div className="flex items-start gap-2 p-1">
        <button type="button" onClick={() => p.onSelect(p.k)} aria-pressed={p.selected} className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 rounded-item px-2 py-2 text-start">
          <span className="mt-0.5 shrink-0 text-muted">{p.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm text-foreground">{p.title}</span>
            {p.lines.filter(Boolean).map((line) => (
              <span key={line} className="block break-words text-xs text-muted">
                {line}
              </span>
            ))}
            {p.note && <span className="block text-xs text-warning">{t(`note.${p.note}`)}</span>}
          </span>
          <StateMark state={p.state} />
        </button>
        {p.editable && (
          <button type="button" onClick={() => p.onRemove(p.k)} aria-label={t("deleteBox")} title={t("deleteBox")} data-testid="discord-box-delete" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {p.children}
    </li>
  );
}
