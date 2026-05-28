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
import { DocumentService } from '../../../apps/server/src/lib/document-service.js';
import { createMetadataDefinition, createMetadataRevision } from '../../../apps/server/src/lib/metadata-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Document Engine Validation Tests...');

  try {
    // 1. Clean up existing tables in strict foreign key order
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

    console.log('🧹 Database cleaned up completely.');

    // 2. Setup Scopes
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userId = '55555555-5555-5555-5555-555555555555';

    const contextA = { tenantId, businessId, branchId: branchA };
    const contextB = { tenantId, businessId, branchId: branchB };

    // Seed structure tables
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
      id: userId,
      tenantId,
      email: 'test@corporate.local',
      passwordHash: 'dummy',
      displayName: 'Document Test User',
      status: 'active',
    });

    console.log('🌱 Seeding structural records completed.');

    // ─── TEST 1: Numbering Sequence Generation ──────────────────
    console.log('\n▶ Test 1: Numbering Sequence Generation');
    
    // Seed customized numbering metadata
    await createMetadataDefinition(db, {
      key: 'invoice_numbering',
      type: 'numbering',
      name: 'Invoice Numbering Rule',
    });

    await createMetadataRevision(db, 'invoice_numbering', {
      tenantId,
      businessId,
      branchId: branchA,
      payload: {
        prefix: 'INV-{year}-',
        digits: 4,
        startFrom: 10, // Starting at 10
      },
    });

    // Create first invoice
    const inv1 = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: {},
      lines: [],
      links: [],
    });

    console.log(`  ✓ First invoice generated number: ${inv1.documentNumber}`);
    if (inv1.documentNumber !== `INV-${new Date().getFullYear()}-0010`) {
      throw new Error(`Expected INV-${new Date().getFullYear()}-0010, got ${inv1.documentNumber}`);
    }

    // Create second invoice
    const inv2 = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: {},
      lines: [],
      links: [],
    });

    console.log(`  ✓ Second invoice generated number: ${inv2.documentNumber}`);
    if (inv2.documentNumber !== `INV-${new Date().getFullYear()}-0011`) {
      throw new Error(`Expected INV-${new Date().getFullYear()}-0011, got ${inv2.documentNumber}`);
    }

    // ─── TEST 2: Dynamic Form Schema Validation ─────────────────
    console.log('\n▶ Test 2: Dynamic Form Schema Validation');

    // Seed Form Metadata
    await createMetadataDefinition(db, {
      key: 'invoice_form',
      type: 'form',
      name: 'Invoice Form',
    });

    await createMetadataRevision(db, 'invoice_form', {
      tenantId,
      businessId,
      branchId: branchA,
      payload: {
        sections: [
          {
            title: 'Primary Information',
            columns: 2,
            fields: [
              { name: 'customerEmail', label: 'Customer Email', type: 'text', required: true },
              { name: 'amountDue', label: 'Amount Due', type: 'currency', required: true },
              { name: 'notes', label: 'Notes', type: 'textarea', required: false },
            ],
          },
        ],
      },
    });

    // Attempt creation with missing customerEmail (required field)
    try {
      await DocumentService.createDocument(db, contextA, userId, {
        type: 'invoice',
        status: 'active',
        workflowState: 'draft',
        data: {
          amountDue: 150.00,
        },
        lines: [],
        links: [],
      });
      throw new Error('Test failed: Missing customerEmail did not trigger Validation Error');
    } catch (e: any) {
      if (e instanceof ValidationError) {
        console.log('  ✓ Correctly rejected missing required customerEmail:', e.message, e.details);
      } else {
        throw e;
      }
    }

    // Attempt creation with invalid field type (amountDue should be a number)
    try {
      await DocumentService.createDocument(db, contextA, userId, {
        type: 'invoice',
        status: 'active',
        workflowState: 'draft',
        data: {
          customerEmail: 'test@customer.com',
          amountDue: 'one hundred', // String instead of number
        },
        lines: [],
        links: [],
      });
      throw new Error('Test failed: Invalid amountDue type did not trigger Validation Error');
    } catch (e: any) {
      if (e instanceof ValidationError) {
        console.log('  ✓ Correctly rejected string for currency type:', e.message, e.details);
      } else {
        throw e;
      }
    }

    // Valid invoice creation
    const validInv = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: {
        customerEmail: 'billing@corporate.com',
        amountDue: 2500.50,
        notes: 'Terms net 30',
      },
      lines: [
        {
          lineNumber: 1,
          description: 'Consulting Services',
          quantity: 10,
          unitPrice: 250,
          amount: 2500,
          data: {},
        },
      ],
      links: [],
    });

    console.log(`  ✓ Successfully created and validated invoice: ${validInv.documentNumber}`);
    if (validInv.lines.length !== 1 || validInv.lines[0].description !== 'Consulting Services') {
      throw new Error('Invoice lines persistence mismatch');
    }

    // ─── TEST 3: Branch Isolation ───────────────────────────────
    console.log('\n▶ Test 3: Branch Isolation Enforcements');

    // Try fetching Branch A invoice using Branch B context - Should fail
    try {
      await DocumentService.getDocumentDetails(db, contextB, validInv.id);
      throw new Error('Test failed: Branch B successfully fetched Branch A invoice');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Correctly blocked read access across branches:', e.message);
      } else {
        throw e;
      }
    }

    // Try updating Branch A invoice using Branch B context - Should fail
    try {
      await DocumentService.updateDocument(db, contextB, userId, validInv.id, {
        data: { customerEmail: 'hacked@corporate.com' },
      });
      throw new Error('Test failed: Branch B successfully updated Branch A invoice');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Correctly blocked update access across branches:', e.message);
      } else {
        throw e;
      }
    }

    // ─── TEST 4: Relational Document Links & Leak Control ───────
    console.log('\n▶ Test 4: Document Link and Scope Leak Controls');

    // Create customer document in Branch A
    const customer = await DocumentService.createDocument(db, contextA, userId, {
      type: 'customer',
      status: 'active',
      workflowState: 'approved',
      data: { companyName: 'Corporate Inc' },
      lines: [],
      links: [],
    });
    console.log(`  ✓ Created customer document in Branch A`);

    // Create invoice in Branch A linked to customer in Branch A - Should succeed
    const linkedInvoice = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: { customerEmail: 'sales@corporate.com', amountDue: 100 },
      lines: [],
      links: [
        {
          targetDocId: customer.id,
          relationType: 'invoice_customer',
        },
      ],
    });
    console.log(`  ✓ Linked Branch A Invoice with Branch A Customer`);
    if (linkedInvoice.links.length !== 1 || linkedInvoice.links[0].targetDocId !== customer.id) {
      throw new Error('Link failed to persist');
    }

    // Attempt to link a Branch B Invoice to a Branch A Customer - Should fail isolation!
    try {
      await DocumentService.createDocument(db, contextB, userId, {
        type: 'invoice',
        status: 'active',
        workflowState: 'draft',
        data: {},
        lines: [],
        links: [
          {
            targetDocId: customer.id, // Customer in Branch A
            relationType: 'invoice_customer',
          },
        ],
      });
      throw new Error('Test failed: Branch B Invoice successfully linked to Branch A Customer');
    } catch (e: any) {
      if (e instanceof ForbiddenError) {
        console.log('  ✓ Correctly prevented cross-branch scope link leak:', e.message);
      } else {
        throw e;
      }
    }

    // ─── TEST 5: Posted Immutability ────────────────────────────
    console.log('\n▶ Test 5: Posted Document Immutability');

    // Transition invoice: draft -> pending_approval -> approved -> posted
    await DocumentService.transitionDocument(db, contextA, userId, validInv.id, 'submit');
    await DocumentService.transitionDocument(db, contextA, userId, validInv.id, 'approve');
    const postedDoc = await DocumentService.transitionDocument(db, contextA, userId, validInv.id, 'post');

    console.log(`  ✓ Transitioned invoice ${postedDoc.documentNumber} to workflow state: ${postedDoc.workflowState}`);

    // Try modifying posted invoice - Should fail!
    try {
      await DocumentService.updateDocument(db, contextA, userId, postedDoc.id, {
        data: {
          customerEmail: 'newemail@corporate.com',
          amountDue: 2500.50,
        },
      });
      throw new Error('Test failed: Successfully modified a POSTED invoice');
    } catch (e: any) {
      if (e instanceof ValidationError && e.message.includes('Posted')) {
        console.log('  ✓ Correctly blocked mutation on Posted document:', e.message);
      } else {
        throw e;
      }
    }

    // ─── TEST 6: Immutable Audit Log Verification ────────────────
    console.log('\n▶ Test 6: Immutable Audit Log Verification');

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, validInv.id));
    console.log(`  ✓ Found ${logs.length} immutable audit logs for invoice ${validInv.documentNumber}`);
    
    // There should be log entries for 'create', 'update' (from transitions), etc.
    const createLogs = logs.filter((l) => l.action === 'create');
    const transitionLogs = logs.filter((l) => l.action === 'transition');

    if (createLogs.length !== 1 || transitionLogs.length < 1) {
      throw new Error('Audit log entries mismatch');
    }
    console.log(`  ✓ Create log captured values successfully.`);
    console.log(`  ✓ Transition log tracked lifecycle transition properly.`);

    console.log('\n🎉 ALL DOCUMENT ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
