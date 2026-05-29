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
  batches,
  warehouses,
  stockLedger,
  stockBalances,
  documents,
  auditLogs,
} from './schema/index.js';
import { InventoryService } from '../../../apps/server/src/lib/inventory-service.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Inventory Core Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(stockBalances);
    await db.delete(stockLedger);
    await db.delete(batches);
    await db.delete(itemUoms);
    await db.delete(items);
    await db.delete(itemGroups);
    await db.delete(warehouses);
    await db.delete(documents);
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
      name: 'Acme Logistics Holding',
      slug: 'acme-logistics',
    });

    await db.insert(businesses).values({
      id: businessId,
      tenantId,
      name: 'Acme Supply Chain Corp',
      legalName: 'Acme Supply Chain Corp LTD',
    });

    await db.insert(branches).values({
      id: branchA,
      tenantId,
      businessId,
      name: 'HQ Warehouse Branch',
      code: 'HQ-WH',
      isDefault: true,
    });

    await db.insert(branches).values({
      id: branchB,
      tenantId,
      businessId,
      name: 'Secondary Warehouse Branch',
      code: 'SEC-WH',
      isDefault: false,
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: 'warehouse-manager@acme.local',
      passwordHash: 'hashed',
      displayName: 'Warehouse Manager',
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

    // ─── TEST 1: Warehouse & Hierarchy ─────────────────────────────
    console.log('\n▶ Test 1: Warehouse Hierarchy Management');

    // Create Group Warehouse
    const mainStore = await InventoryService.createWarehouse(db, contextBranchA, userId, {
      name: 'Main Store Group',
      code: 'WH-MAIN',
      isGroup: true,
    });
    console.log(`  ✓ Group Warehouse (WH-MAIN) created successfully with ID: ${mainStore.id}`);

    // Create Leaf Warehouse under Group
    const rawMaterialShelf = await InventoryService.createWarehouse(db, contextBranchA, userId, {
      name: 'Raw Material Shelf A',
      code: 'WH-RMS-A',
      parentId: mainStore.id,
      isGroup: false,
    });
    console.log(`  ✓ Leaf Warehouse (WH-RMS-A) created under main group with ID: ${rawMaterialShelf.id}`);

    // Verify parent constraints
    try {
      await InventoryService.createWarehouse(db, contextBranchA, userId, {
        name: 'Invalid Leaf Child',
        code: 'WH-RMS-B',
        parentId: rawMaterialShelf.id, // Parent is a leaf!
        isGroup: false,
      });
      throw new Error('Expected leaf parent warehouse creation to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Prevented creating child warehouses under leaf (non-group) warehouses.');
      } else {
        throw err;
      }
    }

    // ─── TEST 2: Item Group & Item Creation with Base UOM ────────────
    console.log('\n▶ Test 2: Item Groups & Items with default Base UOM');

    // Create Item Group
    const electronicsGroup = await InventoryService.createItemGroup(db, contextBranchA, userId, {
      name: 'Electronics',
    });
    console.log(`  ✓ Item Group 'Electronics' created successfully.`);

    // Create Item (Default base UOM: 'Each', Moving Average)
    const microchip = await InventoryService.createItem(db, contextBranchA, userId, {
      sku: 'EL-CHIP-001',
      name: 'Acme Microcontroller 001',
      type: 'inventory',
      itemGroupId: electronicsGroup.id,
      baseUom: 'Each',
      valuationMethod: 'moving_average',
    });
    console.log(`  ✓ Inventory Item 'EL-CHIP-001' created successfully.`);

    // Verify automated creation of default Base UOM in itemUoms table with conversion factor 1.0
    const [uomConv] = await db
      .select()
      .from(itemUoms)
      .where(
        and(
          eq(itemUoms.itemId, microchip.id),
          eq(itemUoms.uom, 'Each')
        )
      )
      .limit(1);

    if (!uomConv || parseFloat(uomConv.conversionFactor) !== 1.0) {
      throw new Error('Default base UOM conversion was not created automatically.');
    }
    console.log(`  ✓ Verified automatic default base UOM setup (conversionFactor = 1.0).`);

    // Define secondary UOM: Box of 10
    const boxUom = await InventoryService.createItemUom(
      db,
      contextBranchA,
      userId,
      microchip.id,
      'Box',
      10.0
    );
    console.log(`  ✓ Secondary UOM 'Box' (Conversion: 10.0 Each) registered for Item.`);

    // ─── TEST 3: Batches & Expiry ──────────────────────────────────
    console.log('\n▶ Test 3: Batch and Expiry Capabilities');

    // Create active batch
    const activeBatch = await InventoryService.createBatch(db, contextBranchA, userId, {
      itemId: microchip.id,
      batchNo: 'B-2026-05',
      expiryDate: new Date('2027-12-31T23:59:59Z'),
    });
    console.log(`  ✓ Batch '${activeBatch.batchNo}' created with future expiry date.`);

    // Create expired batch
    const expiredBatch = await InventoryService.createBatch(db, contextBranchA, userId, {
      itemId: microchip.id,
      batchNo: 'B-OLD',
      expiryDate: new Date('2026-01-01T00:00:00Z'),
    });
    console.log(`  ✓ Batch '${expiredBatch.batchNo}' created with past expiry date.`);

    // ─── TEST 4: Stock Receipt & Moving Average Valuation Recalculation ──
    console.log('\n▶ Test 4: Stock Receipt & Moving Average cost recalculation');

    // 1. Initial Receipt: 10 units @ $10.00 each
    const [receiptDoc1] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchA,
        type: 'stock_receipt',
        documentNumber: 'SR-0001',
        status: 'active',
        workflowState: 'draft',
        data: {
          description: 'First stock arrival',
          lines: [
            {
              itemId: microchip.id,
              targetWarehouseId: rawMaterialShelf.id,
              batchId: activeBatch.id,
              qty: 10,
              uom: 'Each',
              conversionFactor: 1,
              valuationRate: 10.0,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await InventoryService.postStockEntry(db, contextBranchA, userId, receiptDoc1.id);
    console.log('  ✓ Posted receipt 1: 10 units @ $10.00 each');

    // Check balance snapshot
    let balance = await InventoryService.getStockBalance(db, contextBranchA, microchip.id, rawMaterialShelf.id, activeBatch.id);
    console.log(`    Current Balance: Qty = ${balance.qty}, ValuationRate = $${balance.valuationRate}, TotalValue = $${balance.totalValue}`);
    if (parseFloat(balance.qty) !== 10.0 || parseFloat(balance.valuationRate) !== 10.0) {
      throw new Error('Initial stock balance setup error');
    }

    // 2. Second Receipt: 5 units @ $16.00 each
    // Moving average cost calculation:
    // Total Qty = 10 + 5 = 15
    // Total Value = (10 * 10) + (5 * 16) = 100 + 80 = $180.00
    // Valuation Rate = 180 / 15 = $12.00 each
    const [receiptDoc2] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchA,
        type: 'stock_receipt',
        documentNumber: 'SR-0002',
        status: 'active',
        workflowState: 'draft',
        data: {
          description: 'Second stock arrival',
          lines: [
            {
              itemId: microchip.id,
              targetWarehouseId: rawMaterialShelf.id,
              batchId: activeBatch.id,
              qty: 5,
              uom: 'Each',
              conversionFactor: 1,
              valuationRate: 16.0,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await InventoryService.postStockEntry(db, contextBranchA, userId, receiptDoc2.id);
    console.log('  ✓ Posted receipt 2: 5 units @ $16.00 each');

    // Verify Moving Average Rate updates to $12.00
    balance = await InventoryService.getStockBalance(db, contextBranchA, microchip.id, rawMaterialShelf.id, activeBatch.id);
    console.log(`    Recalculated Balance: Qty = ${balance.qty}, ValuationRate = $${balance.valuationRate}, TotalValue = $${balance.totalValue}`);
    if (parseFloat(balance.qty) !== 15.0 || parseFloat(balance.valuationRate) !== 12.0 || parseFloat(balance.totalValue) !== 180.0) {
      throw new Error('Moving average cost calculation failed');
    }
    console.log('  ✓ Moving average rate updated accurately to $12.00.');

    // ─── TEST 5: Outward Movement (Stock Issue) & Neg Stock Prevention ──
    console.log('\n▶ Test 5: Stock Issues & Negative Stock Prevention');

    // 1. Trigger Negative Stock Prevention (Attempt to issue 20 units, but only 15 available)
    const [insufficientDoc] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchA,
        type: 'stock_issue',
        documentNumber: 'SI-ERR',
        status: 'active',
        workflowState: 'draft',
        data: {
          description: 'Over-issuing attempt',
          lines: [
            {
              itemId: microchip.id,
              sourceWarehouseId: rawMaterialShelf.id,
              batchId: activeBatch.id,
              qty: 20,
              uom: 'Each',
              conversionFactor: 1,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    try {
      await InventoryService.postStockEntry(db, contextBranchA, userId, insufficientDoc.id);
      throw new Error('Expected negative stock issue to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Successfully blocked issue due to negative stock prevention.');
      } else {
        throw err;
      }
    }

    // 2. Trigger Expired Batch Prevention
    const [expiredIssueDoc] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchA,
        type: 'stock_issue',
        documentNumber: 'SI-EXP',
        status: 'active',
        workflowState: 'draft',
        data: {
          description: 'Issuing expired lot',
          lines: [
            {
              itemId: microchip.id,
              sourceWarehouseId: rawMaterialShelf.id,
              batchId: expiredBatch.id,
              qty: 2,
              uom: 'Each',
              conversionFactor: 1,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    try {
      await InventoryService.postStockEntry(db, contextBranchA, userId, expiredIssueDoc.id);
      throw new Error('Expected expired batch issue to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Successfully blocked issue from expired batch.');
      } else {
        throw err;
      }
    }

    // 3. Valid Issue: Issue 3 units (should be valued at current rate $12.00, total = $36.00)
    const [validIssueDoc] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchA,
        type: 'stock_issue',
        documentNumber: 'SI-0001',
        status: 'active',
        workflowState: 'draft',
        data: {
          description: 'Valid component dispatch',
          lines: [
            {
              itemId: microchip.id,
              sourceWarehouseId: rawMaterialShelf.id,
              batchId: activeBatch.id,
              qty: 3,
              uom: 'Each',
              conversionFactor: 1,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await InventoryService.postStockEntry(db, contextBranchA, userId, validIssueDoc.id);
    console.log('  ✓ Posted valid issue: 3 units');

    // Validate balance decreases to 12 qty, rate remains $12.00, totalValue = $144.00
    balance = await InventoryService.getStockBalance(db, contextBranchA, microchip.id, rawMaterialShelf.id, activeBatch.id);
    console.log(`    Remaining Balance: Qty = ${balance.qty}, ValuationRate = $${balance.valuationRate}, TotalValue = $${balance.totalValue}`);
    if (parseFloat(balance.qty) !== 12.0 || parseFloat(balance.valuationRate) !== 12.0 || parseFloat(balance.totalValue) !== 144.0) {
      throw new Error('Stock issue valuation updates were inaccurate');
    }
    console.log('  ✓ Stock issue correctly preserved moving average rate ($12) and adjusted totals.');

    // ─── TEST 6: Stock Transfer (Cost & Qty Propagation) ─────────────
    console.log('\n▶ Test 6: Stock Transfer Cost Propagation');

    // Create target leaf warehouse in Branch A
    const secondaryShelf = await InventoryService.createWarehouse(db, contextBranchA, userId, {
      name: 'Secondary Shelf B',
      code: 'WH-SEC-B',
      isGroup: false,
    });

    // Transfer 4 units from rawMaterialShelf to secondaryShelf
    // Should issue 4 units from source @ $12.00, and receive 4 units into target @ $12.00.
    const [transferDoc] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchA,
        type: 'stock_transfer',
        documentNumber: 'ST-0001',
        status: 'active',
        workflowState: 'draft',
        data: {
          description: 'Transfer components to production line B',
          lines: [
            {
              itemId: microchip.id,
              sourceWarehouseId: rawMaterialShelf.id,
              targetWarehouseId: secondaryShelf.id,
              batchId: activeBatch.id,
              qty: 4,
              uom: 'Each',
              conversionFactor: 1,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await InventoryService.postStockEntry(db, contextBranchA, userId, transferDoc.id);
    console.log('  ✓ Posted valid stock transfer: 4 units');

    // Verify source decreases to 8 units
    const srcBal = await InventoryService.getStockBalance(db, contextBranchA, microchip.id, rawMaterialShelf.id, activeBatch.id);
    console.log(`    Source Balance: Qty = ${srcBal.qty}, ValuationRate = $${srcBal.valuationRate}, TotalValue = $${srcBal.totalValue}`);
    if (parseFloat(srcBal.qty) !== 8.0) {
      throw new Error('Stock transfer source reduction error');
    }

    // Verify target increases to 4 units at moving rate $12.00
    const tgtBal = await InventoryService.getStockBalance(db, contextBranchA, microchip.id, secondaryShelf.id, activeBatch.id);
    console.log(`    Target Balance: Qty = ${tgtBal.qty}, ValuationRate = $${tgtBal.valuationRate}, TotalValue = $${tgtBal.totalValue}`);
    if (parseFloat(tgtBal.qty) !== 4.0 || parseFloat(tgtBal.valuationRate) !== 12.0) {
      throw new Error('Stock transfer target setup error');
    }
    console.log('  ✓ Transfer cost propagation verified.');

    // ─── TEST 7: Reversals ─────────────────────────────────────────
    console.log('\n▶ Test 7: Inventory Entry Reversals');

    // Reverse the stock issue (SI-0001) that issued 3 units
    // Reversal should return 3 units to rawMaterialShelf, restoring its balance to 11.00 units
    const reversalDoc = await InventoryService.reverseStockEntry(db, contextBranchA, userId, validIssueDoc.id);
    console.log(`  ✓ Reversal document created successfully: ${reversalDoc.documentNumber}`);

    balance = await InventoryService.getStockBalance(db, contextBranchA, microchip.id, rawMaterialShelf.id, activeBatch.id);
    console.log(`    Restored Balance: Qty = ${balance.qty}, ValuationRate = $${balance.valuationRate}, TotalValue = $${balance.totalValue}`);
    if (parseFloat(balance.qty) !== 11.0 || parseFloat(balance.valuationRate) !== 12.0) {
      throw new Error('Reversal did not restore quantity correctly');
    }
    console.log('  ✓ Reversal correctly restored stock quantities and average rate.');

    // ─── TEST 8: Branch Isolation ──────────────────────────────────
    console.log('\n▶ Test 8: Branch Isolation Enforcement');

    // Create a warehouse in Branch B
    const branchBStore = await InventoryService.createWarehouse(db, contextBranchB, userId, {
      name: 'APAC Warehouse Shelf',
      code: 'WH-APAC-01',
      isGroup: false,
    });

    // Attempting to post stock from Branch A's rawMaterialShelf in Branch B context should fail
    const [isolationDoc] = await db
      .insert(documents)
      .values({
        tenantId,
        businessId,
        branchId: branchB, // APAC context
        type: 'stock_receipt',
        documentNumber: 'SR-APAC-ERR',
        status: 'active',
        workflowState: 'draft',
        data: {
          lines: [
            {
              itemId: microchip.id,
              targetWarehouseId: rawMaterialShelf.id, // BELONGS TO BRANCH A
              qty: 5,
              uom: 'Each',
              conversionFactor: 1,
              valuationRate: 10.0,
            },
          ],
        },
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    try {
      await InventoryService.postStockEntry(db, contextBranchB, userId, isolationDoc.id);
      throw new Error('Expected branch isolation cross-posting to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Security branch isolation verified: prevented APAC branch from posting to HQ branch warehouses.');
      } else {
        throw err;
      }
    }

    console.log('\n🎉 ALL INVENTORY ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
