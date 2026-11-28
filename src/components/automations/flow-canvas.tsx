"use client";

/**
 * n8n-STYLE VISUAL CANVAS using React Flow (@xyflow/react).
 *
 * Phase 1 of the n8n spec (2026-11-26):
 * - Square node cards (80px) with colored circular icon, title + subtitle
 * - Input port (rectangle, left), output port (circle, right)
 * - IF/Switch nodes: extra output with true/false labels
 * - Status badge (✓ count / ✕ / pulse / waiting) from run progress
 * - Trigger badge (⚡) on start nodes
 * - Maturity indicator: nodes that don't really execute show "soon"
 * - Waterfall layout: 8 nodes per row, then drops down
 *
 * Run: src/components/automations/automation-shell.tsx uses this via
 * FlowCanvasView (the exported wrapper).
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MarkerType,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowUpDown, BarChart3, Calendar, Check, Clock, Code2, FileOutput, Filter, GitBranch, GitCompare, GitMerge, Globe, Hash, Heart, FileText, Layers, List, ListFilter, PauseCircle, RefreshCw, Reply, Scissors, Send, Sparkles, Split, Table2, Terminal, Timer, Type, X as XIcon, Zap, Play, Mail, Database, Webhook, ChevronRight, Plus, Search } from "lucide-react";
import type { Box, StartBox, FlowEdge, FlowGroup, NodePosition } from "@/lib/automations/boxes";
import type { Connected } from "@/components/automations/flow-boxes";
import { matchesSearch } from "@/lib/text/search-match";
import type { BoxState, RunProgress } from "@/lib/automations/run-progress";
import type { ShownFlow } from "@/lib/automations/flow-view";

/* ───────────────────── n8n COLOR SYSTEM ───────────────────── */

const THEME: Record<Box["kind"], { accent: string }> = {
  start:     { accent: "#00b050" },
  read:      { accent: "#1a73e8" },
  ai:        { accent: "#7c3aed" },
  condition: { accent: "#ff6d00" },
  approval:  { accent: "#ff6d00" },
  filter:    { accent: "#ff6d00" },
  switch:    { accent: "#ff6d00" },
  action:    { accent: "#1a73e8" },
  code:      { accent: "#0d7377" },
  wait:      { accent: "#9c27b0" },
  delay:     { accent: "#9c27b0" },
  date_time: { accent: "#9c27b0" },
  transform: { accent: "#0097a7" },
  note:      { accent: "#8d6e63" },
  error_handler: { accent: "#d32f2f" },
  stop_error:    { accent: "#d32f2f" },
  loop:          { accent: "#1565c0" },
  split:         { accent: "#00897b" },
  merge:         { accent: "#6a1b9a" },
  sort:              { accent: "#0097a7" },
  limit:             { accent: "#0097a7" },
  remove_duplicates: { accent: "#0097a7" },
  summarize:         { accent: "#7c3aed" },
  set:               { accent: "#0097a7" },
  compare:           { accent: "#0097a7" },
  aggregate:         { accent: "#0097a7" },
  split_out:         { accent: "#0097a7" },
  rename_keys:       { accent: "#0097a7" },
  xml:               { accent: "#2e7d32" },
  markdown:          { accent: "#2e7d32" },
  html_extract:      { accent: "#2e7d32" },
  spreadsheet_parse: { accent: "#2e7d32" },
  crypto:            { accent: "#2e7d32" },
  text_classifier:   { accent: "#7c3aed" },
  sentiment:         { accent: "#7c3aed" },
  extract_info:      { accent: "#7c3aed" },
  ai_agent:          { accent: "#7c3aed" },
  llm_chain:         { accent: "#7c3aed" },
  retrieval_qa:      { accent: "#7c3aed" },
  summarization_chain: { accent: "#7c3aed" },
  respond_webhook:   { accent: "#1a73e8" },
  http_response:     { accent: "#1a73e8" },
  graphql:           { accent: "#1a73e8" },
  smtp_send:         { accent: "#1a73e8" },
  ftp:               { accent: "#1a73e8" },
  ssh:               { accent: "#0d7377" },
  execute_command:   { accent: "#0d7377" },
  execute_workflow:  { accent: "#6a1b9a" },
  read_file:         { accent: "#1a73e8" },
  write_file:        { accent: "#1a73e8" },
  no_op:             { accent: "#78909c" },
};

/** Nodes that are placeholder only — show "soon" badge. Checked against
 *  lib/automations/runner.ts on 2026-11-27: "switch" (routes by its rules
 *  when the graph switch is on) and the four AI nodes (ai_agent, llm_chain,
 *  retrieval_qa, summarization_chain → runAi) do real work, so they carry no
 *  badge, and so do limit / sort / remove_duplicates / set while the switch
 *  "automation-real-logic" is open (lib/automations/transforms.ts); everything left here only passes its data through. */
const SOON_KINDS = new Set<Box["kind"]>([
  "code", "execute_command", "ssh", "loop", "split", "merge", "delay",
  "compare",
  "aggregate", "split_out", "rename_keys",
]);

