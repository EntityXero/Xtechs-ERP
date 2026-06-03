import { z } from 'zod';

export const notificationChannels = ['in_app', 'email', 'sms', 'whatsapp'] as const;
export type NotificationChannel = typeof notificationChannels[number];

export const notificationTypes = ['workflow_approval', 'workflow_status', 'system_alert'] as const;
export type NotificationType = typeof notificationTypes[number];

export const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  channel: z.enum(notificationChannels),
  type: z.enum(notificationTypes),
  subject: z.string().min(1).max(255),
  body: z.string().min(1).max(4000),
  actionLink: z.string().max(512).optional().nullable(),
});

export const updateNotificationPreferencesSchema = z.object({
  tenantId: z.string().uuid().optional().nullable(),
  preferences: z.object({
    channels: z.object({
      email: z.boolean().optional(),
      in_app: z.boolean().optional(),
      sms: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
    }).optional(),
    types: z.record(
      z.string(),
      z.object({
        email: z.boolean().optional(),
        in_app: z.boolean().optional(),
        sms: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
      })
    ).optional(),
  }),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
