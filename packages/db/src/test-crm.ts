import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { createDb } from './client.js';
import {
  tenants,
  businesses,
  branches,
  users,
  leads,
  addresses,
  contacts,
  customers,
  opportunities,
  quotations,
  quotationLines,
  salesOrders,
  salesOrderLines,
} from './schema/index.js';
import { CrmService } from '../../../apps/server/src/lib/crm-service.js';
import { ValidationError, ForbiddenError } from '../../../apps/server/src/lib/errors.js';
import { eq, and } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting CRM Core Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(salesOrderLines);
    await db.delete(salesOrders);
    await db.delete(quotationLines);
    await db.delete(quotations);
    await db.delete(addresses);
    await db.delete(contacts);
    await db.delete(opportunities);
    await db.delete(leads);
    await db.delete(customers);
    await db.delete(users);
    await db.delete(branches);
    await db.delete(businesses);
    await db.delete(tenants);

    console.log('🧹 Database cleaned up.');

    // 2. Setup structural contexts
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userId = '55555555-5555-5555-5555-555555555555';

    await db.insert(tenants).values({
      id: tenantId,
      name: 'Acme Holding',
      slug: 'acme-holding',
    });

    await db.insert(businesses).values({
      id: businessId,
      tenantId,
      name: 'Acme Sales Corp',
      legalName: 'Acme Sales Corp LTD',
    });

    await db.insert(branches).values({
      id: branchA,
      tenantId,
      businessId,
      name: 'HQ Sales Branch',
      code: 'HQ-SL',
      isDefault: true,
    });

    await db.insert(branches).values({
      id: branchB,
      tenantId,
      businessId,
      name: 'Secondary Sales Branch',
      code: 'SEC-SL',
      isDefault: false,
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: 'sales-manager@acme.local',
      passwordHash: 'hashed',
      displayName: 'Sales Manager',
    });

    console.log('🌱 Seeding structural records completed.');

    // Scoped Contexts
    const contextBranchA = {
      tenantId,
      businessId,
      branchId: branchA,
    };

    const contextBranchB = {
      tenantId,
      businessId,
      branchId: branchB,
    };

    // ─── TEST 1: Lead Creation & Status Transitions ───────────────────
    console.log('\n▶ Test 1: Lead Creation & Status Transitions');

    const lead = await CrmService.createLead(db, contextBranchA, userId, {
      firstName: 'Alice',
      lastName: 'Smith',
      company: 'Smith Technologies',
      email: 'alice@smith.tech',
      phone: '+15550199',
      status: 'new',
    });
    console.log(`  ✓ Lead '${lead.firstName} ${lead.lastName}' created in Draft state.`);

    // Transition status to Contacted
    const updatedLead = await CrmService.updateLeadStatus(db, contextBranchA, userId, lead.id, 'contacted');
    console.log(`  ✓ Lead status successfully transitioned from 'new' to '${updatedLead.status}'.`);
    if (updatedLead.status !== 'contacted') {
      throw new Error('Lead status update failed');
    }

    // ─── TEST 2: Address & Contact Polymorphic Linkages ──────────────
    console.log('\n▶ Test 2: Address & Contact Polymorphic Linkages');

    const leadAddress = await CrmService.createAddress(db, contextBranchA, userId, {
      parentType: 'lead',
      parentId: lead.id,
      addressType: 'office',
      addressLine1: '123 Main St',
      city: 'Boston',
      state: 'MA',
      country: 'USA',
      zip: '02108',
    });
    console.log(`  ✓ Polymorphic Address successfully linked to Lead.`);

    const leadContact = await CrmService.createContact(db, contextBranchA, userId, {
      parentType: 'lead',
      parentId: lead.id,
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob@smith.tech',
      phone: '+15550200',
    });
    console.log(`  ✓ Polymorphic Contact successfully linked to Lead.`);

    // ─── TEST 3: Lead Conversion Pipeline ──────────────────────────────
    console.log('\n▶ Test 3: Lead Conversion Pipeline');

    const conversion = await CrmService.convertLeadToOpportunity(
      db,
      contextBranchA,
      userId,
      lead.id,
      '50x Microcontroller Supply Contract',
      25000.0
    );

    console.log(`  ✓ Lead converted successfully:`);
    console.log(`    - Customer created: '${conversion.customer.name}'`);
    console.log(`    - Opportunity created: '${conversion.opportunity.title}' (Expected Value: $${conversion.opportunity.expectedValue})`);

    // Verify lead status is qualified
    const [qualLead] = await db.select().from(leads).where(eq(leads.id, lead.id)).limit(1);
    if (qualLead!.status !== 'qualified') {
      throw new Error('Lead was not qualified after conversion');
    }
    console.log(`    - Verified Lead status is now qualified.`);

    // Verify addresses & contacts were cloned to new Customer
    const custAddress = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.parentId, conversion.customer.id), eq(addresses.parentType, 'customer')));
    
    if (custAddress.length !== 1 || custAddress[0]!.city !== 'Boston') {
      throw new Error('Addresses were not cloned to customer during conversion');
    }
    console.log(`    - Verified Polymorphic Address cloned successfully to Customer.`);

    const custContact = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.parentId, conversion.customer.id), eq(contacts.parentType, 'customer')));

    if (custContact.length !== 1 || custContact[0]!.firstName !== 'Bob') {
      throw new Error('Contacts were not cloned to customer during conversion');
    }
    console.log(`    - Verified Polymorphic Contact cloned successfully to Customer.`);

    // ─── TEST 4: Standalone Customers & Opportunities ────────────────
    console.log('\n▶ Test 4: Standalone Customers & Opportunities');

    const customer = await CrmService.createCustomer(db, contextBranchA, userId, {
      name: 'Global Electronics Ltd',
      email: 'procurement@global.inc',
      phone: '+44207946',
      status: 'active',
    });
    console.log(`  ✓ Customer '${customer.name}' created directly as Master Data.`);

    const updatedCust = await CrmService.updateCustomer(db, contextBranchA, userId, customer.id, {
      status: 'inactive',
    });
    console.log(`  ✓ Updated Customer status successfully to '${updatedCust.status}'.`);

    const standaloneOpp = await CrmService.createOpportunity(db, contextBranchA, userId, {
      customerId: customer.id,
      title: 'Server Rack Assembly Deal',
      expectedValue: 12000.0,
      stage: 'proposal',
    });
    console.log(`  ✓ Opportunity '${standaloneOpp.title}' created linked directly to Customer.`);

    const updatedOpp = await CrmService.updateOpportunityStage(db, contextBranchA, userId, standaloneOpp.id, 'won');
    console.log(`  ✓ Opportunity stage updated successfully to '${updatedOpp.stage}'.`);

    // ─── TEST 5: Branch Isolation ──────────────────────────────────
    console.log('\n▶ Test 5: Branch Isolation Enforcement');

    // Querying Lead from Branch B should fail scope validations
    try {
      await CrmService.updateLeadStatus(db, contextBranchB, userId, lead.id, 'lost');
      throw new Error('Expected branch isolation scope breach check to fail, but it succeeded');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        console.log('  ✓ Security branch isolation verified: prevented Secondary Sales branch from updating HQ branch leads.');
      } else {
        throw err;
      }
    }

    console.log('\n🎉 ALL CRM ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
