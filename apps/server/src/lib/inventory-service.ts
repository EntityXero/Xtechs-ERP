import { eq, and, sql, inArray } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  warehouses,
  itemGroups,
  items,
  itemUoms,
  batches,
  stockLedger,
  stockBalances,
  documents,
} from '@xtechs/db/schema';
import {
  createWarehouseSchema,
  createItemGroupSchema,
  createItemSchema,
  createBatchSchema,
  createStockEntrySchema,
  type CreateWarehouseInput,
  type CreateItemGroupInput,
  type CreateItemInput,
  type CreateBatchInput,
  type CreateStockEntryInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';

// ==========================================
// VALUATION STRATEGIES (Extensible)
// ==========================================

export interface ValuationCalculator {
  calculateReceipt(
    currentQty: number,
    currentRate: number,
    incomingQty: number,
    incomingRate: number
  ): { newValuationRate: number; newTotalValue: number };
}

export class MovingAverageCalculator implements ValuationCalculator {
  public calculateReceipt(
    currentQty: number,
    currentRate: number,
    incomingQty: number,
    incomingRate: number
  ) {
    const currentVal = currentQty * currentRate;
    const incomingVal = incomingQty * incomingRate;
    const newQty = currentQty + incomingQty;

    if (newQty <= 0) {
      return { newValuationRate: 0, newTotalValue: 0 };
    }

    const newTotalValue = currentVal + incomingVal;
    const newValuationRate = newTotalValue / newQty;

    return { newValuationRate, newTotalValue };
  }
}

export function getValuationCalculator(method: string): ValuationCalculator {
  switch (method) {
    case 'moving_average':
      return new MovingAverageCalculator();
    default:
      throw new ValidationError(`Unsupported valuation method: ${method}`);
  }
}

export class InventoryService {
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
  // WAREHOUSES
  // ==========================================

  public static async createWarehouse(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateWarehouseInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createWarehouseSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check duplicate code
    const existing = await db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, tenantId),
          eq(warehouses.businessId, businessId),
          eq(warehouses.branchId, branchId),
          eq(warehouses.code, parsed.code)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Warehouse with code '${parsed.code}' already exists`);
    }

    // Validate parent warehouse if specified
    if (parsed.parentId) {
      const [parent] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.id, parsed.parentId))
        .limit(1);

      if (!parent) {
        throw new NotFoundError('Warehouse parent', parsed.parentId);
      }
      this.enforceScope(context, parent);

      if (!parent.isGroup) {
        throw new ValidationError('Parent warehouse must be a group warehouse');
      }
    }

    const [newWh] = await db
      .insert(warehouses)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        code: parsed.code,
        parentId: parsed.parentId,
        isGroup: parsed.isGroup,
      })
      .returning();

    if (!newWh) {
      throw new ValidationError('Failed to create warehouse');
    }

    await logAudit(db, {
      entityType: 'warehouse',
      entityId: newWh.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newWh.name, code: newWh.code, isGroup: newWh.isGroup },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newWh;
  }

  public static async getWarehouses(db: Database, context: Required<ScopeContext>) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, tenantId),
          eq(warehouses.businessId, businessId),
          eq(warehouses.branchId, branchId)
        )
      );
  }

  // ==========================================
  // ITEM GROUPS
  // ==========================================

  public static async createItemGroup(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateItemGroupInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createItemGroupSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check duplicate name
    const existing = await db
      .select()
      .from(itemGroups)
      .where(
        and(
          eq(itemGroups.tenantId, tenantId),
          eq(itemGroups.businessId, businessId),
          eq(itemGroups.branchId, branchId),
          eq(itemGroups.name, parsed.name)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Item group with name '${parsed.name}' already exists`);
    }

    // Validate parent
    if (parsed.parentId) {
      const [parent] = await db
        .select()
        .from(itemGroups)
        .where(eq(itemGroups.id, parsed.parentId))
        .limit(1);

      if (!parent) {
        throw new NotFoundError('ItemGroup parent', parsed.parentId);
      }
      this.enforceScope(context, parent);
    }

    const [newIg] = await db
      .insert(itemGroups)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        parentId: parsed.parentId,
      })
      .returning();

    if (!newIg) {
      throw new ValidationError('Failed to create item group');
    }

    await logAudit(db, {
      entityType: 'item_group',
      entityId: newIg.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newIg.name },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newIg;
  }

  // ==========================================
  // ITEMS
  // ==========================================

  public static async createItem(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateItemInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createItemSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check SKU duplication
    const existing = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.businessId, businessId),
          eq(items.branchId, branchId),
          eq(items.sku, parsed.sku)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Item with SKU '${parsed.sku}' already exists`);
    }

    // Check Item Group exists
    const [group] = await db
      .select()
      .from(itemGroups)
      .where(eq(itemGroups.id, parsed.itemGroupId))
      .limit(1);

    if (!group) {
      throw new NotFoundError('ItemGroup', parsed.itemGroupId);
    }
    this.enforceScope(context, group);

    const newItem = await db.transaction(async (tx) => {
      const [item] = await tx
        .insert(items)
        .values({
          tenantId,
          businessId,
          branchId,
          sku: parsed.sku,
          name: parsed.name,
          type: parsed.type,
          itemGroupId: parsed.itemGroupId,
          baseUom: parsed.baseUom,
          valuationMethod: parsed.valuationMethod,
        })
        .returning();

      if (!item) {
        throw new ValidationError('Failed to create item');
      }

      // Automatically create a base UOM conversion with factor 1.0
      await tx.insert(itemUoms).values({
        tenantId,
        businessId,
        branchId,
        itemId: item.id,
        uom: parsed.baseUom,
        conversionFactor: '1.000000',
      });

      return item;
    });

    await logAudit(db, {
      entityType: 'item',
      entityId: newItem.id,
      action: 'create',
      actorId: userId,
      newValues: { sku: newItem.sku, name: newItem.name, type: newItem.type, baseUom: newItem.baseUom },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newItem;
  }

  public static async createItemUom(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    itemId: string,
    uom: string,
    conversionFactor: number,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    if (conversionFactor <= 0) {
      throw new ValidationError('Conversion factor must be greater than zero');
    }

    // Check item exists
    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, itemId))
      .limit(1);

    if (!item) {
      throw new NotFoundError('Item', itemId);
    }
    this.enforceScope(context, item);

    // Check duplicate UOM
    const existing = await db
      .select()
      .from(itemUoms)
      .where(
        and(
          eq(itemUoms.tenantId, tenantId),
          eq(itemUoms.businessId, businessId),
          eq(itemUoms.branchId, branchId),
          eq(itemUoms.itemId, itemId),
          eq(itemUoms.uom, uom)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`UOM '${uom}' is already configured for this item`);
    }

    const [newUom] = await db
      .insert(itemUoms)
      .values({
        tenantId,
        businessId,
        branchId,
        itemId,
        uom,
        conversionFactor: conversionFactor.toString(),
      })
      .returning();

    if (!newUom) {
      throw new ValidationError('Failed to create UOM conversion');
    }

    await logAudit(db, {
      entityType: 'item_uom',
      entityId: newUom.id,
      action: 'create',
      actorId: userId,
      newValues: { itemId, uom, conversionFactor },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newUom;
  }

  public static async getItems(db: Database, context: Required<ScopeContext>) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db
      .select()
      .from(items)
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.businessId, businessId),
          eq(items.branchId, branchId),
          eq(items.isArchived, false)
        )
      );
  }

  // ==========================================
  // BATCHES
  // ==========================================

  public static async createBatch(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateBatchInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createBatchSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check item exists
    const [item] = await db
      .select()
      .from(items)
      .where(eq(items.id, parsed.itemId))
      .limit(1);

    if (!item) {
      throw new NotFoundError('Item', parsed.itemId);
    }
    this.enforceScope(context, item);

    // Check batch code duplicate
    const existing = await db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.tenantId, tenantId),
          eq(batches.businessId, businessId),
          eq(batches.branchId, branchId),
          eq(batches.itemId, parsed.itemId),
          eq(batches.batchNo, parsed.batchNo)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Batch '${parsed.batchNo}' already exists for this item`);
    }

    const [newBatch] = await db
      .insert(batches)
      .values({
        tenantId,
        businessId,
        branchId,
        itemId: parsed.itemId,
        batchNo: parsed.batchNo,
        expiryDate: parsed.expiryDate,
      })
      .returning();

    if (!newBatch) {
      throw new ValidationError('Failed to create batch');
    }

    await logAudit(db, {
      entityType: 'batch',
      entityId: newBatch.id,
      action: 'create',
      actorId: userId,
      newValues: { itemId: newBatch.itemId, batchNo: newBatch.batchNo, expiryDate: newBatch.expiryDate },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newBatch;
  }

  // ==========================================
  // STOCK TRANSACTIONS
  // ==========================================

  public static async postStockEntry(
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

      if (
        doc.type !== 'stock_receipt' &&
        doc.type !== 'stock_issue' &&
        doc.type !== 'stock_transfer'
      ) {
        throw new ValidationError(`Document type must be an inventory movement, got: ${doc.type}`);
      }

      if (doc.workflowState === 'posted') {
        throw new ValidationError('This stock movement is already posted and immutable.');
      }

      // Convert doc.data to CreateStockEntryInput
      const docData = doc.data as any;
      const rawInput = {
        type: doc.type,
        postingDate: doc.createdAt, // Or entry date
        description: docData.description || '',
        lines: docData.lines || [],
      };

      const parsedInput = createStockEntrySchema.parse(rawInput);

      // Validate all warehouses exist and are within branch scope
      const whIds = new Set<string>();
      for (const line of parsedInput.lines) {
        if (line.sourceWarehouseId) whIds.add(line.sourceWarehouseId);
        if (line.targetWarehouseId) whIds.add(line.targetWarehouseId);
      }

      const fetchedWarehouses = whIds.size > 0
        ? await tx
            .select()
            .from(warehouses)
            .where(
              and(
                eq(warehouses.tenantId, tenantId),
                eq(warehouses.businessId, businessId),
                eq(warehouses.branchId, branchId),
                inArray(warehouses.id, [...whIds])
              )
            )
        : [];

      if (fetchedWarehouses.length !== whIds.size) {
        throw new ValidationError('One or more warehouses were not found or are out of branch scope');
      }

      const whMap = new Map(fetchedWarehouses.map((w) => [w.id, w]));
      for (const w of fetchedWarehouses) {
        if (w.isGroup) {
          throw new ValidationError(`Warehouse '${w.name}' is a group warehouse. Posting is only allowed to leaf warehouses.`);
        }
      }

      // Process each transaction line
      for (const line of parsedInput.lines) {
        // Fetch item
        const [item] = await tx
          .select()
          .from(items)
          .where(eq(items.id, line.itemId))
          .limit(1);

        if (!item) {
          throw new NotFoundError('Item', line.itemId);
        }
        this.enforceScope(context, item);

        if (item.type !== 'inventory') {
          throw new ValidationError(`Item '${item.name}' is not of type 'inventory'. Stock ledger posts are restricted to inventory items.`);
        }

        // Validate batch if provided
        if (line.batchId) {
          const [batch] = await tx
            .select()
            .from(batches)
            .where(eq(batches.id, line.batchId))
            .limit(1);

          if (!batch) {
            throw new NotFoundError('Batch', line.batchId);
          }
          this.enforceScope(context, batch);

          if (batch.itemId !== item.id) {
            throw new ValidationError(`Batch '${batch.batchNo}' does not belong to item '${item.name}'`);
          }

          // Expired batch check for issue/transfer
          if (
            (parsedInput.type === 'stock_issue' || parsedInput.type === 'stock_transfer') &&
            batch.expiryDate &&
            new Date(batch.expiryDate) < new Date(parsedInput.postingDate)
          ) {
            throw new ValidationError(`Batch '${batch.batchNo}' expired on ${new Date(batch.expiryDate).toLocaleDateString()} and cannot be issued.`);
          }
        }

        // Retrieve UOM conversion factor
        const [uomConv] = await tx
          .select()
          .from(itemUoms)
          .where(
            and(
              eq(itemUoms.itemId, item.id),
              eq(itemUoms.uom, line.uom)
            )
          )
          .limit(1);

        const convFactor = uomConv ? parseFloat(uomConv.conversionFactor) : line.conversionFactor;

        // Base qty (positive/negative calculations)
        const baseQty = line.qty * convFactor;

        if (parsedInput.type === 'stock_receipt') {
          // RECEIPT (Inward to target warehouse)
          const targetWh = line.targetWarehouseId!;
          const baseRate = line.valuationRate / convFactor;
          const totalValue = baseQty * baseRate;

          // Lock stock balance row for update
          const [currentBalance] = await tx
            .select()
            .from(stockBalances)
            .where(
              and(
                eq(stockBalances.tenantId, tenantId),
                eq(stockBalances.businessId, businessId),
                eq(stockBalances.branchId, branchId),
                eq(stockBalances.itemId, item.id),
                eq(stockBalances.warehouseId, targetWh),
                line.batchId ? eq(stockBalances.batchId, line.batchId) : sql`${stockBalances.batchId} IS NULL`
              )
            )
            .for('update');

          const currentQty = currentBalance ? parseFloat(currentBalance.onHand) : 0;
          const currentReserved = currentBalance ? parseFloat(currentBalance.reserved) : 0;
          const currentRate = currentBalance ? parseFloat(currentBalance.valuationRate) : 0;

          // Perform non-hardcoded valuation calculation
          const calculator = getValuationCalculator(item.valuationMethod);
          const { newValuationRate, newTotalValue } = calculator.calculateReceipt(
            currentQty,
            currentRate,
            baseQty,
            baseRate
          );

          // Write Stock Ledger (inward)
          await tx.insert(stockLedger).values({
            tenantId,
            businessId,
            branchId,
            documentId,
            itemId: item.id,
            warehouseId: targetWh,
            batchId: line.batchId || null,
            postingDate: parsedInput.postingDate,
            qty: baseQty.toString(),
            uom: line.uom,
            conversionFactor: convFactor.toString(),
            valuationRate: baseRate.toString(),
            totalValue: totalValue.toString(),
          });

          // Upsert stock balance snapshot
          if (currentBalance) {
            const newOnHand = currentQty + baseQty;
            const newAvailable = newOnHand - currentReserved;
            await tx
              .update(stockBalances)
              .set({
                onHand: newOnHand.toString(),
                available: newAvailable.toString(),
                valuationRate: newValuationRate.toFixed(4),
                totalValue: newTotalValue.toFixed(4),
                updatedAt: new Date(),
              })
              .where(eq(stockBalances.id, currentBalance.id));
          } else {
            await tx.insert(stockBalances).values({
              tenantId,
              businessId,
              branchId,
              itemId: item.id,
              warehouseId: targetWh,
              batchId: line.batchId || null,
              onHand: baseQty.toString(),
              reserved: '0.0000',
              available: baseQty.toString(),
              valuationRate: newValuationRate.toFixed(4),
              totalValue: totalValue.toFixed(4),
            });
          }

        } else if (parsedInput.type === 'stock_issue') {
          // ISSUE (Outward from source warehouse)
          const sourceWh = line.sourceWarehouseId!;

          const [currentBalance] = await tx
            .select()
            .from(stockBalances)
            .where(
              and(
                eq(stockBalances.tenantId, tenantId),
                eq(stockBalances.businessId, businessId),
                eq(stockBalances.branchId, branchId),
                eq(stockBalances.itemId, item.id),
                eq(stockBalances.warehouseId, sourceWh),
                line.batchId ? eq(stockBalances.batchId, line.batchId) : sql`${stockBalances.batchId} IS NULL`
              )
            )
            .for('update');

          if (!currentBalance) {
            throw new ValidationError(
              `Insufficient stock for item '${item.name}' in warehouse '${whMap.get(sourceWh)!.name}'. Available: 0, Requested: ${baseQty}`
            );
          }

          const currentOnHand = parseFloat(currentBalance.onHand);
          const currentReserved = parseFloat(currentBalance.reserved);
          const currentAvailable = parseFloat(currentBalance.available);
          const currentRate = parseFloat(currentBalance.valuationRate);

          // 1. Negative stock prevention (using available quantity)
          if (currentAvailable < baseQty) {
            throw new ValidationError(
              `Insufficient stock for item '${item.name}' in warehouse '${whMap.get(sourceWh)!.name}'. Available: ${currentAvailable}, Requested: ${baseQty}`
            );
          }

          // Outgoing stock valued at current moving average cost
          const totalValue = baseQty * currentRate;

          // Write Stock Ledger (outward)
          await tx.insert(stockLedger).values({
            tenantId,
            businessId,
            branchId,
            documentId,
            itemId: item.id,
            warehouseId: sourceWh,
            batchId: line.batchId || null,
            postingDate: parsedInput.postingDate,
            qty: (-baseQty).toString(),
            uom: line.uom,
            conversionFactor: convFactor.toString(),
            valuationRate: currentRate.toString(),
            totalValue: (-totalValue).toString(),
          });

          // Update stock balance snapshot
          const newOnHand = currentOnHand - baseQty;
          const newAvailable = newOnHand - currentReserved;
          const newTotalValue = newOnHand * currentRate;

          await tx
            .update(stockBalances)
            .set({
              onHand: newOnHand.toString(),
              available: newAvailable.toString(),
              totalValue: newTotalValue.toFixed(4),
              updatedAt: new Date(),
            })
            .where(eq(stockBalances.id, currentBalance.id));

        } else if (parsedInput.type === 'stock_transfer') {
          // TRANSFER (Outward from source, Inward to target)
          const sourceWh = line.sourceWarehouseId!;
          const targetWh = line.targetWarehouseId!;

          // Source Balance Lock
          const [sourceBalance] = await tx
            .select()
            .from(stockBalances)
            .where(
              and(
                eq(stockBalances.tenantId, tenantId),
                eq(stockBalances.businessId, businessId),
                eq(stockBalances.branchId, branchId),
                eq(stockBalances.itemId, item.id),
                eq(stockBalances.warehouseId, sourceWh),
                line.batchId ? eq(stockBalances.batchId, line.batchId) : sql`${stockBalances.batchId} IS NULL`
              )
            )
            .for('update');

          if (!sourceBalance) {
            throw new ValidationError(
              `Insufficient stock for item '${item.name}' in warehouse '${whMap.get(sourceWh)!.name}'. Available: 0, Requested: ${baseQty}`
            );
          }

          const srcOnHand = parseFloat(sourceBalance.onHand);
          const srcReserved = parseFloat(sourceBalance.reserved);
          const srcAvailable = parseFloat(sourceBalance.available);
          const srcRate = parseFloat(sourceBalance.valuationRate);

          // 1. Negative stock prevention at source
          if (srcAvailable < baseQty) {
            throw new ValidationError(
              `Insufficient stock for item '${item.name}' in warehouse '${whMap.get(sourceWh)!.name}'. Available: ${srcAvailable}, Requested: ${baseQty}`
            );
          }

          const totalValue = baseQty * srcRate;

          // Ledger out of source
          await tx.insert(stockLedger).values({
            tenantId,
            businessId,
            branchId,
            documentId,
            itemId: item.id,
            warehouseId: sourceWh,
            batchId: line.batchId || null,
            postingDate: parsedInput.postingDate,
            qty: (-baseQty).toString(),
            uom: line.uom,
            conversionFactor: convFactor.toString(),
            valuationRate: srcRate.toString(),
            totalValue: (-totalValue).toString(),
          });

          // Update Source Balance
          const newSrcOnHand = srcOnHand - baseQty;
          const newSrcAvailable = newSrcOnHand - srcReserved;
          const newSrcTotal = newSrcOnHand * srcRate;
          await tx
            .update(stockBalances)
            .set({
              onHand: newSrcOnHand.toString(),
              available: newSrcAvailable.toString(),
              totalValue: newSrcTotal.toFixed(4),
              updatedAt: new Date(),
            })
            .where(eq(stockBalances.id, sourceBalance.id));

          // Target Balance Lock
          const [targetBalance] = await tx
            .select()
            .from(stockBalances)
            .where(
              and(
                eq(stockBalances.tenantId, tenantId),
                eq(stockBalances.businessId, businessId),
                eq(stockBalances.branchId, branchId),
                eq(stockBalances.itemId, item.id),
                eq(stockBalances.warehouseId, targetWh),
                line.batchId ? eq(stockBalances.batchId, line.batchId) : sql`${stockBalances.batchId} IS NULL`
              )
            )
            .for('update');

          const tgtQty = targetBalance ? parseFloat(targetBalance.onHand) : 0;
          const tgtReserved = targetBalance ? parseFloat(targetBalance.reserved) : 0;
          const tgtRate = targetBalance ? parseFloat(targetBalance.valuationRate) : 0;

          // Target recalculates Moving Average using incoming source rate
          const calculator = getValuationCalculator(item.valuationMethod);
          const { newValuationRate, newTotalValue } = calculator.calculateReceipt(
            tgtQty,
            tgtRate,
            baseQty,
            srcRate
          );

          // Ledger into target
          await tx.insert(stockLedger).values({
            tenantId,
            businessId,
            branchId,
            documentId,
            itemId: item.id,
            warehouseId: targetWh,
            batchId: line.batchId || null,
            postingDate: parsedInput.postingDate,
            qty: baseQty.toString(),
            uom: line.uom,
            conversionFactor: convFactor.toString(),
            valuationRate: srcRate.toString(),
            totalValue: totalValue.toString(),
          });

          // Update Target Balance
          if (targetBalance) {
            const newTgtOnHand = tgtQty + baseQty;
            const newTgtAvailable = newTgtOnHand - tgtReserved;
            await tx
              .update(stockBalances)
              .set({
                onHand: newTgtOnHand.toString(),
                available: newTgtAvailable.toString(),
                valuationRate: newValuationRate.toFixed(4),
                totalValue: newTotalValue.toFixed(4),
                updatedAt: new Date(),
              })
              .where(eq(stockBalances.id, targetBalance.id));
          } else {
            await tx.insert(stockBalances).values({
              tenantId,
              businessId,
              branchId,
              itemId: item.id,
              warehouseId: targetWh,
              batchId: line.batchId || null,
              onHand: baseQty.toString(),
              reserved: '0.0000',
              available: baseQty.toString(),
              valuationRate: newValuationRate.toFixed(4),
              totalValue: newTotalValue.toFixed(4),
            });
          }
        }
      }

      // Update Document Status
      const [updatedDoc] = await tx
        .update(documents)
        .set({
          workflowState: 'posted',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
        .returning();

      await logAudit(tx as any, {
        entityType: `document:${doc.type}`,
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

  public static async reverseStockEntry(
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
      // 1. Fetch document and confirm it is posted
      const [doc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc) {
        throw new NotFoundError('Document', documentId);
      }
      this.enforceScope(context, doc);

      if (doc.workflowState !== 'posted') {
        throw new ValidationError(`Only posted inventory movements can be reversed. Current state: ${doc.workflowState}`);
      }

      // Fetch all stock ledger records generated by this document
      const ledgerLines = await tx
        .select()
        .from(stockLedger)
        .where(eq(stockLedger.documentId, documentId));

      if (ledgerLines.length === 0) {
        throw new ValidationError('No stock ledger transactions found for this document.');
      }

      // Create Reversal Document
      const [reversalDoc] = await tx
        .insert(documents)
        .values({
          tenantId,
          businessId,
          branchId,
          type: `${doc.type}_reversal`,
          documentNumber: `${doc.documentNumber}-REV`,
          status: 'active',
          workflowState: 'posted', // Reversals are finalized immediately
          data: {
            reversalOf: doc.id,
            description: `Reversal of Stock Entry ${doc.documentNumber || doc.id}`,
          },
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!reversalDoc) {
        throw new ValidationError('Failed to create reversal document header');
      }

      // For reversal, we must swap/invert the quantities and apply it transactionally.
      // E.g. if we received +10, we now issue -10. If we issued -5, we now receive +5.
      for (const line of ledgerLines) {
        const itemQty = parseFloat(line.qty);
        const itemValuationRate = parseFloat(line.valuationRate);
        const itemTotalVal = parseFloat(line.totalValue);

        // Fetch balance row to apply reversal
        const [balance] = await tx
          .select()
          .from(stockBalances)
          .where(
            and(
              eq(stockBalances.tenantId, tenantId),
              eq(stockBalances.businessId, businessId),
              eq(stockBalances.branchId, branchId),
              eq(stockBalances.itemId, line.itemId),
              eq(stockBalances.warehouseId, line.warehouseId),
              line.batchId ? eq(stockBalances.batchId, line.batchId) : sql`${stockBalances.batchId} IS NULL`
            )
          )
          .for('update');

        const currentQty = balance ? parseFloat(balance.onHand) : 0;
        const currentReserved = balance ? parseFloat(balance.reserved) : 0;
        const currentRate = balance ? parseFloat(balance.valuationRate) : 0;

        // Swapped quantity
        const reversedQty = -itemQty;
        const reversedTotalVal = -itemTotalVal;

        // If reversing causes negative stock, throw!
        if (itemQty > 0 && currentQty < itemQty) {
          // Means we originally did a receipt (+10), now we reverse it (-10), but we only have less than 10 left in stock.
          throw new ValidationError(
            `Cannot reverse document ${doc.documentNumber || doc.id}: Reversal would result in negative stock for item ID ${line.itemId} in warehouse ID ${line.warehouseId}.`
          );
        }

        let newRate = currentRate;
        let newTotalVal = (currentQty + reversedQty) * currentRate;

        // If we are reversing an issue (adding stock back), we need to update target moving average
        if (itemQty < 0) {
          // We originally issued -5 at rate X, now we are adding +5 back.
          const [item] = await tx.select().from(items).where(eq(items.id, line.itemId)).limit(1);
          const calculator = getValuationCalculator(item!.valuationMethod);
          const result = calculator.calculateReceipt(currentQty, currentRate, reversedQty, itemValuationRate);
          newRate = result.newValuationRate;
          newTotalVal = result.newTotalValue;
        } else {
          // We are reversing a receipt (removing stock), rate stays same, total value reduces
          newTotalVal = (currentQty + reversedQty) * currentRate;
        }

        // Insert reversed ledger line
        await tx.insert(stockLedger).values({
          tenantId,
          businessId,
          branchId,
          documentId: reversalDoc.id,
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          batchId: line.batchId,
          postingDate: new Date(),
          qty: reversedQty.toString(),
          uom: line.uom,
          conversionFactor: line.conversionFactor,
          valuationRate: line.valuationRate,
          totalValue: reversedTotalVal.toString(),
        });

        // Update balance snapshot
        if (balance) {
          const newOnHand = currentQty + reversedQty;
          const newAvailable = newOnHand - currentReserved;
          await tx
            .update(stockBalances)
            .set({
              onHand: newOnHand.toString(),
              available: newAvailable.toString(),
              valuationRate: newRate.toFixed(4),
              totalValue: newTotalVal.toFixed(4),
              updatedAt: new Date(),
            })
            .where(eq(stockBalances.id, balance.id));
        } else {
          // Should not happen as a posted entry must have had balance lines, but fallback:
          await tx.insert(stockBalances).values({
            tenantId,
            businessId,
            branchId,
            itemId: line.itemId,
            warehouseId: line.warehouseId,
            batchId: line.batchId,
            onHand: reversedQty.toString(),
            reserved: '0.0000',
            available: reversedQty.toString(),
            valuationRate: itemValuationRate.toFixed(4),
            totalValue: reversedTotalVal.toFixed(4),
          });
        }
      }

      // Mark original document as archived/reversed or custom status
      await tx
        .update(documents)
        .set({
          status: 'reversed',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      await logAudit(tx as any, {
        entityType: `document:${doc.type}`,
        entityId: documentId,
        action: 'transition',
        actorId: userId,
        oldValues: { status: 'active' },
        newValues: { status: 'reversed' },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      await logAudit(tx as any, {
        entityType: `document:${reversalDoc.type}`,
        entityId: reversalDoc.id,
        action: 'create',
        actorId: userId,
        newValues: { id: reversalDoc.id, documentNumber: reversalDoc.documentNumber },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return reversalDoc;
    });
  }

  public static async getStockBalance(
    db: Database,
    context: Required<ScopeContext>,
    itemId: string,
    warehouseId: string,
    batchId?: string | null
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [balance] = await db
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.tenantId, tenantId),
          eq(stockBalances.businessId, businessId),
          eq(stockBalances.branchId, branchId),
          eq(stockBalances.itemId, itemId),
          eq(stockBalances.warehouseId, warehouseId),
          batchId ? eq(stockBalances.batchId, batchId) : sql`${stockBalances.batchId} IS NULL`
        )
      )
      .limit(1);

    return balance || {
      onHand: '0.0000',
      reserved: '0.0000',
      available: '0.0000',
      valuationRate: '0.0000',
      totalValue: '0.0000',
    };
  }

  public static async getStockBalances(
    db: Database,
    context: Required<ScopeContext>,
    filters?: { itemId?: string; warehouseId?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const queryParts = [
      eq(stockBalances.tenantId, tenantId),
      eq(stockBalances.businessId, businessId),
      eq(stockBalances.branchId, branchId),
    ];

    if (filters?.itemId) {
      queryParts.push(eq(stockBalances.itemId, filters.itemId));
    }

    if (filters?.warehouseId) {
      queryParts.push(eq(stockBalances.warehouseId, filters.warehouseId));
    }

    return db
      .select()
      .from(stockBalances)
      .where(and(...queryParts));
  }
}
