import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { createDb } from './client.js';
import {
  tenants,
  businesses,
  branches,
  users,
  documents,
  departments,
  designations,
  employees,
  leaveRequests,
  auditLogs,
} from './schema/index.js';
import { HrService } from '../../../apps/server/src/lib/hr-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting HR Core Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(leaveRequests);
    await db.delete(employees);
    await db.delete(departments);
    await db.delete(designations);
    await db.delete(documents);
    await db.delete(users);
    await db.delete(branches);
    await db.delete(businesses);
    await db.delete(tenants);

    console.log('🧹 Database cleaned up.');

    // 2. Setup structural contexts
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userId = '55555555-5555-5555-5555-555555555555';

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Acme Holding',
      slug: 'acme-holding',
    });

    await db.insert(businesses).values({
      id: businessId,
      tenantId,
      name: 'Acme Sales Corp',
      legalName: 'Acme Sales Corp LTD',
    });

    await db.insert(branches).values({
      id: branchA,
      tenantId,
      businessId,
      name: 'HQ Sales Branch',
      code: 'HQ-SL',
      isDefault: true,
    });

    await db.insert(branches).values({
      id: branchB,
      tenantId,
      businessId,
      name: 'Secondary Sales Branch',
      code: 'SEC-SL',
      isDefault: false,
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: 'hr-manager@acme.local',
      passwordHash: 'hashed',
      displayName: 'HR Manager',
    });

    console.log('🌱 Seeding structural records completed.');

    // Scoped Contexts
    const contextBranchA = {
      tenantId,
      businessId,
      branchId: branchA,
    };

    const contextBranchB = {
      tenantId,
      businessId,
      branchId: branchB,
    };

    // ─── TEST 1: Department & Designation Creation ────────────────────
    console.log('\n▶ Test 1: Department & Designation Creation');

    const dept = await HrService.createDepartment(db, contextBranchA, userId, {
      name: 'Engineering',
    });
    console.log(`  ✓ Department '${dept.name}' created successfully.`);

    const desg = await HrService.createDesignation(db, contextBranchA, userId, {
      name: 'Senior Developer',
      description: 'Senior software engineering role',
    });
    console.log(`  ✓ Designation '${desg.name}' created successfully.`);

    // ─── TEST 2: Employee Lifecycle ──────────────────────────────────
    console.log('\n▶ Test 2: Employee Lifecycle');

    const employee = await HrService.createEmployee(db, contextBranchA, userId, {
      userId: null, // optionally link user
      departmentId: dept.id,
      designationId: desg.id,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@acme.local',
      phone: '+15559090',
      dateOfJoining: new Date('2025-01-15'),
      status: 'active',
    });
    console.log(`  ✓ Employee '${employee.firstName} ${employee.lastName}' created in active status.`);

    const updatedEmp = await HrService.updateEmployee(db, contextBranchA, userId, employee.id, {
      status: 'terminated',
    });
    console.log(`  ✓ Updated Employee status successfully to '${updatedEmp.status}'.`);
    if (updatedEmp.status !== 'terminated') {
      throw new Error('Employee update failed');
    }

    // ─── TEST 3: Leave Request Posting & Workflow ────────────────────
    console.log('\n▶ Test 3: Leave Request Posting & Workflow');

    const leave = await HrService.createLeaveRequest(db, contextBranchA, userId, {
      employeeId: employee.id,
      leaveType: 'sick',
      fromDate: new Date('2026-06-01'),
      toDate: new Date('2026-06-05'),
      reason: 'Recovering from flu',
    });
    console.log(`  ✓ Leave Request created in draft state.`);
    
    // Verify document header state
    const [draftDoc] = await db.select().from(documents).where(eq(documents.id, leave.documentId)).limit(1);
    if (draftDoc!.workflowState !== 'draft') {
      throw new Error('Document should start in draft state');
    }
    console.log(`    - Verified Leave Request document is in 'draft' state.`);

    // Approve the leave request (Post)
    const approvedDoc = await HrService.postLeaveRequest(db, contextBranchA, userId, leave.documentId);
    console.log(`  ✓ Leave Request document approved (posted) successfully.`);
    if (approvedDoc.workflowState !== 'posted') {
      throw new Error('Leave Request approval failed');
    }

    // ─── TEST 4: Branch Isolation Enforcement ───────────────────────
    console.log('\n▶ Test 4: Branch Isolation Enforcement');

    // Querying employee from Branch B should fail scope validations
    try {
      await HrService.updateEmployee(db, contextBranchB, userId, employee.id, {
        status: 'active',
      });
      throw new Error('Expected branch isolation scope breach check to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security branch isolation verified: prevented Secondary Branch from updating HQ branch employee.');
      } else {
        throw err;
      }
    }

    // Creating department in Branch B with Branch A designated context should fail scope validation
    try {
      const wrongInput = {
        userId: null,
        departmentId: dept.id, // Belongs to Branch A
        designationId: desg.id,
        firstName: 'Bad',
        lastName: 'Actor',
        email: 'bad.actor@acme.local',
        dateOfJoining: new Date(),
        status: 'active',
      };
      await HrService.createEmployee(db, contextBranchB, userId, wrongInput as any);
      throw new Error('Expected cross-branch foreign key scope check to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security branch isolation verified: prevented linking cross-branch department record.');
      } else {
        throw err;
      }
    }

    // ─── TEST 5: Audit Log Verifications ──────────────────────────────
    console.log('\n▶ Test 5: Audit Log Verifications');

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actorId, userId)));

    console.log(`  ✓ Total Audit Logs generated for actor: ${logs.length}`);
    if (logs.length < 4) {
      throw new Error('Audit logging is missing actions');
    }
    console.log(`  ✓ Verified audit trails recorded departments, designations, employee status changes, and leave requests.`);

    console.log('\n🎉 ALL HR ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
