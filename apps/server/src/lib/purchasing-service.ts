import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  suppliers,
  purchaseOrders,
  purchaseOrderLines,
  documents,
  stockBalances,
  items,
  warehouses,
} from '@xtechs/db/schema';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createPurchaseOrderSchema,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type CreatePurchaseOrderInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';
import { PricingService } from './pricing-service.js';

export class PurchasingService {
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
  // SUPPLIERS
  // ==========================================

  public static async createSupplier(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateSupplierInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createSupplierSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newSupplier] = await db
      .insert(suppliers)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        status: parsed.status,
      })
      .returning();

    if (!newSupplier) {
      throw new ValidationError('Failed to create supplier');
    }

    await logAudit(db, {
      entityType: 'supplier',
      entityId: newSupplier.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newSupplier.name, email: newSupplier.email },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newSupplier;
  }

  public static async updateSupplier(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    supplierId: string,
    input: UpdateSupplierInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = updateSupplierSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [supp] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (!supp) {
      throw new NotFoundError('Supplier', supplierId);
    }
    this.enforceScope(context, supp);

    const [updated] = await db
      .update(suppliers)
      .set({
        ...parsed,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId))
      .returning();

    if (!updated) {
      throw new ValidationError('Failed to update supplier');
    }

    await logAudit(db, {
      entityType: 'supplier',
      entityId: supplierId,
      action: 'update',
      actorId: userId,
      oldValues: { name: supp.name, status: supp.status },
      newValues: { name: updated.name, status: updated.status },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return updated;
  }

  // ==========================================
  // PURCHASE ORDERS
  // ==========================================

  public static async createPurchaseOrder(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreatePurchaseOrderInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createPurchaseOrderSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // Validate Supplier exists
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, parsed.supplierId))
        .limit(1);
      if (!supplier) {
        throw new NotFoundError('Supplier', parsed.supplierId);
      }
      this.enforceScope(context, supplier);

      // Validate Warehouse exists
      const [warehouse] = await tx
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, parsed.warehouseId))
        .limit(1);
      if (!warehouse) {
        throw new NotFoundError('Warehouse', parsed.warehouseId);
      }
      this.enforceScope(context, warehouse);

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

      // Calculate rates/discount
      const calculatedLines = PricingService.calculatePrice(parsed.lines);
      const totalAmount = PricingService.calculateTotalAmount(calculatedLines);

      // Create Document header (starts as Draft)
      const [doc] = await tx
        .insert(documents)
        .values({
          tenantId,
          businessId,
          branchId,
          type: 'purchase_order',
          status: 'active',
          workflowState: 'draft',
          data: {
            supplierId: parsed.supplierId,
            warehouseId: parsed.warehouseId,
            description: parsed.description,
            deliveryDate: parsed.deliveryDate,
          },
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!doc) {
        throw new ValidationError('Failed to create purchase order document header');
      }

      // Create Purchase Order
      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          tenantId,
          businessId,
          branchId,
          documentId: doc.id,
          supplierId: parsed.supplierId,
          warehouseId: parsed.warehouseId,
          deliveryDate: parsed.deliveryDate ? new Date(parsed.deliveryDate) : null,
          totalAmount: totalAmount.toString(),
        })
        .returning();

      if (!po) {
        throw new ValidationError('Failed to create purchase order header');
      }

      // Create Purchase Order Lines (supporting supplier item references)
      for (let i = 0; i < calculatedLines.length; i++) {
        const line = calculatedLines[i]!;
        const originalInputLine = parsed.lines[i]!;
        await tx.insert(purchaseOrderLines).values({
          tenantId,
          businessId,
          branchId,
          purchaseOrderId: po.id,
          itemId: line.itemId,
          supplierItemCode: originalInputLine.supplierItemCode,
          qty: line.qty.toString(),
          rate: line.rate.toString(),
          discountPercentage: line.discountPercentage.toString(),
          amount: line.amount.toString(),
        });
      }

      await logAudit(tx as any, {
        entityType: 'document:purchase_order',
        entityId: doc.id,
        action: 'create',
        actorId: userId,
        newValues: { purchaseOrderId: po.id, totalAmount },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      const linesWithExtras = calculatedLines.map((line, i) => ({
        ...line,
        supplierItemCode: parsed.lines[i]!.supplierItemCode,
      }));

      return {
        ...po,
        lines: linesWithExtras,
      };
    });
  }

  /**
   * Post Purchase Order: Approves PO and increments 'ordered' quantity atomically
   */
  public static async postPurchaseOrder(
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
      // 1. Fetch document and validate
      const [doc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc) {
        throw new NotFoundError('Document', documentId);
      }
      this.enforceScope(context, doc);

      if (doc.type !== 'purchase_order') {
        throw new ValidationError(`Document type must be 'purchase_order', got: ${doc.type}`);
      }

      if (doc.workflowState === 'posted') {
        throw new ValidationError('This purchase order is already posted.');
      }

      // 2. Fetch Purchase Order
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.documentId, documentId))
        .limit(1);

      if (!po) {
        throw new NotFoundError('PurchaseOrder for document', documentId);
      }

      // 3. Fetch Lines
      const poLines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, po.id));

      // 4. Update Stock Balances Cache: increment 'ordered' quantity atomically
      for (const line of poLines) {
        const orderQty = parseFloat(line.qty);

        // Lock row if it exists
        const [balance] = await tx
          .select()
          .from(stockBalances)
          .where(
            and(
              eq(stockBalances.tenantId, tenantId),
              eq(stockBalances.businessId, businessId),
              eq(stockBalances.branchId, branchId),
              eq(stockBalances.itemId, line.itemId),
              eq(stockBalances.warehouseId, po.warehouseId),
              sql`${stockBalances.batchId} IS NULL`
            )
          )
          .for('update');

        if (balance) {
          const currentOrdered = parseFloat(balance.ordered);
          const newOrdered = currentOrdered + orderQty;

          await tx
            .update(stockBalances)
            .set({
              ordered: newOrdered.toFixed(4),
              updatedAt: new Date(),
            })
            .where(eq(stockBalances.id, balance.id));
        } else {
          // If the row doesn't exist, create it on-the-fly!
          await tx.insert(stockBalances).values({
            tenantId,
            businessId,
            branchId,
            itemId: line.itemId,
            warehouseId: po.warehouseId,
            batchId: null,
            onHand: '0.0000',
            reserved: '0.0000',
            available: '0.0000',
            ordered: orderQty.toFixed(4),
            valuationRate: '0.0000',
            totalValue: '0.0000',
          });
        }
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

      if (!updatedDoc) {
        throw new ValidationError('Failed to update document workflow state');
      }

      await logAudit(tx as any, {
        entityType: 'document:purchase_order',
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
