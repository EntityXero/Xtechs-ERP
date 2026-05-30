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
  accounts,
  currencies,
  fiscalYears,
  journalEntries,
  journalEntryLines,
  items,
  itemGroups,
  warehouses,
  stockBalances,
  stockLedger,
  auditLogs,
  reportDefinitions,
  reportExecutions,
  purchaseOrderLines,
  purchaseOrders,
  salesOrderLines,
  salesOrders,
  suppliers,
  customers,
  documents,
} from './schema/index.js';
import { ReportingService } from '../../../apps/server/src/lib/reporting-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and } from 'drizzle-orm';
import { redisConnection } from '../../../apps/server/src/lib/redis.js';
import { queueReportJob } from '../../../apps/server/src/lib/reporting-queue.js';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Advanced Reporting Validation Tests...');

  try {
    // 1. Clean up tables in correct dependency order
    await db.delete(reportExecutions);
    await db.delete(reportDefinitions);
    await db.delete(purchaseOrderLines);
    await db.delete(purchaseOrders);
    await db.delete(salesOrderLines);
    await db.delete(salesOrders);
    await db.delete(journalEntryLines);
    await db.delete(journalEntries);
    await db.delete(accounts);
    await db.delete(fiscalYears);
    await db.delete(currencies);
    await db.delete(stockBalances);
    await db.delete(stockLedger);
    await db.delete(documents);
    await db.delete(warehouses);
    await db.delete(items);
    await db.delete(itemGroups);
    await db.delete(suppliers);
    await db.delete(customers);
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

    await db.insert(tenants).values({ id: tenantId, name: 'Report Tenant', slug: 'report-tenant' });
    await db.insert(businesses).values({ id: businessId, tenantId, name: 'Acme Reporting Inc', legalName: 'Acme Reporting Inc LTD' });
    await db.insert(branches).values({ id: branchA, tenantId, businessId, name: 'HQ', code: 'HQ', isDefault: true });
    await db.insert(branches).values({ id: branchB, tenantId, businessId, name: 'Sub', code: 'SUB', isDefault: false });
    await db.insert(users).values({ id: userId, tenantId, email: 'finance-analyst@acme.local', passwordHash: 'hashed', displayName: 'Finance Analyst' });

    console.log('Seeded base structural entities.');

    const contextHQ = { tenantId, businessId, branchId: branchA };
    const contextSUB = { tenantId, businessId, branchId: branchB };

    // 3. Seed Accounting base data (Currency, Fiscal Year, Accounts)
    const [currency] = await db.insert(currencies).values({ tenantId, businessId, branchId: branchA, code: 'INR', symbol: '₹', exchangeRate: '1.000000', isBase: true }).returning();
    const [fy] = await db.insert(fiscalYears).values({ tenantId, businessId, branchId: branchA, name: 'FY 2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') }).returning();

    const [cashAccount] = await db.insert(accounts).values({ tenantId, businessId, branchId: branchA, name: 'Cash', code: '1000', type: 'asset', currencyId: currency.id }).returning();
    const [salesAccount] = await db.insert(accounts).values({ tenantId, businessId, branchId: branchA, name: 'Product Sales', code: '4000', type: 'revenue', currencyId: currency.id }).returning();

    // 4. Seed Journal Entry (Posted transactions)
    const [entry] = await db.insert(journalEntries).values({
      tenantId,
      businessId,
      branchId: branchA,
      date: new Date('2026-05-15'),
      description: 'Customer Cash Sale',
      status: 'posted',
    }).returning();

    // Double entry: Debit Cash 5000, Credit Sales 5000
    await db.insert(journalEntryLines).values([
      { tenantId, businessId, branchId: branchA, entryId: entry.id, accountId: cashAccount.id, debit: '5000.0000', credit: '0.0000', baseDebit: '5000.0000', baseCredit: '0.0000' },
      { tenantId, businessId, branchId: branchA, entryId: entry.id, accountId: salesAccount.id, debit: '0.0000', credit: '5000.0000', baseDebit: '0.0000', baseCredit: '5000.0000' },
    ]);

    // 5. Seed Inventory base data (Warehouse, Item, Stock Balances)
    const [wh] = await db.insert(warehouses).values({ tenantId, businessId, branchId: branchA, name: 'Main Depot', code: 'WH-MAIN', isGroup: false }).returning();
    const [ig] = await db.insert(itemGroups).values({ tenantId, businessId, branchId: branchA, name: 'Electronics' }).returning();
    const [item] = await db.insert(items).values({ tenantId, businessId, branchId: branchA, sku: 'SKU-001', name: 'MacBook Pro', type: 'inventory', itemGroupId: ig.id, baseUom: 'Each' }).returning();

    await db.insert(stockBalances).values({
      tenantId,
      businessId,
      branchId: branchA,
      itemId: item.id,
      warehouseId: wh.id,
      onHand: '100.0000',
      reserved: '10.0000',
      available: '90.0000',
      ordered: '5.0000',
    });

    // Seed document for Stock Ledger reference
    const [doc] = await db.insert(documents).values({
      tenantId,
      businessId,
      branchId: branchA,
      type: 'stock_entry',
      documentNumber: 'STE-2026-0001',
      status: 'active',
      workflowState: 'posted',
      data: {},
    }).returning();

    await db.insert(stockLedger).values({
      tenantId,
      businessId,
      branchId: branchA,
      itemId: item.id,
      warehouseId: wh.id,
      postingDate: new Date('2026-05-10'),
      qty: '100.0000',
      uom: 'Each',
      valuationRate: '150000.0000',
      totalValue: '15000000.0000',
      documentId: doc.id,
    });

    console.log('Seeded transaction & balance master data.');

    // ─── TEST 1: Standard Reports Execution ─────────────────────────
    console.log('\n▶ Test 1: Standard Reports Execution');

    // Execute Trial Balance
    const trialBalanceResult = await ReportingService.executeStandardReport(db, contextHQ, 'trial_balance', {
      startDate: '2026-04-01',
      endDate: '2026-05-30',
    });

    console.log('  ✓ Trial Balance calculated successfully.');
    const cashRow = trialBalanceResult.rows.find((r: any) => r.accountCode === '1000');
    console.log(`    - Account Cash Debit: ${cashRow?.debit}, Credit: ${cashRow?.credit}, Balance: ${cashRow?.closingBalance}`);
    if (!cashRow || cashRow.closingBalance !== 5000) {
      throw new Error(`Trial Balance Cash aggregation error: expected closing balance 5000, got ${cashRow?.closingBalance}`);
    }

    // Execute Profit and Loss
    const plResult = await ReportingService.executeStandardReport(db, contextHQ, 'profit_and_loss', {
      startDate: '2026-04-01',
    });
    console.log('  ✓ P&L calculated successfully.');
    const salesRow = plResult.rows.find((r: any) => r.accountCode === '4000');
    console.log(`    - Sales Account Net: ${salesRow?.netAmount}`);
    if (!salesRow || salesRow.netAmount !== 5000) {
      throw new Error(`P&L Sales Account aggregation error: expected net amount 5000, got ${salesRow?.netAmount}`);
    }

    // Execute Stock Balance Report
    const stockResult = await ReportingService.executeStandardReport(db, contextHQ, 'stock_balance', {});
    console.log('  ✓ Stock Balance report calculated successfully.');
    const itemRow = stockResult.rows[0];
    console.log(`    - Item: ${itemRow?.itemName}, On Hand: ${itemRow?.onHand}, Reserved: ${itemRow?.reserved}, Available: ${itemRow?.available}, Ordered: ${itemRow?.ordered}`);
    if (!itemRow || parseFloat(itemRow.onHand) !== 100) {
      throw new Error(`Stock Balance error: expected 100, got ${itemRow?.onHand}`);
    }

    // Execute Stock Movement Report
    const movementResult = await ReportingService.executeStandardReport(db, contextHQ, 'stock_movement', {});
    console.log('  ✓ Stock Movement report executed successfully.');
    console.log(`    - Stock Movement Rows count: ${movementResult.rows.length}`);

    // ─── TEST 2: Formatting Exporters ───────────────────────────────
    console.log('\n▶ Test 2: Formatting Exporters (CSV & HTML)');

    const csvContent = ReportingService.convertToCSV(trialBalanceResult.columns, trialBalanceResult.rows);
    console.log('  ✓ CSV Output generated successfully:');
    console.log(csvContent.split('\n')[0]); // print headers
    console.log(csvContent.split('\n')[1]); // print first row

    const htmlContent = ReportingService.convertToHTML('Trial Balance Report', trialBalanceResult.columns, trialBalanceResult.rows);
    console.log('  ✓ Printable HTML generated successfully.');
    if (!htmlContent.includes('Trial Balance Report') || !htmlContent.includes('₹5000.00')) {
      throw new Error('Printable HTML content is missing key values');
    }

    // ─── TEST 3: Metadata-Driven Custom Report definitions & runner ──
    console.log('\n▶ Test 3: Metadata-Driven Custom Report Definitions & Runner');

    const customDef = await ReportingService.createReportDefinition(db, contextHQ, userId, {
      code: 'custom_stock_over_50',
      name: 'Custom Stock Over 50',
      description: 'Stock Balances with quantity on hand over 50 units',
      type: 'custom',
      module: 'inventory',
      queryConfig: {
        tableName: 'stock_balances',
        select: ['itemId', 'onHand', 'available'],
        where: [
          { column: 'onHand', operator: 'gt', value: 50 },
        ],
        limit: 100,
      },
      filtersConfig: [],
      columnsConfig: [
        { name: 'itemId', label: 'Item ID', type: 'text' },
        { name: 'onHand', label: 'On Hand', type: 'number' },
        { name: 'available', label: 'Available', type: 'number' },
      ],
    });

    console.log(`  ✓ Custom Report definition created successfully (code: '${customDef.code}').`);

    const customRows = await ReportingService.executeCustomReport(db, contextHQ, customDef.queryConfig as any, {});
    console.log(`  ✓ Custom Report executed successfully. Found rows: ${customRows.length}`);
    if (customRows.length !== 1 || parseFloat(customRows[0]!.onHand as string) !== 100) {
      throw new Error('Custom Report execution filter gt 50 failed');
    }

    // ─── TEST 4: Branch Isolation Scoping ───────────────────────────
    console.log('\n▶ Test 4: Branch Isolation Scoping');

    // Executing custom report using Sub-Branch context should return 0 rows
    const crossBranchRows = await ReportingService.executeCustomReport(db, contextSUB, customDef.queryConfig as any, {});
    console.log(`  ✓ Branch isolation verified: HQ branch records are invisible to Sub-Branch context (rows returned: ${crossBranchRows.length}).`);
    if (crossBranchRows.length !== 0) {
      throw new Error('Cross branch scoping leak detected!');
    }

    // ─── TEST 5: Asynchronous Queue Scheduling (BullMQ Client/Connection) ──
    console.log('\n▶ Test 5: Asynchronous Queue Connection Verification');

    let redisOnline = false;
    try {
      await Promise.race([
        redisConnection.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
      ]);
      redisOnline = true;
    } catch (e) {
      console.log('  ⚠️ Redis server not running locally. Gracefully skipping background worker queue integration tests.');
    }

    if (redisOnline) {
      // Create Report Execution pending row
      const [exec] = await db
        .insert(reportExecutions)
        .values({
          tenantId,
          businessId,
          branchId: branchA,
          reportDefinitionId: customDef.id,
          status: 'pending',
          filtersApplied: {},
          queryConfig: {},
          filtersConfig: [],
          columnsConfig: [],
        } as any)
        .returning();

      // Enqueue job using BullMQ
      const job = await queueReportJob({
        executionId: exec.id,
        reportCode: customDef.code,
        filters: {},
        context: contextHQ as any,
        outputFormat: 'csv',
      });

      console.log(`  ✓ Successfully enqueued job to BullMQ queue reports: '${job.id}'`);
      console.log(`  ✓ Verified background async queue integration!`);
    }

    console.log('\n🎉 ALL REPORTING ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    // Gracefully shutdown Redis client connection
    await redisConnection.quit();
  }
}

runTests();
