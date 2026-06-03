import { eq, and, sql, desc } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import { searchIndexes } from '@xtechs/db/schema';
import type { ScopeContext } from './metadata-service.js';

export interface SearchOptions {
  limit?: number;
  offset?: number;
  entityType?: string;
}

export class SearchService {
  /**
   * Upsert a search index entry for a given entity.
   */
  static async upsertIndex(
    db: Database,
    entityType: string,
    entityId: string,
    title: string,
    description: string | null,
    urlPath: string,
    rawText: string,
    context: Required<ScopeContext>,
    metadata: any = {}
  ) {
    const textToVector = `${title} ${description || ''} ${rawText}`;
    
    return await db
      .insert(searchIndexes)
      .values({
        tenantId: context.tenantId,
        businessId: context.businessId,
        branchId: context.branchId,
        entityType,
        entityId,
        title,
        description,
        urlPath,
        metadata,
        documentVector: sql`to_tsvector('english', ${textToVector})` as any,
      })
      .onConflictDoUpdate({
        target: [searchIndexes.entityType, searchIndexes.entityId],
        set: {
          title,
          description,
          urlPath,
          metadata,
          documentVector: sql`to_tsvector('english', ${textToVector})` as any,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Delete a search index entry.
   */
  static async removeIndex(db: Database, entityType: string, entityId: string) {
    return await db
      .delete(searchIndexes)
      .where(
        and(
          eq(searchIndexes.entityType, entityType),
          eq(searchIndexes.entityId, entityId)
        )
      );
  }

  /**
   * Execute a full-text search query.
   * Leverages both prefix search (for autocompleting typed words) and standard websearch parsing.
   */
  static async globalSearch(
    db: Database,
    queryText: string,
    context: ScopeContext,
    options: SearchOptions = {}
  ) {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    if (!queryText.trim()) {
      return [];
    }

    // Clean up input and format for prefix matching, e.g. "inv" -> "inv:*"
    const cleanWords = queryText
      .trim()
      .split(/\s+/)
      .map(w => w.replace(/['":*&|!]/g, ''))
      .filter(w => w.length > 0);

    let querySql;
    if (cleanWords.length > 0) {
      // Create a prefix query string like "word1:* & word2:*"
      const prefixQueryStr = cleanWords.map(w => `${w}:*`).join(' & ');
      querySql = sql`to_tsquery('english', ${prefixQueryStr})`;
    } else {
      querySql = sql`websearch_to_tsquery('english', ${queryText})`;
    }

    const whereConditions = [
      eq(searchIndexes.tenantId, context.tenantId!),
      eq(searchIndexes.businessId, context.businessId!),
      sql`${searchIndexes.documentVector} @@ ${querySql}`,
    ];

    if (context.branchId) {
      whereConditions.push(eq(searchIndexes.branchId, context.branchId));
    }

    if (options.entityType) {
      whereConditions.push(eq(searchIndexes.entityType, options.entityType));
    }

    return await db
      .select({
        id: searchIndexes.id,
        entityType: searchIndexes.entityType,
        entityId: searchIndexes.entityId,
        title: searchIndexes.title,
        description: searchIndexes.description,
        urlPath: searchIndexes.urlPath,
        metadata: searchIndexes.metadata,
        rank: sql<number>`ts_rank(${searchIndexes.documentVector}, ${querySql})`,
        createdAt: searchIndexes.createdAt,
      })
      .from(searchIndexes)
      .where(and(...whereConditions))
      .orderBy(desc(sql`ts_rank(${searchIndexes.documentVector}, ${querySql})`))
      .limit(limit)
      .offset(offset);
  }
}
