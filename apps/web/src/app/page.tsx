/**
 * Landing page — minimal ERP shell.
 * Will be replaced with login page or dashboard redirect in Phase 1.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md text-center">
        {/* Logo area */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-bold text-primary-foreground font-mono">X</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground font-mono">
            Xtechs ERP
          </h1>
        </div>

        {/* Status card */}
        <div className="rounded-md border border-border bg-card px-6 py-5 shadow-sm text-left">
          <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
            <div className="h-2 w-2 rounded-full bg-status-posted animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              ERP Core Engine Online
            </span>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Platform foundation scaffolded. Ready to run business logic.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Backend</p>
              <p className="font-mono text-xs text-foreground">Fastify v5</p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Frontend</p>
              <p className="font-mono text-xs text-foreground">Next.js v15</p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Database</p>
              <p className="font-mono text-xs text-foreground">PostgreSQL 16</p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Design System</p>
              <p className="font-mono text-xs text-foreground">Zinc + Blue</p>
            </div>
          </div>
        </div>

        <p className="mt-4 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          v0.1.0 — Architecture Scaffold
        </p>
      </div>
    </div>
  );
}
