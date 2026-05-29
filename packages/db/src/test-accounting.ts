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
  currencies,
  fiscalYears,
  accounts,
  journalEntries,
  journalEntryLines,
  auditLogs,
} from './schema/index.js';
import { AccountingService } from '../../../apps/server/src/lib/accounting-service.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq } from 'drizzle-orm';


async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Accounting Core Validation Tests...');

  try {
    // 1. Clean up tables in sequence
    await db.delete(journalEntryLines);
    await db.delete(journalEntries);
    await db.delete(accounts);
    await db.delete(fiscalYears);
    await db.delete(currencies);
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
      name: 'Acme Holding',
      slug: 'acme-holding',
    });

    await db.insert(businesses).values({
      id: businessId,
      tenantId,
      name: 'Acme ERP Corp',
      legalName: 'Acme ERP Corp LTD',
    });

    await db.insert(branches).values({
      id: branchA,
      tenantId,
      businessId,
      name: 'HQ Branch',
      code: 'HQ',
      isDefault: true,
    });

    await db.insert(branches).values({
      id: branchB,
      tenantId,
      businessId,
      name: 'APAC Branch',
      code: 'APAC',
      isDefault: false,
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: 'accountant@acme.local',
      passwordHash: 'hashed',
      displayName: 'Lead Accountant',
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

    // ─── TEST 1: Currency Creation & Base Multi-Currency ───────────
    console.log('\n▶ Test 1: Currency Management');

    // Create Base Currency (USD)
    const baseCur = await AccountingService.createCurrency(db, contextBranchA, userId, {
      code: 'USD',
      symbol: '$',
      exchangeRate: 1.0,
      isBase: true,
    });
    console.log(`  ✓ Base Currency (USD) created successfully with ID: ${baseCur.id}`);

    // Create Foreign Currency (EUR) with exchange rate 1.10
    const eurCur = await AccountingService.createCurrency(db, contextBranchA, userId, {
      code: 'EUR',
      symbol: '€',
      exchangeRate: 1.10,
      isBase: false,
    });
    console.log(`  ✓ Foreign Currency (EUR) created successfully with ID: ${eurCur.id}`);

    // Check base currency setting is unique: setting EUR to base should set USD to isBase=false
    const newBase = await AccountingService.createCurrency(db, contextBranchA, userId, {
      code: 'GBP',
      symbol: '£',
      exchangeRate: 1.25,
      isBase: true,
    });
    
    const currenciesList = await AccountingService.getCurrencies(db, contextBranchA);
    const usd = currenciesList.find((c) => c.code === 'USD')!;
    const gbp = currenciesList.find((c) => c.code === 'GBP')!;
    
    if (usd.isBase || !gbp.isBase) {
      throw new Error('Base currency isolation transaction failed to toggle isBase correctly');
    }
    console.log('  ✓ Base currency exclusivity verified: only one currency marked as base.');

    // Reset base back to USD for subsequent double entry testing
    await db.update(currencies).set({ isBase: false }).where(eq(currencies.id, gbp.id));
    await db.update(currencies).set({ isBase: true }).where(eq(currencies.id, baseCur.id));

    // ─── TEST 2: Fiscal Years ─────────────────────────────────────
    console.log('\n▶ Test 2: Fiscal Year Setup');

    const fy = await AccountingService.createFiscalYear(db, contextBranchA, userId, {
      name: 'FY 2026-27',
      startDate: new Date('2026-04-01T00:00:00Z'),
      endDate: new Date('2027-03-31T23:59:59Z'),
      isClosed: false,
    });
    console.log(`  ✓ Fiscal Year '${fy.name}' created successfully.`);

    // ─── TEST 3: Chart of Accounts (CoA) Trees ─────────────────────
    console.log('\n▶ Test 3: Chart of Accounts Hierarchies');

    // Create Assets Group
    const assetsGroup = await AccountingService.createAccount(db, contextBranchA, userId, {
      name: 'Assets',
      code: '1000',
      type: 'asset',
      isGroup: true,
      currencyId: baseCur.id,
    });
    console.log(`  ✓ Group Account 'Assets' (1000) created.`);

    // Create Bank Subgroup under Assets
    const bankGroup = await AccountingService.createAccount(db, contextBranchA, userId, {
      name: 'Cash & Bank',
      code: '1100',
      type: 'asset',
      parentId: assetsGroup.id,
      isGroup: true,
      currencyId: baseCur.id,
    });
    console.log(`  ✓ Group Account 'Cash & Bank' (1100) created under parent.`);

    // Create Leaf USD checking account under Bank Group
    const usdChecking = await AccountingService.createAccount(db, contextBranchA, userId, {
      name: 'USD Checking Account',
      code: '1110',
      type: 'asset',
      parentId: bankGroup.id,
      isGroup: false,
      currencyId: baseCur.id,
    });
    console.log(`  ✓ Leaf Account 'USD Checking Account' (1110) created.`);

    // Create Leaf EUR account under Bank Group
    const eurSavings = await AccountingService.createAccount(db, contextBranchA, userId, {
      name: 'EUR Savings Account',
      code: '1120',
      type: 'asset',
      parentId: bankGroup.id,
      isGroup: false,
      currencyId: eurCur.id,
    });
    console.log(`  ✓ Leaf Account 'EUR Savings Account' (1120) created.`);

    // Create Group Revenue account
    const revenueGroup = await AccountingService.createAccount(db, contextBranchA, userId, {
      name: 'Revenue',
      code: '4000',
      type: 'revenue',
      isGroup: true,
      currencyId: baseCur.id,
    });

    // Create Leaf Sales Account under Revenue
    const salesAcc = await AccountingService.createAccount(db, contextBranchA, userId, {
      name: 'Sales',
      code: '4100',
      type: 'revenue',
      parentId: revenueGroup.id,
      isGroup: false,
      currencyId: baseCur.id,
    });
    console.log(`  ✓ Revenue Tree created successfully.`);

    // Verify parent accounts must be groups
    try {
      await AccountingService.createAccount(db, contextBranchA, userId, {
        name: 'Invalid Leaf Child',
        code: '1111',
        type: 'asset',
        parentId: usdChecking.id, // leaf parent
        isGroup: false,
        currencyId: baseCur.id,
      });
      throw new Error('Expected leaf parent account creation to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Prevented creating child accounts under leaf (non-group) accounts.');
      } else {
        throw err;
      }
    }

    // ─── TEST 4: Double-Entry Validation & Posting ──────────────────
    console.log('\n▶ Test 4: Journal Entry Postings & Double Entry Checks');

    // 1. Success case: Debit USDChecking 110.00, Credit Sales 110.00 (Base currency entry)
    const validJE = await AccountingService.createJournalEntry(db, contextBranchA, userId, {
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Customer sale USD',
      lines: [
        { accountId: usdChecking.id, debit: 110.00, credit: 0 },
        { accountId: salesAcc.id, debit: 0, credit: 110.00 },
      ],
    });
    console.log(`  ✓ Created draft Journal Entry: ${validJE.id}`);

    // Verify draft is retrievable
    const entryWithLines = await AccountingService.getJournalEntryWithLines(db, contextBranchA, validJE.id);
    if (entryWithLines.lines.length !== 2) {
      throw new Error(`Expected 2 lines for journal entry, got ${entryWithLines.lines.length}`);
    }
    console.log('  ✓ Draft journal lines fetched.');

    // 2. Prevent posting to group accounts
    try {
      await AccountingService.createJournalEntry(db, contextBranchA, userId, {
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Post to group account',
        lines: [
          { accountId: bankGroup.id, debit: 100.00, credit: 0 }, // Group account
          { accountId: salesAcc.id, debit: 0, credit: 100.00 },
        ],
      });
      throw new Error('Expected journal entry on group account to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Prevented posting to group accounts.');
      } else {
        throw err;
      }
    }

    // 3. Failure case: Out of balance check (100 Debit vs 90 Credit)
    try {
      await AccountingService.createJournalEntry(db, contextBranchA, userId, {
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Out of balance',
        lines: [
          { accountId: usdChecking.id, debit: 100.00, credit: 0 },
          { accountId: salesAcc.id, debit: 0, credit: 90.00 },
        ],
      });
      throw new Error('Expected out of balance journal entry to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Prevented saving out-of-balance journal entries.');
      } else {
        throw err;
      }
    }

    // 4. Multi-Currency Double-Entry: EUR account debit (debit 100 EUR, rate 1.10 = 110 USD) vs Sales Credit (110 USD)
    const multiCurJE = await AccountingService.createJournalEntry(db, contextBranchA, userId, {
      date: new Date('2026-06-20T10:00:00Z'),
      description: 'Customer sale EUR',
      lines: [
        {
          accountId: eurSavings.id,
          debit: 100.00,
          credit: 0,
          exchangeRate: 1.10,
          exchangeRateSource: 'manual',
        },
        {
          accountId: salesAcc.id,
          debit: 0,
          credit: 110.00,
        },
      ],
    });
    console.log(`  ✓ Created multi-currency Journal Entry (EUR debit = 100, Base debit = 110.00; Sales credit = 110.00)`);

    // Post both JEs
    await AccountingService.postJournalEntry(db, contextBranchA, userId, validJE.id);
    await AccountingService.postJournalEntry(db, contextBranchA, userId, multiCurJE.id);
    console.log('  ✓ Successfully posted both journal entries.');

    // ─── TEST 5: Immutability ─────────────────────────────────────
    console.log('\n▶ Test 5: Immutability of Posted Entries');

    // Attempting to post again should fail
    try {
      await AccountingService.postJournalEntry(db, contextBranchA, userId, validJE.id);
      throw new Error('Expected re-posting of JE to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ValidationError) {
        console.log('  ✓ Prevented editing or reposting posted journal entries.');
      } else {
        throw err;
      }
    }

    // ─── TEST 6: Reversals ────────────────────────────────────────
    console.log('\n▶ Test 6: Reversal Bookkeeping');

    // Reverse first journal entry (Customer sale USD)
    const reversal = await AccountingService.reverseJournalEntry(db, contextBranchA, userId, validJE.id);
    console.log(`  ✓ Successfully created reversal journal entry with ID: ${reversal.id}`);

    // Verify original journal entry is now 'reversed'
    const originalJE = await AccountingService.getJournalEntryWithLines(db, contextBranchA, validJE.id);
    if (originalJE.status !== 'reversed') {
      throw new Error(`Expected original JE status to be 'reversed', got ${originalJE.status}`);
    }
    console.log("  ✓ Original Journal Entry status changed to 'reversed'.");

    // Verify reversal entry lines are swapped
    const reversalLines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.entryId, reversal.id));

    const usdCheckingLine = reversalLines.find((l) => l.accountId === usdChecking.id)!;
    const salesLine = reversalLines.find((l) => l.accountId === salesAcc.id)!;

    if (parseFloat(usdCheckingLine.credit) !== 110.00 || parseFloat(salesLine.debit) !== 110.00) {
      throw new Error('Reversal lines debit/credit swap failed');
    }
    console.log('  ✓ Swapped debit and credit in reversal lines verified.');

    // ─── TEST 7: Hierarchical on-the-fly rollup balance calculation ─
    console.log('\n▶ Test 7: Hierarchical Rollup Balances');

    // Let's compute balances. Let's trace transactions that are posted:
    // JE 1 (Customer sale USD): 110.00 USD Debit, 110.00 Sales Credit. (REVERSED by reversal entry)
    // Reversal of JE 1: 110.00 USD Credit, 110.00 Sales Debit.
    // JE 2 (Customer sale EUR): 100.00 EUR Debit (110.00 Base USD Debit), 110.00 Sales Credit (110.00 Base USD Credit).

    // Active posted balances for USDChecking:
    // JE1 debit: 110.00
    // Reversal credit: 110.00
    // Total balance = 110 - 110 = 0.
    const usdBal = await AccountingService.getAccountBalance(db, contextBranchA, usdChecking.id);
    console.log(`  ✓ USD Checking leaf balance: ${usdBal.balance} USD (Base: ${usdBal.baseBalance})`);
    if (usdBal.balance !== 0) {
      throw new Error(`Expected USD Checking balance to be 0, got ${usdBal.balance}`);
    }

    // Active posted balances for EURSavings:
    // JE 2 debit: 100.00 EUR (Base: 110.00 USD)
    // Total balance = 100 EUR, Base: 110 USD.
    const eurBal = await AccountingService.getAccountBalance(db, contextBranchA, eurSavings.id);
    console.log(`  ✓ EUR Savings leaf balance: ${eurBal.balance} EUR (Base: ${eurBal.baseBalance})`);
    if (eurBal.balance !== 100.00 || eurBal.baseBalance !== 110.00) {
      throw new Error(`Expected EUR Savings to be 100.00 EUR / 110.00 USD, got ${eurBal.balance} EUR / ${eurBal.baseBalance} USD`);
    }

    // Rollup parent check: Cash & Bank Group (1100)
    // Sum of USD Checking (0 Base) + EUR Savings (110.00 Base) = 110.00 Base!
    const bankBal = await AccountingService.getAccountBalance(db, contextBranchA, bankGroup.id);
    console.log(`  ✓ Cash & Bank group rolled up balance: ${bankBal.baseBalance} (Base Currency)`);
    if (bankBal.baseBalance !== 110.00) {
      throw new Error(`Expected Bank Group rollup balance to be 110.00, got ${bankBal.baseBalance}`);
    }

    // Rollup top root check: Assets (1000)
    // Sum = 110.00 Base
    const assetsBal = await AccountingService.getAccountBalance(db, contextBranchA, assetsGroup.id);
    console.log(`  ✓ Total Assets root rolled up balance: ${assetsBal.baseBalance} (Base Currency)`);
    if (assetsBal.baseBalance !== 110.00) {
      throw new Error(`Expected total Assets root balance to be 110.00, got ${assetsBal.baseBalance}`);
    }

    // ─── TEST 8: Branch Isolation ─────────────────────────────────
    console.log('\n▶ Test 8: Branch Isolation Enforcement');

    // Attempting to query Account A from Branch B's context should throw ForbiddenError/NotFoundError
    try {
      await AccountingService.getAccountBalance(db, contextBranchB, usdChecking.id);
      throw new Error('Expected querying Branch A account balance from Branch B to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security isolation verified: cannot query branch A balances from branch B.');
      } else {
        throw err;
      }
    }

    console.log('\n🎉 ALL ACCOUNTING ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
