"use client";

import type { AllToolsNameKey } from "@/lib/nav/all-tools";

/**
 * TOOL-SPECIFIC PREVIEW for the interior of each tool — what you see
 * when you open it. Used inside ComingSoonShell for not-ready tools
 * and available for ready tools' empty/landing states.
 *
 * Each preview matches the approved mockup (2026-11-15): simple,
 * minimal, uses only design tokens (no Tailwind palette hues).
 * The content is static — no interactivity, no provider calls.
 */

function Pill({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] ${active ? "bg-foreground/10 text-foreground" : "bg-panel text-muted"}`}>
      {children}
    </span>
  );
}

function Box({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <div className={`rounded-item border border-border px-2 py-1.5 text-[11px] text-muted ${className}`}>{children}</div>;
}

function Placeholder({ aspect = "1", className = "" }: { aspect?: string; className?: string }) {
  return <div className={`rounded-item bg-panel ${className}`} style={{ aspectRatio: aspect }} />;
}

function Bar({ w = "100%" }: { w?: string }) {
  return <div className="h-1 rounded-full bg-panel" style={{ width: w }} />;
}

const previews: Partial<Record<AllToolsNameKey, () => React.ReactNode>> = {
  // NOT-READY TOOLS
  threeD: () => (
    <>
      <p>Photo → 3D μοντέλο</p>
      <Placeholder aspect="4/3" className="flex items-center justify-center text-2xl" />
      <div className="flex gap-1.5"><Pill>Upload</Pill><Pill>Rotate</Pill><Pill>Export</Pill></div>
    </>
  ),
  video: () => (
    <>
      <p>Περίγραψε → AI φτιάχνει video</p>
      <Placeholder aspect="16/9" className="flex items-center justify-center text-xl" />
      <Box>Drone over Greek island...</Box>
      <div className="flex gap-1.5"><Pill>5s</Pill><Pill active>10s</Pill><Pill active>Generate →</Pill></div>
    </>
  ),
  films: () => (
    <>
      <p>Ταινία σε σκηνές + timeline</p>
      <div className="grid grid-cols-3 gap-1"><Placeholder aspect="16/9" /><Placeholder aspect="16/9" /><Placeholder aspect="16/9" /></div>
      <div className="flex gap-px h-1"><div className="flex-[3] rounded-item bg-panel" /><div className="flex-[2] rounded-item bg-border" /><div className="flex-[4] rounded-item bg-panel" /></div>
      <div className="flex gap-1.5"><Pill>Script</Pill><Pill>Storyboard</Pill><Pill>Music</Pill></div>
    </>
  ),
  editing: () => (
    <>
      <p>Timeline video editor</p>
      <Placeholder aspect="16/9" className="flex items-center justify-center" />
      <div className="flex gap-px h-1.5"><div className="flex-[3] rounded-item bg-panel" /><div className="flex-[2] rounded-item bg-border" /><div className="flex-[4] rounded-item bg-panel" /></div>
      <div className="flex gap-1.5"><Pill>Cut</Pill><Pill>Trim</Pill><Pill>Text</Pill><Pill>FX</Pill></div>
    </>
  ),
  avatars: () => (
    <>
      <p>AI avatar μιλάει το κείμενό σου</p>
      <div className="flex gap-1.5">
        <div className="h-8 w-8 rounded-full bg-panel" />
        <div className="h-8 w-8 rounded-full bg-panel" />
        <div className="h-8 w-8 rounded-full bg-panel" />
      </div>
      <Box>What avatar says...</Box>
      <Pill active>Generate video</Pill>
    </>
  ),
  audio: () => (
    <>
      <p>Voice, podcast, μουσική</p>
      <div className="flex gap-1.5"><Pill active>Voice</Pill><Pill>Podcast</Pill><Pill>Music</Pill></div>
      <div className="flex items-center gap-px h-4">
        {[30,55,40,75,50,85,40,65].map((h, i) => (
          <div key={i} className="w-0.5 rounded-full bg-muted" style={{ height: `${h}%` }} />
        ))}
      </div>
      <Box>Type text → pick voice → generate</Box>
    </>
  ),
  apps: () => (
    <>
      <p>Περίγραψε → AI φτιάχνει app</p>
      <Box>Inventory tracker with barcode scanning...</Box>
      <Pill active>Create App →</Pill>
    </>
  ),
  iowork: () => (
    <>
      <p>Desktop app — AI στον υπολογιστή σου</p>
      <div className="text-center text-2xl">💻</div>
      <Pill active>Download</Pill>
    </>
  ),
  translate: () => (
    <>
      <p>Μετάφραση κειμένου</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Box>EN — English text</Box>
        <Box>GR — Ελληνικό κείμενο</Box>
      </div>
      <Pill active>Translate →</Pill>
    </>
  ),

  // READY TOOLS — used for empty/landing states
  myStuff: () => (
    <>
      <p>Όλα τα αρχεία σου σε ένα μέρος</p>
      <div className="flex flex-wrap gap-1.5"><Pill>📄 Proposal</Pill><Pill>🖼️ Logo</Pill><Pill>🌐 Site</Pill></div>
      <div className="grid grid-cols-4 gap-1"><Placeholder /><Placeholder /><Placeholder /><Placeholder /></div>
    </>
  ),
  connect: () => (
    <>
      <p>Σύνδεσε τις εφαρμογές σου</p>
      <Pill active>Google · connected</Pill>
      <Pill active>Slack · connected</Pill>
      <Pill>+ Add app</Pill>
    </>
  ),
  analyze: () => (
    <>
      <p>Δεδομένα, γραφήματα, AI insights</p>
      <div className="flex gap-1.5"><Pill active>€24.5k</Pill><Pill active>847 users</Pill></div>
      <div className="flex items-end gap-px h-7">
        {[30,50,45,65,80].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-panel" style={{ height: `${h}%` }} />
        ))}
      </div>
    </>
  ),
  research: () => (
    <>
      <p>AI ψάχνει, γράφει αναφορά με πηγές</p>
      <Pill active>AI SaaS Market Greece</Pill>
      <Bar /><Bar w="85%" /><Bar w="70%" />
      <div className="flex gap-1.5"><Pill>📎 source</Pill><Pill>📎 source</Pill></div>
    </>
  ),
  rebuild: () => (
    <>
      <p>AI ξαναγράφει προϊόντα</p>
      <div className="flex items-center gap-2.5"><Placeholder aspect="1" className="w-12 shrink-0" /><div><span className="text-[12px] font-semibold text-foreground">Headphones</span><br /><span className="text-[11px]">€89.99</span></div></div>
      <Pill active>✨ AI Rewrite</Pill>
    </>
  ),
  site: () => (
    <>
      <p>Φτιάξε sites, δες visits</p>
      <Pill active>🌐 Fitness · live</Pill>
      <Pill active>🌐 Portfolio · live</Pill>
      <Pill>+ New site</Pill>
    </>
  ),
  games: () => (
    <>
      <p>Φτιάξε + παίξε παιχνίδια</p>
      <div className="flex gap-1.5"><Pill active>🚀 Play</Pill><Pill active>🧩 Play</Pill><Pill>+ New</Pill></div>
    </>
  ),
  document: () => (
    <>
      <p>Notebook — σημειώσεις, links, αρχεία. Cmd+V paste. AI διαβάζει τα πάντα.</p>
      <Box>Notes, ideas, anything...</Box>
      <Box>📎 file.pdf — AI reads</Box>
      <Box>🔗 youtube.com — AI describes</Box>
      <Box>📁 /project/ — AI shows files</Box>
    </>
  ),
  slides: () => (
    <>
      <p>Slides — φτιάξε, επεξεργάσου, παρουσίασε</p>
      <div className="flex gap-1"><div className="w-7"><Placeholder aspect="16/9" /><div className="mt-0.5" /><Placeholder aspect="16/9" /><div className="mt-0.5" /><Placeholder aspect="16/9" /></div><div className="flex-1"><Placeholder aspect="16/9" className="flex items-center justify-center text-sm font-bold" /></div></div>
    </>
  ),
  posts: () => (
    <>
      <p>Γράψε + δημοσίευσε σε social</p>
      <div className="flex gap-1.5"><Pill>Twitter</Pill><Pill>IG</Pill><Pill>LinkedIn</Pill></div>
      <Box>Write post... 🚀</Box>
      <Pill active>Post →</Pill>
    </>
  ),
  image: () => (
    <>
      <p>Gallery + AI generate εικόνες</p>
      <div className="grid grid-cols-3 gap-1"><Placeholder /><Placeholder /><Placeholder /><Placeholder /><Placeholder /><Placeholder /></div>
      <Pill active>Generate →</Pill>
    </>
  ),
  coding: () => (
    <div className="rounded-item bg-panel p-2.5 font-mono text-[11px] text-muted leading-relaxed">
      <div>$ <span className="text-foreground">fix login bug on line 42</span></div>
      <div className="text-foreground">⠋ Reading src/auth/callback.ts</div>
      <div className="text-foreground">✓ Fixed: added null check</div>
      <div className="mt-1">$ <span className="text-foreground">run tests</span></div>
      <div className="text-foreground">✓ 48 passed</div>
      <div className="mt-1 border-t border-border pt-1">$ <span className="text-muted">_</span></div>
    </div>
  ),
  agents: () => (
    <>
      <p>AI υπάλληλοι ανά τμήμα</p>
      <Pill active>Maria · Content · 47 tasks</Pill>
      <Pill active>Alex · Sales · 23 tasks</Pill>
      <Pill active>Sophie · Support · 112 tasks</Pill>
      <Pill>+ Hire</Pill>
    </>
  ),
  automations: () => (
    <>
      <p>Αυτόματα workflows</p>
      <Pill active>Email Sorter · 142 runs</Pill>
      <Pill active>Weekly Report · 8 runs</Pill>
      <Pill>+ New</Pill>
    </>
  ),
  projects: () => (
    <>
      <p>Kanban board — tasks</p>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div><div className="mb-1 font-semibold">To Do</div><Pill>Landing</Pill><div className="mt-0.5" /><Pill>Blog</Pill></div>
        <div><div className="mb-1 font-semibold">Doing</div><Pill active>Payments</Pill></div>
        <div><div className="mb-1 font-semibold">Done</div><Pill>Deploy</Pill><div className="mt-0.5" /><Pill>Test</Pill></div>
      </div>
    </>
  ),
};

export function ToolPreviewContent({ toolKey }: { toolKey: AllToolsNameKey }) {
  const Preview = previews[toolKey];
  if (!Preview) return null;
  return (
    <div className="flex flex-col gap-2.5 text-[11px] text-muted">
      <Preview />
    </div>
  );
}

export function hasPreview(toolKey: string): boolean {
  return toolKey in previews;
}
