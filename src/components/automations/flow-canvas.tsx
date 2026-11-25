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
import { AlertTriangle, ArrowUpDown, BarChart3, Calendar, Clock, Code2, FileOutput, Filter, GitBranch, GitCompare, GitMerge, Hash, Heart, FileText, Layers, List, ListFilter, PauseCircle, RefreshCw, Reply, Scissors, Send, Sparkles, Split, Table2, Terminal, Timer, Type, Zap } from "lucide-react";
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
  if (box.kind === "action") return <Send className={cls} />;
  return <Zap className={cls} />;
}

/** Custom node component rendered by React Flow. */
function AutomationNode({ data, selected }: NodeProps) {
  const { box, kindName, description, theme } = data as {
    box: Box;
    kindName: string;
    description: string;
    theme: (typeof THEME)[Box["kind"]];
  };
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2 transition-shadow"
      style={{
        border: selected ? `2px solid ${theme.border}` : "1px solid rgb(var(--border) / 0.5)",
        boxShadow: selected ? `0 0 0 2px ${theme.border}40, 0 2px 8px rgba(0,0,0,0.2)` : "0 1px 4px rgba(0,0,0,0.12)",
        minWidth: 140,
        maxWidth: 200,
        cursor: "grab",
      }}
    >
      {/* Input handle (left) — n8n style: left-to-right flow */}
      <Handle type="target" position={Position.Left} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
      {/* Icon */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: theme.icon, color: theme.iconText }}
      >
        <NodeIcon box={box} />
      </div>
      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: theme.label }}>{kindName}</div>
        <div className="mt-0.5 truncate text-[10px] leading-tight text-foreground" title={description}>{description}</div>
      </div>
      {/* Output handle (right) — n8n style */}
      <Handle type="source" position={Position.Right} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
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
  /** n8n-style categorized node picker. Groups make 30 nodes manageable. */
  const categories: { label: string; kinds: Box["kind"][] }[] = [
    { label: "Core", kinds: ["read", "ai", "condition", "approval", "action"] },
    { label: "Flow", kinds: ["filter", "switch", "loop", "split", "merge", "error_handler"] },
    { label: "Data", kinds: ["sort", "limit", "remove_duplicates", "summarize", "set", "compare", "transform"] },
    { label: "Time", kinds: ["wait", "delay", "date_time"] },
    { label: "AI", kinds: ["text_classifier", "sentiment", "extract_info"] },
    { label: "Code", kinds: ["code", "html_extract", "execute_command", "respond_webhook"] },
    { label: "Other", kinds: ["note"] },
  ];
  const [activeTab, setActiveTab] = useState(0);
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Left} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-all hover:bg-panel hover:text-foreground"
        style={{ border: "1px dashed #4b5563" }}
      >
        <span className="text-lg leading-none">+</span>
      </button>
      {open && (
        <div className="absolute top-10 z-10 w-56 rounded-lg bg-panel shadow-lg" style={{ border: "1px solid rgb(var(--border))" }}>
          {/* Category tabs */}
          <div className="flex flex-wrap gap-0.5 border-b px-1.5 pt-1.5" style={{ borderColor: "rgb(var(--border) / 0.3)" }}>
            {categories.map((cat, idx) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`rounded-t px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors ${activeTab === idx ? "bg-foreground/10 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Nodes grid */}
          <div className="grid grid-cols-2 gap-1 p-1.5">
            {categories[activeTab].kinds.map((k) => {
              const th = themes[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setOpen(false); onAdd(k); }}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-panel-hover"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ background: th.icon, color: th.iconText }}>
                    <NodeIcon box={{ kind: k, id: "_" } as Box} />
                  </span>
                  <span className="truncate text-[9px] font-medium text-foreground">{kindNames[k]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { automation: AutomationNode, addNode: AddNode };

/**
 * Convert linear boxes to React Flow nodes in a HORIZONTAL layout
 * exactly like n8n: left → right, with rows wrapping when the
 * canvas gets too wide. Each row holds up to COLS nodes; when a row
 * is full the next row starts below it, flowing left → right again.
 */
function boxesToNodes(boxes: Box[], kindNames: Record<string, string>, describe: (b: Box) => string): Node[] {
  const COLS = 5;        // nodes per row before wrapping
  const X_STEP = 220;    // horizontal gap between nodes
  const Y_STEP = 120;    // vertical gap between rows
  return boxes.map((box, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // n8n layout: always left → right, new row below
    const x = col * X_STEP;
    const y = row * Y_STEP;
    return {
      id: box.id,
      type: "automation",
      position: { x: x + 20, y: y + 20 },
      data: {
        box,
        kindName: kindNames[box.kind] ?? box.kind,
        description: describe(box),
        theme: THEME[box.kind],
      },
    };
  });
}

/** Convert linear boxes to React Flow edges (each box → next box). */
function boxesToEdges(boxes: Box[]): Edge[] {
  return boxes.slice(0, -1).map((box, i) => ({
    id: `e-${box.id}-${boxes[i + 1].id}`,
    source: box.id,
    target: boxes[i + 1].id,
    type: "smoothstep",
    animated: false,
    style: { stroke: "#4b5563", strokeWidth: 2 },
  }));
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
      // Place "+" to the right of the last node (horizontal n8n layout)
      const COLS = 5;
      const X_STEP = 220;
      const Y_STEP = 120;
      const nextIdx = boxes.length;
      const row = Math.floor(nextIdx / COLS);
      const col = nextIdx % COLS;
      nodes.push({
        id: "__add__",
        type: "addNode",
        position: { x: col * X_STEP + 20, y: row * Y_STEP + 20 },
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

  // Keyboard shortcuts — n8n style
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Delete: remove selected node
    if ((e.key === "Delete" || e.key === "Backspace") && chosen && onDelete) {
      e.preventDefault();
      onDelete(chosen);
    }
    // Ctrl+Z: undo
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && onUndo) {
      e.preventDefault();
      onUndo();
    }
  }, [chosen, onDelete, onUndo]);

  // Height based on number of rows
  const rows = Math.ceil(boxes.length / 2);
  const canvasHeight = Math.max(280, rows * 100 + 100);

  return (
    <div
      className="rounded-xl"
      style={{
        height: canvasHeight,
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
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
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