/** Branching nodes that get extra output handles. */
const IF_KINDS = new Set<Box["kind"]>(["condition", "filter"]);
const SWITCH_KINDS = new Set<Box["kind"]>(["switch"]);

/* ───────────────────── KIND NAMES & DESCRIPTIONS ───────────────────── */

function useKindNames() {
  const t = useTranslations("dashboard.automations");
  return {
    start: t("kinds.start"), read: t("kinds.read"), ai: t("kinds.ai"),
    condition: t("kinds.condition"), approval: t("kinds.approval"), action: t("kinds.action"),
    filter: "Filter", code: "Code", wait: "Wait", transform: "Transform", note: "Note",
    error_handler: "Error Handler", loop: "Loop", split: "Split", merge: "Merge", delay: "Delay",
    sort: "Sort", limit: "Limit", remove_duplicates: "Deduplicate", summarize: "Summarize",
    switch: "Switch", set: "Set", compare: "Compare", date_time: "Date/Time",
    html_extract: "HTML", text_classifier: "Classifier", sentiment: "Sentiment",
    extract_info: "Extract", respond_webhook: "Webhook Resp.", execute_command: "Command",
    aggregate: "Aggregate", split_out: "Split Out", rename_keys: "Rename",
    xml: "XML", markdown: "Markdown", crypto: "Crypto", spreadsheet_parse: "Sheet",
    no_op: "No Op", stop_error: "Stop", execute_workflow: "Sub-Flow",
    read_file: "Read File", write_file: "Write File", smtp_send: "Email",
    ftp: "FTP", ssh: "SSH", graphql: "GraphQL", ai_agent: "AI Agent",
    llm_chain: "LLM Chain", retrieval_qa: "QA", summarization_chain: "Summarize",
    http_response: "HTTP Resp.",
  };
}

function useDescribe() {
  const t = useTranslations("dashboard.automations");
  const src = (key: string) => { try { return t(`sources.${key}` as never); } catch { return key.replace(/_/g, " "); } };
  const act = (key: string) => { try { return t(`actions.${key}` as never); } catch { return key.replace(/_/g, " "); } };
  const weekday = [t("weekdays.d1"), t("weekdays.d2"), t("weekdays.d3"), t("weekdays.d4"), t("weekdays.d5"), t("weekdays.d6"), t("weekdays.d7")];
  return (box: Box): string => {
    if (box.kind === "start") {
      const s = box as StartBox;
      if (s.when === "file_uploaded") return t("start.file");
      if (s.when === "webhook") return t("start.webhook");
      if (s.when === "new_email") return t("start.new_email");
      if (s.when === "rss") return t("start.rss");
      if (s.when === "manual") return t("start.manual");
      if (s.when === "time") {
        if (s.every === "day") return t("start.day", { at: s.at });
        if (s.every === "week") return t("start.week", { day: weekday[(s.weekday ?? 1) - 1], at: s.at });
        return t("start.month", { day: s.monthDay ?? 1, at: s.at });
      }
      return t("start.file");
    }
    if (box.kind === "read") return src(box.source);
    if (box.kind === "ai") return box.instruction.slice(0, 30);
    if (box.kind === "condition") return t("condition");
    if (box.kind === "approval") return t("approval");
    if (box.kind === "filter") return box.expression.slice(0, 25);
    if (box.kind === "code") return box.language;
    if (box.kind === "wait") return `${box.duration} ${box.unit}`;
    if (box.kind === "transform") return box.instruction.slice(0, 25);
    if (box.kind === "note") return box.text.slice(0, 20) || "Note";
    if (box.kind === "error_handler") return box.fallbackAction;
    if (box.kind === "loop") return `max ${box.maxIterations}`;
    if (box.kind === "split") return `batch ${box.batchSize}`;
    if (box.kind === "merge") return box.mode;
    if (box.kind === "delay") return `${box.delay} ${box.unit}`;
    if (box.kind === "sort") return box.field;
    if (box.kind === "limit") return `${box.maxItems}`;
    if (box.kind === "remove_duplicates") return box.field;
    if (box.kind === "summarize") return `${box.operation}(${box.field})`;
    if (box.kind === "switch") return box.field;
    if (box.kind === "set") return "Set";
    if (box.kind === "compare") return box.mode.replace(/_/g, " ");
    if (box.kind === "date_time") return box.operation;
    if (box.kind === "html_extract") return box.selector.slice(0, 20);
    if (box.kind === "text_classifier") return box.categories.slice(0, 2).join(", ");
    if (box.kind === "sentiment") return "Analyze";
    if (box.kind === "extract_info") return box.fields.slice(0, 2).join(", ");
    if (box.kind === "respond_webhook") return `${box.statusCode}`;
    if (box.kind === "execute_command") return box.command.slice(0, 20);
    if (box.kind === "aggregate") return box.operation;
    if (box.kind === "split_out") return box.field;
    if (box.kind === "rename_keys") return "Rename";
    if (box.kind === "xml") return box.direction === "xml_to_json" ? "XML→JSON" : "JSON→XML";
    if (box.kind === "markdown") return box.direction === "md_to_html" ? "MD→HTML" : "HTML→MD";
    if (box.kind === "crypto") return box.operation;
    if (box.kind === "spreadsheet_parse") return box.format.toUpperCase();
    if (box.kind === "no_op") return "Pass";
    if (box.kind === "stop_error") return box.message.slice(0, 15);
    if (box.kind === "execute_workflow") return box.workflowId.slice(0, 12);
    if (box.kind === "read_file") return box.path.slice(0, 15);
    if (box.kind === "write_file") return box.path.slice(0, 15);
    if (box.kind === "smtp_send") return box.host.slice(0, 12);
    if (box.kind === "ftp") return box.operation;
    if (box.kind === "ssh") return box.command.slice(0, 15);
    if (box.kind === "graphql") return "Query";
    if (box.kind === "ai_agent") return box.instruction.slice(0, 20);
    if (box.kind === "llm_chain") return box.prompt.slice(0, 20);
    if (box.kind === "retrieval_qa") return box.question.slice(0, 20);
    if (box.kind === "summarization_chain") return "Summarize";
    if (box.kind === "http_response") return `${box.statusCode}`;
    if (box.kind === "action") return act(box.do);
    return "";
  };
}

