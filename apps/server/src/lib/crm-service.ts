import { eq, and } from 'drizzle-orm';
import type { Database } from '@xtechs/db';
import {
  addresses,
  contacts,
  customers,
  leads,
  opportunities,
} from '@xtechs/db/schema';
import {
  createAddressSchema,
  createContactSchema,
  createCustomerSchema,
  updateCustomerSchema,
  createLeadSchema,
  updateLeadSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  type CreateAddressInput,
  type CreateContactInput,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CreateLeadInput,
  type UpdateLeadInput,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
} from '@xtechs/shared';
import { ValidationError, NotFoundError, ForbiddenError } from './errors.js';
import type { ScopeContext } from './metadata-service.js';
import { logAudit } from './audit-service.js';

export class CrmService {
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
  // ADDRESSES
  // ==========================================

  public static async createAddress(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateAddressInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createAddressSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newAddress] = await db
      .insert(addresses)
      .values({
        tenantId,
        businessId,
        branchId,
        parentType: parsed.parentType,
        parentId: parsed.parentId,
        addressType: parsed.addressType,
        addressLine1: parsed.addressLine1,
        addressLine2: parsed.addressLine2,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        zip: parsed.zip,
      })
      .returning();

    if (!newAddress) {
      throw new ValidationError('Failed to create address');
    }

