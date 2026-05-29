import { eq, and } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  departments,
  designations,
  employees,
  leaveRequests,
  documents,
  users,
} from '@xtechs/db/schema';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  createDesignationSchema,
  updateDesignationSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  createLeaveRequestSchema,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
  type CreateDesignationInput,
  type UpdateDesignationInput,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
  type CreateLeaveRequestInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';

export class HrService {
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
  // DEPARTMENTS
  // ==========================================

  public static async createDepartment(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateDepartmentInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createDepartmentSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newDept] = await db
      .insert(departments)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
      })
      .returning();

    if (!newDept) {
      throw new ValidationError('Failed to create department');
    }

    await logAudit(db, {
      entityType: 'department',
      entityId: newDept.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newDept.name },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newDept;
  }

  // ==========================================
  // DESIGNATIONS
  // ==========================================

  public static async createDesignation(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateDesignationInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createDesignationSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newDesg] = await db
      .insert(designations)
      .values({
        tenantId,
        businessId,
        branchId,
        name: parsed.name,
        description: parsed.description,
      })
      .returning();

    if (!newDesg) {
      throw new ValidationError('Failed to create designation');
    }

    await logAudit(db, {
      entityType: 'designation',
      entityId: newDesg.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newDesg.name },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newDesg;
  }

  // ==========================================
  // EMPLOYEES
  // ==========================================

  public static async createEmployee(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateEmployeeInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createEmployeeSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // Validate optional department
      if (parsed.departmentId) {
        const [dept] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, parsed.departmentId))
          .limit(1);
        if (!dept) {
          throw new NotFoundError('Department', parsed.departmentId);
        }
        this.enforceScope(context, dept);
      }

      // Validate optional designation
      if (parsed.designationId) {
        const [desg] = await tx
          .select()
          .from(designations)
          .where(eq(designations.id, parsed.designationId))
          .limit(1);
        if (!desg) {
          throw new NotFoundError('Designation', parsed.designationId);
        }
        this.enforceScope(context, desg);
      }

      // Validate optional linked user has not been already linked to another employee
      if (parsed.userId) {
        const [existingLink] = await tx
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.tenantId, tenantId),
              eq(employees.businessId, businessId),
              eq(employees.userId, parsed.userId)
            )
          )
          .limit(1);
        if (existingLink) {
          throw new ValidationError(`User with ID '${parsed.userId}' is already linked to another employee`);
        }
      }

      const [newEmp] = await tx
        .insert(employees)
        .values({
          tenantId,
          businessId,
          branchId,
          userId: parsed.userId,
          departmentId: parsed.departmentId,
          designationId: parsed.designationId,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          email: parsed.email,
          phone: parsed.phone,
          dateOfJoining: new Date(parsed.dateOfJoining),
          status: parsed.status,
        })
        .returning();

      if (!newEmp) {
        throw new ValidationError('Failed to create employee');
      }

      await logAudit(tx as any, {
        entityType: 'employee',
        entityId: newEmp.id,
        action: 'create',
        actorId: userId,
        newValues: { name: `${newEmp.firstName} ${newEmp.lastName}`, email: newEmp.email },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return newEmp;
    });
  }

  public static async updateEmployee(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    employeeId: string,
    input: UpdateEmployeeInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = updateEmployeeSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      const [emp] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!emp) {
        throw new NotFoundError('Employee', employeeId);
      }
      this.enforceScope(context, emp);

      // Validate optional department
      if (parsed.departmentId) {
        const [dept] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, parsed.departmentId))
          .limit(1);
        if (!dept) {
          throw new NotFoundError('Department', parsed.departmentId);
        }
        this.enforceScope(context, dept);
      }

      // Validate optional designation
      if (parsed.designationId) {
        const [desg] = await tx
          .select()
          .from(designations)
          .where(eq(designations.id, parsed.designationId))
          .limit(1);
        if (!desg) {
          throw new NotFoundError('Designation', parsed.designationId);
        }
        this.enforceScope(context, desg);
      }

      // Validate user links
      if (parsed.userId && parsed.userId !== emp.userId) {
        const [existingLink] = await tx
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.tenantId, tenantId),
              eq(employees.businessId, businessId),
              eq(employees.userId, parsed.userId)
            )
          )
          .limit(1);
        if (existingLink) {
          throw new ValidationError(`User with ID '${parsed.userId}' is already linked to another employee`);
        }
      }

      const [updated] = await tx
        .update(employees)
        .set({
          ...parsed,
          dateOfJoining: parsed.dateOfJoining ? new Date(parsed.dateOfJoining) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId))
        .returning();

      if (!updated) {
        throw new ValidationError('Failed to update employee');
      }

      await logAudit(tx as any, {
        entityType: 'employee',
        entityId: employeeId,
        action: 'update',
        actorId: userId,
        oldValues: { status: emp.status, departmentId: emp.departmentId, designationId: emp.designationId },
        newValues: { status: updated.status, departmentId: updated.departmentId, designationId: updated.designationId },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return updated;
    });
  }

  // ==========================================
  // LEAVE REQUESTS
  // ==========================================

  public static async createLeaveRequest(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateLeaveRequestInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createLeaveRequestSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // Validate employee existence
      const [emp] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, parsed.employeeId))
        .limit(1);

      if (!emp) {
        throw new NotFoundError('Employee', parsed.employeeId);
      }
      this.enforceScope(context, emp);

      // Create document header (starts as Draft)
      const [doc] = await tx
        .insert(documents)
        .values({
          tenantId,
          businessId,
          branchId,
          type: 'leave_request',
          status: 'active',
          workflowState: 'draft',
          data: {
            employeeId: parsed.employeeId,
            leaveType: parsed.leaveType,
            fromDate: parsed.fromDate,
            toDate: parsed.toDate,
            reason: parsed.reason,
          },
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!doc) {
        throw new ValidationError('Failed to create leave request document header');
      }

      // Create leave request detail
      const [leaveReq] = await tx
        .insert(leaveRequests)
        .values({
          tenantId,
          businessId,
          branchId,
          documentId: doc.id,
          employeeId: parsed.employeeId,
          leaveType: parsed.leaveType,
          fromDate: new Date(parsed.fromDate),
          toDate: new Date(parsed.toDate),
          reason: parsed.reason,
        })
        .returning();

      if (!leaveReq) {
        throw new ValidationError('Failed to create leave request');
      }

      await logAudit(tx as any, {
        entityType: 'document:leave_request',
        entityId: doc.id,
        action: 'create',
        actorId: userId,
        newValues: { leaveRequestId: leaveReq.id, leaveType: leaveReq.leaveType },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return {
        ...leaveReq,
        document: doc,
      };
    });
  }

  public static async postLeaveRequest(
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

      if (doc.type !== 'leave_request') {
        throw new ValidationError(`Document type must be 'leave_request', got: ${doc.type}`);
      }

      if (doc.workflowState === 'posted') {
        throw new ValidationError('This leave request is already approved.');
      }

      // In modular design, we just transition the workflowState of the document to 'posted' (Approved).
      // No complex accruals for now as requested by user.
      const [updatedDoc] = await tx
        .update(documents)
        .set({
          workflowState: 'posted',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
        .returning();

      if (!updatedDoc) {
        throw new ValidationError('Failed to approve leave request');
      }

      await logAudit(tx as any, {
        entityType: 'document:leave_request',
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