/* ───────────────────── NODE ICON ───────────────────── */

function NodeIcon({ kind, size = 16 }: { kind: Box["kind"]; size?: number }) {
  const s = { width: size, height: size };
  const icons: Partial<Record<Box["kind"], React.ReactNode>> = {
    start: <Play style={s} />, read: <Database style={s} />, ai: <Sparkles style={s} />,
    condition: <GitBranch style={s} />, approval: <PauseCircle style={s} />, filter: <Filter style={s} />,
    code: <Code2 style={s} />, wait: <Clock style={s} />, transform: <Layers style={s} />,
    note: <FileText style={s} />, error_handler: <AlertTriangle style={s} />, loop: <RefreshCw style={s} />,
    split: <GitBranch style={s} />, merge: <GitMerge style={s} />, delay: <Timer style={s} />,
    sort: <ArrowUpDown style={s} />, limit: <ListFilter style={s} />, remove_duplicates: <Scissors style={s} />,
    summarize: <BarChart3 style={s} />, switch: <Split style={s} />, set: <Type style={s} />,
    compare: <GitCompare style={s} />, date_time: <Calendar style={s} />, html_extract: <Code2 style={s} />,
    text_classifier: <List style={s} />, sentiment: <Heart style={s} />, extract_info: <FileOutput style={s} />,
    respond_webhook: <Webhook style={s} />, execute_command: <Terminal style={s} />,
    aggregate: <Layers style={s} />, split_out: <GitBranch style={s} />, rename_keys: <Type style={s} />,
    xml: <Code2 style={s} />, markdown: <FileText style={s} />, crypto: <Hash style={s} />,
    spreadsheet_parse: <Table2 style={s} />, no_op: <ChevronRight style={s} />,
    stop_error: <AlertTriangle style={s} />, execute_workflow: <RefreshCw style={s} />,
    read_file: <FileText style={s} />, write_file: <FileOutput style={s} />, smtp_send: <Mail style={s} />,
    ftp: <Globe style={s} />, ssh: <Terminal style={s} />, graphql: <Globe style={s} />,
    ai_agent: <Sparkles style={s} />, llm_chain: <Sparkles style={s} />,
    retrieval_qa: <Sparkles style={s} />, summarization_chain: <Sparkles style={s} />,
    http_response: <Reply style={s} />, action: <Send style={s} />,
  };
  return icons[kind] ?? <Zap style={s} />;
}

/* ───────────────────── STATUS BADGE ───────────────────── */

