import { z } from 'zod';

export const ACCOUNT_TYPES = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  REVENUE: 'revenue',
  EXPENSE: 'expense',
} as const;

export const ACCOUNT_TYPE_VALUES = Object.values(ACCOUNT_TYPES);

/**
 * Currency Validation Schema
 */
export const createCurrencySchema = z.object({
  code: z.string().min(1).max(10).toUpperCase(),
  symbol: z.string().min(1).max(10),
  exchangeRate: z.number().positive().default(1),
  isBase: z.boolean().default(false),
});

export const updateCurrencySchema = z.object({
  code: z.string().min(1).max(10).toUpperCase().optional(),
  symbol: z.string().min(1).max(10).optional(),
  exchangeRate: z.number().positive().optional(),
  isBase: z.boolean().optional(),
});

/**
 * Fiscal Year Validation Schema
 */
export const createFiscalYearSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isClosed: z.boolean().default(false),
}).refine((data) => data.startDate < data.endDate, {
  message: "Start date must be before end date",
  path: ["endDate"],
});

export const updateFiscalYearSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isClosed: z.boolean().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate < data.endDate;
  }
  return true;
}, {
  message: "Start date must be before end date",
  path: ["endDate"],
});

/**
 * Account (Chart of Accounts) Validation Schema
 */
export const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(100),
  type: z.enum(ACCOUNT_TYPE_VALUES as [string, ...string[]]),
  parentId: z.string().uuid().optional().nullable(),
  isGroup: z.boolean().default(false),
  currencyId: z.string().uuid(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(100).optional(),
  type: z.enum(ACCOUNT_TYPE_VALUES as [string, ...string[]]).optional(),
  parentId: z.string().uuid().optional().nullable(),
  isGroup: z.boolean().optional(),
  currencyId: z.string().uuid().optional(),
});

/**
 * Journal Entry Line Validation Schema
 */
export const createJournalEntryLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().max(500).optional().nullable(),
  
  // Custom exchange rate parameters override (optional)
  exchangeRate: z.number().positive().optional(),
  exchangeRateDate: z.coerce.date().optional().nullable(),
  exchangeRateSource: z.string().max(255).optional().nullable(),
}).refine((data) => {
  // Ensure that line is not both debit and credit simultaneously
  return !(data.debit > 0 && data.credit > 0);
}, {
  message: "A single line cannot have both debit and credit values",
  path: ["credit"],
}).refine((data) => {
  // Ensure that line has either a debit or credit value
  return data.debit > 0 || data.credit > 0;
}, {
  message: "Line must have either a non-zero debit or credit value",
  path: ["debit"],
});

/**
 * Journal Entry Validation Schema
 */
export const createJournalEntrySchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1).max(1000),
  lines: z.array(createJournalEntryLineSchema).min(2, {
    message: "A journal entry must have at least 2 lines (double-entry)",
  }),
});

export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;
export type CreateFiscalYearInput = z.infer<typeof createFiscalYearSchema>;
export type UpdateFiscalYearInput = z.infer<typeof updateFiscalYearSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateJournalEntryLineInput = z.infer<typeof createJournalEntryLineSchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
