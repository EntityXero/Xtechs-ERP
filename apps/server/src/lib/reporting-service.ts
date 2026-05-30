import { eq, and, gt, gte, lt, lte, ne, like, inArray, sql } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import * as schemas from '@xtechs/db/schema';
import {
  createReportDefinitionSchema,
  updateReportDefinitionSchema,
  executeReportRequestSchema,
  type CreateReportDefinitionInput,
  type UpdateReportDefinitionInput,
  type ExecuteReportRequestInput,
  type QueryConfig,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map of allowed reporting tables to prevent direct querying of system/users/roles tables
const ALLOWED_TABLES: Record<string, any> = {
  journal_entry_lines: schemas.journalEntryLines,
  stock_balances: schemas.stockBalances,
  employees: schemas.employees,
  customers: schemas.customers,
  suppliers: schemas.suppliers,
  audit_logs: schemas.auditLogs,
  sales_orders: schemas.salesOrders,
  purchase_orders: schemas.purchaseOrders,
};

export class ReportingService {
  /**
   * Create a new metadata-driven custom report definition.
   */
  public static async createReportDefinition(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateReportDefinitionInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createReportDefinitionSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newDef] = await db
      .insert(schemas.reportDefinitions)
      .values({
        tenantId,
        businessId,
        branchId,
        code: parsed.code,
        name: parsed.name,
        description: parsed.description,
        type: parsed.type,
        module: parsed.module,
        queryConfig: parsed.queryConfig,
        filtersConfig: parsed.filtersConfig,
        columnsConfig: parsed.columnsConfig,
      })
      .returning();

    if (!newDef) {
      throw new ValidationError('Failed to create report definition');
    }

    await logAudit(db, {
      entityType: 'report_definition',
      entityId: newDef.id,
      action: 'create',
      actorId: userId,
      newValues: { code: newDef.code, name: newDef.name },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newDef;
  }

  /**
   * List all report definitions (including out-of-the-box standard reports and custom definitions).
   */
  public static async listReportDefinitions(
    db: Database,
    context: Required<ScopeContext>
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Find all custom definitions for this branch
    const customDefs = await db
      .select()
      .from(schemas.reportDefinitions)
      .where(
        and(
          eq(schemas.reportDefinitions.tenantId, tenantId),
          eq(schemas.reportDefinitions.businessId, businessId),
          eq(schemas.reportDefinitions.branchId, branchId)
        )
      );

    return customDefs;
  }

  /**
   * Execute lightweight metadata-driven custom reports synchronously.
   */
  public static async executeCustomReport(
    db: Database,
    context: Required<ScopeContext>,
    queryConfig: QueryConfig,
    filters: Record<string, any>
  ) {
    const table = ALLOWED_TABLES[queryConfig.tableName];
    if (!table) {
      throw new ValidationError(`Restricted or invalid table name: '${queryConfig.tableName}'`);
    }

    // Initialize conditions with branch isolation columns
    const conditions = [
      eq(table.tenantId, context.tenantId),
      eq(table.businessId, context.businessId),
      eq(table.branchId, context.branchId),
    ];

    // Build select object dynamically based on allowed fields on table definition
    const selectObj: Record<string, any> = {};
    for (const field of queryConfig.select) {
      const col = (table as any)[field];
      if (!col) {
        throw new ValidationError(`Invalid column '${field}' on table '${queryConfig.tableName}'`);
      }
      selectObj[field] = col;
    }

    // Apply where filters
    for (const cond of queryConfig.where || []) {
      const col = (table as any)[cond.column];
      if (!col) continue;

      let value = cond.value;
      // If filter specifies dynamic mapping, override with execution filters
      if (typeof cond.value === 'string' && cond.value.startsWith('filter.')) {
        const filterKey = cond.value.replace('filter.', '');
        value = filters[filterKey] !== undefined ? filters[filterKey] : null;
      }

      if (value === null || value === undefined) {
        continue; // Skip if dynamic filter has no value passed
      }

      switch (cond.operator) {
        case 'eq':
          conditions.push(eq(col, value));
          break;
        case 'neq':
          conditions.push(ne(col, value));
          break;
        case 'gt':
          conditions.push(gt(col, value));
          break;
        case 'gte':
          conditions.push(gte(col, value));
          break;
        case 'lt':
          conditions.push(lt(col, value));
          break;
        case 'lte':
          conditions.push(lte(col, value));
          break;
        case 'like':
          conditions.push(like(col, `%${value}%`));
          break;
        case 'in':
          if (Array.isArray(value)) {
            conditions.push(inArray(col, value));
          }
          break;
      }
    }

    // Compile dynamic Drizzle query
    let baseQuery = db.select(selectObj).from(table).where(and(...conditions));

    // Limit if specified
    if (queryConfig.limit) {
      baseQuery = (baseQuery as any).limit(queryConfig.limit);
    }

    const rows = await baseQuery;
    return rows;
  }

  /**
   * Execute lightweight out-of-the-box standard reports synchronously.
   */
  public static async executeStandardReport(
    db: Database,
    context: Required<ScopeContext>,
    reportCode: string,
    filters: Record<string, any>
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    switch (reportCode) {
      case 'trial_balance': {
        const start = filters['startDate'] ? new Date(filters['startDate']) : null;
        const end = filters['endDate'] ? new Date(filters['endDate']) : null;

        // Query all accounts
        const allAccounts = await db
          .select()
          .from(schemas.accounts)
          .where(
            and(
              eq(schemas.accounts.tenantId, tenantId),
              eq(schemas.accounts.businessId, businessId),
              eq(schemas.accounts.branchId, branchId)
            )
          );

        // Fetch posted transaction lines in date range
        const baseConditions = [
          eq(schemas.journalEntries.status, 'posted'),
          eq(schemas.journalEntryLines.tenantId, tenantId),
          eq(schemas.journalEntryLines.businessId, businessId),
          eq(schemas.journalEntryLines.branchId, branchId),
        ];

        if (end) {
          baseConditions.push(lte(schemas.journalEntries.date, end));
        }

        const lines = await db
          .select({
            accountId: schemas.journalEntryLines.accountId,
            date: schemas.journalEntries.date,
            debit: schemas.journalEntryLines.baseDebit,
            credit: schemas.journalEntryLines.baseCredit,
          })
          .from(schemas.journalEntryLines)
          .innerJoin(
            schemas.journalEntries,
            eq(schemas.journalEntryLines.entryId, schemas.journalEntries.id)
          )
          .where(and(...baseConditions));

        // Group rows by account
        const reportData = allAccounts.map(account => {
          let opening = 0;
          let periodDebit = 0;
          let periodCredit = 0;

          for (const line of lines) {
            if (line.accountId === account.id) {
              const val = parseFloat(line.debit) - parseFloat(line.credit);
              if (start && new Date(line.date) < start) {
                opening += val;
              } else {
                periodDebit += parseFloat(line.debit);
                periodCredit += parseFloat(line.credit);
              }
            }
          }

          const closing = opening + periodDebit - periodCredit;

          return {
            accountCode: account.code,
            accountName: account.name,
            accountType: account.type,
            openingBalance: opening,
            debit: periodDebit,
            credit: periodCredit,
            closingBalance: closing,
          };
        });

        return {
          columns: [
            { name: 'accountCode', label: 'Code', type: 'text' },
            { name: 'accountName', label: 'Account Name', type: 'text' },
            { name: 'accountType', label: 'Type', type: 'text' },
            { name: 'openingBalance', label: 'Opening Balance', type: 'currency' },
            { name: 'debit', label: 'Debit', type: 'currency' },
            { name: 'credit', label: 'Credit', type: 'currency' },
            { name: 'closingBalance', label: 'Closing Balance', type: 'currency' },
          ],
          rows: reportData,
        };
      }

      case 'profit_and_loss': {
        const start = filters['startDate'] ? new Date(filters['startDate']) : null;
        const end = filters['endDate'] ? new Date(filters['endDate']) : null;

        // Rev/Exp Accounts only
        const targetAccounts = await db
          .select()
          .from(schemas.accounts)
          .where(
            and(
              eq(schemas.accounts.tenantId, tenantId),
              eq(schemas.accounts.businessId, businessId),
              eq(schemas.accounts.branchId, branchId),
              inArray(schemas.accounts.type, ['revenue', 'expense'])
            )
          );

        const conditions = [
          eq(schemas.journalEntries.status, 'posted'),
          eq(schemas.journalEntryLines.tenantId, tenantId),
          eq(schemas.journalEntryLines.businessId, businessId),
          eq(schemas.journalEntryLines.branchId, branchId),
        ];

        if (start) conditions.push(gte(schemas.journalEntries.date, start));
        if (end) conditions.push(lte(schemas.journalEntries.date, end));

        const lines = await db
          .select({
            accountId: schemas.journalEntryLines.accountId,
            debit: schemas.journalEntryLines.baseDebit,
            credit: schemas.journalEntryLines.baseCredit,
          })
          .from(schemas.journalEntryLines)
          .innerJoin(
            schemas.journalEntries,
            eq(schemas.journalEntryLines.entryId, schemas.journalEntries.id)
          )
          .where(and(...conditions));

        const reportData = targetAccounts.map(account => {
          let sum = 0;
          for (const line of lines) {
            if (line.accountId === account.id) {
              const debit = parseFloat(line.debit);
              const credit = parseFloat(line.credit);
              if (account.type === 'revenue') {
                sum += (credit - debit); // Revenue is Credit Normal
              } else {
                sum += (debit - credit); // Expense is Debit Normal
              }
            }
          }

          return {
            accountCode: account.code,
            accountName: account.name,
            accountType: account.type,
            netAmount: sum,
          };
        });

        return {
          columns: [
            { name: 'accountCode', label: 'Code', type: 'text' },
            { name: 'accountName', label: 'Account Name', type: 'text' },
            { name: 'accountType', label: 'Type', type: 'text' },
            { name: 'netAmount', label: 'Net Amount', type: 'currency' },
          ],
          rows: reportData,
        };
      }

      case 'balance_sheet': {
        const end = filters['endDate'] ? new Date(filters['endDate']) : null;

        // Asset/Liab/Eq Accounts only
        const targetAccounts = await db
          .select()
          .from(schemas.accounts)
          .where(
            and(
              eq(schemas.accounts.tenantId, tenantId),
              eq(schemas.accounts.businessId, businessId),
              eq(schemas.accounts.branchId, branchId),
              inArray(schemas.accounts.type, ['asset', 'liability', 'equity'])
            )
          );

        const conditions = [
          eq(schemas.journalEntries.status, 'posted'),
          eq(schemas.journalEntryLines.tenantId, tenantId),
          eq(schemas.journalEntryLines.businessId, businessId),
          eq(schemas.journalEntryLines.branchId, branchId),
        ];

        if (end) conditions.push(lte(schemas.journalEntries.date, end));

        const lines = await db
          .select({
            accountId: schemas.journalEntryLines.accountId,
            debit: schemas.journalEntryLines.baseDebit,
            credit: schemas.journalEntryLines.baseCredit,
          })
          .from(schemas.journalEntryLines)
          .innerJoin(
            schemas.journalEntries,
            eq(schemas.journalEntryLines.entryId, schemas.journalEntries.id)
          )
          .where(and(...conditions));

        const reportData = targetAccounts.map(account => {
          let balance = 0;
          for (const line of lines) {
            if (line.accountId === account.id) {
              const debit = parseFloat(line.debit);
              const credit = parseFloat(line.credit);
              if (account.type === 'asset') {
                balance += (debit - credit); // Asset is Debit Normal
              } else {
                balance += (credit - debit); // Liab/Eq is Credit Normal
              }
            }
          }

          return {
            accountCode: account.code,
            accountName: account.name,
            accountType: account.type,
            balance: balance,
          };
        });

        return {
          columns: [
            { name: 'accountCode', label: 'Code', type: 'text' },
            { name: 'accountName', label: 'Account Name', type: 'text' },
            { name: 'accountType', label: 'Type', type: 'text' },
            { name: 'balance', label: 'Balance', type: 'currency' },
          ],
          rows: reportData,
        };
      }

      case 'stock_balance': {
        const rows = await db
          .select({
            itemName: schemas.items.name,
            itemCode: schemas.items.sku, // Changed from code to sku
            warehouseName: schemas.warehouses.name,
            onHand: schemas.stockBalances.onHand,
            reserved: schemas.stockBalances.reserved,
            available: schemas.stockBalances.available,
            ordered: schemas.stockBalances.ordered,
          })
          .from(schemas.stockBalances)
          .innerJoin(schemas.items, eq(schemas.stockBalances.itemId, schemas.items.id))
          .innerJoin(schemas.warehouses, eq(schemas.stockBalances.warehouseId, schemas.warehouses.id))
          .where(
            and(
              eq(schemas.stockBalances.tenantId, tenantId),
              eq(schemas.stockBalances.businessId, businessId),
              eq(schemas.stockBalances.branchId, branchId)
            )
          );

        return {
          columns: [
            { name: 'itemCode', label: 'Item Code', type: 'text' },
            { name: 'itemName', label: 'Item Name', type: 'text' },
            { name: 'warehouseName', label: 'Warehouse', type: 'text' },
            { name: 'onHand', label: 'On Hand', type: 'number' },
            { name: 'reserved', label: 'Reserved', type: 'number' },
            { name: 'available', label: 'Available', type: 'number' },
            { name: 'ordered', label: 'Ordered', type: 'number' },
          ],
          rows,
        };
      }

      case 'general_ledger': {
        const rows = await db
          .select({
            date: schemas.journalEntries.date,
            description: schemas.journalEntries.description,
            accountCode: schemas.accounts.code,
            accountName: schemas.accounts.name,
            debit: schemas.journalEntryLines.baseDebit,
            credit: schemas.journalEntryLines.baseCredit,
          })
          .from(schemas.journalEntryLines)
          .innerJoin(schemas.journalEntries, eq(schemas.journalEntryLines.entryId, schemas.journalEntries.id))
          .innerJoin(schemas.accounts, eq(schemas.journalEntryLines.accountId, schemas.accounts.id))
          .where(
            and(
              eq(schemas.journalEntries.status, 'posted'),
              eq(schemas.journalEntryLines.tenantId, tenantId),
              eq(schemas.journalEntryLines.businessId, businessId),
              eq(schemas.journalEntryLines.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.journalEntries.date} DESC`);

        return {
          columns: [
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'accountCode', label: 'Account Code', type: 'text' },
            { name: 'accountName', label: 'Account Name', type: 'text' },
            { name: 'debit', label: 'Debit', type: 'currency' },
            { name: 'credit', label: 'Credit', type: 'currency' },
            { name: 'description', label: 'Description', type: 'text' },
          ],
          rows,
        };
      }

      case 'account_ledger': {
        const targetAccountId = filters['accountId'];
        if (!targetAccountId) {
          throw new ValidationError("Parameter 'accountId' is required for Account Ledger report");
        }

        const rows = await db
          .select({
            date: schemas.journalEntries.date,
            description: schemas.journalEntries.description,
            debit: schemas.journalEntryLines.baseDebit,
            credit: schemas.journalEntryLines.baseCredit,
          })
          .from(schemas.journalEntryLines)
          .innerJoin(schemas.journalEntries, eq(schemas.journalEntryLines.entryId, schemas.journalEntries.id))
          .where(
            and(
              eq(schemas.journalEntries.status, 'posted'),
              eq(schemas.journalEntryLines.accountId, targetAccountId),
              eq(schemas.journalEntryLines.tenantId, tenantId),
              eq(schemas.journalEntryLines.businessId, businessId),
              eq(schemas.journalEntryLines.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.journalEntries.date} DESC`);

        return {
          columns: [
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'debit', label: 'Debit', type: 'currency' },
            { name: 'credit', label: 'Credit', type: 'currency' },
            { name: 'description', label: 'Description', type: 'text' },
          ],
          rows,
        };
      }

      case 'journal_register': {
        const rows = await db
          .select({
            date: schemas.journalEntries.date,
            description: schemas.journalEntries.description,
            status: schemas.journalEntries.status,
          })
          .from(schemas.journalEntries)
          .where(
            and(
              eq(schemas.journalEntries.tenantId, tenantId),
              eq(schemas.journalEntries.businessId, businessId),
              eq(schemas.journalEntries.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.journalEntries.date} DESC`);

        return {
          columns: [
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'status', label: 'Status', type: 'text' },
            { name: 'description', label: 'Description', type: 'text' },
          ],
          rows,
        };
      }

      case 'sales_register': {
        const rows = await db
          .select({
            orderId: schemas.salesOrders.id,
            customerName: schemas.customers.name,
            warehouseName: schemas.warehouses.name,
            totalAmount: schemas.salesOrders.totalAmount,
            deliveryDate: schemas.salesOrders.deliveryDate,
            createdAt: schemas.salesOrders.createdAt,
          })
          .from(schemas.salesOrders)
          .innerJoin(schemas.customers, eq(schemas.salesOrders.customerId, schemas.customers.id))
          .innerJoin(schemas.warehouses, eq(schemas.salesOrders.warehouseId, schemas.warehouses.id))
          .where(
            and(
              eq(schemas.salesOrders.tenantId, tenantId),
              eq(schemas.salesOrders.businessId, businessId),
              eq(schemas.salesOrders.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.salesOrders.createdAt} DESC`);

        return {
          columns: [
            { name: 'createdAt', label: 'Date Created', type: 'date' },
            { name: 'customerName', label: 'Customer', type: 'text' },
            { name: 'warehouseName', label: 'Warehouse', type: 'text' },
            { name: 'deliveryDate', label: 'Delivery Date', type: 'date' },
            { name: 'totalAmount', label: 'Total Amount', type: 'currency' },
          ],
          rows,
        };
      }

      case 'purchase_register': {
        const rows = await db
          .select({
            orderId: schemas.purchaseOrders.id,
            supplierName: schemas.suppliers.name,
            warehouseName: schemas.warehouses.name,
            totalAmount: schemas.purchaseOrders.totalAmount,
            deliveryDate: schemas.purchaseOrders.deliveryDate,
            createdAt: schemas.purchaseOrders.createdAt,
          })
          .from(schemas.purchaseOrders)
          .innerJoin(schemas.suppliers, eq(schemas.purchaseOrders.supplierId, schemas.suppliers.id))
          .innerJoin(schemas.warehouses, eq(schemas.purchaseOrders.warehouseId, schemas.warehouses.id))
          .where(
            and(
              eq(schemas.purchaseOrders.tenantId, tenantId),
              eq(schemas.purchaseOrders.businessId, businessId),
              eq(schemas.purchaseOrders.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.purchaseOrders.createdAt} DESC`);

        return {
          columns: [
            { name: 'createdAt', label: 'Date Created', type: 'date' },
            { name: 'supplierName', label: 'Supplier', type: 'text' },
            { name: 'warehouseName', label: 'Warehouse', type: 'text' },
            { name: 'deliveryDate', label: 'Delivery Date', type: 'date' },
            { name: 'totalAmount', label: 'Total Amount', type: 'currency' },
          ],
          rows,
        };
      }

      case 'customer_outstanding': {
        // Lightweight Customer outstanding based on Sales Order amounts
        const rows = await db
          .select({
            customerName: schemas.customers.name,
            email: schemas.customers.email,
            outstandingAmount: sql`COALESCE(SUM(${schemas.salesOrders.totalAmount}), 0)`,
          })
          .from(schemas.customers)
          .leftJoin(schemas.salesOrders, eq(schemas.salesOrders.customerId, schemas.customers.id))
          .where(
            and(
              eq(schemas.customers.tenantId, tenantId),
              eq(schemas.customers.businessId, businessId),
              eq(schemas.customers.branchId, branchId)
            )
          )
          .groupBy(schemas.customers.id, schemas.customers.name, schemas.customers.email);

        return {
          columns: [
            { name: 'customerName', label: 'Customer', type: 'text' },
            { name: 'email', label: 'Email', type: 'text' },
            { name: 'outstandingAmount', label: 'Committed Outstanding', type: 'currency' },
          ],
          rows,
        };
      }

      case 'supplier_outstanding': {
        const rows = await db
          .select({
            supplierName: schemas.suppliers.name,
            email: schemas.suppliers.email,
            outstandingAmount: sql`COALESCE(SUM(${schemas.purchaseOrders.totalAmount}), 0)`,
          })
          .from(schemas.suppliers)
          .leftJoin(schemas.purchaseOrders, eq(schemas.purchaseOrders.supplierId, schemas.suppliers.id))
          .where(
            and(
              eq(schemas.suppliers.tenantId, tenantId),
              eq(schemas.suppliers.businessId, businessId),
              eq(schemas.suppliers.branchId, branchId)
            )
          )
          .groupBy(schemas.suppliers.id, schemas.suppliers.name, schemas.suppliers.email);

        return {
          columns: [
            { name: 'supplierName', label: 'Supplier', type: 'text' },
            { name: 'email', label: 'Email', type: 'text' },
            { name: 'outstandingAmount', label: 'Committed Outstanding', type: 'currency' },
          ],
          rows,
        };
      }

      case 'stock_movement': {
        const rows = await db
          .select({
            date: schemas.stockLedger.createdAt,
            itemName: schemas.items.name,
            warehouseName: schemas.warehouses.name,
            qtyChange: schemas.stockLedger.qty, // Changed from qtyChange to qty
            valuationRate: schemas.stockLedger.valuationRate,
            voucherType: schemas.stockLedger.documentId, // Changed from voucherType to documentId
          })
          .from(schemas.stockLedger)
          .innerJoin(schemas.items, eq(schemas.stockLedger.itemId, schemas.items.id))
          .innerJoin(schemas.warehouses, eq(schemas.stockLedger.warehouseId, schemas.warehouses.id))
          .where(
            and(
              eq(schemas.stockLedger.tenantId, tenantId),
              eq(schemas.stockLedger.businessId, businessId),
              eq(schemas.stockLedger.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.stockLedger.createdAt} DESC`);

        return {
          columns: [
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'itemName', label: 'Item', type: 'text' },
            { name: 'warehouseName', label: 'Warehouse', type: 'text' },
            { name: 'qtyChange', label: 'Qty Change', type: 'number' },
            { name: 'valuationRate', label: 'Rate', type: 'currency' },
            { name: 'voucherType', label: 'Voucher Type', type: 'text' },
          ],
          rows,
        };
      }

      case 'audit_activity': {
        const rows = await db
          .select({
            timestamp: schemas.auditLogs.timestamp,
            entityType: schemas.auditLogs.entityType,
            action: schemas.auditLogs.action,
            actorId: schemas.auditLogs.actorId,
            ipAddress: schemas.auditLogs.ipAddress,
          })
          .from(schemas.auditLogs)
          .where(
            and(
              eq(schemas.auditLogs.tenantId, tenantId),
              eq(schemas.auditLogs.businessId, businessId),
              eq(schemas.auditLogs.branchId, branchId)
            )
          )
          .orderBy(sql`${schemas.auditLogs.timestamp} DESC`)
          .limit(1000);

        return {
          columns: [
            { name: 'timestamp', label: 'Timestamp', type: 'date' },
            { name: 'entityType', label: 'Resource', type: 'text' },
            { name: 'action', label: 'Action', type: 'text' },
            { name: 'actorId', label: 'Actor ID', type: 'text' },
            { name: 'ipAddress', label: 'IP Address', type: 'text' },
          ],
          rows,
        };
      }

      default:
        throw new ValidationError(`Unknown standard report code: '${reportCode}'`);
    }
  }

  /**
   * Helper to format report output as CSV.
   */
  public static convertToCSV(columns: any[], rows: any[]): string {
    if (columns.length === 0) return '';
    const headers = columns.map(c => c.label);
    const keys = columns.map(c => c.name);
    const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

    for (const row of rows) {
      const values = keys.map(key => {
        const val = row[key];
        const strVal = val !== null && val !== undefined ? String(val) : '';
        return `"${strVal.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
  }

  /**
   * Helper to format report output as printable HTML layout.
   */
  public static convertToHTML(reportName: string, columns: any[], rows: any[]): string {
    const headers = columns
      .map(c => `<th style="padding: 12px 10px; border-bottom: 2px solid #e2e8f0; text-align: left; font-weight: 600; color: #475569;">${c.label}</th>`)
      .join('');

    const tableRows = rows
      .map(row => {
        const cells = columns
          .map(c => {
            const val = row[c.name];
            let strVal = val !== null && val !== undefined ? String(val) : '';
            if (c.type === 'currency' && !isNaN(Number(strVal)) && strVal.trim() !== '') {
              strVal = '₹' + Number(strVal).toFixed(2);
            }
            return `<td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #334155;">${strVal}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${reportName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 40px;
      color: #1e293b;
      background-color: #ffffff;
    }
    h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
    }
    .subtitle {
      margin: 0 0 24px 0;
      font-size: 14px;
      color: #64748b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      font-size: 14px;
    }
    .print-btn {
      padding: 8px 16px;
      background-color: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .print-btn:hover {
      background-color: #1e293b;
    }
    @media print {
      body { margin: 20px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 16px;">
    <div>
      <h1>${reportName}</h1>
      <div class="subtitle">Generated on ${new Date().toLocaleString()}</div>
    </div>
    <div class="no-print">
      <button class="print-btn" onclick="window.print()">Print PDF</button>
    </div>
  </div>
  <table>
    <thead>
      <tr style="background-color: #f8fafc;">
        ${headers}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</body>
</html>
    `;
  }
}
