import { pgTable, varchar, uuid, timestamp, boolean, decimal, index, unique } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { documents } from './documents.js';

/**
 * Currencies Table.
 * Supports multi-currency transactions and standard base currency definition.
 */
export const currencies = pgTable('currencies', {
  ...pkColumn(),
  ...tenantColumns(),
  code: varchar('code', { length: 10 }).notNull(), // e.g. 'USD', 'INR'
  symbol: varchar('symbol', { length: 10 }).notNull(), // e.g. '$', '₹'
  exchangeRate: decimal('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1.000000'), // rate relative to base currency
  isBase: boolean('is_base').notNull().default(false),
  ...timestampColumns(),
}, (table) => [
  index('idx_currencies_scope').on(table.tenantId, table.businessId, table.branchId),
  unique('uq_currencies_code').on(table.tenantId, table.businessId, table.branchId, table.code),
]);

/**
 * Fiscal Years Table.
 * Dictates when journal entries can be posted.
 */
export const fiscalYears = pgTable('fiscal_years', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 100 }).notNull(), // e.g. 'FY 2026-27'
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  ...timestampColumns(),
}, (table) => [
  index('idx_fiscal_years_scope').on(table.tenantId, table.businessId, table.branchId),
  unique('uq_fiscal_years_name').on(table.tenantId, table.businessId, table.branchId, table.name),
]);

/**
 * Accounts (Chart of Accounts) Table.
 * Self-referencing tree for asset, liability, equity, revenue, and expense tracking.
 */
export const accounts = pgTable('accounts', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(), // e.g., '1100', '2100'
  type: varchar('type', { length: 50 }).notNull(), // 'asset', 'liability', 'equity', 'revenue', 'expense'
  parentId: uuid('parent_id').references((): AnyPgColumn => accounts.id, { onDelete: 'cascade' }), // Self-reference for hierarchical structure
  isGroup: boolean('is_group').notNull().default(false), // Group accounts cannot receive direct posting, only children
  currencyId: uuid('currency_id').notNull().references(() => currencies.id),
  ...timestampColumns(),
}, (table) => [
  index('idx_accounts_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_accounts_parent').on(table.parentId),
  unique('uq_accounts_code').on(table.tenantId, table.businessId, table.branchId, table.code),
]);

/**
 * Journal Entries Table.
 * Core ledger document containing double-entry records.
 */
export const journalEntries = pgTable('journal_entries', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').references(() => documents.id), // Links to polymorphic Document engine if needed
  date: timestamp('date', { withTimezone: true }).notNull(),
  description: varchar('description', { length: 1000 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('draft'), // 'draft', 'posted', 'reversed'
  reversalOf: uuid('reversal_of').references((): AnyPgColumn => journalEntries.id), // Reference if reversing another posted entry


  ...timestampColumns(),
}, (table) => [
  index('idx_journal_entries_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_journal_entries_date').on(table.date),
  index('idx_journal_entries_status').on(table.status),
]);

/**
 * Journal Entry Lines Table.
 * Individual debit/credit lines. Multi-currency and base currency tracking are both enforced on each line.
 */
export const journalEntryLines = pgTable('journal_entry_lines', {
  ...pkColumn(),
  ...tenantColumns(),
  entryId: uuid('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  
  // Transaction currency values
  debit: decimal('debit', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  credit: decimal('credit', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  
  // Base currency values for unified ledger reporting
  baseDebit: decimal('base_debit', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  baseCredit: decimal('base_credit', { precision: 18, scale: 4 }).notNull().default('0.0000'),
  
  // Exchange rate snapshot at posting time
  exchangeRate: decimal('exchange_rate', { precision: 18, scale: 6 }).notNull().default('1.000000'),
  exchangeRateDate: timestamp('exchange_rate_date', { withTimezone: true }),
  exchangeRateSource: varchar('exchange_rate_source', { length: 255 }),
  
  description: varchar('description', { length: 500 }),
  ...timestampColumns(),
}, (table) => [
  index('idx_journal_entry_lines_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_journal_entry_lines_entry').on(table.entryId),
  index('idx_journal_entry_lines_account').on(table.accountId),
]);
