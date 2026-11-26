"use client";

/**
 * n8n-STYLE VISUAL CANVAS using React Flow (@xyflow/react).
 *
 * Renders the automation's boxes as draggable nodes on an interactive
 * canvas with zoom, pan, and bezier connections — matching n8n's exact
 * visual design: wide rectangular nodes with icon left, label right,
 * colored left accent stripe, and proper horizontal flow.
 *
 * Run: src/components/automations/automation-shell.tsx uses this via
 * FlowCanvasView (the exported wrapper).
 */

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowUpDown, BarChart3, Calendar, Clock, Code2, FileOutput, Filter, GitBranch, GitCompare, GitMerge, Globe, Hash, Heart, FileText, Layers, List, ListFilter, PauseCircle, RefreshCw, Reply, Scissors, Send, Sparkles, Split, Table2, Terminal, Timer, Type, Zap, Play, Mail, Database, Webhook, ChevronRight, Plus, Search, X } from "lucide-react";
import type { Box, ReadSource, ActionKind, StartBox } from "@/lib/automations/boxes";
import type { Connected } from "@/components/automations/flow-boxes";

/* ───────────────────── n8n COLOR SYSTEM ───────────────────── */

/**
 * n8n uses distinct brand colors per node category.
 * Each node has: accent (left stripe + icon bg), iconColor, and a subtle tint.
 */
