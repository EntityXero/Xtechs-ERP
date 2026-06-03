import { eq, and, isNull, desc } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import { notifications, notificationPreferences } from '@xtechs/db/schema';
import { resolveMetadata, type ScopeContext } from './metadata-service.js';
import { queueNotificationJob } from './notifications/queue.js';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import { logAudit } from './audit-service.js';

// System default mapping
export const SYSTEM_DEFAULTS: Record<string, Record<string, boolean>> = {
  workflow_approval: { email: true, in_app: true, sms: false, whatsapp: false },
  workflow_status: { email: false, in_app: true, sms: false, whatsapp: false },
  system_alert: { email: true, in_app: true, sms: false, whatsapp: false },
};

export class NotificationService {
  private static enforceScope(
    context: Required<ScopeContext> & { tokenScope?: string },
    targetScope: { tenantId: string; businessId: string; branchId: string }
  ) {
    if (targetScope.tenantId !== context.tenantId! || targetScope.businessId !== context.businessId!) {
      throw new ForbiddenError('Tenant isolation breach: Notification belongs to another business entity');
    }
    
    // If not admin/all-branches token, enforce branch isolation
    if (context.tokenScope !== 'all-branches' && targetScope.branchId !== context.branchId!) {
      throw new ForbiddenError('Branch isolation breach: Notification belongs to another branch');
    }
  }

  private static getSystemDefault(type: string, channel: string): boolean {
    const typeDefaults = SYSTEM_DEFAULTS[type];
    if (typeDefaults && typeof typeDefaults[channel] === 'boolean') {
      return typeDefaults[channel];
    }
    if (channel === 'in_app' || channel === 'email') return true;
    return false;
  }

  private static resolvePreferenceValue(payload: any, type: string, channel: string): boolean | undefined {
    if (!payload) return undefined;
    
    // 1. Check per-type overrides (e.g. types.workflow_approval.email)
    if (payload.types?.[type] && typeof payload.types[type][channel] === 'boolean') {
      return payload.types[type][channel];
    }
    // 2. Check global channel override (e.g. channels.email)
    if (payload.channels && typeof payload.channels[channel] === 'boolean') {
      return payload.channels[channel];
    }
    return undefined;
  }

  /**
   * Evaluates if a notification of a given type is enabled for a user via a given channel.
   * Scans scope hierarchy: User-Tenant > User-Global > Tenant-Wide Metadata > System Defaults.
   */
  public static async isNotificationEnabled(
    db: Database,
    userId: string,
    tenantId: string,
    type: string,
    channel: string,
    context: ScopeContext
  ): Promise<boolean> {
    // 1. User Tenant-Scoped Preference
    const [userTenantPref] = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.tenantId, tenantId)
        )
      )
      .limit(1);

    const userTenantVal = this.resolvePreferenceValue(userTenantPref?.preferences, type, channel);
    if (userTenantVal !== undefined) return userTenantVal;

    // 2. User Global Preference (across all tenants)
    const [userGlobalPref] = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          isNull(notificationPreferences.tenantId)
        )
      )
      .limit(1);

    const userGlobalVal = this.resolvePreferenceValue(userGlobalPref?.preferences, type, channel);
    if (userGlobalVal !== undefined) return userGlobalVal;

    // 3. Check Tenant-Wide Default Setting via metadata key 'notification_settings'
    try {
      const meta = await resolveMetadata(db, 'notification_settings', { tenantId });
      const tenantVal = this.resolvePreferenceValue(meta?.revision?.payload, type, channel);
      if (tenantVal !== undefined) return tenantVal;
    } catch (err: any) {
      console.error('[NotificationService] Failed to resolve tenant notification settings metadata:', err.message);
    }

    // 4. System Default Fallback
    return this.getSystemDefault(type, channel);
  }

  /**
   * Dispatch a notification (saves metadata record and enqueues BullMQ worker job).
   */
  public static async dispatchNotification(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    params: {
      userId: string;
      channel: string;
      type: string;
      subject: string;
      body: string;
      actionLink?: string | null;
    }
  ) {
    const { userId, channel, type, subject, body, actionLink } = params;
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Check if preference is enabled
    const isEnabled = await this.isNotificationEnabled(db, userId, tenantId, type, channel, context);
    if (!isEnabled) {
      return { success: false, reason: 'disabled_by_preferences' };
    }

    // 2. Create the notification pending record
    const [newNotification] = await db
      .insert(notifications)
      .values({
        tenantId,
        businessId,
        branchId,
        userId,
        channel,
        type,
        subject,
        body,
        actionLink: actionLink || null,
        status: 'pending',
      })
      .returning();

    if (!newNotification) {
      throw new ValidationError('Failed to create notification record.');
    }

    // 3. Queue the background job
    await queueNotificationJob({
      notificationId: newNotification.id,
      context,
    });

    return { success: true, notificationId: newNotification.id };
  }

  /**
   * Fetch in-app notifications for the user, enforcing tenant and branch isolation.
   */
  public static async getUserInAppNotifications(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    userId: string,
    pagination: { limit: number; offset: number } = { limit: 20, offset: 0 }
  ) {
    const baseConditions = [
      eq(notifications.userId, userId),
      eq(notifications.channel, 'in_app'),
      isNull(notifications.deletedAt),
      eq(notifications.tenantId, context.tenantId!),
      eq(notifications.businessId, context.businessId!),
    ];

    if (context.tokenScope !== 'all-branches') {
      baseConditions.push(eq(notifications.branchId, context.branchId!));
    }

    return db
      .select()
      .from(notifications)
      .where(and(...baseConditions))
      .orderBy(desc(notifications.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }

  /**
   * Mark an in-app notification as read.
   */
  public static async markAsRead(
    db: Database,
    context: Required<ScopeContext> & { tokenScope?: string },
    userId: string,
    notificationId: string
  ) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), isNull(notifications.deletedAt)))
      .limit(1);

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    // Enforce branch isolation & self-ownership
    if (notification.userId !== userId) {
      throw new ForbiddenError('Access Denied: You do not own this notification');
    }
    this.enforceScope(context, notification);

    const [updated] = await db
      .update(notifications)
      .set({
        status: 'read',
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(notifications.id, notificationId))
      .returning();

    return updated;
  }

  /**
   * Fetch user notification preferences.
   */
  public static async getUserPreferences(
    db: Database,
    userId: string,
    tenantId?: string | null
  ) {
    const conditions = [eq(notificationPreferences.userId, userId)];
    if (tenantId) {
      conditions.push(eq(notificationPreferences.tenantId, tenantId));
    } else {
      conditions.push(isNull(notificationPreferences.tenantId));
    }

    const [pref] = await db
      .select()
      .from(notificationPreferences)
      .where(and(...conditions))
      .limit(1);

    return pref || { userId, tenantId: tenantId || null, preferences: {} };
  }

  /**
   * Update or create user notification preferences.
   */
  public static async updateUserPreferences(
    db: Database,
    userId: string,
    tenantId: string | null,
    preferences: any
  ) {
    const conditions = [eq(notificationPreferences.userId, userId)];
    if (tenantId) {
      conditions.push(eq(notificationPreferences.tenantId, tenantId));
    } else {
      conditions.push(isNull(notificationPreferences.tenantId));
    }

    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(and(...conditions))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(notificationPreferences)
        .set({
          preferences,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(notificationPreferences)
        .values({
          userId,
          tenantId,
          preferences,
        })
        .returning();
      return inserted;
    }
  }
}
