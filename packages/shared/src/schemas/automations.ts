import { z } from 'zod';

export const automationTriggerTypes = ['event', 'schedule'] as const;
export type AutomationTriggerType = typeof automationTriggerTypes[number];

export const automationOperators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
export type AutomationOperator = typeof automationOperators[number];

export const automationActionTypes = ['notification', 'workflow_transition'] as const;
export type AutomationActionType = typeof automationActionTypes[number];

// Schema for triggers
export const triggerConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('event'),
    event: z.string().min(1),
  }),
  z.object({
    type: z.literal('schedule'),
    cron: z.string().min(5), // simplified cron validation, e.g. "0 9 * * *"
  }),
]);

// Schema for conditions
export const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(automationOperators),
  value: z.any(),
});

// Schema for actions
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('notification'),
    payload: z.object({
      userId: z.string().uuid().optional(), // If empty, can be resolved dynamically from event context (e.g., invoice creator)
      channel: z.enum(['in_app', 'email', 'sms', 'whatsapp']),
      subject: z.string().min(1).max(255),
      body: z.string().min(1).max(4000),
      actionLink: z.string().max(512).optional().nullable(),
    }),
  }),
  z.object({
    type: z.literal('workflow_transition'),
    payload: z.object({
      documentIdField: z.string().min(1).optional(), // Field in event payload that contains the document ID (e.g., 'id' or 'documentId')
      transition: z.string().min(1),
    }),
  }),
]);

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  triggerType: z.enum(automationTriggerTypes),
  triggerConfig: triggerConfigSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
});

export const updateAutomationSchema = createAutomationSchema.partial();

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type AutomationCondition = z.infer<typeof conditionSchema>;
export type AutomationAction = z.infer<typeof actionSchema>;
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;
