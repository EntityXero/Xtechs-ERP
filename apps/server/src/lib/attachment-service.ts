import { createHash, randomUUID } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import { attachments, documentAttachments } from '@xtechs/db/schema';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZES } from '@xtechs/shared';
import { getStorageProvider } from './storage/index.js';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';

export class AttachmentService {
  /**
   * Helper to verify if user has branch scope permission to access the attachment.
   */
  private static enforceScope(
    context: Required<ScopeContext> & { tokenScope?: string },
    targetScope: { tenantId: string; businessId: string; branchId: string }
  ) {
    if (targetScope.tenantId !== context.tenantId! || targetScope.businessId !== context.businessId!) {
      throw new ForbiddenError('Tenant isolation breach: Attachment belongs to another business entity');
    }
    
    // If not admin/all-branches token, enforce branch isolation
    if (context.tokenScope !== 'all-branches' && targetScope.branchId !== context.branchId!) {
      throw new ForbiddenError('Branch isolation breach: Attachment belongs to another branch');
    }

  }

  private static detectMimeTypeFromMagicBytes(buffer: Buffer): string | null {
    if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
      return 'image/png';
    }
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp';
    }
    if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    return null;
  }

  private static validateExtension(fileName: string, mimeType: string): boolean {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext) return false;

    const mimeToExts: Record<string, string[]> = {
      'application/pdf': ['pdf'],
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
    };

    const allowedExts = mimeToExts[mimeType];
    return allowedExts ? allowedExts.includes(ext) : false;
  }

  // Future hooks
  private static async runVirusScan(buffer: Buffer, fileName: string): Promise<boolean> {
    console.log(`[Virus Scan Hook] Scanning file ${fileName}...`);
    // Placeholder: Integration with ClamAV / VirusTotal in production
    return true; // assume safe
  }

  private static async runOcr(buffer: Buffer, mimeType: string, attachmentId: string): Promise<void> {
    if (mimeType === 'application/pdf') {
      console.log(`[OCR Hook] Extracting text from PDF attachment ${attachmentId}...`);
      // Placeholder: Extract text and add to search indexes
    }
  }

  private static async generateThumbnail(buffer: Buffer, mimeType: string, attachmentId: string): Promise<void> {
    if (mimeType.startsWith('image/')) {
      console.log(`[Thumbnail Hook] Generating thumbnail for image attachment ${attachmentId}...`);
      // Placeholder: Generate smaller resolution version using sharp
    }
  }

  /**
   * Upload an attachment linked to a specific entity.
   */
  public static async uploadAttachment(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    userId: string,
    params: {
      fileName: string;
      buffer: Buffer;
      entityType: string;
      entityId: string;
    },
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const { fileName, buffer, entityType, entityId } = params;
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;


    // 1. Detect and Validate MIME type using magic bytes
    const detectedMime = this.detectMimeTypeFromMagicBytes(buffer);
    if (!detectedMime) {
      throw new ValidationError('Could not identify file format. Only JPEG, PNG, WebP, and PDF are allowed.');
    }

    if (!ALLOWED_MIME_TYPES.includes(detectedMime as any)) {
      throw new ValidationError(`Unsupported file type: ${detectedMime}`);
    }

    // 2. Validate Size Limit
    const fileSize = buffer.length;
    if (detectedMime.startsWith('image/')) {
      if (fileSize > MAX_FILE_SIZES.IMAGE) {
        throw new ValidationError(`Image size exceeds limit of 10 MB`);
      }
    } else if (detectedMime === 'application/pdf') {
      if (fileSize > MAX_FILE_SIZES.PDF) {
        throw new ValidationError(`PDF size exceeds limit of 25 MB`);
      }
    }

    // 3. Validate Extension Matches MIME type
    if (!this.validateExtension(fileName, detectedMime)) {
      throw new ValidationError('File extension does not match the actual file content type.');
    }

    // 4. Run Virus Scanning Hook
    const isSafe = await this.runVirusScan(buffer, fileName);
    if (!isSafe) {
      throw new ValidationError('File was rejected by security/virus scanner.');
    }

    // 5. Generate SHA256 checksum
    const sha256Checksum = createHash('sha256').update(buffer).digest('hex');

    // 6. Generate Randomized Unique Storage Path
    const storageProvider = process.env['STORAGE_DRIVER'] || 'local';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const storageId = randomUUID();
    const ext = fileName.split('.').pop()?.toLowerCase();
    const storagePath = `${tenantId}/${year}/${month}/${day}/${storageId}.${ext}`;

    // 7. Write to Storage Provider
    const provider = getStorageProvider();
    await provider.put(storagePath, buffer, detectedMime);

    // 8. Insert into Database
    const [newAttachment] = await db
      .insert(attachments)
      .values({
        tenantId,
        businessId,
        branchId,
        entityType,
        entityId,
        fileName,
        originalName: fileName,
        fileSize,
        mimeType: detectedMime,
        storageProvider,
        storagePath,
        sha256Checksum,
        uploadedBy: userId,
      })
      .returning();

    if (!newAttachment) {
      // Cleanup storage if database insert fails
      await provider.delete(storagePath);
      throw new ValidationError('Failed to store attachment metadata.');
    }

    // Synchronize to documentAttachments if linking to a document
    if (entityType === 'document' || entityType.startsWith('document:')) {
      await db
        .insert(documentAttachments)
        .values({
          tenantId,
          businessId,
          branchId,
          documentId: entityId,
          uploaderId: userId,
          fileName,
          fileType: detectedMime,
          fileSize,
          storagePath,
        });
    }

    // 9. Run Async hooks (OCR, thumbnails)
    // Run concurrently or as background tasks (here run as non-blocking promises)
    this.runOcr(buffer, detectedMime, newAttachment.id).catch(console.error);
    this.generateThumbnail(buffer, detectedMime, newAttachment.id).catch(console.error);

    // 10. Audit Logging
    await logAudit(db, {
      entityType: 'attachment',
      entityId: newAttachment.id,
      action: 'create',
      actorId: userId,
      newValues: {
        fileName,
        fileSize,
        mimeType: detectedMime,
        entityType,
        entityId,
        sha256Checksum,
      },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newAttachment;
  }

  /**
   * Retrieve attachment metadata.
   */
  public static async getAttachment(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    attachmentId: string
  ) {
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId), isNull(attachments.deletedAt)))
      .limit(1);

    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    // Enforce branch isolation
    this.enforceScope(context, attachment);

    return attachment;
  }

  /**
   * Fetch the download/view URL for an attachment.
   */
  public static async getAttachmentDownloadUrl(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    attachmentId: string
  ): Promise<string> {
    const attachment = await this.getAttachment(db, context, attachmentId);
    const provider = getStorageProvider();
    return provider.getSignedUrl(attachment.storagePath);
  }

  /**
   * Fetch raw file buffer for an attachment.
   */
  public static async getAttachmentBuffer(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    attachmentId: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const attachment = await this.getAttachment(db, context, attachmentId);
    const provider = getStorageProvider();
    const buffer = await provider.get(attachment.storagePath);
    return {
      buffer,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * List attachments for a given entity.
   */
  public static async listEntityAttachments(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    entityType: string,
    entityId: string
  ) {
    const baseConditions = [
      eq(attachments.entityType, entityType),
      eq(attachments.entityId, entityId),
      isNull(attachments.deletedAt),
      eq(attachments.tenantId, context.tenantId!),
      eq(attachments.businessId, context.businessId!),
    ];

    if (context.tokenScope !== 'all-branches') {
      baseConditions.push(eq(attachments.branchId, context.branchId!));
    }

    return db
      .select()
      .from(attachments)
      .where(and(...baseConditions));
  }

  /**
   * Soft/Hard delete an attachment.
   */
  public static async deleteAttachment(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    userId: string,
    attachmentId: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const attachment = await this.getAttachment(db, context, attachmentId);

    // 1. Delete from Storage Provider
    const provider = getStorageProvider();
    await provider.delete(attachment.storagePath);

    // 2. Hard delete metadata from DB (or soft delete if required, but the storage file is gone so hard delete is safe here)
    await db
      .delete(attachments)
      .where(eq(attachments.id, attachmentId));

    // Synchronize to documentAttachments if linked to a document
    if (attachment.entityType === 'document' || attachment.entityType.startsWith('document:')) {
      await db
        .delete(documentAttachments)
        .where(
          and(
            eq(documentAttachments.documentId, attachment.entityId),
            eq(documentAttachments.storagePath, attachment.storagePath)
          )
        );
    }

    // 3. Log Audit
    await logAudit(db, {
      entityType: 'attachment',
      entityId: attachmentId,
      action: 'delete',
      actorId: userId,
      oldValues: {
        fileName: attachment.fileName,
        storagePath: attachment.storagePath,
      },
      tenantId: attachment.tenantId,
      businessId: attachment.businessId,
      branchId: attachment.branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return { success: true };
  }
}
