# GEMINI.MD — ERP CORE SPECIFICATION

## SYSTEM IDENTITY
Self-hosted, metadata-driven, document-centric ERP platform using modular monolith architecture. Multi-tenant hierarchy: tenant > business > branch. Internal enterprise operating platform, not public SaaS. Priorities: stability, auditability, security, maintainability, flexibility, performance. ERP is lifecycle/state-transition centric, NOT CRUD-centric. Every mutation must pass through permission validation, workflow validation, audit logging, and branch isolation enforcement.

## GLOBAL ARCHITECTURE RULES
Never bypass audit engine, workflow engine, permission engine, or branch isolation logic. Never permanently delete runtime business data. Never directly mutate finalized accounting entries. Never hardcode branch-specific business logic. Never tightly couple modules. Prefer metadata-driven systems over hardcoded systems. Prefer maintainability over abstraction. Prefer auditability over convenience. Prefer SSR over client-heavy rendering.

## CORE ARCHITECTURE
- Modular monolith
- Internal event-driven communication only
- No microservices initially
- No Kubernetes initially
- Backend-first architecture
- SSR-first frontend architecture
- Minimal client-side execution
- LAN-first deployment model
- Native hosting preferred
- Docker optional
- Windows + Linux hosting support

## TECH STACK
### Backend
- Node.js LTS
- TypeScript strict mode
- Fastify
- PostgreSQL
- Drizzle ORM
- Redis optional early stage
- BullMQ

### Frontend
- Next.js SSR-first
- React
- Tailwind CSS
- Zustand
- TanStack Query
- TanStack Table
- React Hook Form
- Zod

### Infrastructure
- Nginx reverse proxy
- Docker Compose optional
- Native executable deployment preferred

## PERFORMANCE TARGETS
Must operate acceptably on Windows 7 desktops, Intel Celeron systems, 4GB RAM machines, Chromium-based browsers, and low-end office hardware. Avoid GPU-heavy rendering, excessive hydration, massive bundles, animation-heavy interfaces, excessive realtime rendering, oversized payloads, and unnecessary re-renders. Pagination mandatory. Lazy loading mandatory. Server-rendered pages preferred. Default dark mode. Table-first UI philosophy.

## NETWORKING MODEL
Three access modes: LAN, DDNS, Tunnel. LAN accessible via local IP and port. DDNS support using DuckDNS/No-IP with automatic DNS updates. Preferred tunnel provider: Cloudflare Tunnel; alternatives: Ngrok and Tailscale. No public APIs enabled by default. Tunnel configuration isolated from ERP runtime.

## TENANCY MODEL
Hierarchy: tenant > business > branch. All runtime entities require tenant_id, business_id, branch_id. Branches isolated by default. Optional synchronization supported. Branch-specific metadata overrides allowed. Cross-branch visibility permission-controlled.

## DATABASE DESIGN
PostgreSQL mandatory. UUID primary keys only. No auto-increment integer PKs. Use relational schema for stable/core data and JSONB for dynamic metadata/custom fields.

### Core Relational Fields
- id
- status
- workflow_state
- tenant_id
- business_id
- branch_id
- timestamps
- ownership refs

### JSONB Metadata
- custom fields
- form schemas
- layouts
- workflow configs
- dashboard configs
- UI preferences
- numbering configs
- report configs

## METADATA ENGINE
Metadata hierarchy: global > tenant > business > branch. Metadata types include form defs, field defs, workflow defs, layout defs, numbering defs, report defs, dashboard configs, notification configs, permission configs. Metadata must be versioned, immutable-history tracked, branch-overridable, schema-validated, and protected from circular dependencies.

## FORM ENGINE
Visual form configuration supported using controlled schema-driven rendering only. No unrestricted drag-anything builder.

### Supported Field Types
- text
- textarea
- number
- currency
- boolean
- date
- datetime
- select
- multi-select
- relation
- formula
- image
- pdf
- attachment
- table/grid

### Constraints
Section-based forms, grid layouts, mandatory validation schema, Zod-compatible validation pipeline, metadata-driven rendering.

## DOCUMENT ENGINE
All business entities are documents: invoice, PO, payment, stock entry, receipt, journal entry, customer, supplier.

### Lifecycle
- draft
- pending_approval
- approved
- posted
- archived
- reversed

### Features
- attachments
- comments
- activities
- audit history
- workflow state
- approvals
- delegation
- numbering
- printable outputs

## WORKFLOW ENGINE
State-based workflows only. No graph/node visual engine initially.

### Components
- states
- transitions
- conditions
- approvals
- delegation
- notifications
- automations

### Supported Logic
- conditional approvals
- parallel approvals
- escalation
- branch-aware workflows
- role-aware transitions

