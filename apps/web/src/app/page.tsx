/**
 * Landing page — minimal ERP shell.
 * Will be replaced with login page or dashboard redirect in Phase 1.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {/* Logo area */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600">
            <span className="text-lg font-bold text-white">X</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-dark-primary">
            Xtechs ERP
          </h1>
        </div>

        {/* Status card */}
        <div className="rounded-lg border border-border-dark bg-surface-d2 px-8 py-6 shadow-card-dark">
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-status-success animate-pulse" />
            <span className="text-sm text-text-dark-secondary">System Online</span>
          </div>

          <p className="text-sm text-text-dark-muted">
            Platform scaffold ready. Phase 1 development pending.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 text-left">
            <div className="rounded border border-border-dark bg-surface-d3 px-3 py-2">
              <p className="text-xs text-text-dark-muted">Backend</p>
              <p className="font-mono text-sm text-text-dark-secondary">Fastify v5</p>
            </div>
            <div className="rounded border border-border-dark bg-surface-d3 px-3 py-2">
              <p className="text-xs text-text-dark-muted">Frontend</p>
              <p className="font-mono text-sm text-text-dark-secondary">Next.js v15</p>
            </div>
            <div className="rounded border border-border-dark bg-surface-d3 px-3 py-2">
              <p className="text-xs text-text-dark-muted">Database</p>
              <p className="font-mono text-sm text-text-dark-secondary">PostgreSQL 16</p>
            </div>
            <div className="rounded border border-border-dark bg-surface-d3 px-3 py-2">
              <p className="text-xs text-text-dark-muted">ORM</p>
              <p className="font-mono text-sm text-text-dark-secondary">Drizzle</p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-text-dark-muted">
          v0.1.0 — Scaffold Build
        </p>
      </div>
    </div>
  );
}
