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
  workflowApprovals,
  workflowDelegations,
} from './schema/index.js';
import { DocumentService } from '../../../apps/server/src/lib/document-service.js';
import { WorkflowService, evaluateConditions } from '../../../apps/server/src/lib/workflow-service.js';
import { createMetadataDefinition, createMetadataRevision } from '../../../apps/server/src/lib/metadata-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Workflow Engine Validation Tests...');

  try {
    // 1. Clean up existing tables in strict foreign key order
    await db.delete(workflowApprovals);
    await db.delete(workflowDelegations);
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
    const userId = '55555555-5555-5555-5555-555555555555';
    
    // Additional test users
    const managerId = '66666666-6666-6666-6666-666666666666';
    const directorId = '77777777-7777-7777-7777-777777777777';
    const vpId = '88888888-8888-8888-8888-888888888888';
    const delegateId = '99999999-9999-9999-9999-999999999999';

    const contextA = { tenantId, businessId, branchId: branchA };

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

    // Seed users
    await db.insert(users).values([
      { id: userId, tenantId, email: 'submitter@corp.local', passwordHash: 'dummy', displayName: 'Submitter', status: 'active' },
      { id: managerId, tenantId, email: 'manager@corp.local', passwordHash: 'dummy', displayName: 'Manager User', status: 'active' },
      { id: directorId, tenantId, email: 'director@corp.local', passwordHash: 'dummy', displayName: 'Director User', status: 'active' },
      { id: vpId, tenantId, email: 'vp@corp.local', passwordHash: 'dummy', displayName: 'VP User', status: 'active' },
      { id: delegateId, tenantId, email: 'delegate@corp.local', passwordHash: 'dummy', displayName: 'Delegate User', status: 'active' },
    ]);

    // Seed Roles
    const [managerRole] = await db.insert(roles).values({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tenantId, businessId, name: 'Manager', description: 'Manager Role' }).returning();
    const [directorRole] = await db.insert(roles).values({ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', tenantId, businessId, name: 'Director', description: 'Director Role' }).returning();
    const [vpRole] = await db.insert(roles).values({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', tenantId, businessId, name: 'VP', description: 'VP Role' }).returning();

    // Map users to roles in Branch A scope
    await db.insert(userRoles).values([
      { userId: managerId, roleId: managerRole.id, tenantId, businessId, branchId: branchA },
      { userId: directorId, roleId: directorRole.id, tenantId, businessId, branchId: branchA },
      { userId: vpId, roleId: vpRole.id, tenantId, businessId, branchId: branchA },
    ]);

    console.log('🌱 Seeding structural records completed.');

    // ─── TEST 1: Strict Declarative Conditions Evaluation ───────
    console.log('\n▶ Test 1: Strict Declarative Conditions Evaluation');
    const mockDoc = {
      type: 'invoice',
      createdBy: userId,
      data: {
        amountDue: 6500.00,
        customerType: 'Enterprise',
      },
    };

    const condsSuccess = [
      { field: 'data.amountDue', operator: 'gt', value: 5000 },
      { field: 'data.customerType', operator: 'eq', value: 'Enterprise' },
    ];
    const condsFailure = [
      { field: 'data.amountDue', operator: 'lt', value: 5000 },
    ];

    const pass = evaluateConditions(mockDoc, condsSuccess);
    const fail = evaluateConditions(mockDoc, condsFailure);

    console.log(`  ✓ Evaluating matching conditions: ${pass}`);
    console.log(`  ✓ Evaluating non-matching conditions: ${!fail}`);

    if (!pass || fail) {
      throw new Error('DSL Condition evaluation failed');
    }

    // ─── TEST 2: Workflow Spawning and Blocking ──────────────────
    console.log('\n▶ Test 2: Custom Workflow Spawning and State Blocking');

    // Create Invoice Workflow Definition
    await createMetadataDefinition(db, {
      key: 'invoice_workflow',
      type: 'workflow',
      name: 'Invoice Workflow Def',
    });

    const workflowPayload = {
      initialState: 'draft',
      states: {
        draft: {
          label: 'Draft',
          transitions: [
            {
              event: 'submit',
              to: 'approved',
              conditions: [
                { field: 'data.amountDue', operator: 'gt', value: 5000 },
              ],
              approvals: {
                roles: ['Manager', 'Director'],
                requiredCount: 2,
                escalationHours: 2, // past-due in 2 hrs
                escalateToRole: 'VP',
              },
            },
            {
              event: 'submit',
              to: 'approved',
              conditions: [
                { field: 'data.amountDue', operator: 'lte', value: 5000 },
              ],
            },
          ],
        },
        approved: {
          label: 'Approved',
          transitions: [
            { event: 'post', to: 'posted' },
          ],
        },
        posted: {
          label: 'Posted',
          isEndState: true,
        },
      },
    };

    await createMetadataRevision(db, 'invoice_workflow', {
      tenantId,
      businessId,
      branchId: branchA,
      payload: workflowPayload,
    });

    // Subtest A: Under 5000 should bypass approvals immediately!
    const smallInvoice = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: { amountDue: 4500.00 },
      lines: [],
      links: [],
    });

    const transitionedSmall = await DocumentService.transitionDocument(db, contextA, userId, smallInvoice.id, 'submit');
    console.log(`  ✓ Small invoice transitioned immediately to state: ${transitionedSmall.workflowState}`);
    if (transitionedSmall.workflowState !== 'approved') {
      throw new Error(`Expected immediately approved, got ${transitionedSmall.workflowState}`);
    }

    // Subtest B: Over 5000 should spawn 2 roles approvals and block to pending_approval!
    const largeInvoice = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: { amountDue: 7500.00 },
      lines: [],
      links: [],
    });

    const transitionedLarge = await DocumentService.transitionDocument(db, contextA, userId, largeInvoice.id, 'submit');
    console.log(`  ✓ Large invoice submitted. Target state: ${transitionedLarge.workflowState}`);
    if (transitionedLarge.workflowState !== 'pending_approval') {
      throw new Error(`Expected pending_approval state, got ${transitionedLarge.workflowState}`);
    }

    // Verify approvals spawned in database
    const spawnedApprovals = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.documentId, largeInvoice.id));
    
    console.log(`  ✓ Spawned ${spawnedApprovals.length} approvals in database.`);
    if (spawnedApprovals.length !== 2) {
      throw new Error(`Expected 2 spawned approvals, got ${spawnedApprovals.length}`);
    }

    const spawnedRoles = spawnedApprovals.map((a) => a.requiredRole);
    if (!spawnedRoles.includes('Manager') || !spawnedRoles.includes('Director')) {
      throw new Error('Required roles Manager or Director are missing from spawned approvals');
    }

    // ─── TEST 3: Parallel Approvals Convergence ─────────────────
    console.log('\n▶ Test 3: Parallel Approvals Convergence');

    const managerApproval = spawnedApprovals.find((a) => a.requiredRole === 'Manager')!;
    const directorApproval = spawnedApprovals.find((a) => a.requiredRole === 'Director')!;

    // Manager approves
    await WorkflowService.approveRequest(db, contextA, managerId, managerApproval.id, 'Looks good from Manager');
    
    // Check document state: should STILL be pending_approval because Director hasn't approved
    const [docMidway] = await db.select().from(documents).where(eq(documents.id, largeInvoice.id)).limit(1);
    console.log(`  ✓ After Manager approval, document state is: ${docMidway.workflowState}`);
    if (docMidway.workflowState !== 'pending_approval') {
      throw new Error('Expected document to remain in pending_approval');
    }

    // Director approves
    await WorkflowService.approveRequest(db, contextA, directorId, directorApproval.id, 'Director approved');

    // Check document state: should now automatically transition to 'approved'!
    const [docApproved] = await db.select().from(documents).where(eq(documents.id, largeInvoice.id)).limit(1);
    console.log(`  ✓ After Director approval, document automatically transitioned to: ${docApproved.workflowState}`);
    if (docApproved.workflowState !== 'approved') {
      throw new Error('Expected document to transition to approved');
    }

    // ─── TEST 4: Rejection and Rollback ──────────────────────────
    console.log('\n▶ Test 4: Rejection and Transition Rollback');

    const anotherLargeInv = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: { amountDue: 8000.00 },
      lines: [],
      links: [],
    });

    await DocumentService.transitionDocument(db, contextA, userId, anotherLargeInv.id, 'submit');
    const newSpawned = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.documentId, anotherLargeInv.id),
          eq(workflowApprovals.status, 'pending')
        )
      );

    const rejectedAppr = newSpawned.find((a) => a.requiredRole === 'Manager')!;
    
    // Reject it
    await WorkflowService.rejectRequest(db, contextA, managerId, rejectedAppr.id, 'Not approved: too expensive');

    // Verify document returned to draft
    const [docRejected] = await db.select().from(documents).where(eq(documents.id, anotherLargeInv.id)).limit(1);
    console.log(`  ✓ After rejection, document state returned to: ${docRejected.workflowState}`);
    if (docRejected.workflowState !== 'draft') {
      throw new Error('Expected document to rollback to draft');
    }

    // Verify other approvals for this transition were cancelled
    const remaining = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.documentId, anotherLargeInv.id));
    
    const cancelledCount = remaining.filter((a) => a.status === 'cancelled').length;
    console.log(`  ✓ Cancelled status confirmed for other parallel approvals: ${cancelledCount === 1}`);

    // ─── TEST 5: Automatic Delegation ────────────────────────────
    console.log('\n▶ Test 5: Automatic Delegation Routing');

    // Create a new workflow that triggers direct user assignment
    await createMetadataRevision(db, 'invoice_workflow', {
      tenantId,
      businessId,
      branchId: branchA,
      payload: {
        initialState: 'draft',
        states: {
          draft: {
            label: 'Draft',
            transitions: [
              {
                event: 'submit',
                to: 'approved',
                conditions: [],
                approvals: {
                  users: [managerId], // direct assignment to Manager
                  requiredCount: 1,
                  escalationHours: 2,
                  escalateToRole: 'VP',
                },
              },
            ],
          },
        },
      },
    });

    // Configure a global delegation rule: Manager delegates to Delegate
    const start = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const end = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day future
    await WorkflowService.createDelegationRule(db, contextA, managerId, {
      delegatorId: managerId,
      delegateeId: delegateId,
      startDate: start,
      endDate: end,
    });
    console.log('  ✓ Configured global delegation: Manager -> Delegate');

    // Create and submit invoice
    const delegatedInvoice = await DocumentService.createDocument(db, contextA, userId, {
      type: 'invoice',
      status: 'active',
      workflowState: 'draft',
      data: { amountDue: 100.00 },
      lines: [],
      links: [],
    });

    await DocumentService.transitionDocument(db, contextA, userId, delegatedInvoice.id, 'submit');

    // Fetch spawned approvals
    const [delegatedAppr] = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.documentId, delegatedInvoice.id))
      .limit(1);

    console.log(`  ✓ Approval spawned with status: ${delegatedAppr.status}`);
    console.log(`  ✓ Delegated target matches Delegate User: ${delegatedAppr.delegatedTo === delegateId}`);

    if (delegatedAppr.status !== 'delegated' || delegatedAppr.delegatedTo !== delegateId) {
      throw new Error('Auto-delegation routing failed');
    }

    // ─── TEST 6: Background Escalation ───────────────────────────
    console.log('\n▶ Test 6: Background Escalation');

    // Backdate the escalation deadline to simulate timeout
    await db
      .update(workflowApprovals)
      .set({
        escalationDeadline: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      })
      .where(eq(workflowApprovals.id, delegatedAppr.id));

    // Run the escalation handler
    const escalateResult = await WorkflowService.escalatePastDueApprovals(db);
    console.log(`  ✓ Escalation engine ran. Escalated count: ${escalateResult.escalatedCount}`);

    // Verify approval record updated to VP role
    const [escalatedAppr] = await db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.id, delegatedAppr.id))
      .limit(1);

    console.log(`  ✓ Escalated approval status: ${escalatedAppr.status}`);
    console.log(`  ✓ Escalated required role: ${escalatedAppr.requiredRole}`);

    if (escalatedAppr.status !== 'escalated' || escalatedAppr.requiredRole !== 'VP') {
      throw new Error('Escalation failed to elevate to backup role');
    }

    console.log('\n🎉 ALL WORKFLOW ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