    await logAudit(db, {
      entityType: 'address',
      entityId: newAddress.id,
      action: 'create',
      actorId: userId,
      newValues: { parentType: newAddress.parentType, parentId: newAddress.parentId, addressType: newAddress.addressType },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newAddress;
  }

  // ==========================================
  // CONTACTS
  // ==========================================

  public static async createContact(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateContactInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createContactSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newContact] = await db
      .insert(contacts)
      .values({
        tenantId,
        businessId,
        branchId,
        parentType: parsed.parentType,
        parentId: parsed.parentId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        phone: parsed.phone,
        isPrimary: parsed.isPrimary ? new Date(parsed.isPrimary) : null,
      })
      .returning();

    if (!newContact) {
      throw new ValidationError('Failed to create contact');
    }

    await logAudit(db, {
      entityType: 'contact',
      entityId: newContact.id,
      action: 'create',
      actorId: userId,
      newValues: { parentType: newContact.parentType, parentId: newContact.parentId, email: newContact.email },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newContact;
  }

  // ==========================================
  // CUSTOMERS
  // ==========================================

  public static async createCustomer(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateCustomerInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createCustomerSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Check duplicate email
    const existing = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, tenantId),
          eq(customers.businessId, businessId),
          eq(customers.branchId, branchId),
          eq(customers.email, parsed.email)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Customer with email '${parsed.email}' already exists`);
    }

    const [newCustomer] = await db
      .insert(customers)
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

    if (!newCustomer) {
      throw new ValidationError('Failed to create customer');
    }

    await logAudit(db, {
      entityType: 'customer',
      entityId: newCustomer.id,
      action: 'create',
      actorId: userId,
      newValues: { name: newCustomer.name, email: newCustomer.email },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newCustomer;
  }

  public static async updateCustomer(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    customerId: string,
    input: UpdateCustomerInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = updateCustomerSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!cust) {
      throw new NotFoundError('Customer', customerId);
    }
    this.enforceScope(context, cust);

    const [updated] = await db
      .update(customers)
      .set({
        ...parsed,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))
      .returning();

    if (!updated) {
      throw new ValidationError('Failed to update customer');
    }

    await logAudit(db, {
      entityType: 'customer',
      entityId: customerId,
      action: 'update',
      actorId: userId,
      oldValues: { name: cust.name, status: cust.status },
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
  // LEADS
  // ==========================================

  public static async createLead(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateLeadInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createLeadSchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [newLead] = await db
      .insert(leads)
      .values({
        tenantId,
        businessId,
        branchId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        company: parsed.company,
        email: parsed.email,
        phone: parsed.phone,
        status: parsed.status,
      })
      .returning();

    if (!newLead) {
      throw new ValidationError('Failed to create lead');
    }

    await logAudit(db, {
      entityType: 'lead',
      entityId: newLead.id,
      action: 'create',
      actorId: userId,
      newValues: { name: `${newLead.firstName} ${newLead.lastName}`, company: newLead.company, status: newLead.status },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newLead;
  }

  public static async updateLeadStatus(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    leadId: string,
    status: 'new' | 'contacted' | 'qualified' | 'lost',
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      throw new NotFoundError('Lead', leadId);
    }
    this.enforceScope(context, lead);

    const [updated] = await db
      .update(leads)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    if (!updated) {
      throw new ValidationError('Failed to update lead status');
    }

    await logAudit(db, {
      entityType: 'lead',
      entityId: leadId,
      action: 'transition',
      actorId: userId,
      oldValues: { status: lead.status },
      newValues: { status },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return updated;
  }

  /**
   * Leads Workflow: Lead -> Qualified -> Convert to Opportunity & Customer
   */
  public static async convertLeadToOpportunity(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    leadId: string,
    opportunityTitle: string,
    expectedValue: number,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    return db.transaction(async (tx) => {
      // 1. Fetch Lead
      const [lead] = await tx
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!lead) {
        throw new NotFoundError('Lead', leadId);
      }
      this.enforceScope(context, lead);

      if (lead.status === 'qualified') {
        throw new ValidationError('Lead is already qualified and converted.');
      }

      // 2. Mark Lead as Qualified
      await tx
        .update(leads)
        .set({ status: 'qualified', updatedAt: new Date() })
        .where(eq(leads.id, leadId));

      await logAudit(tx as any, {
        entityType: 'lead',
        entityId: leadId,
        action: 'transition',
        actorId: userId,
        oldValues: { status: lead.status },
        newValues: { status: 'qualified' },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      // 3. Create Customer
      const customerName = lead.company || `${lead.firstName} ${lead.lastName}`;
      const [customer] = await tx
        .insert(customers)
        .values({
          tenantId,
          businessId,
          branchId,
          name: customerName,
          email: lead.email,
          phone: lead.phone,
          status: 'active',
        })
        .returning();

      if (!customer) {
        throw new ValidationError('Failed to create customer during conversion');
      }

      await logAudit(tx as any, {
        entityType: 'customer',
        entityId: customer.id,
        action: 'create',
        actorId: userId,
        newValues: { name: customer.name, email: customer.email },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      // Link any Address or Contact polymorphically to this new Customer
      const leadAddresses = await tx
        .select()
        .from(addresses)
        .where(and(eq(addresses.parentId, leadId), eq(addresses.parentType, 'lead')));

      for (const addr of leadAddresses) {
        await tx.insert(addresses).values({
          tenantId,
          businessId,
          branchId,
          parentType: 'customer',
          parentId: customer.id,
          addressType: addr.addressType,
          addressLine1: addr.addressLine1,
          addressLine2: addr.addressLine2,
          city: addr.city,
          state: addr.state,
          country: addr.country,
          zip: addr.zip,
        });
      }

      const leadContacts = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.parentId, leadId), eq(contacts.parentType, 'lead')));

      for (const cnt of leadContacts) {
        await tx.insert(contacts).values({
          tenantId,
          businessId,
          branchId,
          parentType: 'customer',
          parentId: customer.id,
          firstName: cnt.firstName,
          lastName: cnt.lastName,
          email: cnt.email,
          phone: cnt.phone,
          isPrimary: cnt.isPrimary,
        });
      }

      // 4. Create Opportunity
      const [opportunity] = await tx
        .insert(opportunities)
        .values({
          tenantId,
          businessId,
          branchId,
          leadId,
          customerId: customer.id,
          title: opportunityTitle,
          expectedValue: expectedValue.toString(),
          stage: 'prospecting',
        })
        .returning();

      if (!opportunity) {
        throw new ValidationError('Failed to create opportunity during conversion');
      }

      await logAudit(tx as any, {
        entityType: 'opportunity',
        entityId: opportunity.id,
        action: 'create',
        actorId: userId,
        newValues: { title: opportunity.title, expectedValue },
        tenantId,
        businessId,
        branchId,
        requestId: auditCtx?.requestId,
        ipAddress: auditCtx?.ipAddress,
      });

      return { customer, opportunity };
    });
  }

  // ==========================================
  // OPPORTUNITIES
  // ==========================================

  public static async createOpportunity(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    input: CreateOpportunityInput,
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const parsed = createOpportunitySchema.parse(input);
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    // Validate relationships
    if (parsed.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, parsed.leadId)).limit(1);
      if (!lead) throw new NotFoundError('Lead', parsed.leadId);
      this.enforceScope(context, lead);
    }

    if (parsed.customerId) {
      const [customer] = await db.select().from(customers).where(eq(customers.id, parsed.customerId)).limit(1);
      if (!customer) throw new NotFoundError('Customer', parsed.customerId);
      this.enforceScope(context, customer);
    }

    const [newOpportunity] = await db
      .insert(opportunities)
      .values({
        tenantId,
        businessId,
        branchId,
        leadId: parsed.leadId,
        customerId: parsed.customerId,
        title: parsed.title,
        expectedValue: parsed.expectedValue.toString(),
        stage: parsed.stage,
        expectedCloseDate: parsed.expectedCloseDate ? new Date(parsed.expectedCloseDate) : null,
      })
      .returning();

    if (!newOpportunity) {
      throw new ValidationError('Failed to create opportunity');
    }

    await logAudit(db, {
      entityType: 'opportunity',
      entityId: newOpportunity.id,
      action: 'create',
      actorId: userId,
      newValues: { title: newOpportunity.title, expectedValue: newOpportunity.expectedValue, stage: newOpportunity.stage },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return newOpportunity;
  }

  public static async updateOpportunityStage(
    db: Database,
    context: Required<ScopeContext>,
    userId: string,
    opportunityId: string,
    stage: 'prospecting' | 'proposal' | 'negotiation' | 'won' | 'lost',
    auditCtx?: { requestId?: string; ipAddress?: string }
  ) {
    const tenantId = context.tenantId!;
    const businessId = context.businessId!;
    const branchId = context.branchId!;

    const [opp] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .limit(1);

    if (!opp) {
      throw new NotFoundError('Opportunity', opportunityId);
    }
    this.enforceScope(context, opp);

    const [updated] = await db
      .update(opportunities)
      .set({
        stage,
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, opportunityId))
      .returning();

    if (!updated) {
      throw new ValidationError('Failed to update opportunity stage');
    }

    await logAudit(db, {
      entityType: 'opportunity',
      entityId: opportunityId,
      action: 'transition',
      actorId: userId,
      oldValues: { stage: opp.stage },
      newValues: { stage },
      tenantId,
      businessId,
      branchId,
      requestId: auditCtx?.requestId,
      ipAddress: auditCtx?.ipAddress,
    });

    return updated;
  }
}