function StatusBadge({ state, count }: { state: BoxState; count?: number }) {
  if (state === "idle") return null;
  if (state === "done") return (
    <div style={{ position: "absolute", top: -6, right: -6, display: "flex", alignItems: "center", gap: 2, background: "#16a34a", color: "#fff", borderRadius: 10, padding: "1px 5px 1px 3px", fontSize: 9, fontWeight: 700, lineHeight: "14px", zIndex: 2 }}>
      <Check style={{ width: 10, height: 10 }} />
      {count != null && count > 0 && <span>{count}</span>}
    </div>
  );
  if (state === "active") return (
    <div style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: "#f97316", zIndex: 2, animation: "pulse 1s infinite" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
  if (state === "failed") return (
    <div style={{ position: "absolute", top: -6, right: -6, display: "flex", alignItems: "center", background: "#dc2626", color: "#fff", borderRadius: 10, padding: "1px 4px", fontSize: 9, fontWeight: 700, zIndex: 2 }}>
      <XIcon style={{ width: 10, height: 10 }} />
    </div>
  );
  return null;
}

/* ───────────────────── n8n NODE CARD ───────────────────── */

/**
 * Phase 1 node card (spec §4):
 *
 *  [▌] ← input port (rectangle)     [●] ← output port (circle)
 *       ┌──────────────┐
 *  ⚡   │    (●icon)    │  [✓ 3] ← status badge
 *       └──────────────┘
 *         Node Name           ← title
 *         operation info      ← subtitle (gray)
 */
function AutomationNode({ data, selected }: NodeProps) {
  const { box, kindName, description, theme, boxState, stepCount } = data as {
    box: Box; kindName: string; description: string;
    theme: { accent: string }; index: number;
    boxState: BoxState; stepCount: number;
  };

  const isStart = box.kind === "start";
  const isSoon = SOON_KINDS.has(box.kind);
  const accent = theme.accent;

  // State-based border
  let borderColor = selected ? accent : "rgb(var(--border) / 0.18)";
  let borderWidth = selected ? 2 : 1;
  let borderStyle = "solid";
  if (boxState === "failed") { borderColor = "#dc2626"; borderWidth = 2; }
  if (boxState === "active") { borderColor = "#f97316"; borderWidth = 2; }
  if (isSoon) { borderStyle = "dashed"; }

  return (
    <div style={{ cursor: "grab", position: "relative" }}
      title={description && description !== kindName ? `${kindName}: ${description}` : kindName}>

      {/* Wide card: icon LEFT, title+subtitle RIGHT — always readable */}
      <div style={{
        width: 180, height: 56, borderRadius: 10,
        display: "flex", alignItems: "center",
        background: "rgb(var(--panel))",
        border: `${borderWidth}px ${borderStyle} ${borderColor}`,
        boxShadow: selected
          ? `0 0 0 3px ${accent}25, 0 4px 14px rgba(0,0,0,0.18)`
          : "0 1px 4px rgba(0,0,0,0.08)",
        position: "relative", overflow: "hidden",
        transition: "all 0.15s",
      }}>

        {/* Colored left accent stripe */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent, borderRadius: "10px 0 0 10px" }} />

        {/* Trigger badge ⚡ */}
        {isStart && (
          <div style={{ position: "absolute", top: -4, left: -4, width: 16, height: 16, borderRadius: "50%", background: "#00b050", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
            <Zap style={{ width: 9, height: 9, color: "#fff" }} />
          </div>
        )}

        {/* SOON badge */}
        {isSoon && !isStart && (
          <div style={{ position: "absolute", top: -5, right: 8, background: "#78909c", color: "#fff", borderRadius: 6, padding: "0 4px", fontSize: 7, fontWeight: 700, zIndex: 2 }}>
            SOON
          </div>
        )}

        <StatusBadge state={boxState} count={stepCount} />

        {/* Input port */}
        {!isStart && (
          <Handle type="target" position={Position.Left} id="left"
            style={{ background: "rgb(var(--foreground) / 0.4)", border: "2px solid rgb(var(--panel))", width: 10, height: 10, borderRadius: "50%", left: -5 }} />
        )}

        {/* Circular icon */}
        <div style={{
          marginLeft: 14, width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: accent, color: "#fff",
        }}>
          <NodeIcon kind={box.kind} size={16} />
        </div>

        {/* Title + subtitle INSIDE card */}
        <div style={{ marginLeft: 10, overflow: "hidden", flex: 1, paddingRight: 10 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "rgb(var(--foreground) / 0.9)",
            lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {kindName}
          </div>
          {description && (
            <div style={{
              fontSize: 10, color: "rgb(var(--foreground) / 0.45)",
              lineHeight: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1,
            }}>
              {description}
            </div>
          )}
        </div>

        {/* Output port */}
        <Handle type="source" position={Position.Right} id="right"
          style={{ background: accent, border: "2px solid rgb(var(--panel))", width: 10, height: 10, borderRadius: "50%", right: -5 }} />
      </div>

      {/* IF true/false labels */}
      {IF_KINDS.has(box.kind) && (
        <>
          <div style={{ position: "absolute", right: -30, top: 10, fontSize: 8, fontWeight: 600, color: "#16a34a" }}>true</div>
          <div style={{ position: "absolute", right: -30, bottom: 8, fontSize: 8, fontWeight: 600, color: "#dc2626" }}>false</div>
        </>
      )}
    </div>
  );
}

/* ───────────────────── "+" ADD NODE ───────────────────── */

function AddNode({ data }: NodeProps) {
  const t = useTranslations("dashboard.automations");
  const { onAdd, kindNames, themes } = data as {
    onAdd: (kind: Box["kind"]) => void;
    kindNames: Record<string, string>;
    themes: typeof THEME;
  };
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const CATEGORIES: { label: string; kinds: Box["kind"][] }[] = [
    { label: "Triggers", kinds: ["read"] },
    { label: "Actions", kinds: ["action", "ai", "approval"] },
    { label: "Flow", kinds: ["condition", "switch", "filter", "loop", "split", "merge", "error_handler", "no_op", "stop_error", "execute_workflow"] },
    { label: "Transform", kinds: ["transform", "set", "sort", "limit", "remove_duplicates", "summarize", "compare", "aggregate", "split_out", "rename_keys"] },
    { label: "Convert", kinds: ["xml", "markdown", "html_extract", "spreadsheet_parse", "crypto"] },
    { label: "Timing", kinds: ["wait", "delay", "date_time"] },
    { label: "AI", kinds: ["ai_agent", "llm_chain", "retrieval_qa", "summarization_chain", "text_classifier", "sentiment", "extract_info"] },
    { label: "Dev", kinds: ["code", "execute_command", "ssh", "graphql"] },
    { label: "Files", kinds: ["read_file", "write_file", "ftp"] },
    { label: "HTTP", kinds: ["respond_webhook", "http_response", "smtp_send"] },
    { label: "Other", kinds: ["note"] },
  ];

  const allKinds = CATEGORIES.flatMap((c) => c.kinds);
  const q = search.trim();
  const cats = q
    ? [{ label: "Results", kinds: allKinds.filter((k) => matchesSearch(kindNames[k] ?? k, q)) }]
    : CATEGORIES;

  return (
    <div style={{ position: "relative" }}>
      <Handle type="target" position={Position.Left}
        style={{ background: "#6b7280", border: "none", width: 6, height: 14, borderRadius: 2, left: -3 }} />
      <button type="button" onClick={() => { setOpen(!open); setSearch(""); }}
        style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed rgb(var(--border) / 0.3)", background: "rgb(var(--panel))", color: "rgb(var(--foreground) / 0.35)", cursor: "pointer", transition: "all 0.15s" }}>
        <Plus style={{ width: 16, height: 16 }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 44, left: -110, zIndex: 50, width: 260, borderRadius: 10, background: "rgb(var(--panel))", border: "1px solid rgb(var(--border) / 0.3)", boxShadow: "0 8px 30px rgba(0,0,0,0.2)", overflow: "hidden" }}>
          <div style={{ padding: "8px 8px 4px", borderBottom: "1px solid rgb(var(--border) / 0.15)" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 7, top: 6, width: 13, height: 13, color: "rgb(var(--foreground) / 0.3)" }} />
              <input ref={inputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("nodeEdit.canvasSearch")}
                style={{ width: "100%", padding: "5px 8px 5px 26px", borderRadius: 6, border: "1px solid rgb(var(--border) / 0.3)", background: "rgb(var(--background))", color: "rgb(var(--foreground))", fontSize: 11, outline: "none" }} />
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "2px 0" }}>
            {cats.map((cat) => {
              if (cat.kinds.length === 0) return null;
              return (
                <div key={cat.label}>
                  <div style={{ padding: "5px 10px 2px", fontSize: 9, fontWeight: 600, color: "rgb(var(--foreground) / 0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{cat.label}</div>
                  {cat.kinds.map((k) => {
                    const th = themes[k];
                    const soon = SOON_KINDS.has(k);
                    return (
                      <button key={k} type="button" onClick={() => { setOpen(false); setSearch(""); onAdd(k); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 10px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgb(var(--foreground) / 0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: th.accent, color: "#fff", flexShrink: 0, opacity: soon ? 0.5 : 1 }}>
                          <NodeIcon kind={k} size={11} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "rgb(var(--foreground))", opacity: soon ? 0.5 : 1 }}>{kindNames[k] ?? k}</span>
                        {soon && <span style={{ fontSize: 8, fontWeight: 600, color: "#78909c", marginLeft: "auto" }}>SOON</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {q && cats[0]?.kinds.length === 0 && (
              <div style={{ padding: "14px 10px", textAlign: "center", fontSize: 11, color: "rgb(var(--foreground) / 0.4)" }}>{t("nodeEdit.canvasNone")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sticky note — spec Γ1: Notes are NOT workflow nodes. Yellow, no ports, free-floating. */
function StickyNoteNode({ data, selected }: NodeProps) {
  const { box } = data as { box: Box };
  const text = "text" in box ? (box as { text: string }).text : "";
  return (
    <div style={{
      width: 160, minHeight: 60, padding: "10px 12px",
      background: "#fef9c3", borderRadius: 8, cursor: "grab",
      border: selected ? "2px solid #ca8a04" : "1px solid #fbbf2480",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      fontSize: 11, lineHeight: "15px", color: "#78350f",
      whiteSpace: "pre-wrap", wordBreak: "break-word",
    }}>
      {text || "Note"}
    </div>
  );
}

const nodeTypes: NodeTypes = { automation: AutomationNode, addNode: AddNode, stickyNote: StickyNoteNode };

/* ───────────────────── LAYOUT ───────────────────── */

/**
 * HORIZONTAL FLOW — spec Γ3: NO waterfall.
 *
 * Every node goes to the RIGHT. Branch nodes (IF/Switch) spread the
 * next nodes vertically to show parallel paths. Merge brings back to
 * center. This is how n8n works.
 *
 * Notes are placed BELOW the main flow as sticky notes (separate y).
 * Saved layout positions override auto-layout.
 */
const X_STEP = 230;     // horizontal spacing — 180px card + 50px gap
const Y_STEP = 80;      // vertical offset for branching
const WRAP_COLS = 1000; // cards per row; one line like n8n — a long flow is panned, not wrapped
const OPEN_NODES = 9;   // how many cards the first view fits (about a screen at a readable size)
const ROW_STEP = 210;    // vertical distance between wrapped rows
const CENTER_Y = 0;     // main flow Y
const NOTE_OFFSET_Y = 250; // sticky notes go below the main flow

const BRANCH_KINDS = new Set(["condition", "switch", "filter", "error_handler"]);

/**
 * Tree layout from the edges, or null when the flow is a straight line.
 * The column of a box is the longest path to it from a box nothing points
 * at; boxes in one column are stacked, centred on the main line.
 */
function treeLayout(ids: string[], edges: FlowEdge[] | null): Map<string, { x: number; y: number }> | null {
  if (!edges || edges.length === 0) return null;
  const known = new Set(ids);
  const use = edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const e of use) {
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
  }
  const branches = [...outCount.values(), ...inCount.values()].some((n) => n > 1);
  if (!branches) return null;
  const depth = new Map<string, number>(ids.map((id) => [id, 0]));
  // Relax at most ids.length times: a loop back-edge cannot spin forever.
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const e of use) {
      const d = (depth.get(e.from) ?? 0) + 1;
      if (d > (depth.get(e.to) ?? 0) && d < ids.length) { depth.set(e.to, d); moved = true; }
    }
    if (!moved) break;
  }
  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const d = depth.get(id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), id]);
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const [d, members] of columns) {
    members.forEach((id, i) => out.set(id, { x: d * X_STEP, y: CENTER_Y + Math.round((i - (members.length - 1) / 2) * Y_STEP) }));
  }
  return out;
}

function boxesToNodes(
  boxes: Box[], kindNames: Record<string, string>,
  describe: (b: Box) => string, progress: RunProgress | null,
  savedLayout: Record<string, NodePosition> | null,
  graphEdges: FlowEdge[] | null = null,
): Node[] {
  // An empty sticky note says nothing; it is not drawn (owner, 2026-11-28:
  // ten blank yellow squares under «Daily Mega Pipeline»). A note with
  // words stays.
  boxes = boxes.filter((b) => !(b.kind === "note" && !b.text.trim()));
  if (boxes.length === 0) return [];

  // Separate notes from workflow boxes
  const workflowBoxes = boxes.filter((b) => b.kind !== "note");
  const noteBoxes = boxes.filter((b) => b.kind === "note");

  const positions: Map<string, { x: number; y: number }> = new Map();

  // Use saved positions if available
  if (savedLayout && Object.keys(savedLayout).length >= workflowBoxes.length * 0.5) {
    for (const box of boxes) {
      const saved = savedLayout[box.id];
      if (saved) positions.set(box.id, saved);
    }
  }

  // Auto-layout for workflow boxes without saved positions. A long flow is
  // wrapped into rows of WRAP_COLS cards (reading order, left to right, then
  // the next row down) so 113 nodes are not one 18 000 px line that can only
  // be seen as specks; the edge that returns to the left is drawn smoothstep
  // by graphToEdges (goesLeft).
  let noteX = 0;
  let col = 0;
  let row = 0;
  let branchY = 0;
  for (let i = 0; i < workflowBoxes.length; i++) {
    const box = workflowBoxes[i];
    if (positions.has(box.id)) continue;

    const prevIsBranch = i > 0 && BRANCH_KINDS.has(workflowBoxes[i - 1].kind);
    const isMerge = box.kind === "merge" || box.kind === "aggregate";

    if (i > 0) {
      col += 1;
      if (col >= WRAP_COLS) { col = 0; row += 1; branchY = 0; }
    }
    if (prevIsBranch) branchY = Math.round(Y_STEP * 0.5);
    else if (isMerge) branchY = 0;
    positions.set(box.id, { x: col * X_STEP, y: CENTER_Y + row * ROW_STEP + branchY });
  }

  // A flow whose edges really branch or join is laid out as a tree: one
  // column per step from the start, the parallel branches stacked in that
  // column — the n8n picture. A straight line keeps the line above.
  const tree = treeLayout(workflowBoxes.map((b) => b.id), graphEdges);
  if (tree) for (const box of workflowBoxes) {
    if (savedLayout?.[box.id]) continue;
    const at = tree.get(box.id);
    if (at) positions.set(box.id, at);
  }

  // Place note sticky notes below the flow
  for (const note of noteBoxes) {
    if (!positions.has(note.id)) {
      positions.set(note.id, { x: noteX, y: NOTE_OFFSET_Y + row * ROW_STEP });
      noteX += 180;
    }
  }

  const stepCounts: Record<string, number> = {};
  if (progress?.failed) stepCounts[progress.failed.box] = 0;

  return boxes.map((box, i) => ({
    id: box.id,
    type: box.kind === "note" ? "stickyNote" : "automation",
    position: positions.get(box.id) ?? { x: i * X_STEP, y: CENTER_Y },
    data: {
      box, kindName: kindNames[box.kind] ?? box.kind,
      description: describe(box), theme: THEME[box.kind], index: i,
      boxState: progress?.boxes[box.id] ?? ("idle" as BoxState),
      stepCount: stepCounts[box.id] ?? 0,
    },
  }));
}

function graphToEdges(graphEdges: FlowEdge[] | null, boxes: Box[], positions: { x: number; y: number }[]): Edge[] {
  if (graphEdges && graphEdges.length > 0) {
    // Use real graph edges
    return graphEdges.map((ge) => {
      const si = boxes.findIndex((b) => b.id === ge.from);
      const ti = boxes.findIndex((b) => b.id === ge.to);
      const sp = positions[si], tp = positions[ti];
      const goesLeft = tp && sp && tp.x < sp.x;
      // Color edge by port type
      let strokeColor = "#9ca3af";
      if (ge.fromPort === "true") strokeColor = "#16a34a";
      if (ge.fromPort === "false") strokeColor = "#dc2626";
      if (ge.fromPort === "error") strokeColor = "#dc2626";
      return {
        id: ge.id,
        source: ge.from, sourceHandle: "right",
        target: ge.to, targetHandle: "left",
        type: goesLeft ? "smoothstep" : "default",
        animated: false,
        label: ge.fromPort !== "main" ? ge.fromPort : undefined,
        labelStyle: { fontSize: 8, fontWeight: 600, fill: strokeColor },
        style: { stroke: strokeColor, strokeWidth: 2, opacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: strokeColor },
      };
    });
  }
  // Fallback: linear edges from boxes order (skip notes — they're sticky notes, not connected)
  const connected = boxes.filter((b) => b.kind !== "note");
  return connected.slice(0, -1).map((box, i) => {
    const si = boxes.indexOf(box), ti = boxes.indexOf(connected[i + 1]);
    const sp = positions[si], tp = positions[ti];
    const goesLeft = tp && sp && tp.x < sp.x;
    return {
      id: `e-${box.id}-${connected[i + 1].id}`,
      source: box.id, sourceHandle: "right",
      target: connected[i + 1].id, targetHandle: "left",
      type: goesLeft ? "smoothstep" : "default",
      animated: false,
      style: { stroke: "#9ca3af", strokeWidth: 2, opacity: 0.85 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#9ca3af" },
    };
  });
}

/* ───────────────────── CANVAS ───────────────────── */

function FlowCanvasInner({
  boxes, chosen, onChoose, connected, onAdd, onDelete, onUndo, progress,
  graphEdges, savedLayout, groups,
}: {
  boxes: Box[]; chosen: string | null; onChoose: (id: string) => void;
  connected: Connected; onAdd?: (kind: Box["kind"]) => void;
  onDelete?: (boxId: string) => void; onUndo?: () => void;
  progress?: RunProgress | null;
  graphEdges?: FlowEdge[] | null;
  savedLayout?: Record<string, NodePosition> | null;
  groups?: FlowGroup[] | null;
}) {
  const t = useTranslations("dashboard.automations");
  const kindNames = useKindNames();
  const describe = useDescribe();

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes = boxesToNodes(boxes, kindNames, describe, progress ?? null, savedLayout ?? null, graphEdges ?? null);
    const posArr = nodes.map((n) => n.position);
    if (onAdd) {
      const lastPos = nodes.length > 0 ? nodes[nodes.length - 1].position : { x: 0, y: 0 };
      nodes.push({
        id: "__add__", type: "addNode",
        position: { x: lastPos.x + X_STEP, y: lastPos.y + 20 },
        data: { onAdd, kindNames, themes: THEME },
        draggable: false, selectable: false,
      });
    }
    const edges = graphToEdges(graphEdges ?? null, boxes, posArr);
    if (onAdd && boxes.length > 0) {
      edges.push({
        id: `e-${boxes[boxes.length - 1].id}-__add__`,
        source: boxes[boxes.length - 1].id, sourceHandle: "right",
        target: "__add__", targetHandle: "left", type: "default",
        animated: false, style: { stroke: "#6b7280", strokeWidth: 1.5, strokeDasharray: "6 4", opacity: 0.3 },
      });
    }
    return { initialNodes: nodes, initialEdges: edges };
  }, [boxes, kindNames, describe, onAdd, progress, graphEdges, savedLayout]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id !== "__add__") onChoose(node.id);
  }, [onChoose]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault(); if (node.id === "__add__") return;
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);
  const closeContext = useCallback(() => setContextMenu(null), []);
  const reactFlowInstance = useReactFlow();
  // Open on the first row once React Flow has MEASURED the cards. Fitting in
  // onInit ran before that, saw no sizes, and left the view on the middle of
  // the flow (owner's screenshot, 2026-11-28).
  const measured = useNodesInitialized();
  const fittedOnce = useRef(false);
  useEffect(() => {
    if (!measured || fittedOnce.current) return;
    fittedOnce.current = true;
    reactFlowInstance.fitView({ nodes: nodes.slice(0, OPEN_NODES).map((n) => ({ id: n.id })), padding: 0.12, maxZoom: 1, minZoom: 0.5 });
  }, [measured, nodes, reactFlowInstance]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && chosen && onDelete) { e.preventDefault(); onDelete(chosen); }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && onUndo) { e.preventDefault(); onUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "d" && chosen && onAdd) {
      e.preventDefault(); const box = boxes.find((b) => b.id === chosen);
      if (box && box.kind !== "start") onAdd(box.kind);
    }
    if (e.key === "1" && !e.ctrlKey && !e.metaKey) reactFlowInstance.fitView({ padding: 0.08, duration: 300, minZoom: 0.7 });
    if (e.key === "0" && !e.ctrlKey && !e.metaKey) reactFlowInstance.zoomTo(1, { duration: 300 });
  }, [chosen, onDelete, onUndo, onAdd, boxes, reactFlowInstance]);

  return (
    <div style={{ height: 600, borderRadius: 10, border: "1px solid rgb(var(--border) / 0.2)", overflow: "hidden", position: "relative" }}
      onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: n.id === chosen }))}
        edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={(e, n) => { closeContext(); onNodeClick(e, n); }}
        onNodeDoubleClick={(_, n) => { if (n.id !== "__add__") onChoose(n.id); }}
        onNodeContextMenu={onNodeContextMenu} onPaneClick={closeContext}
        nodeTypes={nodeTypes}
        minZoom={0.3} panOnDrag zoomOnScroll panOnScroll
        proOptions={{ hideAttribution: true }} style={{ background: "transparent" }}
        deleteKeyCode={null} defaultEdgeOptions={{ type: "default" }}>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(var(--foreground) / 0.16)" />
        <Controls showInteractive={false} style={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--border) / 0.2)", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }} />
        {/* Minimap only when canvas is bigger than viewport (spec #15) */}
        {boxes.length > 8 && (
          <MiniMap
            nodeColor={(n) => THEME[(n.data as { box: Box })?.box?.kind]?.accent ?? "#6b7280"}
            maskColor="rgb(var(--panel) / 0.85)"
            style={{ background: "rgb(var(--panel) / 0.7)", border: "1px solid rgb(var(--border) / 0.2)", borderRadius: 8, height: 100, width: 160 }} />
        )}
      </ReactFlow>

      {contextMenu && (
        <div style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 50, minWidth: 140, borderRadius: 8, background: "rgb(var(--panel))", border: "1px solid rgb(var(--border) / 0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: "4px 0" }}>
          {[
            { label: "Edit", color: "rgb(var(--foreground))", action: () => { onChoose(contextMenu.nodeId); closeContext(); } },
            ...(onAdd ? [{ label: "Duplicate", color: "rgb(var(--foreground))", action: () => { const box = boxes.find((b) => b.id === contextMenu.nodeId); if (box && box.kind !== "start") onAdd(box.kind); closeContext(); } }] : []),
            ...(onDelete ? [{ label: "Delete", color: "#ef4444", action: () => { onDelete(contextMenu.nodeId); closeContext(); } }] : []),
          ].map((item) => (
            <button key={item.label} type="button" onClick={item.action}
              style={{ display: "flex", width: "100%", alignItems: "center", padding: "6px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 11, color: item.color, textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgb(var(--foreground) / 0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 12px", background: "rgb(var(--panel) / 0.95)", borderTop: "1px solid rgb(var(--border) / 0.15)", fontSize: 9, color: "rgb(var(--foreground) / 0.3)" }}>
        <span>{boxes.length} node{boxes.length !== 1 ? "s" : ""}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Tidy up button — spec #13 */}
          <button type="button" onClick={() => {
            // Re-layout all nodes using auto-layout (remove saved positions)
            const newNodes = boxesToNodes(boxes, kindNames, describe, progress ?? null, null);
            // Note: this only updates the visual; saving layout requires the graph migration
            reactFlowInstance.setNodes(newNodes.map((n) => ({ ...n, selected: n.id === chosen })));
            setTimeout(() => reactFlowInstance.fitView({ padding: 0.08, duration: 300, minZoom: 0.7 }), 50);
          }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "rgb(var(--foreground) / 0.4)", textDecoration: "underline" }}>
            {t("nodeEdit.canvasTidy")}
          </button>
          <span>{t("nodeEdit.canvasKeys")}</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── EXPORT ───────────────────── */

export function FlowCanvasView(props: {
  boxes: Box[]; chosen: string | null; onChoose: (id: string) => void;
  connected: Connected; onAdd?: (kind: Box["kind"]) => void;
  onDelete?: (boxId: string) => void; onUndo?: () => void;
  progress?: RunProgress | null;
  graphEdges?: FlowEdge[] | null;
  savedLayout?: Record<string, NodePosition> | null;
  groups?: FlowGroup[] | null;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
