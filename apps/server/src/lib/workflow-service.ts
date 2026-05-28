import { eq, and, or, isNull, lt, sql, desc, gt } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  documents,
  workflowApprovals,
  workflowDelegations,
  documentActivities,
  userRoles,
  roles,
} from '@xtechs/db/schema';
import { resolveMetadata, type ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import { DOCUMENT_LIFECYCLE, DOCUMENT_TRANSITIONS } from '@xtechs/shared';

/**
 * Resolves a dotted path in a nested object.
 */
function getFieldValue(obj: any, path: string): any {
  if (!obj) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Checks a single condition against a document.
 */
function evaluateCondition(doc: any, condition: { field: string; operator: string; value: any }): boolean {
  const actualValue = getFieldValue(doc, condition.field);
  const expectedValue = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actualValue === expectedValue;
    case 'neq':
      return actualValue !== expectedValue;
    case 'gt':
      if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
        return actualValue > expectedValue;
      }
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue > expectedValue;
      }
      return false;
    case 'gte':
      if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
        return actualValue >= expectedValue;
      }
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue >= expectedValue;
      }
      return false;
    case 'lt':
      if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
        return actualValue < expectedValue;
      }
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue < expectedValue;
      }
      return false;
    case 'lte':
      if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
        return actualValue <= expectedValue;
      }
      if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
        return actualValue <= expectedValue;
      }
      return false;
    case 'contains':
      if (Array.isArray(actualValue)) {
        return actualValue.includes(expectedValue);
      }
      if (typeof actualValue === 'string') {
        return actualValue.includes(String(expectedValue));
      }
      return false;
    case 'in':
      if (Array.isArray(expectedValue)) {
        return expectedValue.includes(actualValue);
      }
      return false;
    default:
      return false;
  }
}

/**
 * Evaluates all declarative conditions. All must be true.
 */
export function evaluateConditions(doc: any, conditions?: { field: string; operator: string; value: any }[]): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => evaluateCondition(doc, cond));
}

/**
 * Helper to check if a user has a specific role in a branch.
 */
export async function checkUserHasRole(db: any, userId: string, branchId: string, roleName: string): Promise<boolean> {
  const result = await db
    .select()
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.branchId, branchId),
        eq(roles.name, roleName)
      )
    )
    .limit(1);
  return result.length > 0;
}

/**
 * Workflow Service.
 * Manages document transitions, approvals, delegation, and escalation.
 */
export class WorkflowService {
  /**
   * Safe branch scope enforcement helper.
   */
  private static enforceBranchScope(
    context: Required<ScopeContext>,
    scope: { tenantId: string; businessId: string; branchId: string }
  ) {
    if (
      scope.tenantId !== context.tenantId ||
      scope.businessId !== context.businessId ||
      scope.branchId !== context.branchId
    ) {
      throw new ForbiddenError('Branch isolation breach');
    }
  }

