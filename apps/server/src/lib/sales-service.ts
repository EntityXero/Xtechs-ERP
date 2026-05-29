import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  quotations,
  quotationLines,
  salesOrders,
  salesOrderLines,
  documents,
  stockBalances,
  items,
} from '@xtechs/db/schema';
import {
  createQuotationSchema,
  createSalesOrderSchema,
  type CreateQuotationInput,
  type CreateSalesOrderInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';
import { PricingService } from './pricing-service.js';

export class SalesService {
  /**
   * Enforce branch isolation
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
  // QUOTATIONS
  // ==========================================

  public static async createQuotation(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateQuotationInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createQuotationSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // Validate all items exist
      for (const line of parsed.lines) {
        const [item] = await tx
          .select()
          .from(items)
          .where(eq(items.id, line.itemId))
          .limit(1);

        if (!item) {
          throw new NotFoundError('Item', line.itemId);
        }
        this.enforceScope(context, item);
      }

      // Calculate prices using PricingService
      const calculatedLines = PricingService.calculatePrice(parsed.lines);
      const totalAmount = PricingService.calculateTotalAmount(calculatedLines);

      // Generate polymorphic document header (Quotation is a Draft document by default)
      const [doc] = await tx
        .insert(documents)
        .values({
          tenantId,
          businessId,
          branchId,
          type: 'sales_quotation',
          status: 'active',
          workflowState: 'draft',
          data: {
            customerId: parsed.customerId,
            opportunityId: parsed.opportunityId,
            description: parsed.description,
            validUntil: parsed.validUntil,
          },
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!doc) {
        throw new ValidationError('Failed to create quotation document header');
      }

      // Create quotation header
      const [quotation] = await tx
        .insert(quotations)
        .values({
          tenantId,
          businessId,
          branchId,
          documentId: doc.id,
          customerId: parsed.customerId,
          opportunityId: parsed.opportunityId,
          validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      if (!quotation) {
        throw new ValidationError('Failed to create quotation header');
      }

      // Create quotation lines
      for (const line of calculatedLines) {
        await tx.insert(quotationLines).values({
          tenantId,
          businessId,
          branchId,
          quotationId: quotation.id,
          itemId: line.itemId,
          qty: line.qty.toString(),
          rate: line.rate.toString(),
          discountPercentage: line.discountPercentage.toString(),
          amount: line.amount.toString(),
        });
      }

      await logAudit(tx as any, {
        entityType: 'document:sales_quotation',
        entityId: doc.id,
        action: 'create',
        actorId: userId,
        newValues: { quotationId: quotation.id, totalAmount },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return {
        ...quotation,
        lines: calculatedLines,
      };
    });
  }

  public static async postQuotation(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      const [doc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc) {
        throw new NotFoundError('Document', documentId);
      }
      this.enforceScope(context, doc);

      if (doc.type !== 'sales_quotation') {
        throw new ValidationError(`Document is not a quotation, got type: ${doc.type}`);
      }

      if (doc.workflowState === 'posted') {
        throw new ValidationError('This quotation is already posted.');
      }

      const [updatedDoc] = await tx
        .update(documents)
        .set({
          workflowState: 'posted',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
        .returning();

      await logAudit(tx as any, {
        entityType: 'document:sales_quotation',
        entityId: documentId,
        action: 'approve',
        actorId: userId,
        oldValues: { workflowState: doc.workflowState },
        newValues: { workflowState: 'posted' },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return updatedDoc;
    });
  }

  // ==========================================
  // SALES ORDERS
  // ==========================================

  public static async createSalesOrder(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateSalesOrderInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createSalesOrderSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // Validate all items exist
      for (const line of parsed.lines) {
        const [item] = await tx
          .select()
          .from(items)
          .where(eq(items.id, line.itemId))
          .limit(1);

        if (!item) {
          throw new NotFoundError('Item', line.itemId);
        }
        this.enforceScope(context, item);
      }

      // Calculate prices using PricingService
      const calculatedLines = PricingService.calculatePrice(parsed.lines);
      const totalAmount = PricingService.calculateTotalAmount(calculatedLines);

      // Generate polymorphic document header (Sales Order is Draft by default)
      const [doc] = await tx
        .insert(documents)
        .values({
          tenantId,
          businessId,
          branchId,
          type: 'sales_order',
          status: 'active',
          workflowState: 'draft',
          data: {
            customerId: parsed.customerId,
            warehouseId: parsed.warehouseId,
            quotationId: parsed.quotationId,
            description: parsed.description,
            deliveryDate: parsed.deliveryDate,
          },
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!doc) {
        throw new ValidationError('Failed to create sales order document header');
      }

      // Create sales order header
      const [salesOrder] = await tx
        .insert(salesOrders)
        .values({
          tenantId,
          businessId,
          branchId,
          documentId: doc.id,
          customerId: parsed.customerId,
          warehouseId: parsed.warehouseId,
          quotationId: parsed.quotationId,
          deliveryDate: parsed.deliveryDate ? new Date(parsed.deliveryDate) : null,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      if (!salesOrder) {
        throw new ValidationError('Failed to create sales order header');
      }

      // Create sales order lines
      for (const line of calculatedLines) {
        await tx.insert(salesOrderLines).values({
          tenantId,
          businessId,
          branchId,
          salesOrderId: salesOrder.id,
          itemId: line.itemId,
          qty: line.qty.toString(),
          rate: line.rate.toString(),
          discountPercentage: line.discountPercentage.toString(),
          amount: line.amount.toString(),
        });
      }

      await logAudit(tx as any, {
        entityType: 'document:sales_order',
        entityId: doc.id,
        action: 'create',
        actorId: userId,
        newValues: { salesOrderId: salesOrder.id, totalAmount },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return {
        ...salesOrder,
        lines: calculatedLines,
      };
    });
  }

  /**
   * Post Sales Order: commits stock reservations atomically
   */
  public static async postSalesOrder(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // 1. Fetch document and validate type/status
      const [doc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc) {
        throw new NotFoundError('Document', documentId);
      }
      this.enforceScope(context, doc);

      if (doc.type !== 'sales_order') {
        throw new ValidationError(`Document type must be 'sales_order', got: ${doc.type}`);
      }

      if (doc.workflowState === 'posted') {
        throw new ValidationError('This sales order is already posted.');
      }

      // 2. Fetch Sales Order
      const [salesOrder] = await tx
        .select()
        .from(salesOrders)
        .where(eq(salesOrders.documentId, documentId))
        .limit(1);

      if (!salesOrder) {
        throw new NotFoundError('SalesOrder for document', documentId);
      }

      // 3. Fetch Sales Order Lines
      const orderLines = await tx
        .select()
        .from(salesOrderLines)
        .where(eq(salesOrderLines.salesOrderId, salesOrder.id));

      // 4. Reserve stock atomically
      for (const line of orderLines) {
        const orderQty = parseFloat(line.qty);

        // Lock the stock balance row for update (for standard standard item tracking, we use batchId = null)
        const [balance] = await tx
          .select()
          .from(stockBalances)
          .where(
            and(
              eq(stockBalances.tenantId, tenantId),
              eq(stockBalances.businessId, businessId),
              eq(stockBalances.branchId, branchId),
              eq(stockBalances.itemId, line.itemId),
              eq(stockBalances.warehouseId, salesOrder.warehouseId),
              sql`${stockBalances.batchId} IS NULL`
            )
          )
          .for('update');

        if (!balance) {
          throw new ValidationError(
            `Insufficient stock for reservation: No inventory record exists for item ID ${line.itemId} in warehouse ID ${salesOrder.warehouseId}.`
          );
        }

        const currentOnHand = parseFloat(balance.onHand);
        const currentReserved = parseFloat(balance.reserved);
        const currentAvailable = parseFloat(balance.available);

        // Negative stock/reservation prevention
        if (currentAvailable < orderQty) {
          throw new ValidationError(
            `Insufficient available stock for reservation. Available: ${currentAvailable}, Requested: ${orderQty} for item ID ${line.itemId} in warehouse ID ${salesOrder.warehouseId}.`
          );
        }

        // Adjust reserved and available amounts
        const newReserved = currentReserved + orderQty;
        const newAvailable = currentOnHand - newReserved;

        await tx
          .update(stockBalances)
          .set({
            reserved: newReserved.toFixed(4),
            available: newAvailable.toFixed(4),
            updatedAt: new Date(),
          })
          .where(eq(stockBalances.id, balance.id));
      }

      // 5. Update document workflow state
      const [updatedDoc] = await tx
        .update(documents)
        .set({
          workflowState: 'posted',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
        .returning();

      await logAudit(tx as any, {
        entityType: 'document:sales_order',
        entityId: documentId,
        action: 'approve',
        actorId: userId,
        oldValues: { workflowState: doc.workflowState },
        newValues: { workflowState: 'posted' },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return updatedDoc;
    });
  }
}
