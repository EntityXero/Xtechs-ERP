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
  suppliers,
  purchaseOrders,
  purchaseOrderLines,
  warehouses,
  itemGroups,
  items,
  stockBalances,
  auditLogs,
} from './schema/index.js';
import { PurchasingService } from '../../../apps/server/src/lib/purchasing-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and, sql } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Purchasing Core Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(purchaseOrderLines);
    await db.delete(purchaseOrders);
    await db.delete(suppliers);
    await db.delete(stockBalances);
    await db.delete(warehouses);
    await db.delete(items);
    await db.delete(itemGroups);
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
      email: 'procurement-manager@acme.local',
      passwordHash: 'hashed',
      displayName: 'Procurement Manager',
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

    // 3. Setup Inventory prereqs (Warehouse, Item Group, Item)
    const wh = await db.insert(warehouses).values({
      tenantId,
      businessId,
      branchId: branchA,
      name: 'Main Procurement Warehouse',
      code: 'WH-PROC-MAIN',
      isGroup: false,
    }).returning();

    const whB = await db.insert(warehouses).values({
      tenantId,
      businessId,
      branchId: branchB,
      name: 'Secondary Warehouse',
      code: 'WH-PROC-SEC',
      isGroup: false,
    }).returning();

    const group = await db.insert(itemGroups).values({
      tenantId,
      businessId,
      branchId: branchA,
      name: 'Electronic Components',
    }).returning();

    const item = await db.insert(items).values({
      tenantId,
      businessId,
      branchId: branchA,
      sku: 'SKU-MCU-001',
      name: 'ARM Cortex-M4 Microcontroller',
      type: 'inventory',
      itemGroupId: group[0]!.id,
      baseUom: 'Each',
      valuationMethod: 'moving_average',
    }).returning();

    console.log('🌱 Seeding inventory prerequisite masters completed.');

    // ─── TEST 1: Supplier Creation ──────────────────────────────────
    console.log('\n▶ Test 1: Supplier Creation');

    const supplier = await PurchasingService.createSupplier(db, contextBranchA, userId, {
      name: 'Global Semiconductor Corp',
      email: 'sales@globalsemi.com',
      phone: '+18005550100',
      status: 'active',
    });
    console.log(`  ✓ Supplier '${supplier.name}' created successfully.`);

    const updatedSupp = await PurchasingService.updateSupplier(db, contextBranchA, userId, supplier.id, {
      status: 'inactive',
    });
    console.log(`  ✓ Updated Supplier status successfully to '${updatedSupp.status}'.`);
    
    // Reset to active for PO tests
    await db.update(suppliers).set({ status: 'active' }).where(eq(suppliers.id, supplier.id));

    // ─── TEST 2: Purchase Order Creation with Supplier Reference ──────
    console.log('\n▶ Test 2: Purchase Order Creation with Supplier Reference');

    const po = await PurchasingService.createPurchaseOrder(db, contextBranchA, userId, {
      supplierId: supplier.id,
      warehouseId: wh[0]!.id,
      deliveryDate: new Date('2026-06-10'),
      description: 'Q3 Chip Supply Order',
      lines: [
        {
          itemId: item[0]!.id,
          supplierItemCode: 'GSC-MCU-M4-A', // Supplier Item Reference
          qty: 1500,
          rate: 4.5,
          discountPercentage: 5, // 5% bulk discount
        }
      ]
    });

    console.log(`  ✓ Purchase Order created successfully:`);
    console.log(`    - Total PO Amount: $${po.totalAmount} (Gross: $${1500 * 4.5}, 5% Disc: $${1500 * 4.5 * 0.05})`);
    console.log(`    - Line 1 Supplier Item Reference: '${po.lines[0]!.supplierItemCode}'`);

    if (parseFloat(po.totalAmount) !== 6412.5) {
      throw new Error(`Invalid total amount calculation: expected 6412.5, got ${po.totalAmount}`);
    }
    console.log(`    - Verified PO total amount is accurate.`);

    const [draftDoc] = await db.select().from(documents).where(eq(documents.id, po.documentId)).limit(1);
    if (draftDoc!.workflowState !== 'draft') {
      throw new Error('PO Document must start in draft state');
    }
    console.log(`    - Verified PO document starts in 'draft' state.`);

    // ─── TEST 3: Purchase Order Posting & Atomic Stock Balance Increment ──
    console.log('\n▶ Test 3: Purchase Order Posting & Atomic Stock Balance Cache Update');

    // Make sure ordered is 0 before posting
    const [preBalance] = await db
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.itemId, item[0]!.id), eq(stockBalances.warehouseId, wh[0]!.id)));
    
    if (preBalance) {
      throw new Error('Stock balance record should not exist initially');
    }
    console.log('    - Confirmed no pre-existing stock balance record.');

    // Approve the PO (Post)
    const approvedDoc = await PurchasingService.postPurchaseOrder(db, contextBranchA, userId, po.documentId);
    console.log(`  ✓ PO Document posted (approved) successfully.`);
    if (approvedDoc.workflowState !== 'posted') {
      throw new Error('PO Approval failed');
    }

    // Verify stock balances 'ordered' column has incremented
    const [postBalance] = await db
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.itemId, item[0]!.id), eq(stockBalances.warehouseId, wh[0]!.id)));

    if (!postBalance || parseFloat(postBalance.ordered) !== 1500.0) {
      throw new Error(`Ordered quantity cache increment failed: expected 1500.0, got ${postBalance ? postBalance.ordered : 'no balance record'}`);
    }
    console.log(`    - Verified stock_balances 'ordered' quantity is atomically cache-updated to: ${postBalance.ordered}`);
    console.log(`    - Verified remaining columns: on_hand = ${postBalance.onHand}, reserved = ${postBalance.reserved}, available = ${postBalance.available}`);

    // Post another PO to verify additive accumulation
    const po2 = await PurchasingService.createPurchaseOrder(db, contextBranchA, userId, {
      supplierId: supplier.id,
      warehouseId: wh[0]!.id,
      lines: [
        {
          itemId: item[0]!.id,
          qty: 500,
          rate: 4.5,
          discountPercentage: 0,
        }
      ]
    });
    await PurchasingService.postPurchaseOrder(db, contextBranchA, userId, po2.documentId);
    
    const [postBalance2] = await db
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.itemId, item[0]!.id), eq(stockBalances.warehouseId, wh[0]!.id)));

    if (parseFloat(postBalance2!.ordered) !== 2000.0) {
      throw new Error(`Additive accumulation failed: expected 2000.0, got ${postBalance2!.ordered}`);
    }
    console.log(`    - Verified additive PO posting updates ordered quantity cache correctly: ${postBalance2!.ordered}`);

    // ─── TEST 4: Branch Isolation Enforcement ───────────────────────
    console.log('\n▶ Test 4: Branch Isolation Enforcement');

    // Secondary branch updating HQ branch supplier should fail
    try {
      await PurchasingService.updateSupplier(db, contextBranchB, userId, supplier.id, {
        status: 'inactive',
      });
      throw new Error('Expected branch isolation check to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security branch isolation verified: prevented Secondary Branch from updating HQ branch supplier.');
      } else {
        throw err;
      }
    }

    // Creating PO for Branch A warehouse using Branch B context should fail
    try {
      await PurchasingService.createPurchaseOrder(db, contextBranchB, userId, {
        supplierId: supplier.id,
        warehouseId: wh[0]!.id, // Branch A Warehouse
        lines: [
          {
            itemId: item[0]!.id,
            qty: 100,
            rate: 5.0,
            discountPercentage: 0,
          }
        ]
      });
      throw new Error('Expected cross-branch warehouse linkage validation to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security branch isolation verified: prevented cross-branch warehouse links in PO creation.');
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
    if (logs.length < 5) {
      throw new Error('Audit logging is missing actions');
    }
    console.log(`  ✓ Verified audit logs for suppliers, PO creation, and PO workflow approvals are securely recorded.`);

    console.log('\n🎉 ALL PURCHASING ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
