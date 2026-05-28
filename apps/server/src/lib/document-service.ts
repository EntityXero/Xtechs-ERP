import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  documents,
  documentLines,
  documentLinks,
  documentSequences,
  documentComments,
  documentActivities,
  documentAttachments,
} from '@xtechs/db/schema';
import {
  createDocumentInputSchema,
  updateDocumentInputSchema,
  createDocumentCommentSchema,
  DOCUMENT_LIFECYCLE,
  DOCUMENT_TRANSITIONS,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import { resolveMetadata, type ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';
import { z } from 'zod';

/**
 * Transactional document types that strictly require sequential numbering.
 */
const TRANSACTIONAL_TYPES = [
  'invoice',
  'po',
  'payment',
  'stock_entry',
  'receipt',
  'journal_entry',
];

/**
 * Dynamically builds a Zod validation schema from a resolved Form Metadata payload.
 */
export function buildZodSchemaFromFormMetadata(formPayload: any) {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (formPayload && Array.isArray(formPayload.sections)) {
    for (const section of formPayload.sections) {
      if (Array.isArray(section.fields)) {
        for (const field of section.fields) {
          let fieldSchema: z.ZodTypeAny;

          switch (field.type) {
            case 'number':
            case 'currency':
              fieldSchema = z.number();
              break;
            case 'boolean':
              fieldSchema = z.boolean();
              break;
            case 'date':
            case 'datetime':
              fieldSchema = z.string().or(z.date());
              break;
            case 'multi-select':
              fieldSchema = z.array(z.string());
              break;
            default:
              fieldSchema = z.string();
              break;
          }

          if (!field.required) {
            fieldSchema = fieldSchema.optional().nullable();
          }

          shape[field.name] = fieldSchema;
        }
      }
    }
  }

  return z.object(shape);
}

/**
 * Dynamic prefix template formatter.
 * Supports {YYYY}, {year}, {YY}, {MM}, {DD}.
 */
function formatPrefix(prefixTemplate: string): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const yy = yyyy.slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return prefixTemplate
    .replace(/{YYYY}/g, yyyy)
    .replace(/{year}/g, yyyy)
    .replace(/{YY}/g, yy)
    .replace(/{MM}/g, mm)
    .replace(/{DD}/g, dd);
}

/**
 * Document Service.
 * Central engine to create, update, fetch, and transition documents.
 */
export class DocumentService {
  /**
   * Helper to validate branch isolation for a document context.
   */
  private static enforceBranchScope(
    context: Required<ScopeContext>,
    docScope: { tenantId: string; businessId: string; branchId: string }
  ) {
    if (
      docScope.tenantId !== context.tenantId ||
      docScope.businessId !== context.businessId ||
      docScope.branchId !== context.branchId
    ) {
      throw new ForbiddenError('Branch isolation breach: Document belongs to another branch');
    }
  }

  /**
   * Create a new document with sequential numbering, metadata schema validation, and audit trail.
   */
  public static async createDocument(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateDocumentInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    // 1. Zod input validation
    const parsedInput = createDocumentInputSchema.parse(input);

    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 2. Resolve Form Metadata for schema validation of dynamic fields
    const formMetadata = await resolveMetadata(db, `${parsedInput.type}_form`, context);
    if (formMetadata && formMetadata.revision) {
      const dataSchema = buildZodSchemaFromFormMetadata(formMetadata.revision.payload);
      const parsedData = dataSchema.safeParse(parsedInput.data);
      if (!parsedData.success) {
        // Collect errors in a standard dictionary format
        const errorDetails: Record<string, string[]> = {};
        for (const issue of parsedData.error.issues) {
          const path = issue.path.join('.');
          if (!errorDetails[path]) errorDetails[path] = [];
          errorDetails[path].push(issue.message);
        }
        throw new ValidationError('Invalid dynamic fields payload for document type', errorDetails);
      }
    }

    // 3. Atomically generate numbering sequence
    let docNumber: string | null = null;
    const numberingMetadata = await resolveMetadata(db, `${parsedInput.type}_numbering`, context);

    let prefixTemplate = `${parsedInput.type.toUpperCase()}-{YYYY}-`;
    let digits = 4;
    let startFrom = 1;

    if (numberingMetadata && numberingMetadata.revision) {
      const payload = numberingMetadata.revision.payload as any;
      if (payload.prefix) prefixTemplate = payload.prefix;
      if (typeof payload.digits === 'number') digits = payload.digits;
      if (typeof payload.startFrom === 'number') startFrom = payload.startFrom;
    }

    // Format prefix (INV-{YYYY}- => INV-2026-)
    const resolvedPrefix = formatPrefix(prefixTemplate);

    // Atomic database sequence generator
    const seq = await db.transaction(async (tx) => {
      // Upsert lockable sequence counter
      const [sequence] = await tx
        .insert(documentSequences)
        .values({
          tenantId,
          businessId,
          branchId,
          type: parsedInput.type,
          prefix: resolvedPrefix,
          currentValue: startFrom,
        })
        .onConflictDoUpdate({
          target: [
            documentSequences.tenantId,
            documentSequences.businessId,
            documentSequences.branchId,
            documentSequences.type,
            documentSequences.prefix,
          ],
          set: {
            currentValue: sql`${documentSequences.currentValue} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!sequence) {
        throw new ValidationError('Failed to generate document numbering sequence');
      }

      return sequence;
    });

    const paddedVal = String(seq.currentValue).padStart(digits, '0');
    docNumber = `${resolvedPrefix}${paddedVal}`;

    // 4. Save document, lines, and links inside transaction
    const savedDoc = await db.transaction(async (tx) => {
      // Create Base Document
      const [doc] = await tx
        .insert(documents)
        .values({
          tenantId,
          businessId,
          branchId,
          type: parsedInput.type,
          documentNumber: docNumber,
          status: parsedInput.status,
          workflowState: parsedInput.workflowState,
          data: parsedInput.data,
          assignedTo: parsedInput.assignedTo || null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!doc) {
        throw new ValidationError('Failed to create document header record');
      }

      // Create hybrid Lines
      if (parsedInput.lines.length > 0) {
        const lineValues = parsedInput.lines.map((line) => ({
          tenantId,
          businessId,
          branchId,
          documentId: doc.id,
          lineNumber: line.lineNumber,
          description: line.description || null,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          amount: String(line.amount),
          data: line.data,
        }));
        await tx.insert(documentLines).values(lineValues);
      }

      // Create relational Links (checking that targets exist and reside in the same branch scope!)
      if (parsedInput.links.length > 0) {
        for (const link of parsedInput.links) {
          const [target] = await tx
            .select()
            .from(documents)
            .where(eq(documents.id, link.targetDocId))
            .limit(1);

          if (!target) {
            throw new ValidationError(`Linked document target '${link.targetDocId}' does not exist`);
          }

          // Enforce target branch isolation
          this.enforceBranchScope(context, target);

          await tx.insert(documentLinks).values({
            tenantId,
            businessId,
            branchId,
            sourceDocId: doc.id,
            targetDocId: link.targetDocId,
            relationType: link.relationType,
          });
        }
      }

      // Log initial creation Activity
      await tx.insert(documentActivities).values({
        tenantId,
        businessId,
        branchId,
        documentId: doc.id,
        actorId: userId,
        activityType: 'created',
        description: `Document ${doc.documentNumber || doc.id} created as ${doc.workflowState} state`,
      });

      return doc;
    });

    // 5. Audit Logging mutation
    await logAudit(db, {
      entityType: `document:${savedDoc.type}`,
      entityId: savedDoc.id,
      action: 'create',
      actorId: userId,
      newValues: {
        documentNumber: savedDoc.documentNumber,
        status: savedDoc.status,
        workflowState: savedDoc.workflowState,
        data: savedDoc.data,
        lines: parsedInput.lines,
        links: parsedInput.links,
      },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return this.getDocumentDetails(db, context, savedDoc.id);
  }

  /**
   * Fetch complete document details (header + lines + links) with strict branch isolation.
   */
  public static async getDocumentDetails(
    db: Database,
    context: Required<ScopeContext>,
    documentId: string
  ) {
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) {
      throw new NotFoundError('Document', documentId);
    }

    // Branch Isolation
    this.enforceBranchScope(context, doc);

    const lines = await db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, documentId))
      .orderBy(documentLines.lineNumber);

    const links = await db
      .select()
      .from(documentLinks)
      .where(eq(documentLinks.sourceDocId, documentId));

    const comments = await db
      .select()
      .from(documentComments)
      .where(eq(documentComments.documentId, documentId))
      .orderBy(documentComments.createdAt);

    const activities = await db
      .select()
      .from(documentActivities)
      .where(eq(documentActivities.documentId, documentId))
      .orderBy(documentActivities.createdAt);

    const attachments = await db
      .select()
      .from(documentAttachments)
      .where(eq(documentAttachments.documentId, documentId))
      .orderBy(documentAttachments.createdAt);

    return {
      ...doc,
      lines,
      links,
      comments,
      activities,
      attachments,
    };
  }

  /**
   * Update an existing document (header, lines, and links).
   * Posted documents are strictly immutable!
   */
  public static async updateDocument(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    input: UpdateDocumentInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsedInput = updateDocumentInputSchema.parse(input);

    // Fetch existing document to check status
    const existing = await this.getDocumentDetails(db, context, documentId);

    // Finalized posted documents are IMMUTABLE per accounting rules
    if (existing.workflowState === DOCUMENT_LIFECYCLE.POSTED) {
      throw new ValidationError('Posted documents are finalized and strictly immutable. Use correction documents instead.');
    }

    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Resolve Form Metadata for schema validation
    const formMetadata = await resolveMetadata(db, `${existing.type}_form`, context);
    if (formMetadata && formMetadata.revision && parsedInput.data) {
      const dataSchema = buildZodSchemaFromFormMetadata(formMetadata.revision.payload);
      const parsedData = dataSchema.safeParse(parsedInput.data);
      if (!parsedData.success) {
        const errorDetails: Record<string, string[]> = {};
        for (const issue of parsedData.error.issues) {
          const path = issue.path.join('.');
          if (!errorDetails[path]) errorDetails[path] = [];
          errorDetails[path].push(issue.message);
        }
        throw new ValidationError('Invalid dynamic fields payload for document type', errorDetails);
      }
    }

    // Update inside a single transaction
    const updatedDoc = await db.transaction(async (tx) => {
      // Update Base Document Header
      const updatePayload: Record<string, any> = {
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (parsedInput.status !== undefined) updatePayload.status = parsedInput.status;
      if (parsedInput.workflowState !== undefined) updatePayload.workflowState = parsedInput.workflowState;
      if (parsedInput.data !== undefined) updatePayload.data = parsedInput.data;
      if (parsedInput.assignedTo !== undefined) updatePayload.assignedTo = parsedInput.assignedTo;

      const [doc] = await tx
        .update(documents)
        .set(updatePayload)
        .where(eq(documents.id, documentId))
        .returning();

      if (!doc) {
        throw new NotFoundError('Document', documentId);
      }

      // Update hybrid Lines: drop old, insert new
      if (parsedInput.lines !== undefined) {
        await tx.delete(documentLines).where(eq(documentLines.documentId, documentId));

        if (parsedInput.lines.length > 0) {
          const lineValues = parsedInput.lines.map((line) => ({
            tenantId,
            businessId,
            branchId,
            documentId: doc.id,
            lineNumber: line.lineNumber,
            description: line.description || null,
            quantity: String(line.quantity),
            unitPrice: String(line.unitPrice),
            amount: String(line.amount),
            data: line.data,
          }));
          await tx.insert(documentLines).values(lineValues);
        }
      }

      // Update relational Links: drop old, insert new
      if (parsedInput.links !== undefined) {
        await tx.delete(documentLinks).where(eq(documentLinks.sourceDocId, documentId));

        if (parsedInput.links.length > 0) {
          for (const link of parsedInput.links) {
            const [target] = await tx
              .select()
              .from(documents)
              .where(eq(documents.id, link.targetDocId))
              .limit(1);

            if (!target) {
              throw new ValidationError(`Linked document target '${link.targetDocId}' does not exist`);
            }

            this.enforceBranchScope(context, target);

            await tx.insert(documentLinks).values({
              tenantId,
              businessId,
              branchId,
              sourceDocId: doc.id,
              targetDocId: link.targetDocId,
              relationType: link.relationType,
            });
          }
        }
      }

      // Log update Activity
      await tx.insert(documentActivities).values({
        tenantId,
        businessId,
        branchId,
        documentId: doc.id,
        actorId: userId,
        activityType: 'updated',
        description: `Document ${doc.documentNumber || doc.id} updated by user`,
      });

      return doc;
    });

    if (!updatedDoc) {
      throw new NotFoundError('Document', documentId);
    }

    // 5. Audit Logging trail (immutable old vs new values)
    await logAudit(db, {
      entityType: `document:${updatedDoc.type}`,
      entityId: updatedDoc.id,
      action: 'update',
      actorId: userId,
      oldValues: {
        status: existing.status,
        workflowState: existing.workflowState,
        data: existing.data,
        lines: existing.lines,
        links: existing.links,
      },
      newValues: {
        status: updatedDoc.status,
        workflowState: updatedDoc.workflowState,
        data: updatedDoc.data,
        lines: parsedInput.lines ?? existing.lines,
        links: parsedInput.links ?? existing.links,
      },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return this.getDocumentDetails(db, context, documentId);
  }

  /**
   * Transition document state in the workflow lifecycle.
   */
  public static async transitionDocument(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    event: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const existing = await this.getDocumentDetails(db, context, documentId);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Resolve workflow metadata configuration
    let targetState: string | null = null;
    const workflowMeta = await resolveMetadata(db, `${existing.type}_workflow`, context);

    if (workflowMeta && workflowMeta.revision) {
      const workflowPayload = workflowMeta.revision.payload as any;
      const stateConfig = workflowPayload.states?.[existing.workflowState];
      if (stateConfig && Array.isArray(stateConfig.transitions)) {
        const matchingTransition = stateConfig.transitions.find((t: any) => t.event === event);
        if (matchingTransition) {
          targetState = matchingTransition.to;
        }
      }
    }

    // 2. Fall back to standard core lifecycle transitions if no custom workflow metadata is present
    if (!targetState) {
      const allowedStandard = DOCUMENT_TRANSITIONS[existing.workflowState as keyof typeof DOCUMENT_TRANSITIONS] || [];
      // Look up target based on typical transitions
      const matchingTarget = allowedStandard.find((state) => {
        // Map common trigger events to states
        if (event === 'submit' && state === DOCUMENT_LIFECYCLE.PENDING_APPROVAL) return true;
        if (event === 'approve' && state === DOCUMENT_LIFECYCLE.APPROVED) return true;
        if (event === 'post' && state === DOCUMENT_LIFECYCLE.POSTED) return true;
        if (event === 'reverse' && state === DOCUMENT_LIFECYCLE.REVERSED) return true;
        if (event === 'archive' && state === DOCUMENT_LIFECYCLE.ARCHIVED) return true;
        if (event === 'reject' && state === DOCUMENT_LIFECYCLE.DRAFT) return true;
        return false;
      });

      if (!matchingTarget) {
        throw new ValidationError(`Invalid transition event '${event}' from state '${existing.workflowState}'`);
      }
      targetState = matchingTarget;
    }

    // 3. Save the state transition
    const updatedDoc = await db.transaction(async (tx) => {
      const [doc] = await tx
        .update(documents)
        .set({
          workflowState: targetState!,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
        .returning();

      if (!doc) {
        throw new NotFoundError('Document', documentId);
      }

      // Log transition Activity
      await tx.insert(documentActivities).values({
        tenantId,
        businessId,
        branchId,
        documentId: doc.id,
        actorId: userId,
        activityType: 'transitioned',
        description: `Document transitioned from '${existing.workflowState}' to '${targetState}' via event '${event}'`,
      });

      return doc;
    });

    if (!updatedDoc) {
      throw new NotFoundError('Document', documentId);
    }

    // 4. Audit Log
    await logAudit(db, {
      entityType: `document:${updatedDoc.type}`,
      entityId: updatedDoc.id,
      action: 'transition',
      actorId: userId,
      oldValues: { workflowState: existing.workflowState },
      newValues: { workflowState: updatedDoc.workflowState },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return this.getDocumentDetails(db, context, documentId);
  }

  /**
   * Add a comment to a document.
   */
  public static async addComment(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    content: string
  ) {
    const parsed = createDocumentCommentSchema.parse({ content });
    const doc = await this.getDocumentDetails(db, context, documentId);

    const [comment] = await db
      .insert(documentComments)
      .values({
        tenantId: context.tenantId!,
        businessId: context.businessId!,
        branchId: context.branchId!,
        documentId,
        authorId: userId,
        content: parsed.content,
      })
      .returning();

    // Log commenting activity
    await db.insert(documentActivities).values({
      tenantId: context.tenantId!,
      businessId: context.businessId!,
      branchId: context.branchId!,
      documentId,
      actorId: userId,
      activityType: 'commented',
      description: `User added a comment: "${parsed.content.substring(0, 50)}..."`,
    });

    return comment;
  }

  /**
   * Add an attachment to a document.
   */
  public static async addAttachment(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    input: { fileName: string; fileType: string; fileSize: number; storagePath: string }
  ) {
    await this.getDocumentDetails(db, context, documentId);

    const [attachment] = await db
      .insert(documentAttachments)
      .values({
        tenantId: context.tenantId!,
        businessId: context.businessId!,
        branchId: context.branchId!,
        documentId,
        uploaderId: userId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        storagePath: input.storagePath,
      })
      .returning();

    // Log attachment activity
    await db.insert(documentActivities).values({
      tenantId: context.tenantId!,
      businessId: context.businessId!,
      branchId: context.branchId!,
      documentId,
      actorId: userId,
      activityType: 'attachment_added',
      description: `File '${input.fileName}' uploaded successfully`,
    });

    return attachment;
  }
}
