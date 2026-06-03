import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { createDb } from './client.js';
import {
  tenants,
  businesses,
  branches,
  users,
  attachments,
  auditLogs,
} from './schema/index.js';
import { AttachmentService } from '../../../apps/server/src/lib/attachment-service.js';
import { getStorageProvider } from '../../../apps/server/src/lib/storage/index.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../apps/server/src/lib/errors.js';
import { eq } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Attachment Engine Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(attachments);
    await db.delete(auditLogs);
    await db.delete(users);
    await db.delete(branches);
    await db.delete(businesses);
    await db.delete(tenants);

    console.log('Cleaned up tables.');

    // 2. Setup Context Structures
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userId = '55555555-5555-5555-5555-555555555555';

    await db.insert(tenants).values({ id: tenantId, name: 'Attachment Tenant', slug: 'attachment-tenant' });
    await db.insert(businesses).values({ id: businessId, tenantId, name: 'Acme Storage Inc', legalName: 'Acme Storage Inc LTD' });
    await db.insert(branches).values({ id: branchA, tenantId, businessId, name: 'HQ', code: 'HQ', isDefault: true });
    await db.insert(branches).values({ id: branchB, tenantId, businessId, name: 'Sub', code: 'SUB', isDefault: false });
    await db.insert(users).values({ id: userId, tenantId, email: 'admin@acme.local', passwordHash: 'hashed', displayName: 'Admin User' });

    console.log('Seeded base structural entities.');

    const contextHQ = { tenantId, businessId, branchId: branchA, tokenScope: 'branch' };
    const contextSUB = { tenantId, businessId, branchId: branchB, tokenScope: 'branch' };
    const contextAdmin = { tenantId, businessId, branchId: branchA, tokenScope: 'all-branches' };

    const mockEntityId = '99999999-9999-9999-9999-999999999999';

    // Create mock file buffers with valid magic bytes
    const jpegBuffer = Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF]), // JPEG magic bytes
      Buffer.from('Fake JPEG data content '.repeat(10)),
    ]);

    const pdfBuffer = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF magic bytes (%PDF)
      Buffer.from('Fake PDF data content '.repeat(20)),
    ]);

    // ─── TEST 1: Successful Upload & Metadata Hashing ─────────────────────────
    console.log('\n▶ Test 1: Successful Upload & Metadata Hashing');
    
    const attachment = await AttachmentService.uploadAttachment(
      db,
      contextHQ,
      userId,
      {
        fileName: 'receipt.jpg',
        buffer: jpegBuffer,
        entityType: 'sales_order',
        entityId: mockEntityId,
      }
    );

    console.log('  ✓ Upload succeeded.');
    console.log(`    - File name: ${attachment.fileName}`);
    console.log(`    - Size: ${attachment.fileSize} bytes`);
    console.log(`    - Detected MIME: ${attachment.mimeType}`);
    console.log(`    - Storage path: ${attachment.storagePath}`);
    console.log(`    - Checksum: ${attachment.sha256Checksum}`);

    if (attachment.mimeType !== 'image/jpeg') {
      throw new Error(`Expected image/jpeg, got ${attachment.mimeType}`);
    }

    // Verify file actually written to local uploads directory
    const provider = getStorageProvider() as any;
    const absPath = join(provider.baseDir, attachment.storagePath);
    if (!existsSync(absPath)) {
      throw new Error(`Local file not written to path: ${absPath}`);
    }
    console.log('  ✓ Verified file exists on disk.');

    // ─── TEST 2: Validation of MIME types & extensions ─────────────────────────
    console.log('\n▶ Test 2: Validation of MIME types & extensions');

    // Unsupported MIME (no correct magic bytes)
    try {
      await AttachmentService.uploadAttachment(
        db,
        contextHQ,
        userId,
        {
          fileName: 'unsafe.exe',
          buffer: Buffer.from('MZ... executable bytes'),
          entityType: 'sales_order',
          entityId: mockEntityId,
        }
      );
      throw new Error('Allowed uploading an unsupported executable file');
    } catch (e: any) {
      if (e instanceof ValidationError) {
        console.log('  ✓ Successfully blocked invalid file magic bytes:', e.message);
      } else {
        throw e;
      }
    }

    // Mismatched extension
    try {
      await AttachmentService.uploadAttachment(
        db,
        contextHQ,
        userId,
        {
          fileName: 'receipt.pdf', // PDF extension but contains JPEG bytes
          buffer: jpegBuffer,
          entityType: 'sales_order',
          entityId: mockEntityId,
        }
      );
      throw new Error('Allowed uploading file with mismatched extension');
    } catch (e: any) {
      if (e instanceof ValidationError) {
        console.log('  ✓ Successfully blocked mismatched extension:', e.message);
      } else {
        throw e;
      }
    }

    // ─── TEST 3: Size Limits Enforcement ─────────────────────────────────────────
    console.log('\n▶ Test 3: Size Limits Enforcement');
    
    // Create large mock buffer (11MB JPEG)
    const largeJpegBuffer = Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF]),
      Buffer.alloc(11 * 1024 * 1024), // 11MB
    ]);

    try {
      await AttachmentService.uploadAttachment(
        db,
        contextHQ,
        userId,
        {
          fileName: 'huge.jpg',
          buffer: largeJpegBuffer,
          entityType: 'sales_order',
          entityId: mockEntityId,
        }
      );
      throw new Error('Allowed uploading image exceeding 10MB limit');
    } catch (e: any) {
      if (e instanceof ValidationError) {
        console.log('  ✓ Successfully blocked file exceeding image size limit (10MB):', e.message);
      } else {
        throw e;
      }
    }

    // ─── TEST 4: Isolation & Access Control ──────────────────────────────────────
    console.log('\n▶ Test 4: Isolation & Access Control');

    // Retrieve via HQ context (should succeed)
    const fetchedHq = await AttachmentService.getAttachment(db, contextHQ, attachment.id);
    console.log(`  ✓ Successfully fetched attachment via HQ context: ${fetchedHq.fileName}`);

    // Retrieve via SUB context (should fail - branch isolation)
    try {
      await AttachmentService.getAttachment(db, contextSUB, attachment.id);
      throw new Error('Branch isolation breach: SUB context retrieved HQ attachment');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Successfully blocked cross-branch read request:', e.message);
      } else {
        throw e;
      }
    }

    // Retrieve via admin context (should succeed - tokenScope 'all-branches')
    const fetchedAdmin = await AttachmentService.getAttachment(db, contextAdmin, attachment.id);
    console.log(`  ✓ Admin context (all-branches) successfully fetched HQ attachment: ${fetchedAdmin.fileName}`);

    // ─── TEST 5: Listing & Signed Links ─────────────────────────────────────────
    console.log('\n▶ Test 5: Listing & Signed Links');

    const hqList = await AttachmentService.listEntityAttachments(db, contextHQ, 'sales_order', mockEntityId);
    console.log(`  ✓ HQ context listed attachments (found: ${hqList.length})`);
    if (hqList.length !== 1) {
      throw new Error(`Expected 1 attachment in HQ listing, found ${hqList.length}`);
    }

    const subList = await AttachmentService.listEntityAttachments(db, contextSUB, 'sales_order', mockEntityId);
    console.log(`  ✓ SUB context listed attachments (found: ${subList.length})`);
    if (subList.length !== 0) {
      throw new Error(`Expected 0 attachments in SUB listing, found ${subList.length}`);
    }

    const downloadUrl = await AttachmentService.getAttachmentDownloadUrl(db, contextHQ, attachment.id);
    console.log(`  ✓ Successfully generated signed download URL: ${downloadUrl}`);
    if (!downloadUrl.includes('/api/attachments/download?token=')) {
      throw new Error(`Invalid signed URL path generated: ${downloadUrl}`);
    }

    // ─── TEST 6: Delete & Storage Cleanup ──────────────────────────────────────
    console.log('\n▶ Test 6: Delete & Storage Cleanup');

    // Attempt delete by SUB branch (should fail)
    try {
      await AttachmentService.deleteAttachment(db, contextSUB, userId, attachment.id);
      throw new Error('Branch isolation breach: SUB context deleted HQ attachment');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Successfully blocked cross-branch delete request:', e.message);
      } else {
        throw e;
      }
    }

    // Succeeded delete by HQ branch
    const deleteResult = await AttachmentService.deleteAttachment(db, contextHQ, userId, attachment.id);
    console.log('  ✓ Successfully deleted attachment via HQ context:', deleteResult);

    // Verify metadata deleted from database
    const dbRecord = await db.select().from(attachments).where(eq(attachments.id, attachment.id)).limit(1);
    if (dbRecord.length !== 0) {
      throw new Error('Attachment record still exists in DB after deletion');
    }
    console.log('  ✓ Verified DB record removed.');

    // Verify file deleted from local filesystem
    if (existsSync(absPath)) {
      throw new Error('Storage file still exists on disk after deletion');
    }
    console.log('  ✓ Verified storage file deleted from disk.');

    console.log('\n🎉 ALL ATTACHMENT ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
