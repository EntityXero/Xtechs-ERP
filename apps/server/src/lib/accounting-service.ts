import { eq, and, sql, inArray, gte, lte } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  currencies,
  fiscalYears,
  accounts,
  journalEntries,
  journalEntryLines,
} from '@xtechs/db/schema';
import {
  createCurrencySchema,
  createFiscalYearSchema,
  createAccountSchema,
  createJournalEntrySchema,
  type CreateCurrencyInput,
  type CreateFiscalYearInput,
  type CreateAccountInput,
  type CreateJournalEntryInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';

export class AccountingService {
  /**
   * Enforce that scope is valid and matched
   */
  private static enforceScope(
    context: Required<ScopeContext>,
    targetScope: { tenantId: string; businessId: string; branchId: string }
  ) {
    if (
      targetScope.tenantId !== context.tenantId ||
      targetScope.businessId !== context.businessId ||
      targetScope.branchId !== context.branchId
    ) {
      throw new ForbiddenError('Branch isolation breach: Resource belongs to another branch');
    }
  }

  // ==========================================
  // CURRENCIES
  // ==========================================

  public static async createCurrency(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateCurrencyInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createCurrencySchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check code duplication in scope
    const existing = await db
      .select()
      .from(currencies)
      .where(
        and(
          eq(currencies.tenantId, tenantId),
          eq(currencies.businessId, businessId),
          eq(currencies.branchId, branchId),
          eq(currencies.code, parsed.code)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Currency with code '${parsed.code}' already exists`);
    }

    const newCurrency = await db.transaction(async (tx) => {
      // If setting this to base, set all other currencies in this branch to not base
      if (parsed.isBase) {
        await tx
          .update(currencies)
          .set({ isBase: false, updatedAt: new Date() })
          .where(
            and(
              eq(currencies.tenantId, tenantId),
              eq(currencies.businessId, businessId),
              eq(currencies.branchId, branchId)
            )
          );
      }

      const [row] = await tx
        .insert(currencies)
        .values({
          tenantId,
          businessId,
          branchId,
          code: parsed.code,
          symbol: parsed.symbol,
          exchangeRate: parsed.exchangeRate.toString(),
          isBase: parsed.isBase,
        })
        .returning();

      return row;
    });

    if (!newCurrency) {
      throw new ValidationError('Failed to create currency');
    }

    await logAudit(db, {
      entityType: 'currency',
      entityId: newCurrency.id,
      action: 'create',
      actorId: userId,
      newValues: { code: newCurrency.code, symbol: newCurrency.symbol, isBase: newCurrency.isBase },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newCurrency;
  }

  public static async getCurrencies(db: Database, context: Required<ScopeContext>) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db
      .select()
      .from(currencies)
      .where(
        and(
          eq(currencies.tenantId, tenantId),
          eq(currencies.businessId, businessId),
          eq(currencies.branchId, branchId)
        )
      );
  }

  // ==========================================
  // FISCAL YEARS
  // ==========================================

  public static async createFiscalYear(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateFiscalYearInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createFiscalYearSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check duplicate name
    const existing = await db
      .select()
      .from(fiscalYears)
      .where(
        and(
          eq(fiscalYears.tenantId, tenantId),
          eq(fiscalYears.businessId, businessId),
          eq(fiscalYears.branchId, branchId),
          eq(fiscalYears.name, parsed.name)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Fiscal year with name '${parsed.name}' already exists`);
    }

    const [newFy] = await db
      .insert(fiscalYears)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        isClosed: parsed.isClosed,
      })
      .returning();

    if (!newFy) {
      throw new ValidationError('Failed to create fiscal year');
    }

    await logAudit(db, {
      entityType: 'fiscal_year',
      entityId: newFy.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newFy.name, startDate: newFy.startDate, endDate: newFy.endDate },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newFy;
  }

  public static async getFiscalYears(db: Database, context: Required<ScopeContext>) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db
      .select()
      .from(fiscalYears)
      .where(
        and(
          eq(fiscalYears.tenantId, tenantId),
          eq(fiscalYears.businessId, businessId),
          eq(fiscalYears.branchId, branchId)
        )
      );
  }

  // ==========================================
  // ACCOUNTS (CHART OF ACCOUNTS)
  // ==========================================

  public static async createAccount(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateAccountInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createAccountSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Validate Account Code uniqueness
    const existingCode = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.businessId, businessId),
          eq(accounts.branchId, branchId),
          eq(accounts.code, parsed.code)
        )
      )
      .limit(1);

    if (existingCode.length > 0) {
      throw new ValidationError(`Account with code '${parsed.code}' already exists`);
    }

    // Validate parent account if specified
    if (parsed.parentId) {
      const [parent] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, parsed.parentId))
        .limit(1);

      if (!parent) {
        throw new NotFoundError('Account', parsed.parentId);
      }
      this.enforceScope(context, parent);

      if (!parent.isGroup) {
        throw new ValidationError(`Parent account must be a group account`);
      }
    }

    // Validate currency
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, parsed.currencyId))
      .limit(1);

    if (!currency) {
      throw new NotFoundError('Currency', parsed.currencyId);
    }
    this.enforceScope(context, currency);

    const [newAccount] = await db
      .insert(accounts)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        code: parsed.code,
        type: parsed.type,
        parentId: parsed.parentId,
        isGroup: parsed.isGroup,
        currencyId: parsed.currencyId,
      })
      .returning();

    if (!newAccount) {
      throw new ValidationError('Failed to create account');
    }

    await logAudit(db, {
      entityType: 'account',
      entityId: newAccount.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newAccount.name, code: newAccount.code, type: newAccount.type },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newAccount;
  }

  public static async getAccounts(db: Database, context: Required<ScopeContext>) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.businessId, businessId),
          eq(accounts.branchId, branchId)
        )
      );
  }

  // ==========================================
  // JOURNAL ENTRIES
  // ==========================================

  public static async createJournalEntry(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateJournalEntryInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createJournalEntrySchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Resolve Base Currency
    const [baseCurrency] = await db
      .select()
      .from(currencies)
      .where(
        and(
          eq(currencies.tenantId, tenantId),
          eq(currencies.businessId, businessId),
          eq(currencies.branchId, branchId),
          eq(currencies.isBase, true)
        )
      )
      .limit(1);

    if (!baseCurrency) {
      throw new ValidationError('Base currency must be configured first');
    }

    return db.transaction(async (tx) => {
      // 2. Fetch and validate all accounts in a single pass
      const accountIds = parsed.lines.map((l) => l.accountId);
      const uniqueAccountIds = [...new Set(accountIds)];

      const fetchedAccounts = await tx
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, tenantId),
            eq(accounts.businessId, businessId),
            eq(accounts.branchId, branchId),
            inArray(accounts.id, uniqueAccountIds)
          )
        );

      if (fetchedAccounts.length !== uniqueAccountIds.length) {
        throw new ValidationError('One or more specified accounts were not found or are out of branch scope');
      }

      const accountMap = new Map(fetchedAccounts.map((a) => [a.id, a]));

      // 3. Fetch active currencies in branch
      const activeCurrencies = await tx
        .select()
        .from(currencies)
        .where(
          and(
            eq(currencies.tenantId, tenantId),
            eq(currencies.businessId, businessId),
            eq(currencies.branchId, branchId)
          )
        );
      const currencyMap = new Map(activeCurrencies.map((c) => [c.id, c]));

      let totalBaseDebit = 0;
      let totalBaseCredit = 0;

      const processedLines: any[] = [];

      // 4. Validate lines, compute base currency values
      for (const line of parsed.lines) {
        const account = accountMap.get(line.accountId)!;

        if (account.isGroup) {
          throw new ValidationError(`Account '${account.name}' is a group account. Postings are only allowed to leaf accounts.`);
        }

        const accountCurrency = currencyMap.get(account.currencyId)!;

        // Exchange Rate Determination
        let rate = 1.0;
        let rateSource = 'base';
        let rateDate = new Date();

        if (account.currencyId !== baseCurrency.id) {
          if (line.exchangeRate) {
            rate = line.exchangeRate;
            rateSource = line.exchangeRateSource || 'manual';
            rateDate = line.exchangeRateDate || new Date();
          } else {
            rate = parseFloat(accountCurrency.exchangeRate);
            rateSource = 'system_default';
            rateDate = accountCurrency.updatedAt;
          }
        }

        const baseDebit = line.debit * rate;
        const baseCredit = line.credit * rate;

        totalBaseDebit += baseDebit;
        totalBaseCredit += baseCredit;

        processedLines.push({
          accountId: line.accountId,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
          baseDebit: baseDebit.toFixed(4),
          baseCredit: baseCredit.toFixed(4),
          exchangeRate: rate.toString(),
          exchangeRateDate: rateDate,
          exchangeRateSource: rateSource,
          description: line.description,
        });
      }

      // Enforce absolute double-entry logic on base currency amounts (up to 4 decimal places)
      const formattedTotalBaseDebit = totalBaseDebit.toFixed(4);
      const formattedTotalBaseCredit = totalBaseCredit.toFixed(4);

      if (formattedTotalBaseDebit !== formattedTotalBaseCredit) {
        throw new ValidationError(
          `Double-entry balance mismatch: Total base debits (${formattedTotalBaseDebit}) must equal total base credits (${formattedTotalBaseCredit})`
        );
      }

      // 5. Insert Journal Entry
      const [entry] = await tx
        .insert(journalEntries)
        .values({
          tenantId,
          businessId,
          branchId,
          date: parsed.date,
          description: parsed.description,
          status: 'draft',
        })
        .returning();

      if (!entry) {
        throw new ValidationError('Failed to create journal entry');
      }

      // 6. Insert Lines
      for (const pl of processedLines) {
        await tx.insert(journalEntryLines).values({
          tenantId,
          businessId,
          branchId,
          entryId: entry.id,
          accountId: pl.accountId,
          debit: pl.debit,
          credit: pl.credit,
          baseDebit: pl.baseDebit,
          baseCredit: pl.baseCredit,
          exchangeRate: pl.exchangeRate,
          exchangeRateDate: pl.exchangeRateDate,
          exchangeRateSource: pl.exchangeRateSource,
          description: pl.description,
        });
      }

      await logAudit(db, {
        entityType: 'journal_entry',
        entityId: entry.id,
        action: 'create',
        actorId: userId,
        newValues: { date: entry.date, description: entry.description, status: entry.status },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return entry;
    });
  }

  public static async getJournalEntries(db: Database, context: Required<ScopeContext>) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.tenantId, tenantId),
          eq(journalEntries.businessId, businessId),
          eq(journalEntries.branchId, branchId)
        )
      );
  }

  public static async getJournalEntryWithLines(
    db: Database,
    context: Required<ScopeContext>,
    entryId: string
  ) {
    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, entryId))
      .limit(1);

    if (!entry) {
      throw new NotFoundError('JournalEntry', entryId);
    }
    this.enforceScope(context, entry);

    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.entryId, entryId));

    return {
      ...entry,
      lines,
    };
  }

  public static async postJournalEntry(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    entryId: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // 1. Fetch journal entry
      const [entry] = await tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entryId))
        .limit(1);

      if (!entry) {
        throw new NotFoundError('JournalEntry', entryId);
      }
      this.enforceScope(context, entry);

      // Check status
      if (entry.status !== 'draft') {
        throw new ValidationError(`Journal entry is already finalized (status: ${entry.status})`);
      }

      // 2. Validate Fiscal Year covers entry date and is open
      const entryDate = new Date(entry.date);

      const [fy] = await tx
        .select()
        .from(fiscalYears)
        .where(
          and(
            eq(fiscalYears.tenantId, tenantId),
            eq(fiscalYears.businessId, businessId),
            eq(fiscalYears.branchId, branchId),
            lte(fiscalYears.startDate, entryDate),
            gte(fiscalYears.endDate, entryDate)
          )
        )
        .limit(1);

      if (!fy) {
        throw new ValidationError(`No fiscal year configured covering date ${entryDate.toDateString()}`);
      }

      if (fy.isClosed) {
        throw new ValidationError(`Fiscal year '${fy.name}' is closed`);
      }

      // 3. Mark posted
      const [updated] = await tx
        .update(journalEntries)
        .set({ status: 'posted', updatedAt: new Date() })
        .where(eq(journalEntries.id, entryId))
        .returning();

      if (!updated) {
        throw new ValidationError('Failed to post journal entry');
      }

      await logAudit(db, {
        entityType: 'journal_entry',
        entityId: entryId,
        action: 'approve', // approves/finalizes the posted state
        actorId: userId,
        oldValues: { status: 'draft' },
        newValues: { status: 'posted' },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return updated;
    });
  }

  public static async reverseJournalEntry(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    entryId: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // 1. Fetch journal entry with lines
      const [entry] = await tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entryId))
        .limit(1);

      if (!entry) {
        throw new NotFoundError('JournalEntry', entryId);
      }
      this.enforceScope(context, entry);

      if (entry.status !== 'posted') {
        throw new ValidationError(`Only posted journal entries can be reversed. Current status: ${entry.status}`);
      }

      // Check current fiscal year is open
      const reversalDate = new Date();
      const [fy] = await tx
        .select()
        .from(fiscalYears)
        .where(
          and(
            eq(fiscalYears.tenantId, tenantId),
            eq(fiscalYears.businessId, businessId),
            eq(fiscalYears.branchId, branchId),
            lte(fiscalYears.startDate, reversalDate),
            gte(fiscalYears.endDate, reversalDate)
          )
        )
        .limit(1);

      if (!fy) {
        throw new ValidationError(`No open fiscal year configured for today's reversal date: ${reversalDate.toDateString()}`);
      }

      if (fy.isClosed) {
        throw new ValidationError(`Fiscal year '${fy.name}' is closed`);
      }

      const lines = await tx
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.entryId, entryId));

      // 2. Insert Reversing Entry
      const [reversalEntry] = await tx
        .insert(journalEntries)
        .values({
          tenantId,
          businessId,
          branchId,
          date: reversalDate,
          description: `REVERSAL of Journal Entry ${entry.id}: ${entry.description}`,
          status: 'posted', // Reversals are immediately posted
          reversalOf: entry.id,
        })
        .returning();

      if (!reversalEntry) {
        throw new ValidationError('Failed to create reversal journal entry');
      }

      // Swapping debits and credits
      for (const line of lines) {
        await tx.insert(journalEntryLines).values({
          tenantId,
          businessId,
          branchId,
          entryId: reversalEntry.id,
          accountId: line.accountId,
          
          debit: line.credit, // SWAP
          credit: line.debit, // SWAP
          baseDebit: line.baseCredit, // SWAP
          baseCredit: line.baseDebit, // SWAP
          
          exchangeRate: line.exchangeRate,
          exchangeRateDate: line.exchangeRateDate,
          exchangeRateSource: line.exchangeRateSource,
          description: `REVERSAL LINE: ${line.description || ''}`,
        });
      }

      // 3. Mark original entry as reversed
      await tx
        .update(journalEntries)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(eq(journalEntries.id, entry.id));

      await logAudit(db, {
        entityType: 'journal_entry',
        entityId: entry.id,
        action: 'transition',
        actorId: userId,
        oldValues: { status: 'posted' },
        newValues: { status: 'reversed' },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      await logAudit(db, {
        entityType: 'journal_entry',
        entityId: reversalEntry.id,
        action: 'create',
        actorId: userId,
        newValues: { status: 'posted', reversalOf: entry.id },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return reversalEntry;
    });
  }

  // ==========================================
  // GENERAL LEDGER & BALANCES (ON-THE-FLY)
  // ==========================================

  public static async getAccountBalance(
    db: Database,
    context: Required<ScopeContext>,
    accountId: string
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Fetch account
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundError('Account', accountId);
    }
    this.enforceScope(context, account);

    // 2. Hierarchical aggregation: if group account, get all leaf children
    const accountIdsToSum: string[] = [accountId];

    if (account.isGroup) {
      const allAccounts = await db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, tenantId),
            eq(accounts.businessId, businessId),
            eq(accounts.branchId, branchId)
          )
        );

      // Build parent-child tree mapping
      const childMap = new Map<string, string[]>();
      for (const acc of allAccounts) {
        if (acc.parentId) {
          const list = childMap.get(acc.parentId) || [];
          list.push(acc.id);
          childMap.set(acc.parentId, list);
        }
      }

      // Recursive helper to traverse hierarchy
      const collectLeafs = (id: string) => {
        const children = childMap.get(id) || [];
        for (const childId of children) {
          const childAccount = allAccounts.find((a) => a.id === childId)!;
          if (!childAccount.isGroup) {
            accountIdsToSum.push(childId);
          } else {
            collectLeafs(childId);
          }
        }
      };

      collectLeafs(accountId);
    }

    // 3. Query posted journal entry lines
    const lines = await db
      .select({
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
        baseDebit: journalEntryLines.baseDebit,
        baseCredit: journalEntryLines.baseCredit,
      })
      .from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
      .where(
        and(
          inArray(journalEntryLines.accountId, accountIdsToSum),
          inArray(journalEntries.status, ['posted', 'reversed'])
        )
      );

    // 4. Sum up values
    let totalDebit = 0;
    let totalCredit = 0;
    let totalBaseDebit = 0;
    let totalBaseCredit = 0;

    for (const line of lines) {
      totalDebit += parseFloat(line.debit);
      totalCredit += parseFloat(line.credit);
      totalBaseDebit += parseFloat(line.baseDebit);
      totalBaseCredit += parseFloat(line.baseCredit);
    }

    const balance = totalDebit - totalCredit;
    const baseBalance = totalBaseDebit - totalBaseCredit;

    return {
      accountId,
      accountName: account.name,
      accountCode: account.code,
      type: account.type,
      isGroup: account.isGroup,
      totalDebit,
      totalCredit,
      balance,
      totalBaseDebit,
      totalBaseCredit,
      baseBalance,
    };
  }
}
