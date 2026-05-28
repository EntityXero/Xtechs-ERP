import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { createDb } from './client.js';
import {
  documents,
  documentLines,
  documentLinks,
  documentSequences,
  documentComments,
  documentActivities,
  documentAttachments,
  auditLogs,
  metadataDefs,
  metadataRevisions,
  metadataDependencies,
  userRoles,
  users,
  branches,
  businesses,
  tenants,
  refreshTokens,
  roles,
  rolePermissions,
} from './schema/index.js';
import { eq, and } from 'drizzle-orm';
import {
  logAudit,
  queryAuditLogs,
  getEntityTimeline,
  streamAuditLogsCsv,
} from '../../../apps/server/src/lib/audit-service.js';
import { createScopedDb } from '../../../apps/server/src/lib/scoped-db.js';
import { Readable } from 'stream';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Audit Engine Validation Tests...');

  try {
    // 1. Clean up existing tables
    await db.delete(documentLinks);
    await db.delete(documentLines);
    await db.delete(documentComments);
    await db.delete(documentActivities);
    await db.delete(documentAttachments);
    await db.delete(documents);
    await db.delete(documentSequences);
    await db.delete(auditLogs);
    await db.delete(metadataDependencies);
    await db.delete(metadataRevisions);
    await db.delete(metadataDefs);
    await db.delete(refreshTokens);
    await db.delete(userRoles);
    await db.delete(rolePermissions);
    await db.delete(roles);
    await db.delete(users);
    await db.delete(branches);
    await db.delete(businesses);
    await db.delete(tenants);

    console.log('🧹 Database cleaned up.');

    // 2. Setup Scopes
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userAdminId = '55555555-5555-5555-5555-555555555555';
    const userBId = '66666666-6666-6666-6666-666666666666';

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Test Tenant',
      slug: 'test-tenant',
      status: 'active',
      metadata: {},
    });

    await db.insert(businesses).values({
      id: businessId,
      tenantId,
      name: 'Test Business',
      legalName: 'Test Business LLC',
      status: 'active',
      metadata: {},
    });

    await db.insert(branches).values({
      id: branchA,
      tenantId,
      businessId,
      name: 'Branch A',
      code: 'A',
      isDefault: true,
      status: 'active',
      metadata: {},
    });

    await db.insert(branches).values({
      id: branchB,
      tenantId,
      businessId,
      name: 'Branch B',
      code: 'B',
      isDefault: false,
      status: 'active',
      metadata: {},
    });

    await db.insert(users).values({
      id: userAdminId,
      tenantId,
      email: 'admin@corporate.local',
      passwordHash: 'dummy',
      displayName: 'Admin User',
      status: 'active',
    });

    await db.insert(users).values({
      id: userBId,
      tenantId,
      email: 'userb@corporate.local',
      passwordHash: 'dummy',
      displayName: 'User B',
      status: 'active',
    });

    console.log('🌱 Seeding structural records completed.');

    // Contexts
    const authContextAdmin = {
      userId: userAdminId,
      tokenScope: 'all-branches' as const,
      scope: { tenantId, businessId, branchId: branchA },
    };

    const authContextUserB = {
      userId: userBId,
      tokenScope: 'branch' as const,
      scope: { tenantId, businessId, branchId: branchB },
    };

    const scopedAdmin = createScopedDb(authContextAdmin);
    const scopedUserB = createScopedDb(authContextUserB);

    // 3. Write some audit logs for testing
    const invoiceId = '77777777-7777-7777-7777-777777777777';
    
    // Log 1: Branch A invoice create by Admin
    await logAudit(db, {
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'create',
      actorId: userAdminId,
      newValues: { total: 100 },
      tenantId,
      businessId,
      branchId: branchA,
      ipAddress: '127.0.0.1',
    });

    // Log 2: Branch A invoice update by Admin
    await logAudit(db, {
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'update',
      actorId: userAdminId,
      oldValues: { total: 100 },
      newValues: { total: 150 },
      tenantId,
      businessId,
      branchId: branchA,
      ipAddress: '127.0.0.1',
    });

    // Log 3: Branch B invoice create by User B
    const invoiceBId = '88888888-8888-8888-8888-888888888888';
    await logAudit(db, {
      entityType: 'invoice',
      entityId: invoiceBId,
      action: 'create',
      actorId: userBId,
      newValues: { total: 50 },
      tenantId,
      businessId,
      branchId: branchB,
      ipAddress: '192.168.1.1',
    });

    console.log('✍ Created initial audit logs.');

    // ─── TEST 1: Branch Isolation ────────────────────────────────
    console.log('\n▶ Test 1: Branch Isolation Enforcements');
    
    // User B (scoped to Branch B) queries audit logs
    const resultUserB = await queryAuditLogs(db, scopedUserB.filters(auditLogs));
    console.log(`  ✓ User B returned ${resultUserB.total} audit logs`);
    if (resultUserB.total !== 1) {
      throw new Error(`Expected 1 audit log for Branch B, got ${resultUserB.total}`);
    }
    if (resultUserB.logs[0].entityId !== invoiceBId) {
      throw new Error(`Expected Branch B log to be invoice ${invoiceBId}, got ${resultUserB.logs[0].entityId}`);
    }

    // Admin (scoped to all branches) queries audit logs
    const resultAdmin = await queryAuditLogs(db, scopedAdmin.filters(auditLogs));
    console.log(`  ✓ Admin returned ${resultAdmin.total} audit logs`);
    if (resultAdmin.total !== 3) {
      throw new Error(`Expected 3 total audit logs for Admin, got ${resultAdmin.total}`);
    }

    // ─── TEST 2: Pagination & Filtering ──────────────────────────
    console.log('\n▶ Test 2: Pagination & Filtering');

    // Test limit & offset
    const page1 = await queryAuditLogs(db, scopedAdmin.filters(auditLogs), { limit: 2, offset: 0 });
    const page2 = await queryAuditLogs(db, scopedAdmin.filters(auditLogs), { limit: 2, offset: 2 });
    
    console.log(`  ✓ Page 1 logs count: ${page1.logs.length}, Total reported: ${page1.total}`);
    console.log(`  ✓ Page 2 logs count: ${page2.logs.length}, Total reported: ${page2.total}`);

    if (page1.logs.length !== 2 || page2.logs.length !== 1 || page1.total !== 3) {
      throw new Error('Pagination limits or total counts mismatch');
    }

    // Test filter by entityType & action
    const updateLogs = await queryAuditLogs(db, scopedAdmin.filters(auditLogs), { action: 'update' });
    console.log(`  ✓ Query for update actions returned ${updateLogs.total} logs`);
    if (updateLogs.total !== 1 || updateLogs.logs[0].action !== 'update') {
      throw new Error('Action filter failed');
    }

    const branchBFilter = await queryAuditLogs(db, scopedAdmin.filters(auditLogs), { branchId: branchB });
    console.log(`  ✓ Query filtered by branchId Branch B returned ${branchBFilter.total} logs`);
    if (branchBFilter.total !== 1 || branchBFilter.logs[0].branchId !== branchB) {
      throw new Error('BranchId filter failed');
    }

    // ─── TEST 3: Entity Timeline ─────────────────────────────────
    console.log('\n▶ Test 3: Entity Timeline chronolog');

    const timeline = await getEntityTimeline(db, scopedAdmin.filters(auditLogs), 'invoice', invoiceId);
    console.log(`  ✓ Timeline for invoice ${invoiceId} returned ${timeline.length} history items`);
    if (timeline.length !== 2) {
      throw new Error(`Expected 2 timeline items, got ${timeline.length}`);
    }

    // Check chronological order (newest first, so update comes before create)
    if (timeline[0].action !== 'update' || timeline[1].action !== 'create') {
      throw new Error('Timeline ordering is incorrect');
    }

    // Ensure User B cannot see Admin invoice timeline
    const timelineUserB = await getEntityTimeline(db, scopedUserB.filters(auditLogs), 'invoice', invoiceId);
    console.log(`  ✓ User B query of Admin invoice timeline returned ${timelineUserB.length} items`);
    if (timelineUserB.length !== 0) {
      throw new Error('Security Leak! User B was able to fetch Branch A invoice timeline');
    }

    // ─── TEST 4: Streaming CSV Export ────────────────────────────
    console.log('\n▶ Test 4: Streaming CSV Export');

    const allLogs = await db.select().from(auditLogs);
    const csvStream = streamAuditLogsCsv(allLogs);

    if (!(csvStream instanceof Readable)) {
      throw new Error('CSV Export did not return a Readable stream');
    }

    // Read stream content
    let csvContent = '';
    for await (const chunk of csvStream) {
      csvContent += chunk.toString();
    }

    console.log('  ✓ CSV stream read successfully. Output preview:\n' + csvContent.trim());
    
    // Basic verification of CSV contents
    const lines = csvContent.trim().split('\r\n');
    if (lines.length !== 4) {
      throw new Error(`Expected 4 CSV lines (1 header + 3 rows), got ${lines.length}`);
    }
    
    const expectedHeaders = 'id,timestamp,entity_type,entity_id,action,actor_id,request_id,ip_address,old_values,new_values';
    if (lines[0] !== expectedHeaders) {
      throw new Error(`Header mismatch. Expected:\n${expectedHeaders}\nGot:\n${lines[0]}`);
    }

    console.log('\n🎉 ALL AUDIT ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
