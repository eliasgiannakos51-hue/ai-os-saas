"use client";

/**
 * n8n-STYLE VISUAL CANVAS using React Flow (@xyflow/react).
 *
 * Renders the automation's boxes as draggable nodes on an interactive
 * canvas with zoom, pan, and curved connections — exactly like n8n.
 * The linear boxes[] array is converted to React Flow nodes + edges.
 *
 * Clicking a node selects it (onChoose). Dragging repositions it.
 * The canvas has a dot-grid background like n8n.
 */

import { useCallback, useMemo, useState } from "react";
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
import { AlertTriangle, ArrowUpDown, BarChart3, Calendar, Clock, Code2, FileOutput, Filter, GitBranch, GitCompare, GitMerge, Globe, Hash, Heart, FileText, Layers, List, ListFilter, PauseCircle, RefreshCw, Reply, Scissors, Send, Sparkles, Split, Table2, Terminal, Timer, Type, Zap } from "lucide-react";
import type { Box, ReadSource, ActionKind, StartBox } from "@/lib/automations/boxes";
import type { Connected } from "@/components/automations/flow-boxes";

/** Blue/gray theme — matches the rest of the automation UI. */
const THEME: Record<Box["kind"], { icon: string; iconText: string; label: string; border: string }> = {
  start:     { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  read:      { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  ai:        { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  condition: { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  approval:  { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  action:    { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  filter:    { icon: "#4a2c0a", iconText: "#fbbf24", label: "#fbbf24", border: "#f59e0b" },
  code:      { icon: "#1a2e1a", iconText: "#4ade80", label: "#4ade80", border: "#22c55e" },
  wait:      { icon: "#3b1a3b", iconText: "#e879f9", label: "#e879f9", border: "#d946ef" },
  transform: { icon: "#1e3a5f", iconText: "#38bdf8", label: "#38bdf8", border: "#0ea5e9" },
  note:      { icon: "#3a3a1a", iconText: "#fde68a", label: "#fde68a", border: "#fbbf24" },
  // n8n advanced nodes (2026-11-24):
  error_handler: { icon: "#5c1a1a", iconText: "#fca5a5", label: "#fca5a5", border: "#ef4444" },
  loop:          { icon: "#1a3a5c", iconText: "#93c5fd", label: "#93c5fd", border: "#3b82f6" },
  split:         { icon: "#1a4a3a", iconText: "#6ee7b7", label: "#6ee7b7", border: "#10b981" },
  merge:         { icon: "#3a1a4a", iconText: "#c4b5fd", label: "#c4b5fd", border: "#8b5cf6" },
  delay:         { icon: "#3a2a1a", iconText: "#fdba74", label: "#fdba74", border: "#f97316" },
  // n8n data transformation + flow control (round 2):
  sort:              { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  limit:             { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  remove_duplicates: { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  summarize:         { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  switch:            { icon: "#4a2c0a", iconText: "#fbbf24", label: "#fbbf24", border: "#f59e0b" },
  set:               { icon: "#1e3a5f", iconText: "#38bdf8", label: "#38bdf8", border: "#0ea5e9" },
  compare:           { icon: "#1a4a3a", iconText: "#6ee7b7", label: "#6ee7b7", border: "#10b981" },
  date_time:         { icon: "#3b1a3b", iconText: "#e879f9", label: "#e879f9", border: "#d946ef" },
  html_extract:      { icon: "#1a2e1a", iconText: "#4ade80", label: "#4ade80", border: "#22c55e" },
  text_classifier:   { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  sentiment:         { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  extract_info:      { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  respond_webhook:   { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  execute_command:   { icon: "#1a2e1a", iconText: "#4ade80", label: "#4ade80", border: "#22c55e" },
  // n8n remaining core (round 3):
  aggregate:         { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  split_out:         { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  rename_keys:       { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  xml:               { icon: "#1a2e1a", iconText: "#4ade80", label: "#4ade80", border: "#22c55e" },
  markdown:          { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  crypto:            { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  spreadsheet_parse: { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  no_op:             { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  stop_error:        { icon: "#5c1a1a", iconText: "#fca5a5", label: "#fca5a5", border: "#ef4444" },
  execute_workflow:  { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  read_file:         { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  write_file:        { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  smtp_send:         { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  ftp:               { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  ssh:               { icon: "#1a2e1a", iconText: "#4ade80", label: "#4ade80", border: "#22c55e" },
  graphql:           { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
  ai_agent:          { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  llm_chain:         { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  retrieval_qa:      { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  summarization_chain: { icon: "#2d1b69", iconText: "#a78bfa", label: "#a78bfa", border: "#8b5cf6" },
  http_response:     { icon: "#1e3a5f", iconText: "#60a5fa", label: "#60a5fa", border: "#3b82f6" },
};

/** Translate box kind to display name. */
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
    remove_duplicates: "Remove Duplicates",
    summarize: "Summarize",
    switch: "Switch",
    set: "Set",
    compare: "Compare",
    date_time: "Date & Time",
    html_extract: "HTML Extract",
    text_classifier: "Text Classifier",
    sentiment: "Sentiment",
    extract_info: "Extract Info",
    respond_webhook: "Respond Webhook",
    execute_command: "Execute Command",
    aggregate: "Aggregate", split_out: "Split Out", rename_keys: "Rename Keys",
    xml: "XML", markdown: "Markdown", crypto: "Crypto", spreadsheet_parse: "Spreadsheet",
    no_op: "No Op", stop_error: "Stop & Error", execute_workflow: "Sub-Workflow",
    read_file: "Read File", write_file: "Write File", smtp_send: "SMTP Send",
    ftp: "FTP", ssh: "SSH", graphql: "GraphQL", ai_agent: "AI Agent",
    llm_chain: "LLM Chain", retrieval_qa: "Retrieval QA",
    summarization_chain: "Summarize Chain", http_response: "HTTP Response",
  };
}

/** Short description for a box. Uses t() with fallback to key name. */
function useDescribe() {
  const t = useTranslations("dashboard.automations");
  // Dynamic lookup — avoids maintaining a 100-entry Record manually
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
    if (box.kind === "ai") return box.instruction.slice(0, 50);
    if (box.kind === "condition") return t("condition");
    if (box.kind === "approval") return t("approval");
    if (box.kind === "filter") return box.expression.slice(0, 40);
    if (box.kind === "code") return `${box.language}: ${box.code.slice(0, 30)}`;
    if (box.kind === "wait") return `${box.duration} ${box.unit}`;
    if (box.kind === "transform") return box.instruction.slice(0, 40);
    if (box.kind === "note") return box.text.slice(0, 30) || "Note";
    // n8n advanced nodes:
    if (box.kind === "error_handler") return `On error: ${box.fallbackAction}`;
    if (box.kind === "loop") return `Loop (max ${box.maxIterations})`;
    if (box.kind === "split") return `Batch ${box.batchSize}`;
    if (box.kind === "merge") return `Merge: ${box.mode}`;
    if (box.kind === "delay") return `${box.delay} ${box.unit}`;
    // n8n data transformation + flow control (round 2):
    if (box.kind === "sort") return `Sort by ${box.field}`;
    if (box.kind === "limit") return `First ${box.maxItems}`;
    if (box.kind === "remove_duplicates") return `Dedup ${box.field}`;
    if (box.kind === "summarize") return `${box.operation}(${box.field})`;
    if (box.kind === "switch") return `Route: ${box.field}`;
    if (box.kind === "set") return "Set fields";
    if (box.kind === "compare") return box.mode.replace(/_/g, " ");
    if (box.kind === "date_time") return `Date: ${box.operation}`;
    if (box.kind === "html_extract") return box.selector.slice(0, 30);
    if (box.kind === "text_classifier") return box.categories.slice(0, 2).join(", ");
    if (box.kind === "sentiment") return "Sentiment";
    if (box.kind === "extract_info") return box.fields.slice(0, 2).join(", ");
    if (box.kind === "respond_webhook") return `Respond ${box.statusCode}`;
    if (box.kind === "execute_command") return box.command.slice(0, 30);
    // n8n remaining core (round 3):
    if (box.kind === "aggregate") return box.operation;
    if (box.kind === "split_out") return box.field;
    if (box.kind === "rename_keys") return "Rename";
    if (box.kind === "xml") return box.direction === "xml_to_json" ? "XML→JSON" : "JSON→XML";
    if (box.kind === "markdown") return box.direction === "md_to_html" ? "MD→HTML" : "HTML→MD";
    if (box.kind === "crypto") return box.operation;
    if (box.kind === "spreadsheet_parse") return box.format.toUpperCase();
    if (box.kind === "no_op") return "Pass";
    if (box.kind === "stop_error") return box.message.slice(0, 25);
    if (box.kind === "execute_workflow") return box.workflowId.slice(0, 15);
    if (box.kind === "read_file") return box.path.slice(0, 25);
    if (box.kind === "write_file") return box.path.slice(0, 25);
    if (box.kind === "smtp_send") return box.host.slice(0, 20);
    if (box.kind === "ftp") return `${box.operation} ${box.host.slice(0, 15)}`;
    if (box.kind === "ssh") return box.command.slice(0, 25);
    if (box.kind === "graphql") return "GraphQL";
    if (box.kind === "ai_agent") return box.instruction.slice(0, 30);
    if (box.kind === "llm_chain") return box.prompt.slice(0, 30);
    if (box.kind === "retrieval_qa") return box.question.slice(0, 30);
    if (box.kind === "summarization_chain") return "Summarize";
    if (box.kind === "http_response") return `${box.statusCode}`;
    if (box.kind === "action") return act(box.do);
    return "";
  };
}

/** Icon for a box kind. */
function NodeIcon({ box }: { box: Box }) {
  const cls = "h-4 w-4";
  if (box.kind === "start") return <Clock className={cls} />;
  if (box.kind === "read") return <Table2 className={cls} />;
  if (box.kind === "ai") return <Sparkles className={cls} />;
  if (box.kind === "condition") return <Filter className={cls} />;
  if (box.kind === "approval") return <PauseCircle className={cls} />;
  if (box.kind === "filter") return <Filter className={cls} />;
  if (box.kind === "code") return <Hash className={cls} />;
  if (box.kind === "wait") return <Clock className={cls} />;
  if (box.kind === "transform") return <Layers className={cls} />;
  if (box.kind === "note") return <FileText className={cls} />;
  // n8n advanced nodes:
  if (box.kind === "error_handler") return <AlertTriangle className={cls} />;
  if (box.kind === "loop") return <RefreshCw className={cls} />;
  if (box.kind === "split") return <GitBranch className={cls} />;
  if (box.kind === "merge") return <GitMerge className={cls} />;
  if (box.kind === "delay") return <Timer className={cls} />;
  // n8n data transformation + flow control (round 2):
  if (box.kind === "sort") return <ArrowUpDown className={cls} />;
  if (box.kind === "limit") return <ListFilter className={cls} />;
  if (box.kind === "remove_duplicates") return <Scissors className={cls} />;
  if (box.kind === "summarize") return <BarChart3 className={cls} />;
  if (box.kind === "switch") return <Split className={cls} />;
  if (box.kind === "set") return <Type className={cls} />;
  if (box.kind === "compare") return <GitCompare className={cls} />;
  if (box.kind === "date_time") return <Calendar className={cls} />;
  if (box.kind === "html_extract") return <Code2 className={cls} />;
  if (box.kind === "text_classifier") return <List className={cls} />;
  if (box.kind === "sentiment") return <Heart className={cls} />;
  if (box.kind === "extract_info") return <FileOutput className={cls} />;
  if (box.kind === "respond_webhook") return <Reply className={cls} />;
  if (box.kind === "execute_command") return <Terminal className={cls} />;
  // n8n remaining core (round 3):
  if (box.kind === "aggregate") return <Layers className={cls} />;
  if (box.kind === "split_out") return <GitBranch className={cls} />;
  if (box.kind === "rename_keys") return <Type className={cls} />;
  if (box.kind === "xml") return <Code2 className={cls} />;
  if (box.kind === "markdown") return <FileText className={cls} />;
  if (box.kind === "crypto") return <Hash className={cls} />;
  if (box.kind === "spreadsheet_parse") return <Table2 className={cls} />;
  if (box.kind === "no_op") return <ArrowUpDown className={cls} />;
  if (box.kind === "stop_error") return <AlertTriangle className={cls} />;
  if (box.kind === "execute_workflow") return <RefreshCw className={cls} />;
  if (box.kind === "read_file") return <FileText className={cls} />;
  if (box.kind === "write_file") return <FileOutput className={cls} />;
  if (box.kind === "smtp_send") return <Send className={cls} />;
  if (box.kind === "ftp") return <Globe className={cls} />;
  if (box.kind === "ssh") return <Terminal className={cls} />;
  if (box.kind === "graphql") return <Globe className={cls} />;
  if (box.kind === "ai_agent") return <Sparkles className={cls} />;
  if (box.kind === "llm_chain") return <Sparkles className={cls} />;
  if (box.kind === "retrieval_qa") return <Sparkles className={cls} />;
  if (box.kind === "summarization_chain") return <Sparkles className={cls} />;
  if (box.kind === "http_response") return <Reply className={cls} />;
  if (box.kind === "action") return <Send className={cls} />;
  return <Zap className={cls} />;
}

/**
 * n8n EXACT node design: square card, big centered icon, label below.
 * Compact — many nodes fit on screen. No description inside the node.
 */
function AutomationNode({ data, selected }: NodeProps) {
  const { box, kindName, description, theme } = data as {
    box: Box;
    kindName: string;
    description: string;
    theme: (typeof THEME)[Box["kind"]];
  };
  return (
    <div
      className="relative flex flex-col items-center rounded-xl transition-shadow"
      style={{
        border: selected ? `2.5px solid ${theme.border}` : "1.5px solid rgb(var(--border) / 0.3)",
        boxShadow: selected ? `0 0 0 3px ${theme.border}30, 0 4px 16px rgba(0,0,0,0.3)` : "0 2px 8px rgba(0,0,0,0.2)",
        width: 80,
        height: 80,
        cursor: "grab",
        background: "rgb(var(--panel))",
      }}
      title={`${kindName}: ${description}`}
    >
      {/* Input handle (left) */}
      <Handle type="target" position={Position.Left} style={{ background: theme.border, border: "2px solid rgb(var(--panel))", width: 9, height: 9 }} />
      {/* Big centered icon */}
      <div
        className="mt-2.5 flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: theme.icon, color: theme.iconText }}
      >
        <NodeIcon box={box} />
      </div>
      {/* Label below icon */}
      <span className="mt-1 w-full truncate px-1 text-center text-[8px] font-semibold uppercase tracking-wide" style={{ color: theme.border }}>
        {kindName}
      </span>
      {/* Output handle (right) */}
      <Handle type="source" position={Position.Right} style={{ background: theme.border, border: "2px solid rgb(var(--panel))", width: 9, height: 9 }} />
    </div>
  );
}

/** "+" add-node button rendered as a React Flow node at the end. */
function AddNode({ data }: NodeProps) {
  const { onAdd, kindNames, theme: themes } = data as {
    onAdd: (kind: Box["kind"]) => void;
    kindNames: Record<string, string>;
    theme: typeof THEME;
  };
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  /** n8n-style categorized node picker with search. */
  const ALL_KINDS: Box["kind"][] = [
    "read", "ai", "condition", "approval", "action",
    "filter", "switch", "loop", "split", "merge", "error_handler", "no_op", "stop_error", "execute_workflow",
    "sort", "limit", "remove_duplicates", "summarize", "set", "compare", "transform", "aggregate", "split_out", "rename_keys",
    "xml", "markdown", "html_extract", "spreadsheet_parse", "crypto",
    "wait", "delay", "date_time",
    "ai_agent", "llm_chain", "retrieval_qa", "summarization_chain", "text_classifier", "sentiment", "extract_info",
    "code", "execute_command", "ssh", "graphql",
    "read_file", "write_file", "ftp",
    "respond_webhook", "http_response", "smtp_send",
    "note",
  ];
  const filtered = search.trim()
    ? ALL_KINDS.filter((k) => (kindNames[k] ?? k).toLowerCase().includes(search.toLowerCase()))
    : ALL_KINDS.slice(0, 12); // show top 12 by default
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Left} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-all hover:bg-panel hover:text-foreground"
        style={{ border: "1px dashed #4b5563" }}
      >
        <span className="text-lg leading-none">+</span>
      </button>
      {open && (
        <div className="absolute top-10 z-10 w-60 rounded-lg bg-panel shadow-lg" style={{ border: "1px solid rgb(var(--border))" }}>
          {/* n8n-style search bar */}
          <div className="px-2 pt-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes..."
              autoFocus
              className="w-full rounded-md bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted outline-none"
              style={{ border: "1px solid rgb(var(--border) / 0.4)" }}
            />
          </div>
          {/* Nodes grid */}
          <div className="grid grid-cols-2 gap-1 p-2" style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.map((k) => {
              const th = themes[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setOpen(false); setSearch(""); onAdd(k); }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-panel-hover"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ background: th.icon, color: th.iconText }}>
                    <NodeIcon box={{ kind: k, id: "_" } as Box} />
                  </span>
                  <span className="truncate text-[9px] font-medium text-foreground">{kindNames[k]}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="col-span-2 py-2 text-center text-[10px] text-muted">No nodes found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { automation: AutomationNode, addNode: AddNode };

/**
 * n8n CANVAS LAYOUT with visual grouping.
 *
 * Primary direction: LEFT → RIGHT.
 * When there are many boxes, they group into "columns" of up to 3
 * stacked vertically, then the next column goes right.
 * This creates the n8n-style visual where you see branching paths.
 *
 * The grouping is: 1 node starts a column; if the NEXT nodes are
 * the same category (e.g. 5 consecutive "action" boxes), they stack
 * vertically in that column (up to 3), then overflow to the next column.
 */
const BRANCH_KINDS = new Set(["condition", "switch", "filter", "error_handler"]);

function boxesToNodes(boxes: Box[], kindNames: Record<string, string>, describe: (b: Box) => string): Node[] {
  const X_STEP = 120;
  const Y_STEP = 95;
  const MAX_STACK = 3;    // max vertical stack per column

  // Group consecutive same-kind boxes into vertical stacks
  const positions: { x: number; y: number }[] = [];
  let col = 0;
  let stackCount = 0;
  let lastKind = "";

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const sameAsPrev = box.kind === lastKind && !BRANCH_KINDS.has(box.kind);
    const prevIsBranch = i > 0 && BRANCH_KINDS.has(boxes[i - 1].kind);

    if (i === 0) {
      // First box — always top left
      positions.push({ x: 0, y: 0 });
      stackCount = 1;
    } else if (sameAsPrev && stackCount < MAX_STACK && !prevIsBranch) {
      // Same kind, stack vertically
      positions.push({ x: col * X_STEP, y: stackCount * Y_STEP });
      stackCount++;
    } else if (prevIsBranch && i + 1 < boxes.length && !BRANCH_KINDS.has(box.kind)) {
      // After a branch node: offset down to show branching visual
      col++;
      positions.push({ x: col * X_STEP, y: Y_STEP * 0.5 });
      stackCount = 1;
    } else {
      // New column
      col++;
      positions.push({ x: col * X_STEP, y: 0 });
      stackCount = 1;
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
      type: "smoothstep",
      animated: false,
      style: { stroke: sourceTheme?.border ?? "#4b5563", strokeWidth: 2, opacity: 0.5 },
    };
  });
}

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
    // Add "+" node at the end
    if (onAdd) {
      // Place "+" after the last node
      const lastPos = nodes.length > 0 ? nodes[nodes.length - 1].position : { x: 0, y: 0 };
      nodes.push({
        id: "__add__",
        type: "addNode",
        position: { x: lastPos.x + 220, y: lastPos.y },
        data: { onAdd, kindNames, theme: THEME },
        draggable: false,
        selectable: false,
      });
    }
    return nodes;
  }, [boxes, kindNames, describe, onAdd]);
  const initialEdges = useMemo(() => {
    const edges = boxesToEdges(boxes);
    // Connect last box to "+" node
    if (onAdd && boxes.length > 0) {
      edges.push({
        id: `e-${boxes[boxes.length - 1].id}-__add__`,
        source: boxes[boxes.length - 1].id,
        target: "__add__",
        type: "smoothstep",
        animated: false,
        style: { stroke: "#4b5563", strokeWidth: 1.5, strokeDasharray: "4 3" },
      });
    }
    return edges;
  }, [boxes, onAdd]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onChoose(node.id);
  }, [onChoose]);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (node.id === "__add__") return;
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);
  const closeContext = useCallback(() => setContextMenu(null), []);

  const reactFlowInstance = useReactFlow();

  // Keyboard shortcuts — n8n style
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Delete/Backspace: remove selected node
    if ((e.key === "Delete" || e.key === "Backspace") && chosen && onDelete) {
      e.preventDefault();
      onDelete(chosen);
    }
    // Ctrl+Z: undo
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && onUndo) {
      e.preventDefault();
      onUndo();
    }
    // Ctrl+D: duplicate selected node
    if ((e.ctrlKey || e.metaKey) && e.key === "d" && chosen && onAdd) {
      e.preventDefault();
      const box = boxes.find((b) => b.id === chosen);
      if (box && box.kind !== "start") onAdd(box.kind);
    }
    // 1: zoom to fit (n8n shortcut)
    if (e.key === "1" && !e.ctrlKey && !e.metaKey) {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }
    // 0: zoom to 100%
    if (e.key === "0" && !e.ctrlKey && !e.metaKey) {
      reactFlowInstance.zoomTo(1, { duration: 300 });
    }
  }, [chosen, onDelete, onUndo, onAdd, boxes, reactFlowInstance]);

  return (
    <div
      className="relative rounded-xl"
      style={{
        height: 500,
        border: "1px solid rgb(var(--border) / 0.3)",
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
        fitViewOptions={{ padding: 0.2 }}
        panOnDrag
        zoomOnScroll
        panOnScroll
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="rgb(var(--foreground) / 0.08)"
        />
        {/* n8n-style zoom controls — bottom left */}
        <Controls
          showInteractive={false}
          style={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--border) / 0.3)", borderRadius: 8 }}
        />
        {/* Mini-map — bottom right, like n8n */}
        <MiniMap
          nodeColor={() => "#3b82f6"}
          maskColor="rgb(var(--panel) / 0.8)"
          style={{ background: "rgb(var(--panel) / 0.6)", border: "1px solid rgb(var(--border) / 0.3)", borderRadius: 8, height: 80, width: 120 }}
        />
      </ReactFlow>
      {/* n8n-style right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg bg-panel py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y, border: "1px solid rgb(var(--border))", minWidth: 140 }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-panel-hover"
            onClick={() => { onChoose(contextMenu.nodeId); closeContext(); }}
          >
            Edit
          </button>
          {onAdd && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-panel-hover"
              onClick={() => {
                const box = boxes.find((b) => b.id === contextMenu.nodeId);
                if (box && box.kind !== "start") onAdd(box.kind);
                closeContext();
              }}
            >
              Duplicate
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-panel-hover"
              onClick={() => { onDelete(contextMenu.nodeId); closeContext(); }}
            >
              Delete
            </button>
          )}
        </div>
      )}
      {/* n8n-style status bar — bottom of canvas */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between rounded-b-xl px-3 py-1" style={{ background: "rgb(var(--panel) / 0.9)", borderTop: "1px solid rgb(var(--border) / 0.2)" }}>
        <span className="text-[10px] text-muted">{boxes.length} nodes</span>
        <span className="text-[10px] text-muted">
          Del: delete · Ctrl+D: duplicate · 1: fit · 0: 100%
        </span>
      </div>
    </div>
  );
}

/** Wrapper that provides ReactFlowProvider. */
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
