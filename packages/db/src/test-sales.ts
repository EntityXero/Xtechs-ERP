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
  itemGroups,
  items,
  itemUoms,
  warehouses,
  stockBalances,
  stockLedger,
  documents,
  customers,
  quotations,
  quotationLines,
  salesOrders,
  salesOrderLines,
  auditLogs,
} from './schema/index.js';
import { SalesService } from '../../../apps/server/src/lib/sales-service.js';
import { CrmService } from '../../../apps/server/src/lib/crm-service.js';
import { InventoryService } from '../../../apps/server/src/lib/inventory-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and, sql } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Sales & Reservation Core Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(salesOrderLines);
    await db.delete(salesOrders);
    await db.delete(quotationLines);
    await db.delete(quotations);
    await db.delete(stockBalances);
    await db.delete(stockLedger);
    await db.delete(itemUoms);
    await db.delete(items);
    await db.delete(itemGroups);
    await db.delete(warehouses);
    await db.delete(documents);
    await db.delete(customers);
    await db.delete(auditLogs);
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
      name: 'Acme Sales Holding',
      slug: 'acme-sales',
    });

    await db.insert(businesses).values({
      id: businessId,
      tenantId,
      name: 'Acme Commerce Corp',
      legalName: 'Acme Commerce Corp LTD',
    });

    await db.insert(branches).values({
      id: branchA,
      tenantId,
      businessId,
      name: 'HQ Commerce Branch',
      code: 'HQ-CM',
      isDefault: true,
    });

    await db.insert(branches).values({
      id: branchB,
      tenantId,
      businessId,
      name: 'Secondary Commerce Branch',
      code: 'SEC-CM',
      isDefault: false,
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: 'commerce-manager@acme.local',
      passwordHash: 'hashed',
      displayName: 'Commerce Manager',
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

    // Pre-requisites setup
    const customer = await CrmService.createCustomer(db, contextBranchA, userId, {
      name: 'Alpha Systems Inc',
      email: 'alpha@systems.com',
      phone: '+15559876',
    });

    const warehouse = await InventoryService.createWarehouse(db, contextBranchA, userId, {
      name: 'Commerce Warehouse Shelf',
      code: 'WH-COMM-A',
      isGroup: false,
    });

    const itemGroup = await InventoryService.createItemGroup(db, contextBranchA, userId, {
      name: 'Hardware Components',
    });

    const item = await InventoryService.createItem(db, contextBranchA, userId, {
      sku: 'HW-MEM-002',
      name: 'High Density Memory Module',
      type: 'inventory',
      itemGroupId: itemGroup.id,
      baseUom: 'Each',
      valuationMethod: 'moving_average',
    });

    // Seed stock balances directly: onHand = 20, reserved = 0, available = 20
    await db.insert(stockBalances).values({
      tenantId,
      businessId,
      branchId: branchA,
      itemId: item.id,
      warehouseId: warehouse.id,
      batchId: null,
      onHand: '20.0000',
      reserved: '0.0000',
      available: '20.0000',
      valuationRate: '10.0000',
      totalValue: '200.0000',
    });

    console.log('📦 Pre-requisite Customer, Item, Warehouse, and Stock Balances seeded (20 units onHand, 20 units available).');

    // ─── TEST 1: Pricing Calculation & Quotation Creation ──────────────
    console.log('\n▶ Test 1: Pricing Calculation & Quotation Creation');

    const quotation = await SalesService.createQuotation(db, contextBranchA, userId, {
      customerId: customer.id,
      lines: [
        {
          itemId: item.id,
          qty: 5,
          rate: 10.0,
          discountPercentage: 10.0, // 10% discount on 5 units @ $10 = $45
        },
      ],
      description: 'Quotation with manual discount',
    });

    console.log(`  ✓ Quotation created successfully. Quotation Total Amount: $${quotation.totalAmount}`);
    if (parseFloat(quotation.totalAmount) !== 45.0) {
      throw new Error(`Quotation price calculation error: Expected $45.00, got $${quotation.totalAmount}`);
    }
    console.log(`  ✓ Verified manual pricing & simple 10% discount calculation correctly yields $45.00.`);

    // Post Quotation
    const docObj = await db.select().from(documents).where(eq(documents.id, quotation.documentId)).limit(1);
    const postedDoc = await SalesService.postQuotation(db, contextBranchA, userId, docObj[0]!.id);
    console.log(`  ✓ Quotation posted successfully. Status is now '${postedDoc.workflowState}'.`);

    // ─── TEST 2: Sales Order & Atomic Stock Reservation ────────────────
    console.log('\n▶ Test 2: Sales Order & Atomic Stock Reservation');

    const salesOrder = await SalesService.createSalesOrder(db, contextBranchA, userId, {
      customerId: customer.id,
      quotationId: quotation.id,
      warehouseId: warehouse.id,
      lines: [
        {
          itemId: item.id,
          qty: 3,
          rate: 15.0,
          discountPercentage: 0, // 3 units @ $15 = $45
        },
      ],
      description: 'Reservation Sales Order',
    });

    console.log(`  ✓ Draft Sales Order created successfully for ${salesOrder.lines[0]!.qty} units.`);

    // Post Sales Order -> commits stock reservation!
    const orderDoc = await db.select().from(documents).where(eq(documents.id, salesOrder.documentId)).limit(1);
    await SalesService.postSalesOrder(db, contextBranchA, userId, orderDoc[0]!.id);
    console.log(`  ✓ Sales Order posted and approved successfully.`);

    // Verify stock balance snapshot updates: onHand = 20, reserved = 3, available = 17
    const [balance] = await db
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.itemId, item.id),
          eq(stockBalances.warehouseId, warehouse.id),
          sql`${stockBalances.batchId} IS NULL`
        )
      )
      .limit(1);

    console.log(`    Current Stock Balance:`);
    console.log(`      - Physical On Hand: ${balance!.onHand}`);
    console.log(`      - Reserved stock  : ${balance!.reserved}`);
    console.log(`      - Available stock : ${balance!.available}`);

    if (
      parseFloat(balance!.onHand) !== 20.0 ||
      parseFloat(balance!.reserved) !== 3.0 ||
      parseFloat(balance!.available) !== 17.0
    ) {
      throw new Error('Stock reservation cache updates failed');
    }
    console.log(`  ✓ Verified reservation cache values updated: 3 units reserved, 17 units available, 20 units on-hand.`);

    // ─── TEST 3: Negative Stock Reservation Prevention ─────────────────
    console.log('\n▶ Test 3: Negative Stock Reservation Prevention');

    // Create a sales order requesting 18 units (available is only 17)
    const overdraftOrder = await SalesService.createSalesOrder(db, contextBranchA, userId, {
      customerId: customer.id,
      warehouseId: warehouse.id,
      lines: [
        {
          itemId: item.id,
          qty: 18,
          rate: 10.0,
        },
      ],
      description: 'Over-reservation attempt',
    });

    const overdraftDoc = await db.select().from(documents).where(eq(documents.id, overdraftOrder.documentId)).limit(1);

    try {
      await SalesService.postSalesOrder(db, contextBranchA, userId, overdraftDoc[0]!.id);
      throw new Error('Expected overdraft sales order posting to fail due to negative stock prevention, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Successfully blocked Sales Order posting due to insufficient available stock reservation prevention.');
      } else {
        throw err;
      }
    }

    // ─── TEST 4: Branch Isolation ──────────────────────────────────
    console.log('\n▶ Test 4: Branch Isolation Enforcement');

    // Attempting to post Sales Order under Branch B context should fail
    try {
      await SalesService.postSalesOrder(db, contextBranchB, userId, orderDoc[0]!.id);
      throw new Error('Expected branch isolation cross-posting check to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security branch isolation verified: prevented Secondary Commerce branch from posting HQ branch orders.');
      } else {
        throw err;
      }
    }

    console.log('\n🎉 ALL SALES & RESERVATION CORE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
