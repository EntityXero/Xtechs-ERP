export interface ScopeContext {
    tenantId?: string | null;
    businessId?: string | null;
    branchId?: string | null;
}
/**
 * Resolves the active metadata revision for a definition key, following the scope hierarchy:
 * Branch > Business > Tenant > Global
 */
export declare function resolveMetadata(db: any, key: string, context: ScopeContext): Promise<any>;
/**
 * Creates a new metadata definition.
 */
export declare function createMetadataDefinition(db: any, input: {
    key: string;
    type: string;
    name: string;
    description?: string;
}): Promise<any>;
/**
 * Helper to recursively extract all referenced metadata keys (e.g. "$ref": "metadata:sales_workflow")
 */
export declare function extractReferences(payload: any): string[];
/**
 * Cycle detection algorithm using DFS.
 * Builds an adjacency list and checks for loops.
 */
export declare function detectCycle(sourceId: string, targetIds: string[], existingDeps: {
    sourceDefId: string;
    targetDefId: string;
}[]): boolean;
/**
 * Publishes a new revision for a definition key, enforcing strict schema validation and cycle checks.
 */
export declare function createMetadataRevision(db: any, key: string, input: {
    tenantId?: string | null;
    businessId?: string | null;
    branchId?: string | null;
    payload: any;
    createdBy?: string;
}): Promise<any>;
//# sourceMappingURL=metadata-service.d.ts.map