const THEME: Record<Box["kind"], { accent: string; iconBg: string; iconColor: string }> = {
  // Triggers — green
  start:     { accent: "#00b050", iconBg: "#e6f9ef", iconColor: "#00b050" },
  // Data sources — blue
  read:      { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  // AI — purple
  ai:        { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  // Flow control — orange/amber
  condition: { accent: "#ff6d00", iconBg: "#fff3e0", iconColor: "#ff6d00" },
  approval:  { accent: "#ff6d00", iconBg: "#fff3e0", iconColor: "#ff6d00" },
  filter:    { accent: "#ff6d00", iconBg: "#fff3e0", iconColor: "#ff6d00" },
  switch:    { accent: "#ff6d00", iconBg: "#fff3e0", iconColor: "#ff6d00" },
  // Actions — blue
  action:    { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  // Code — dark green
  code:      { accent: "#0d7377", iconBg: "#e0f2f1", iconColor: "#0d7377" },
  // Wait/timing — purple-pink
  wait:      { accent: "#9c27b0", iconBg: "#f3e5f5", iconColor: "#9c27b0" },
  delay:     { accent: "#9c27b0", iconBg: "#f3e5f5", iconColor: "#9c27b0" },
  date_time: { accent: "#9c27b0", iconBg: "#f3e5f5", iconColor: "#9c27b0" },
  // Transform — teal
  transform: { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  // Note — warm gray
  note:      { accent: "#8d6e63", iconBg: "#efebe9", iconColor: "#8d6e63" },
  // Error handling — red
  error_handler: { accent: "#d32f2f", iconBg: "#ffebee", iconColor: "#d32f2f" },
  stop_error:    { accent: "#d32f2f", iconBg: "#ffebee", iconColor: "#d32f2f" },
  // Loop/branching — blue
  loop:          { accent: "#1565c0", iconBg: "#e3f2fd", iconColor: "#1565c0" },
  split:         { accent: "#00897b", iconBg: "#e0f2f1", iconColor: "#00897b" },
  merge:         { accent: "#6a1b9a", iconBg: "#f3e5f5", iconColor: "#6a1b9a" },
  // Data ops — teal/blue
  sort:              { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  limit:             { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  remove_duplicates: { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  summarize:         { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  set:               { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  compare:           { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  aggregate:         { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  split_out:         { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  rename_keys:       { accent: "#0097a7", iconBg: "#e0f7fa", iconColor: "#0097a7" },
  // Format conversion — green
  xml:               { accent: "#2e7d32", iconBg: "#e8f5e9", iconColor: "#2e7d32" },
  markdown:          { accent: "#2e7d32", iconBg: "#e8f5e9", iconColor: "#2e7d32" },
  html_extract:      { accent: "#2e7d32", iconBg: "#e8f5e9", iconColor: "#2e7d32" },
  spreadsheet_parse: { accent: "#2e7d32", iconBg: "#e8f5e9", iconColor: "#2e7d32" },
  crypto:            { accent: "#2e7d32", iconBg: "#e8f5e9", iconColor: "#2e7d32" },
  // AI tools — purple
  text_classifier:      { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  sentiment:            { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  extract_info:         { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  ai_agent:             { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  llm_chain:            { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  retrieval_qa:         { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  summarization_chain:  { accent: "#7c3aed", iconBg: "#f3e8ff", iconColor: "#7c3aed" },
  // Network/IO — blue
  respond_webhook:   { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  http_response:     { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  graphql:           { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  smtp_send:         { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  ftp:               { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  ssh:               { accent: "#0d7377", iconBg: "#e0f2f1", iconColor: "#0d7377" },
  // Exec/files — dark teal
  execute_command:   { accent: "#0d7377", iconBg: "#e0f2f1", iconColor: "#0d7377" },
  execute_workflow:  { accent: "#6a1b9a", iconBg: "#f3e5f5", iconColor: "#6a1b9a" },
  read_file:         { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  write_file:        { accent: "#1a73e8", iconBg: "#e8f0fe", iconColor: "#1a73e8" },
  // Pass-through
  no_op:             { accent: "#78909c", iconBg: "#eceff1", iconColor: "#78909c" },
};

/* ───────────────────── KIND NAMES & DESCRIPTIONS ───────────────────── */

function useKindNames() {
  const t = useTranslations("dashboard.automations");
  return {
    start: t("kinds.start"),
    read: t("kinds.read"),
    ai: t("kinds.ai"),
    condition: t("kinds.condition"),
    approval: t("kinds.approval"),
    action: t("kinds.action"),
    filter: "Filter",
    code: "Code",
    wait: "Wait",
    transform: "Transform",
    note: "Note",
    error_handler: "Error Handler",
    loop: "Loop",
    split: "Split",
    merge: "Merge",
    delay: "Delay",
    sort: "Sort",
    limit: "Limit",
    remove_duplicates: "Deduplicate",
    summarize: "Summarize",
    switch: "Switch",
    set: "Set",
    compare: "Compare",
    date_time: "Date/Time",
    html_extract: "HTML",
    text_classifier: "Classifier",
    sentiment: "Sentiment",
    extract_info: "Extract",
    respond_webhook: "Webhook Response",
    execute_command: "Execute Command",
    aggregate: "Aggregate", split_out: "Split Out", rename_keys: "Rename Keys",
    xml: "XML", markdown: "Markdown", crypto: "Crypto", spreadsheet_parse: "Spreadsheet",
    no_op: "No Op", stop_error: "Stop & Error", execute_workflow: "Sub-Workflow",
    read_file: "Read File", write_file: "Write File", smtp_send: "Send Email",
    ftp: "FTP", ssh: "SSH", graphql: "GraphQL", ai_agent: "AI Agent",
    llm_chain: "LLM Chain", retrieval_qa: "Retrieval QA",
    summarization_chain: "Summarize Chain", http_response: "HTTP Response",
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
    if (box.kind === "ai") return box.instruction.slice(0, 40);
    if (box.kind === "condition") return t("condition");
    if (box.kind === "approval") return t("approval");
    if (box.kind === "filter") return box.expression.slice(0, 30);
    if (box.kind === "code") return `${box.language}`;
    if (box.kind === "wait") return `${box.duration} ${box.unit}`;
    if (box.kind === "transform") return box.instruction.slice(0, 30);
    if (box.kind === "note") return box.text.slice(0, 25) || "Note";
    if (box.kind === "error_handler") return box.fallbackAction;
    if (box.kind === "loop") return `max ${box.maxIterations}`;
    if (box.kind === "split") return `batch ${box.batchSize}`;
    if (box.kind === "merge") return box.mode;
    if (box.kind === "delay") return `${box.delay} ${box.unit}`;
    if (box.kind === "sort") return box.field;
    if (box.kind === "limit") return `${box.maxItems} items`;
    if (box.kind === "remove_duplicates") return box.field;
    if (box.kind === "summarize") return `${box.operation}(${box.field})`;
    if (box.kind === "switch") return box.field;
    if (box.kind === "set") return "Set fields";
    if (box.kind === "compare") return box.mode.replace(/_/g, " ");
    if (box.kind === "date_time") return box.operation;
    if (box.kind === "html_extract") return box.selector.slice(0, 25);
    if (box.kind === "text_classifier") return box.categories.slice(0, 2).join(", ");
    if (box.kind === "sentiment") return "Analyze";
    if (box.kind === "extract_info") return box.fields.slice(0, 2).join(", ");
    if (box.kind === "respond_webhook") return `${box.statusCode}`;
    if (box.kind === "execute_command") return box.command.slice(0, 25);
    if (box.kind === "aggregate") return box.operation;
    if (box.kind === "split_out") return box.field;
    if (box.kind === "rename_keys") return "Rename";
    if (box.kind === "xml") return box.direction === "xml_to_json" ? "XML → JSON" : "JSON → XML";
    if (box.kind === "markdown") return box.direction === "md_to_html" ? "MD → HTML" : "HTML → MD";
    if (box.kind === "crypto") return box.operation;
    if (box.kind === "spreadsheet_parse") return box.format.toUpperCase();
    if (box.kind === "no_op") return "Pass through";
    if (box.kind === "stop_error") return box.message.slice(0, 20);
    if (box.kind === "execute_workflow") return box.workflowId.slice(0, 15);
    if (box.kind === "read_file") return box.path.slice(0, 20);
    if (box.kind === "write_file") return box.path.slice(0, 20);
    if (box.kind === "smtp_send") return box.host.slice(0, 15);
    if (box.kind === "ftp") return `${box.operation}`;
    if (box.kind === "ssh") return box.command.slice(0, 20);
    if (box.kind === "graphql") return "Query";
    if (box.kind === "ai_agent") return box.instruction.slice(0, 25);
    if (box.kind === "llm_chain") return box.prompt.slice(0, 25);
    if (box.kind === "retrieval_qa") return box.question.slice(0, 25);
    if (box.kind === "summarization_chain") return "Summarize";
    if (box.kind === "http_response") return `${box.statusCode}`;
    if (box.kind === "action") return act(box.do);
    return "";
  };
}

/* ───────────────────── NODE ICON ───────────────────── */

function NodeIcon({ box, size = 18 }: { box: Box; size?: number }) {
  const s = { width: size, height: size };
  if (box.kind === "start") return <Play style={s} />;
  if (box.kind === "read") return <Database style={s} />;
  if (box.kind === "ai") return <Sparkles style={s} />;
  if (box.kind === "condition") return <GitBranch style={s} />;
  if (box.kind === "approval") return <PauseCircle style={s} />;
  if (box.kind === "filter") return <Filter style={s} />;
  if (box.kind === "code") return <Code2 style={s} />;
  if (box.kind === "wait") return <Clock style={s} />;
  if (box.kind === "transform") return <Layers style={s} />;
  if (box.kind === "note") return <FileText style={s} />;
  if (box.kind === "error_handler") return <AlertTriangle style={s} />;
  if (box.kind === "loop") return <RefreshCw style={s} />;
  if (box.kind === "split") return <GitBranch style={s} />;
  if (box.kind === "merge") return <GitMerge style={s} />;
  if (box.kind === "delay") return <Timer style={s} />;
  if (box.kind === "sort") return <ArrowUpDown style={s} />;
  if (box.kind === "limit") return <ListFilter style={s} />;
  if (box.kind === "remove_duplicates") return <Scissors style={s} />;
  if (box.kind === "summarize") return <BarChart3 style={s} />;
  if (box.kind === "switch") return <Split style={s} />;
  if (box.kind === "set") return <Type style={s} />;
  if (box.kind === "compare") return <GitCompare style={s} />;
  if (box.kind === "date_time") return <Calendar style={s} />;
  if (box.kind === "html_extract") return <Code2 style={s} />;
  if (box.kind === "text_classifier") return <List style={s} />;
  if (box.kind === "sentiment") return <Heart style={s} />;
  if (box.kind === "extract_info") return <FileOutput style={s} />;
  if (box.kind === "respond_webhook") return <Webhook style={s} />;
  if (box.kind === "execute_command") return <Terminal style={s} />;
  if (box.kind === "aggregate") return <Layers style={s} />;
  if (box.kind === "split_out") return <GitBranch style={s} />;
  if (box.kind === "rename_keys") return <Type style={s} />;
  if (box.kind === "xml") return <Code2 style={s} />;
  if (box.kind === "markdown") return <FileText style={s} />;
  if (box.kind === "crypto") return <Hash style={s} />;
  if (box.kind === "spreadsheet_parse") return <Table2 style={s} />;
  if (box.kind === "no_op") return <ChevronRight style={s} />;
  if (box.kind === "stop_error") return <AlertTriangle style={s} />;
  if (box.kind === "execute_workflow") return <RefreshCw style={s} />;
  if (box.kind === "read_file") return <FileText style={s} />;
  if (box.kind === "write_file") return <FileOutput style={s} />;
  if (box.kind === "smtp_send") return <Mail style={s} />;
  if (box.kind === "ftp") return <Globe style={s} />;
  if (box.kind === "ssh") return <Terminal style={s} />;
  if (box.kind === "graphql") return <Globe style={s} />;
  if (box.kind === "ai_agent") return <Sparkles style={s} />;
  if (box.kind === "llm_chain") return <Sparkles style={s} />;
  if (box.kind === "retrieval_qa") return <Sparkles style={s} />;
  if (box.kind === "summarization_chain") return <Sparkles style={s} />;
  if (box.kind === "http_response") return <Reply style={s} />;
  if (box.kind === "action") return <Send style={s} />;
  return <Zap style={s} />;
}

/* ───────────────────── n8n NODE COMPONENT ───────────────────── */

/**
 * n8n-EXACT node design:
 *  ┌─────────────────────────────┐
 *  │ ▌  [icon]  Node Name        │
 *  │ ▌          operation desc   │
 *  └─────────────────────────────┘
 *
 * n8n EXACT node design (from n8n source: GRID_SIZE=16, node=6×6=96×96px):
 *
 *       ┌──────────┐
 *       │          │
 *       │   (●)    │  ← 96×96 square card, big circular icon centered
 *       │          │
 *       └──────────┘
 *         Node Name    ← label BELOW the card (not inside)
 *
 * Square card, big centered circular icon with brand color, name below.
 * This is n8n's actual design — verified from their source code.
 */
function AutomationNode({ data, selected }: NodeProps) {
  const { box, kindName, description, theme } = data as {
    box: Box;
    kindName: string;
    description: string;
    theme: (typeof THEME)[Box["kind"]];
    index: number;
  };

  const isStart = box.kind === "start";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "grab",
        width: 96,
      }}
      title={`${kindName}: ${description}`}
    >
      {/* The square card */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgb(var(--panel))",
          border: selected
            ? `2px solid ${theme.accent}`
            : "1px solid rgb(var(--border) / 0.18)",
          boxShadow: selected
            ? `0 0 0 3px ${theme.accent}25, 0 4px 14px rgba(0,0,0,0.18)`
            : "0 1px 4px rgba(0,0,0,0.08)",
          position: "relative",
          transition: "box-shadow 0.15s, border-color 0.15s",
        }}
      >
        {/* Input handle (left) — not on start node */}
        {!isStart && (
          <Handle
            type="target"
            position={Position.Left}
            style={{
              background: "rgb(var(--panel))",
              border: `2px solid ${theme.accent}`,
              width: 10,
              height: 10,
              left: -5,
            }}
          />
        )}

        {/* n8n big CIRCULAR icon — centered in the square */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: theme.accent,
            color: "#fff",
          }}
        >
          <NodeIcon box={box} size={20} />
        </div>

        {/* Output handle (right) */}
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: "rgb(var(--panel))",
            border: `2px solid ${theme.accent}`,
            width: 10,
            height: 10,
            right: -5,
          }}
        />
      </div>

      {/* Label BELOW the card — n8n's actual design */}
      <div
        style={{
          marginTop: 6,
          maxWidth: 110,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 500,
          color: "rgb(var(--foreground) / 0.75)",
          lineHeight: "14px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {kindName}
      </div>
    </div>
  );
}

/* ───────────────────── "+" ADD NODE ───────────────────── */

function AddNode({ data }: NodeProps) {
  const { onAdd, kindNames, themes } = data as {
    onAdd: (kind: Box["kind"]) => void;
    kindNames: Record<string, string>;
    themes: typeof THEME;
  };
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  /* Categorized n8n node picker */
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
  const q = search.trim().toLowerCase();
  const filteredCategories = q
    ? [{ label: "Results", kinds: allKinds.filter((k) => (kindNames[k] ?? k).toLowerCase().includes(q)) }]
    : CATEGORIES;

  return (
    <div style={{ position: "relative" }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#6b7280", border: "2px solid #4b5563", width: 8, height: 8 }}
      />
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px dashed rgb(var(--border) / 0.3)",
          background: "rgb(var(--panel))",
          color: "rgb(var(--foreground) / 0.35)",
          cursor: "pointer",
          fontSize: 16,
          transition: "all 0.15s",
        }}
      >
        <Plus style={{ width: 14, height: 14 }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 44,
            left: -100,
            zIndex: 50,
            width: 280,
            borderRadius: 10,
            background: "rgb(var(--panel))",
            border: "1px solid rgb(var(--border) / 0.3)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "10px 10px 6px", borderBottom: "1px solid rgb(var(--border) / 0.15)" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 8, top: 7, width: 14, height: 14, color: "rgb(var(--foreground) / 0.3)" }} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nodes..."
                style={{
                  width: "100%",
                  padding: "6px 8px 6px 28px",
                  borderRadius: 6,
                  border: "1px solid rgb(var(--border) / 0.3)",
                  background: "rgb(var(--background))",
                  color: "rgb(var(--foreground))",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Categories + items */}
          <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
            {filteredCategories.map((cat) => {
              if (cat.kinds.length === 0) return null;
              return (
                <div key={cat.label}>
                  <div style={{ padding: "6px 12px 3px", fontSize: 10, fontWeight: 600, color: "rgb(var(--foreground) / 0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {cat.label}
                  </div>
                  {cat.kinds.map((k) => {
                    const th = themes[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setOpen(false); setSearch(""); onAdd(k); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "6px 12px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                          borderRadius: 0,
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgb(var(--foreground) / 0.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 5,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: th.iconBg,
                            color: th.iconColor,
                            flexShrink: 0,
                          }}
                        >
                          <NodeIcon box={{ kind: k, id: "_" } as Box} size={14} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "rgb(var(--foreground))" }}>
                          {kindNames[k] ?? k}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {q && filteredCategories[0]?.kinds.length === 0 && (
              <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "rgb(var(--foreground) / 0.4)" }}>
                No nodes found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { automation: AutomationNode, addNode: AddNode };

/* ───────────────────── n8n LAYOUT ALGORITHM ───────────────────── */

/**
 * n8n CANVAS LAYOUT — exact horizontal flow.
 *
 * Primary direction: LEFT → RIGHT with 250px column spacing.
 * Branching nodes (condition/switch/filter) create Y offsets for
 * the nodes that follow, simulating parallel paths.
 * Same-kind consecutive nodes stack vertically in a column.
 */
const NODE_W = 96;    // n8n: GRID_SIZE * 6 = 96
const NODE_H = 120;   // 96px card + ~24px label below
const X_GAP = 56;     // horizontal gap between nodes
const Y_GAP = 20;     // vertical gap between stacked nodes
const X_STEP = NODE_W + X_GAP;  // 152px per column
const Y_STEP = NODE_H + Y_GAP;  // 140px per stack row
const MAX_STACK = 4;

const BRANCH_KINDS = new Set(["condition", "switch", "filter", "error_handler"]);

function boxesToNodes(boxes: Box[], kindNames: Record<string, string>, describe: (b: Box) => string): Node[] {
  if (boxes.length === 0) return [];

  const positions: { x: number; y: number }[] = [];
  let col = 0;
  let stackInCol = 0;
  let lastKind = "";

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const isBranch = BRANCH_KINDS.has(box.kind);
    const prevIsBranch = i > 0 && BRANCH_KINDS.has(boxes[i - 1].kind);
    const sameAsPrev = box.kind === lastKind && !isBranch;

    if (i === 0) {
      positions.push({ x: 0, y: 0 });
      stackInCol = 1;
    } else if (sameAsPrev && stackInCol < MAX_STACK && !prevIsBranch) {
      // Stack vertically — same kind, same column
      positions.push({ x: col * X_STEP, y: stackInCol * Y_STEP });
      stackInCol++;
    } else if (prevIsBranch) {
      // After branch: shift right AND down to show branching
      col++;
      positions.push({ x: col * X_STEP, y: Math.round(Y_STEP * 0.6) });
      stackInCol = 1;
    } else {
      // New column
      col++;
      positions.push({ x: col * X_STEP, y: 0 });
      stackInCol = 1;
    }
    lastKind = box.kind;
  }

  return boxes.map((box, i) => ({
    id: box.id,
    type: "automation",
    position: positions[i],
    data: {
      box,
      kindName: kindNames[box.kind] ?? box.kind,
      description: describe(box),
      theme: THEME[box.kind],
      index: i,
    },
  }));
}

/** Convert linear boxes to React Flow edges (each box → next box). */
function boxesToEdges(boxes: Box[]): Edge[] {
  return boxes.slice(0, -1).map((box, i) => {
    const sourceTheme = THEME[box.kind];
    return {
      id: `e-${box.id}-${boxes[i + 1].id}`,
      source: box.id,
      target: boxes[i + 1].id,
      type: "default",  // bezier curves — like n8n
      animated: false,
      style: {
        stroke: sourceTheme?.accent ?? "#6b7280",
        strokeWidth: 2,
        opacity: 0.45,
      },
    };
  });
}

/* ───────────────────── CANVAS INNER ───────────────────── */

function FlowCanvasInner({
  boxes,
  chosen,
  onChoose,
  connected,
  onAdd,
  onDelete,
  onUndo,
}: {
  boxes: Box[];
  chosen: string | null;
  onChoose: (id: string) => void;
  connected: Connected;
  onAdd?: (kind: Box["kind"]) => void;
  onDelete?: (boxId: string) => void;
  onUndo?: () => void;
}) {
  const kindNames = useKindNames();
  const describe = useDescribe();

  const initialNodes = useMemo(() => {
    const nodes = boxesToNodes(boxes, kindNames, describe);
    if (onAdd) {
      const lastPos = nodes.length > 0 ? nodes[nodes.length - 1].position : { x: 0, y: 0 };
      nodes.push({
        id: "__add__",
        type: "addNode",
        position: { x: lastPos.x + X_STEP + 10, y: lastPos.y + 6 },
        data: { onAdd, kindNames, themes: THEME },
        draggable: false,
        selectable: false,
      });
    }
    return nodes;
  }, [boxes, kindNames, describe, onAdd]);

  const initialEdges = useMemo(() => {
    const edges = boxesToEdges(boxes);
    if (onAdd && boxes.length > 0) {
      edges.push({
        id: `e-${boxes[boxes.length - 1].id}-__add__`,
        source: boxes[boxes.length - 1].id,
        target: "__add__",
        type: "default",
        animated: false,
        style: { stroke: "#6b7280", strokeWidth: 1.5, strokeDasharray: "6 4", opacity: 0.3 },
      });
    }
    return edges;
  }, [boxes, onAdd]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id !== "__add__") onChoose(node.id);
  }, [onChoose]);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (node.id === "__add__") return;
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);
  const closeContext = useCallback(() => setContextMenu(null), []);

  const reactFlowInstance = useReactFlow();

  // n8n keyboard shortcuts
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && chosen && onDelete) {
      e.preventDefault();
      onDelete(chosen);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && onUndo) {
      e.preventDefault();
      onUndo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "d" && chosen && onAdd) {
      e.preventDefault();
      const box = boxes.find((b) => b.id === chosen);
      if (box && box.kind !== "start") onAdd(box.kind);
    }
    if (e.key === "1" && !e.ctrlKey && !e.metaKey) {
      reactFlowInstance.fitView({ padding: 0.15, duration: 300 });
    }
    if (e.key === "0" && !e.ctrlKey && !e.metaKey) {
      reactFlowInstance.zoomTo(1, { duration: 300 });
    }
  }, [chosen, onDelete, onUndo, onAdd, boxes, reactFlowInstance]);

  return (
    <div
      style={{
        height: 520,
        borderRadius: 10,
        border: "1px solid rgb(var(--border) / 0.2)",
        overflow: "hidden",
        position: "relative",
      }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: n.id === chosen }))}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(e, n) => { closeContext(); onNodeClick(e, n); }}
        onNodeDoubleClick={(_, n) => { if (n.id !== "__add__") onChoose(n.id); }}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={closeContext}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnDrag
        zoomOnScroll
        panOnScroll
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        deleteKeyCode={null}
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgb(var(--foreground) / 0.06)"
        />
        <Controls
          showInteractive={false}
          style={{
            background: "rgb(var(--panel))",
            border: "1px solid rgb(var(--border) / 0.2)",
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            const th = THEME[(n.data as { box: Box })?.box?.kind];
            return th?.accent ?? "#6b7280";
          }}
          maskColor="rgb(var(--panel) / 0.85)"
          style={{
            background: "rgb(var(--panel) / 0.7)",
            border: "1px solid rgb(var(--border) / 0.2)",
            borderRadius: 8,
            height: 80,
            width: 130,
          }}
        />
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 50,
            minWidth: 150,
            borderRadius: 8,
            background: "rgb(var(--panel))",
            border: "1px solid rgb(var(--border) / 0.3)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            padding: "4px 0",
          }}
        >
          <button
            type="button"
            onClick={() => { onChoose(contextMenu.nodeId); closeContext(); }}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "rgb(var(--foreground))", textAlign: "left" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgb(var(--foreground) / 0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Edit
          </button>
          {onAdd && (
            <button
              type="button"
              onClick={() => {
                const box = boxes.find((b) => b.id === contextMenu.nodeId);
                if (box && box.kind !== "start") onAdd(box.kind);
                closeContext();
              }}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "rgb(var(--foreground))", textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgb(var(--foreground) / 0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              Duplicate
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => { onDelete(contextMenu.nodeId); closeContext(); }}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "7px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#ef4444", textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgb(var(--foreground) / 0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 14px",
          background: "rgb(var(--panel) / 0.95)",
          borderTop: "1px solid rgb(var(--border) / 0.15)",
          fontSize: 10,
          color: "rgb(var(--foreground) / 0.35)",
        }}
      >
        <span>{boxes.length} node{boxes.length !== 1 ? "s" : ""}</span>
        <span>Del · Ctrl+D · 1: fit · 0: 100%</span>
      </div>
    </div>
  );
}

/* ───────────────────── EXPORT ───────────────────── */

export function FlowCanvasView(props: {
  boxes: Box[];
  chosen: string | null;
  onChoose: (id: string) => void;
  connected: Connected;
  onAdd?: (kind: Box["kind"]) => void;
  onDelete?: (boxId: string) => void;
  onUndo?: () => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
