import { eq, and, isNull, desc, or } from 'drizzle-orm';
import { metadataDefs, metadataRevisions, metadataDependencies } from '@xtechs/db/schema';
import { formDefPayloadSchema, workflowDefPayloadSchema } from '@xtechs/shared';
import { ValidationError } from './errors.js';

export interface ScopeContext {
  tenantId?: string | null;
  businessId?: string | null;
  branchId?: string | null;
}

/**
 * Resolves the active metadata revision for a definition key, following the scope hierarchy:
 * Branch > Business > Tenant > Global
 */
export async function resolveMetadata(
  db: any,
  key: string,
  context: ScopeContext
) {
  // 1. Retrieve the definition
  const defs = await db.select().from(metadataDefs).where(eq(metadataDefs.key, key)).limit(1);
  if (defs.length === 0) return null;
  const def = defs[0];

  const { tenantId, businessId, branchId } = context;
  const conditions = [];

  // Always check global scope
  conditions.push(
    and(
      isNull(metadataRevisions.tenantId),
      isNull(metadataRevisions.businessId),
      isNull(metadataRevisions.branchId)
    )
  );

  if (tenantId) {
    // Tenant scope
    conditions.push(
      and(
        eq(metadataRevisions.tenantId, tenantId),
        isNull(metadataRevisions.businessId),
        isNull(metadataRevisions.branchId)
      )
    );

    if (businessId) {
      // Business scope
      conditions.push(
        and(
          eq(metadataRevisions.tenantId, tenantId),
          eq(metadataRevisions.businessId, businessId),
          isNull(metadataRevisions.branchId)
        )
      );

      if (branchId) {
        // Branch scope
        conditions.push(
          and(
            eq(metadataRevisions.tenantId, tenantId),
            eq(metadataRevisions.businessId, businessId),
            eq(metadataRevisions.branchId, branchId)
          )
        );
      }
    }
  }

  // Fetch revisions ordered by version descending so that we can scan for the active one
  const revs = await db.select()
    .from(metadataRevisions)
    .where(
      and(
        eq(metadataRevisions.defId, def.id),
        or(...conditions)
      )
    )
    .orderBy(desc(metadataRevisions.version));

  if (revs.length === 0) return { ...def, revision: null };

  const findRevision = (scopeType: 'branch' | 'business' | 'tenant' | 'global') => {
    return revs.find((r: any) => {
      if (scopeType === 'branch') {
        return r.tenantId === tenantId && r.businessId === businessId && r.branchId === branchId;
      }
      if (scopeType === 'business') {
        return r.tenantId === tenantId && r.businessId === businessId && r.branchId === null;
      }
      if (scopeType === 'tenant') {
        return r.tenantId === tenantId && r.businessId === null && r.branchId === null;
      }
      if (scopeType === 'global') {
        return r.tenantId === null && r.businessId === null && r.branchId === null;
      }
      return false;
    });
  };

  const branchRev = branchId ? findRevision('branch') : null;
  if (branchRev) return { ...def, revision: branchRev };

  const businessRev = businessId ? findRevision('business') : null;
  if (businessRev) return { ...def, revision: businessRev };

  const tenantRev = tenantId ? findRevision('tenant') : null;
  if (tenantRev) return { ...def, revision: tenantRev };

  const globalRev = findRevision('global');
  if (globalRev) return { ...def, revision: globalRev };

  return { ...def, revision: null };
}

/**
 * Creates a new metadata definition.
 */
export async function createMetadataDefinition(
  db: any,
  input: { key: string; type: string; name: string; description?: string }
) {
  // Key constraint: lowercase alphanumeric with underscores
  if (!/^[a-z0-9_]+$/.test(input.key)) {
    throw new ValidationError('Metadata key must be lowercase alphanumeric with underscores only');
  }

  const existing = await db.select().from(metadataDefs).where(eq(metadataDefs.key, input.key)).limit(1);
  if (existing.length > 0) {
    throw new ValidationError(`Metadata definition with key '${input.key}' already exists`);
  }

  const [newDef] = await db.insert(metadataDefs).values({
    key: input.key,
    type: input.type,
    name: input.name,
    description: input.description || null,
  }).returning();

  return newDef;
}

/**
 * Helper to recursively extract all referenced metadata keys (e.g. "$ref": "metadata:sales_workflow")
 */
export function extractReferences(payload: any): string[] {
  const refs: string[] = [];

  function recurse(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach(recurse);
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('metadata:')) {
        refs.push(value.replace('metadata:', ''));
      } else {
        recurse(value);
      }
    }
  }

  recurse(payload);
  return Array.from(new Set(refs));
}

/**
 * Cycle detection algorithm using DFS.
 * Builds an adjacency list and checks for loops.
 */