  /**
   * Evaluate conditions and transition a document or spawn approvals.
   */
  public static async processTransition(
    db: any,
    context: Required<ScopeContext>,
    userId: string,
    documentId: string,
    event: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Fetch document header
    const [doc] = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenantId, tenantId),
          eq(documents.businessId, businessId),
          eq(documents.branchId, branchId)
        )
      )
      .limit(1);

    if (!doc) {
      throw new NotFoundError('Document', documentId);
    }

    // Immutable posted documents rule
    if (doc.workflowState === DOCUMENT_LIFECYCLE.POSTED) {
      throw new ValidationError('Posted documents are finalized and strictly immutable.');
    }

    let targetState: string | null = null;
    let approvalsConfig: any = null;

    // 2. Resolve custom workflow metadata
    const workflowMeta = await resolveMetadata(db, `${doc.type}_workflow`, context);
    if (workflowMeta && workflowMeta.revision) {
      const workflowPayload = workflowMeta.revision.payload as any;
      const stateConfig = workflowPayload.states?.[doc.workflowState];
      if (stateConfig && Array.isArray(stateConfig.transitions)) {
        // Find the first transition matching the event whose conditions are met
        const transition = stateConfig.transitions.find((t: any) => {
          if (t.event !== event) return false;
          return evaluateConditions(doc, t.conditions);
        });

        if (transition) {
          targetState = transition.to;
          approvalsConfig = transition.approvals;
        } else {
          // Check if there was a transition matching event, but conditions failed
          const anyTransitionWithEvent = stateConfig.transitions.some((t: any) => t.event === event);
          if (anyTransitionWithEvent) {
            throw new ValidationError(`Transition conditions not met for event '${event}'`);
          }
        }
      }
    }

    // 3. Fall back to standard core lifecycle transitions if no custom workflow metadata is present
    if (!targetState) {
      const allowedStandard = DOCUMENT_TRANSITIONS[doc.workflowState as keyof typeof DOCUMENT_TRANSITIONS] || [];
      const matchingTarget = allowedStandard.find((state) => {
        if (event === 'submit' && state === DOCUMENT_LIFECYCLE.PENDING_APPROVAL) return true;
        if (event === 'approve' && state === DOCUMENT_LIFECYCLE.APPROVED) return true;
        if (event === 'post' && state === DOCUMENT_LIFECYCLE.POSTED) return true;
        if (event === 'reverse' && state === DOCUMENT_LIFECYCLE.REVERSED) return true;
        if (event === 'archive' && state === DOCUMENT_LIFECYCLE.ARCHIVED) return true;
        if (event === 'reject' && state === DOCUMENT_LIFECYCLE.DRAFT) return true;
        return false;
      });

      if (!matchingTarget) {
        throw new ValidationError(`Invalid transition event '${event}' from state '${doc.workflowState}'`);
      }
      targetState = matchingTarget;
    }

    // 4. Handle Approvals Spawning if required
    if (approvalsConfig && (approvalsConfig.roles?.length || approvalsConfig.users?.length)) {
      const savedDoc = await db.transaction(async (tx: any) => {
        const now = new Date();
        // Drop any existing pending/delegated/escalated approvals for this document and event to prevent duplication
        await tx
          .delete(workflowApprovals)
          .where(
            and(
              eq(workflowApprovals.documentId, documentId),
              eq(workflowApprovals.transitionEvent, event)
            )
          );

        const escalationDeadline = approvalsConfig.escalationHours
          ? new Date(Date.now() + approvalsConfig.escalationHours * 60 * 60 * 1000)
          : null;

        // Spawn Role-based approvals
        if (Array.isArray(approvalsConfig.roles)) {
          for (const role of approvalsConfig.roles) {
            await tx.insert(workflowApprovals).values({
              tenantId,
              businessId,
              branchId,
              documentId,
              transitionEvent: event,
              requiredRole: role,
              status: 'pending',
              escalationDeadline,
              escalatedToRole: approvalsConfig.escalateToRole || null,
            });
          }
        }

        // Spawn User-based approvals (checking delegations!)
        if (Array.isArray(approvalsConfig.users)) {
          for (const assignedUser of approvalsConfig.users) {
            // Find active delegation for this user in this branch
            const [delegation] = await tx
              .select()
              .from(workflowDelegations)
              .where(
                and(
                  eq(workflowDelegations.tenantId, tenantId),
                  eq(workflowDelegations.businessId, businessId),
                  eq(workflowDelegations.branchId, branchId),
                  eq(workflowDelegations.delegatorId, assignedUser),
                  eq(workflowDelegations.isActive, true),
                  lt(workflowDelegations.startDate, now),
                  gt(workflowDelegations.endDate, now)
                )
              )
              .limit(1);

            await tx.insert(workflowApprovals).values({
              tenantId,
              businessId,
              branchId,
              documentId,
              transitionEvent: event,
              assignedUserId: assignedUser,
              delegatedTo: delegation ? delegation.delegateeId : null,
              status: delegation ? 'delegated' : 'pending',
              escalationDeadline,
              escalatedToRole: approvalsConfig.escalateToRole || null,
            });
          }
        }

        // Update document state to pending approval
        const [updatedDoc] = await tx
          .update(documents)
          .set({
            workflowState: DOCUMENT_LIFECYCLE.PENDING_APPROVAL,
            updatedBy: userId,
            updatedAt: now,
          })
          .where(eq(documents.id, documentId))
          .returning();

        // Log submitted Activity
        await tx.insert(documentActivities).values({
          tenantId,
          businessId,
          branchId,
          documentId,
          actorId: userId,
          activityType: 'submitted',
          description: `Document submitted for approval via event '${event}'`,
        });

        return updatedDoc;
      });

      // Audit log transition
      await logAudit(db, {
        entityType: `document:${savedDoc.type}`,
        entityId: savedDoc.id,
        action: 'transition',
        actorId: userId,
        oldValues: { workflowState: doc.workflowState },
        newValues: { workflowState: savedDoc.workflowState },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return savedDoc;
    }

    // 5. No approvals required — transition immediately!
    const savedDoc = await db.transaction(async (tx: any) => {
      const [updatedDoc] = await tx
        .update(documents)
        .set({
          workflowState: targetState!,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
        .returning();

      // Log transition Activity
      await tx.insert(documentActivities).values({
        tenantId,
        businessId,
        branchId,
        documentId,
        actorId: userId,
        activityType: 'transitioned',
        description: `Document transitioned from '${doc.workflowState}' to '${targetState}' via event '${event}'`,
      });

      return updatedDoc;
    });

    await logAudit(db, {
      entityType: `document:${savedDoc.type}`,
      entityId: savedDoc.id,
      action: 'transition',
      actorId: userId,
      oldValues: { workflowState: doc.workflowState },
      newValues: { workflowState: savedDoc.workflowState },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return savedDoc;
  }

  /**
   * Approve a pending approval request.
   */
  public static async approveRequest(
    db: any,
    context: Required<ScopeContext>,
    userId: string,
    approvalId: string,
    comments?: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Fetch approval record
    const [approval] = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.id, approvalId),
          eq(workflowApprovals.tenantId, tenantId),
          eq(workflowApprovals.businessId, businessId),
          eq(workflowApprovals.branchId, branchId)
        )
      )
      .limit(1);

    if (!approval) {
      throw new NotFoundError('WorkflowApproval', approvalId);
    }

    if (approval.status !== 'pending' && approval.status !== 'delegated' && approval.status !== 'escalated') {
      throw new ValidationError(`Approval request is already in '${approval.status}' status`);
    }

    // 2. Validate Authorization
    let isAuthorized = false;

    if (approval.assignedUserId) {
      // Direct assignment or delegation checks
      if (approval.assignedUserId === userId || approval.delegatedTo === userId) {
        isAuthorized = true;
      }
    }

    if (approval.requiredRole) {
      // Role-based authorization check
      const hasRole = await checkUserHasRole(db, userId, branchId, approval.requiredRole);
      if (hasRole) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenError('Not authorized to approve this request');
    }

    // 3. Mark approval as approved
    const updatedApproval = await db.transaction(async (tx: any) => {
      const [appr] = await tx
        .update(workflowApprovals)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          comments: comments || null,
          updatedAt: new Date(),
        })
        .where(eq(workflowApprovals.id, approvalId))
        .returning();

      // Log activity
      await tx.insert(documentActivities).values({
        tenantId,
        businessId,
        branchId,
        documentId: approval.documentId,
        actorId: userId,
        activityType: 'approved',
        description: `Approval approved for event '${approval.transitionEvent}'`,
      });

      return appr;
    });

    // 4. Check if the required count of approvals for this transition is complete!
    // Fetch document to resolve its current workflow metadata
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, approval.documentId))
      .limit(1);

    if (!doc) {
      throw new NotFoundError('Document', approval.documentId);
    }

    let targetState = DOCUMENT_LIFECYCLE.APPROVED;
    let requiredCount = 1;

    const workflowMeta = await resolveMetadata(db, `${doc.type}_workflow`, context);
    if (workflowMeta && workflowMeta.revision) {
      const workflowPayload = workflowMeta.revision.payload as any;
      // Note: when pending approval, the current state of the document is pending_approval,
      // but the approvals were spawned from the PREVIOUS state transition rules.
      // So we have to scan the states to find the matching transition for this event.
      let foundTransition = false;
      for (const [stateName, stateConfig] of Object.entries(workflowPayload.states || {})) {
        const matchingTrans = (stateConfig as any).transitions?.find((t: any) => t.event === approval.transitionEvent);
        if (matchingTrans) {
          targetState = matchingTrans.to;
          requiredCount = matchingTrans.approvals?.requiredCount || 1;
          foundTransition = true;
          break;
        }
      }
    }

    // Count approved requests for this document and event
    const approvedList = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.documentId, approval.documentId),
          eq(workflowApprovals.transitionEvent, approval.transitionEvent),
          eq(workflowApprovals.status, 'approved')
        )
      );

    const approvedCount = approvedList.length;

    if (approvedCount >= requiredCount) {
      // Transition document to the target state!
      await db.transaction(async (tx: any) => {
        await tx
          .update(documents)
          .set({
            workflowState: targetState,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, approval.documentId));

        // Cancel all remaining pending/delegated/escalated approvals for this transition
        await tx
          .update(workflowApprovals)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowApprovals.documentId, approval.documentId),
              eq(workflowApprovals.transitionEvent, approval.transitionEvent),
              or(
                eq(workflowApprovals.status, 'pending'),
                eq(workflowApprovals.status, 'delegated'),
                eq(workflowApprovals.status, 'escalated')
              )
            )
          );

        // Log final transition activity
        await tx.insert(documentActivities).values({
          tenantId,
          businessId,
          branchId,
          documentId: approval.documentId,
          actorId: userId,
          activityType: 'transitioned',
          description: `All required approvals met. Document transitioned to state '${targetState}'`,
        });
      });

      // Audit Log the final transition
      await logAudit(db, {
        entityType: `document:${doc.type}`,
        entityId: doc.id,
        action: 'transition',
        actorId: userId,
        oldValues: { workflowState: doc.workflowState },
        newValues: { workflowState: targetState },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });
    }

    return updatedApproval;
  }

  /**
   * Reject a pending approval request.
   */
  public static async rejectRequest(
    db: any,
    context: Required<ScopeContext>,
    userId: string,
    approvalId: string,
    comments?: string,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // 1. Fetch approval record
    const [approval] = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.id, approvalId),
          eq(workflowApprovals.tenantId, tenantId),
          eq(workflowApprovals.businessId, businessId),
          eq(workflowApprovals.branchId, branchId)
        )
      )
      .limit(1);

    if (!approval) {
      throw new NotFoundError('WorkflowApproval', approvalId);
    }

    if (approval.status !== 'pending' && approval.status !== 'delegated' && approval.status !== 'escalated') {
      throw new ValidationError(`Approval request is already in '${approval.status}' status`);
    }

    // 2. Authorization validation
    let isAuthorized = false;

    if (approval.assignedUserId) {
      if (approval.assignedUserId === userId || approval.delegatedTo === userId) {
        isAuthorized = true;
      }
    }

    if (approval.requiredRole) {
      const hasRole = await checkUserHasRole(db, userId, branchId, approval.requiredRole);
      if (hasRole) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenError('Not authorized to reject this request');
    }

    // 3. Perform rejection transaction:
    // Mark request as rejected, return document to Draft, and cancel other approvals
    const updatedApproval = await db.transaction(async (tx: any) => {
      const [appr] = await tx
        .update(workflowApprovals)
        .set({
          status: 'rejected',
          approvedBy: userId,
          approvedAt: new Date(),
          comments: comments || null,
          updatedAt: new Date(),
        })
        .where(eq(workflowApprovals.id, approvalId))
        .returning();

      // Return document back to Draft state
      await tx
        .update(documents)
        .set({
          workflowState: DOCUMENT_LIFECYCLE.DRAFT,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, approval.documentId));

      // Cancel all other approvals for this transition
      await tx
        .update(workflowApprovals)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowApprovals.documentId, approval.documentId),
            eq(workflowApprovals.transitionEvent, approval.transitionEvent),
            or(
              eq(workflowApprovals.status, 'pending'),
              eq(workflowApprovals.status, 'delegated'),
              eq(workflowApprovals.status, 'escalated')
            )
          )
        );

      // Log activities
      await tx.insert(documentActivities).values({
        tenantId,
        businessId,
        branchId,
        documentId: approval.documentId,
        actorId: userId,
        activityType: 'rejected',
        description: `Approval rejected. Document returned to draft state.`,
      });

      return appr;
    });

    return updatedApproval;
  }

  /**
   * Manually delegate an approval request to another user.
   */
  public static async delegateApproval(
    db: any,
    context: Required<ScopeContext>,
    userId: string,
    approvalId: string,
    targetUserId: string
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [approval] = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.id, approvalId),
          eq(workflowApprovals.tenantId, tenantId),
          eq(workflowApprovals.businessId, businessId),
          eq(workflowApprovals.branchId, branchId)
        )
      )
      .limit(1);

    if (!approval) {
      throw new NotFoundError('WorkflowApproval', approvalId);
    }

    if (approval.status !== 'pending' && approval.status !== 'delegated' && approval.status !== 'escalated') {
      throw new ValidationError(`Approval request is already in '${approval.status}' status`);
    }

    // Verify target branch scope (delegatee must exist or be compatible)
    const [delegate] = await db
      .select()
      .from(workflowApprovals)
      .update(workflowApprovals)
      .set({
        delegatedTo: targetUserId,
        status: 'delegated',
        updatedAt: new Date(),
      })
      .where(eq(workflowApprovals.id, approvalId))
      .returning();

    // Log delegation Activity
    await db.insert(documentActivities).values({
      tenantId,
      businessId,
      branchId,
      documentId: approval.documentId,
      actorId: userId,
      activityType: 'delegated',
      description: `Approval request manually delegated to user '${targetUserId}'`,
    });

    return delegate;
  }

  /**
   * Configures a global delegation rule.
   */
  public static async createDelegationRule(
    db: any,
    context: Required<ScopeContext>,
    userId: string,
    input: { delegatorId: string; delegateeId: string; startDate: Date; endDate: Date }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Delegator permission verification: user can create delegation rules for themselves or requires admin
    if (input.delegatorId !== userId) {
      const isAdmin = await checkUserHasRole(db, userId, branchId, 'Admin');
      if (!isAdmin) {
        throw new ForbiddenError('Only admins or the delegator themselves can set up delegation rules');
      }
    }

    const [rule] = await db
      .insert(workflowDelegations)
      .values({
        tenantId,
        businessId,
        branchId,
        delegatorId: input.delegatorId,
        delegateeId: input.delegateeId,
        startDate: input.startDate,
        endDate: input.endDate,
        isActive: true,
      })
      .returning();

    return rule;
  }

  /**
   * Background-job driven Escalation engine.
   * Finds all expired pending approvals and automatically elevates them to backup roles.
   */
  public static async escalatePastDueApprovals(db: any) {
    const now = new Date();

    // Query pending/delegated approvals where deadline is in the past and escalateToRole is set
    const expiredList = await db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          or(eq(workflowApprovals.status, 'pending'), eq(workflowApprovals.status, 'delegated')),
          lt(workflowApprovals.escalationDeadline, now),
          sql`${workflowApprovals.escalatedToRole} IS NOT NULL`
        )
      );

    const escalatedCount = expiredList.length;

    for (const app of expiredList) {
      await db.transaction(async (tx: any) => {
        // Fetch document creator as fallback actorId
        const [doc] = await tx
          .select({ createdBy: documents.createdBy })
          .from(documents)
          .where(eq(documents.id, app.documentId))
          .limit(1);

        const actorId = app.assignedUserId || app.approvedBy || doc?.createdBy;

        // Update approval record to the escalated role
        await tx
          .update(workflowApprovals)
          .set({
            requiredRole: app.escalatedToRole,
            assignedUserId: null, // clear original user assignment to escalate to role
            delegatedTo: null,
            status: 'escalated',
            escalationDeadline: null, // prevent multiple escalations
            updatedAt: new Date(),
          })
          .where(eq(workflowApprovals.id, app.id));

        // Log document activity
        await tx.insert(documentActivities).values({
          tenantId: app.tenantId,
          businessId: app.businessId,
          branchId: app.branchId,
          documentId: app.documentId,
          actorId: actorId!,
          activityType: 'escalated',
          description: `Approval automatically escalated to Role '${app.escalatedToRole}' due to deadline expiration`,
        });
      });
    }

    return { escalatedCount };
  }
}
