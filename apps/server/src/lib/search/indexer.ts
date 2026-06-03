import { eventBus } from '../automations/event-bus.js';
import { queueSearchJob } from './queue.js';
import type { ScopeContext } from '../metadata-service.js';

export class SearchIndexerService {
  /**
   * Initializes the event bus listeners to track document mutations and queue indexing.
   */
  public static init() {
    console.log('[SearchIndexerService] Initializing event bus listeners for indexing...');

    eventBus.on('document_created', async (doc: any, context: Required<ScopeContext>) => {
      try {
        await this.queueDocumentIndexing(doc, context);
      } catch (err: any) {
        console.error('[SearchIndexerService] Error queueing document index on creation:', err.message);
      }
    });

    eventBus.on('document_updated', async (doc: any, context: Required<ScopeContext>) => {
      try {
        await this.queueDocumentIndexing(doc, context);
      } catch (err: any) {
        console.error('[SearchIndexerService] Error queueing document index on update:', err.message);
      }
    });

    eventBus.on('state_changed', async (doc: any, context: Required<ScopeContext>) => {
      try {
        await this.queueDocumentIndexing(doc, context);
      } catch (err: any) {
        console.error('[SearchIndexerService] Error queueing document index on state change:', err.message);
      }
    });
  }

  /**
   * Helper to format a document and queue it for search indexing.
   */
  private static async queueDocumentIndexing(doc: any, context: Required<ScopeContext>) {
    if (!doc || !doc.id) return;

    const docType = doc.type || 'document';
    const docNumber = doc.documentNumber || doc.id.substring(0, 8);
    const title = `${docType.toUpperCase()} ${docNumber}`;
    const description = `Status: ${doc.workflowState || doc.status || 'draft'}`;
    const urlPath = `/documents/${docType}/${doc.id}`;

    // Flatten document data into a searchable raw text block
    const textParts: string[] = [];
    textParts.push(title);
    textParts.push(description);

    if (doc.description) {
      textParts.push(doc.description);
    }

    // Include details from the dynamic JSONB data block if it exists
    if (doc.data && typeof doc.data === 'object') {
      try {
        textParts.push(JSON.stringify(doc.data));
      } catch {}
    }

    const rawText = textParts.join(' ');

    await queueSearchJob({
      action: 'index',
      entityType: docType,
      entityId: doc.id,
      title,
      description,
      urlPath,
      rawText,
      metadata: {
        status: doc.status || null,
        workflowState: doc.workflowState || null,
        createdBy: doc.createdBy || null,
      },
      context,
    });
  }
}