export function detectCycle(
  sourceId: string,
  targetIds: string[],
  existingDeps: { sourceDefId: string; targetDefId: string }[]
): boolean {
  const adjList = new Map<string, string[]>();

  // 1. Populate adjacency list with existing dependencies, ignoring old edges of the current source
  for (const dep of existingDeps) {
    if (dep.sourceDefId === sourceId) continue;
    if (!adjList.has(dep.sourceDefId)) {
      adjList.set(dep.sourceDefId, []);
    }
    adjList.get(dep.sourceDefId)!.push(dep.targetDefId);
  }

  // 2. Add proposed edges
  if (targetIds.length > 0) {
    adjList.set(sourceId, targetIds);
  }

  // 3. DFS to detect cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string): boolean {
    if (recStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    recStack.add(node);

    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) return true;
    }

    recStack.delete(node);
    return false;
  }

  for (const node of adjList.keys()) {
    if (dfs(node)) return true;
  }

  return false;
}

/**
 * Publishes a new revision for a definition key, enforcing strict schema validation and cycle checks.
 */
export async function createMetadataRevision(
  db: any,
  key: string,
  input: {
    tenantId?: string | null;
    businessId?: string | null;
    branchId?: string | null;
    payload: any;
    createdBy?: string;
  }
) {
  // 1. Fetch metadata definition
  const defs = await db.select().from(metadataDefs).where(eq(metadataDefs.key, key)).limit(1);
  if (defs.length === 0) {
    throw new ValidationError(`Metadata definition with key '${key}' does not exist`);
  }
  const def = defs[0];

  // 2. Strict type-level payload validation
  let validatedPayload = input.payload;
  if (def.type === 'form') {
    const res = formDefPayloadSchema.safeParse(input.payload);
    if (!res.success) {
      throw new ValidationError(`Invalid Form Metadata payload: ${res.error.message}`);
    }
    validatedPayload = res.data;
  } else if (def.type === 'workflow') {
    const res = workflowDefPayloadSchema.safeParse(input.payload);
    if (!res.success) {
      throw new ValidationError(`Invalid Workflow Metadata payload: ${res.error.message}`);
    }
    validatedPayload = res.data;
  }

  // 3. Extract references and run cycle check
  const referencedKeys = extractReferences(validatedPayload);
  const targetDefIds: string[] = [];

  for (const refKey of referencedKeys) {
    const refDefs = await db.select().from(metadataDefs).where(eq(metadataDefs.key, refKey)).limit(1);
    if (refDefs.length === 0) {
      throw new ValidationError(`Metadata reference failed: Definition for '${refKey}' does not exist`);
    }
    targetDefIds.push(refDefs[0].id);
  }

  if (targetDefIds.length > 0) {
    const allDeps = await db.select().from(metadataDependencies);
    const hasCycle = detectCycle(def.id, targetDefIds, allDeps);
    if (hasCycle) {
      throw new ValidationError(`Circular dependency detected! Publishing this revision would introduce a cycle.`);
    }
  }

  // 4. Auto-increment version per scope
  const tenantId = input.tenantId || null;
  const businessId = input.businessId || null;
  const branchId = input.branchId || null;

  const scopeConditions = [
    eq(metadataRevisions.defId, def.id),
    tenantId ? eq(metadataRevisions.tenantId, tenantId) : isNull(metadataRevisions.tenantId),
    businessId ? eq(metadataRevisions.businessId, businessId) : isNull(metadataRevisions.businessId),
    branchId ? eq(metadataRevisions.branchId, branchId) : isNull(metadataRevisions.branchId),
  ];

  const existingRevs = await db.select()
    .from(metadataRevisions)
    .where(and(...scopeConditions))
    .orderBy(desc(metadataRevisions.version))
    .limit(1);

  const nextVersion = existingRevs.length > 0 ? existingRevs[0].version + 1 : 1;

  // 5. Transaction: Save revision and update dependencies
  const result = await db.transaction(async (tx: any) => {
    // Save metadata revision
    const [rev] = await tx.insert(metadataRevisions).values({
      defId: def.id,
      tenantId,
      businessId,
      branchId,
      version: nextVersion,
      payload: validatedPayload,
      createdBy: input.createdBy || null,
    }).returning();

    // Update dependencies: delete old, insert new
    await tx.delete(metadataDependencies).where(eq(metadataDependencies.sourceDefId, def.id));

    if (targetDefIds.length > 0) {
      const depValues = targetDefIds.map(targetId => ({
        sourceDefId: def.id,
        targetDefId: targetId,
      }));
      await tx.insert(metadataDependencies).values(depValues);
    }

    return rev;
  });

  return result;
}