### Forbidden
- arbitrary JS execution
- eval
- unrestricted scripting
- unsafe runtime injection

## AUTOMATION ENGINE
Triggers: document_created, document_updated, state_changed, threshold_reached, scheduled_event. Actions: notification, assignment, workflow transition, report generation, reminders. Scheduling: cron jobs, retry support, dead-letter support, idempotent execution preferred.

## AUDIT ENGINE
Immutable append-only logs. Never overwrite or delete audit events.

### Audit Fields
- event_id
- entity_type
- entity_id
- action
- actor_id
- old_values
- new_values
- timestamp
- request_id
- tenant_id
- business_id
- branch_id
- ip_address

### Requirements
- entity timelines
- branch filtering
- global searchability
- rollback visibility
- export support

## ACCOUNTING RULES
Finalized accounting entries immutable. Corrections only through reversal/amendment documents. No direct ledger mutation after posting. Multi-currency architecture future-ready. User-defined currency symbols supported.

## PERMISSION ENGINE
Permission layers: role permissions, field permissions, branch permissions, workflow permissions. Requirements: deny-by-default, branch-scoped enforcement, field masking, approval authorization, workflow transition validation.

## REPORTING ENGINE
Features: filters, exports, printable reports, branch-aware reports, metadata-driven reports, custom report builder. Server-side generation preferred. Async generation required for heavy reports.

## SEARCH ENGINE
Targets: documents, comments, audit logs, attachment metadata. Initial strategy: PostgreSQL full-text search. Future optional: OpenSearch.

## ATTACHMENT ENGINE
Supported: images, PDFs. Future-ready: OCR, thumbnails, virus scanning, attachment versioning.

## NOTIFICATION ENGINE
Providers: in-app, email, SMS future, WhatsApp future. Requirements: user-configurable, background processed, branch-aware.

## BACKGROUND JOB SYSTEM
Responsibilities: email dispatch, OCR, indexing, scheduled reports, notifications, cleanup, backups. Constraints: never block API requests, retry-safe, idempotent preferred.

## FRONTEND ARCHITECTURE
SSR-first rendering. Minimal hydration. Minimal client-side state. Desktop ERP feel. Low-resource rendering. Accessibility-first. Keyboard-friendly workflows.

## MOBILE FUTURE PREPARATION
Goals: SQLite sync compatibility, offline-safe identifiers, conflict resolution support. Requirements: UUIDs mandatory, deterministic synchronization logic, append-only audit compatibility.

## MODULE SYSTEM
Initial strategy: first-party modules only. Examples: accounting, inventory, CRM, HR, reporting. Constraints: loose coupling, shared core services, centralized audit/workflow engines, metadata-driven extensions.

## FORBIDDEN DECISIONS
- no microservices initially
- no GraphQL initially
- no MongoDB
- no Firebase
- no Electron
- no unrestricted plugins
- no runtime scripting engine
- no public API exposure by default
- no hardcoded workflows
- no hardcoded branch logic

## DEVELOPMENT ORDER
Phase 1: auth, tenants, businesses, branches, roles, permissions, metadata engine, document engine, workflow engine, audit engine.
Phase 2: accounting, inventory, CRM, HR, advanced reporting.

## AI AGENT EXECUTION DIRECTIVES
When assigned a task: analyze requirements before implementation, break tasks into phases/subcomponents, identify dependencies/risks/performance/security/branch-isolation impacts, ask clarification questions for ambiguous business logic before implementation, produce implementation plan before coding, prefer existing workflows/skills/shared services before introducing new patterns, reuse centralized services whenever possible, avoid duplicate logic/schemas, validate architecture compatibility before code generation, maintain metadata-driven consistency.

## AI AGENT DEVELOPMENT WORKFLOW
Workflow: requirement analysis, dependency mapping, schema planning, permission validation planning, workflow integration planning, audit integration planning, implementation, unit testing, integration testing, security review, performance review, refactoring if necessary.

### Mandatory Testing
Every completed phase must be tested for:
- permission bypasses
- branch isolation leaks
- workflow bypasses
- audit omissions
- SQL injection
- XSS
- unsafe serialization
- race conditions
- performance regressions
- metadata corruption
- invalid state transitions

### Security Directives
- Never trust client input
- Always validate server-side
- Prefer parameterized queries
- Enforce RBAC + workflow validation together
- Sanitize uploads and metadata
- Avoid unsafe eval/runtime execution
- Never expose sensitive fields unintentionally

## FINAL ENGINEERING DIRECTIVES
Optimize for weak hardware stability, long-term maintainability, metadata consistency, audit reliability, and predictable ERP behavior over visual complexity or unnecessary abstraction.