import { eq, and, desc, isNull } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import { automations, automationLogs } from '@xtechs/db/schema';
import { resolveMetadata, type ScopeContext } from './metadata-service.js';
import { queueAutomationJob } from './automations/queue.js';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import { logAudit } from './audit-service.js';
import { createAutomationSchema, updateAutomationSchema } from '@xtechs/shared';
import { calculateNextRunAt } from './automations/scheduler.js';
import { eventBus } from './automations/event-bus.js';

export class AutomationService {
  /**
   * Initializes the event bus listeners to react to system events and trigger automations.
   */
  public static init(db: Database) {
    console.log('[AutomationService] Initializing event bus listeners...');
    
    eventBus.on('document_created', async (doc: any, context: Required<ScopeContext>) => {
      try {
        await this.triggerEvent(db, 'document_created', doc, context);
      } catch (err: any) {
        console.error(`[AutomationService] Error handling document_created event:`, err.message);
      }
    });

    eventBus.on('document_updated', async (doc: any, context: Required<ScopeContext>) => {
      try {
        await this.triggerEvent(db, 'document_updated', doc, context);
      } catch (err: any) {
        console.error(`[AutomationService] Error handling document_updated event:`, err.message);
      }
    });

    eventBus.on('state_changed', async (doc: any, context: Required<ScopeContext>) => {
      try {
        await this.triggerEvent(db, 'state_changed', doc, context);
      } catch (err: any) {
        console.error(`[AutomationService] Error handling state_changed event:`, err.message);
      }
    });
  }

  /**
   * Finds active event automations matching eventName and queues them.
   */
  public static async triggerEvent(
    db: Database,
    eventName: string,
    payload: any,
    context: Required<ScopeContext>
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    console.log(`[triggerEvent] Triggered event: "${eventName}" for scope:`, { tenantId, businessId, branchId });

    // Query active event automations for this branch scope
    const activeAutomations = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.tenantId, tenantId),
          eq(automations.businessId, businessId),
          eq(automations.branchId, branchId),
          eq(automations.isActive, true),
          eq(automations.triggerType, 'event'),
          isNull(automations.deletedAt)
        )
      );

    console.log(`[triggerEvent] Found active automations in DB:`, activeAutomations.length);

    const matching = activeAutomations.filter((auto) => {
      const config = auto.triggerConfig as any;
      console.log(`[triggerEvent] Checking rule ${auto.id} triggerConfig:`, config);
      return config?.event === eventName;
    });

    console.log(`[triggerEvent] Matching automations for event:`, matching.length);

    if (matching.length === 0) {
      return;
    }

    console.log(`[AutomationService] Found ${matching.length} matching automations for event "${eventName}"`);

    for (const auto of matching) {
      await queueAutomationJob({
        automationId: auto.id,
        entityType: payload?.type ? `document:${payload.type}` : 'event',
        entityId: payload?.id || null,
        payload,
        context,
      });
    }
  }

  /**
   * CRUD: Create a new automation rule.
   */
  public static async createAutomation(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: any
  ) {
    const parsed = createAutomationSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    let nextRunAt: Date | null = null;
    if (parsed.triggerType === 'schedule') {
      const cronExpr = (parsed.triggerConfig as any).cron;
      if (!cronExpr) {
        throw new ValidationError('Cron expression is required for schedule triggers');
      }
      nextRunAt = calculateNextRunAt(cronExpr);
    }

    const [newAuto] = await db
      .insert(automations)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        description: parsed.description || null,
        isActive: parsed.isActive,
        triggerType: parsed.triggerType,
        triggerConfig: parsed.triggerConfig,
        conditions: parsed.conditions || [],
        actions: parsed.actions,
        nextRunAt,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!newAuto) {
      throw new ValidationError('Failed to create automation rule.');
    }

    await logAudit(db, {
      entityType: 'automation',
      entityId: newAuto.id,
      action: 'create',
      actorId: userId,
      newValues: newAuto,
      tenantId,
      businessId,
      branchId,
    });

    return newAuto;
  }

  /**
   * CRUD: Fetch active automations for the branch.
   */
  public static async getAutomations(
    db: Database,
    context: Required<ScopeContext>
  ) {
    return db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.tenantId, context.tenantId!),
          eq(automations.businessId, context.businessId!),
          eq(automations.branchId, context.branchId!),
          isNull(automations.deletedAt)
        )
      )
      .orderBy(desc(automations.createdAt));
  }

  /**
   * CRUD: Fetch an automation by ID.
   */
  public static async getAutomationById(
    db: Database,
    context: Required<ScopeContext>,
    id: string
  ) {
    const [auto] = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.id, id),
          eq(automations.tenantId, context.tenantId!),
          eq(automations.businessId, context.businessId!),
          eq(automations.branchId, context.branchId!),
          isNull(automations.deletedAt)
        )
      )
      .limit(1);

    if (!auto) {
      throw new NotFoundError('Automation', id);
    }

    return auto;
  }

  /**
   * CRUD: Update an automation rule.
   */
  public static async updateAutomation(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    id: string,
    input: any
  ) {
    const existing = await this.getAutomationById(db, context, id);
    const parsed = updateAutomationSchema.parse(input);

    const updateFields: any = {
      ...parsed,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    // Recalculate nextRunAt if trigger type or cron schedule changes
    if (
      (parsed.triggerType && parsed.triggerType !== existing.triggerType) ||
      (parsed.triggerConfig && (parsed.triggerConfig as any).cron !== (existing.triggerConfig as any).cron)
    ) {
      if ((parsed.triggerType || existing.triggerType) === 'schedule') {
        const cronExpr = (parsed.triggerConfig as any)?.cron || (existing.triggerConfig as any)?.cron;
        if (cronExpr) {
          updateFields.nextRunAt = calculateNextRunAt(cronExpr);
        } else {
          updateFields.nextRunAt = null;
        }
      } else {
        updateFields.nextRunAt = null;
      }
    }

    const [updated] = await db
      .update(automations)
      .set(updateFields)
      .where(eq(automations.id, id))
      .returning();

    await logAudit(db, {
      entityType: 'automation',
      entityId: id,
      action: 'update',
      actorId: userId,
      oldValues: existing,
      newValues: updated,
      tenantId: context.tenantId!,
      businessId: context.businessId!,
      branchId: context.branchId!,
    });

    return updated;
  }

  /**
   * CRUD: Soft delete an automation rule.
   */
  public static async deleteAutomation(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    id: string
  ) {
    const existing = await this.getAutomationById(db, context, id);

    await db
      .update(automations)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(automations.id, id));

    await logAudit(db, {
      entityType: 'automation',
      entityId: id,
      action: 'delete',
      actorId: userId,
      oldValues: existing,
      tenantId: context.tenantId!,
      businessId: context.businessId!,
      branchId: context.branchId!,
    });

    return { success: true };
  }

  /**
   * Logs: Get execution logs for a specific automation rule.
   */
  public static async getAutomationLogs(
    db: Database,
    context: Required<ScopeContext>,
    automationId: string,
    pagination: { limit: number; offset: number } = { limit: 50, offset: 0 }
  ) {
    // Verify automation exists and is within branch scope first
    await this.getAutomationById(db, context, automationId);

    return db
      .select()
      .from(automationLogs)
      .where(
        and(
          eq(automationLogs.automationId, automationId),
          eq(automationLogs.tenantId, context.tenantId!),
          eq(automationLogs.businessId, context.businessId!),
          eq(automationLogs.branchId, context.branchId!)
        )
      )
      .orderBy(desc(automationLogs.executedAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }
}
