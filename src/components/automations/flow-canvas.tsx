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
import { Clock, Filter, Hash, FileText, Layers, PauseCircle, Send, Sparkles, Table2, Zap } from "lucide-react";
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
  };
}

/** Short description for a box. */
function useDescribe() {
  const t = useTranslations("dashboard.automations");
  const source: Record<ReadSource, string> = {
    calendar_today: t("sources.calendar_today"), calendar_tomorrow: t("sources.calendar_tomorrow"),
    calendar_week: t("sources.calendar_week"), finances_week: t("sources.finances_week"),
    finances_month: t("sources.finances_month"), uploaded_file: t("sources.uploaded_file"),
    google_sheets: t("sources.google_sheets"), website_scrape: t("sources.website_scrape"),
    rss_feed: t("sources.rss_feed"), last_emails: t("sources.last_emails"),
    database_query: t("sources.database_query"), crm_contacts: t("sources.crm_contacts"),
    social_mentions: t("sources.social_mentions"), analytics_report: t("sources.analytics_report"),
    notion_pages: t("sources.notion_pages"), airtable_records: t("sources.airtable_records"),
    google_drive_files: t("sources.google_drive_files"), jira_issues: t("sources.jira_issues"),
    github_issues: t("sources.github_issues"), hubspot_contacts: t("sources.hubspot_contacts"),
    shopify_orders: t("sources.shopify_orders"), http_request: t("sources.http_request"),
    pdf_extract: t("sources.pdf_extract"), weather_data: t("sources.weather_data"),
    stock_prices: t("sources.stock_prices"), discord_messages: t("sources.discord_messages"),
    trello_cards: t("sources.trello_cards"), asana_tasks: t("sources.asana_tasks"),
    clickup_tasks: t("sources.clickup_tasks"), stripe_payments: t("sources.stripe_payments"),
    typeform_responses: t("sources.typeform_responses"), google_forms: t("sources.google_forms"),
  };
  const action: Record<ActionKind, string> = {
    send_telegram: t("actions.send_telegram"), send_email: t("actions.send_email"),
    notify: t("actions.notify"), save_to_library: t("actions.save_to_library"),
    send_whatsapp: t("actions.send_whatsapp"), send_slack: t("actions.send_slack"),
    send_sms: t("actions.send_sms"), post_instagram: t("actions.post_instagram"),
    post_facebook: t("actions.post_facebook"), post_twitter: t("actions.post_twitter"),
    post_linkedin: t("actions.post_linkedin"), sheets_write: t("actions.sheets_write"),
    database_write: t("actions.database_write"), webhook_post: t("actions.webhook_post"),
    create_task: t("actions.create_task"), create_event: t("actions.create_event"),
    create_invoice: t("actions.create_invoice"), send_discord: t("actions.send_discord"),
    notion_write: t("actions.notion_write"), airtable_write: t("actions.airtable_write"),
    google_drive_upload: t("actions.google_drive_upload"), jira_create: t("actions.jira_create"),
    github_create: t("actions.github_create"), hubspot_update: t("actions.hubspot_update"),
    shopify_update: t("actions.shopify_update"), http_request: t("actions.http_request"),
    generate_pdf: t("actions.generate_pdf"), translate_text: t("actions.translate_text"),
    compress_files: t("actions.compress_files"), resize_image: t("actions.resize_image"),
    convert_format: t("actions.convert_format"), trello_create: t("actions.trello_create"),
    asana_create: t("actions.asana_create"), clickup_create: t("actions.clickup_create"),
    stripe_charge: t("actions.stripe_charge"), mailchimp_add: t("actions.mailchimp_add"),
    sendgrid_send: t("actions.sendgrid_send"), twilio_call: t("actions.twilio_call"),
    zoom_create: t("actions.zoom_create"), google_ads_update: t("actions.google_ads_update"),
    facebook_ads_update: t("actions.facebook_ads_update"), youtube_upload: t("actions.youtube_upload"),
    wordpress_post: t("actions.wordpress_post"), supabase_insert: t("actions.supabase_insert"),
    redis_set: t("actions.redis_set"), mqtt_publish: t("actions.mqtt_publish"),
    s3_upload: t("actions.s3_upload"),
  };
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
    if (box.kind === "read") return source[box.source];
    if (box.kind === "ai") return box.instruction.slice(0, 50);
    if (box.kind === "condition") return t("condition");
    if (box.kind === "approval") return t("approval");
    if (box.kind === "action") return action[box.do];
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
      {/* Input handle (top) */}
      <Handle type="target" position={Position.Top} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
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
      {/* Output handle (bottom) */}
      <Handle type="source" position={Position.Bottom} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
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
  const kinds: Box["kind"][] = ["read", "ai", "condition", "approval", "action"];
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} style={{ background: "#4b5563", border: "2px solid #374151", width: 8, height: 8 }} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-all hover:bg-panel hover:text-foreground"
        style={{ border: "1px dashed #4b5563" }}
      >
        <span className="text-lg leading-none">+</span>
      </button>
      {open && (
        <div className="absolute top-10 z-10 flex gap-1 rounded-lg bg-panel p-1.5 shadow-lg" style={{ border: "1px solid rgb(var(--border))" }}>
          {kinds.map((k) => {
            const th = themes[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => { setOpen(false); onAdd(k); }}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors hover:bg-panel-hover"
                style={{ color: th.label }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: th.icon, color: th.iconText }}>
                  {k === "read" && <Table2 className="h-3 w-3" />}
                  {k === "ai" && <Sparkles className="h-3 w-3" />}
                  {k === "condition" && <Filter className="h-3 w-3" />}
                  {k === "approval" && <PauseCircle className="h-3 w-3" />}
                  {k === "action" && <Send className="h-3 w-3" />}
                </span>
                {kindNames[k]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { automation: AutomationNode, addNode: AddNode };

/** Convert linear boxes to React Flow nodes arranged in a zigzag. */
function boxesToNodes(boxes: Box[], kindNames: Record<string, string>, describe: (b: Box) => string): Node[] {
  const COLS = 2;
  const X_STEP = 240;
  const Y_STEP = 100;
  return boxes.map((box, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // Zigzag: even rows left→right, odd rows right→left
    const x = row % 2 === 0 ? col * X_STEP : (COLS - 1 - col) * X_STEP;
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
      const lastNode = nodes[nodes.length - 1];
      const COLS = 2;
      const lastRow = Math.floor(boxes.length / COLS);
      const lastCol = boxes.length % COLS;
      const X_STEP = 240;
      const Y_STEP = 100;
      const x = lastRow % 2 === 0 ? lastCol * X_STEP : (COLS - 1 - lastCol) * X_STEP;
      const y = lastRow * Y_STEP;
      nodes.push({
        id: "__add__",
        type: "addNode",
        position: { x: x + 60, y: y + 20 },
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
