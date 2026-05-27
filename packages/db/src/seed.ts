import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { hash } from 'bcryptjs';
import { createDb } from './client.js';
import { tenants, businesses, branches, users, roles, userRoles } from './schema/index.js';
import { eq, and } from 'drizzle-orm';

/**
 * Development seed script.
 * Creates a default tenant, business, branch, admin role, admin user,
 * and assigns the admin user to the branch with the Admin role.
 *
 * Idempotent: checks if tenant already exists before inserting.
 *
 * Usage: pnpm db:seed
 */
async function seed() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);

  try {
    console.log('🌱 Seeding database...');

    // Check if already seeded
    const [existingTenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, 'xtechs'))
      .limit(1);

    if (existingTenant) {
      console.log('⚡ Database already seeded. Skipping.');
      return;
    }

    // 1. Create default tenant
    const [tenant] = await db.insert(tenants).values({
      name: 'Xtechs',
      slug: 'xtechs',
      status: 'active',
      metadata: {},
    }).returning();

    console.log(`  ✓ Tenant: ${tenant!.name} (${tenant!.id})`);

    // 2. Create default business
    const [business] = await db.insert(businesses).values({
      tenantId: tenant!.id,
      name: 'Xtechs Pvt Ltd',
      legalName: 'Xtechs Private Limited',
      status: 'active',
      metadata: {},
    }).returning();

    console.log(`  ✓ Business: ${business!.name} (${business!.id})`);

    // 3. Create default branch
    const [branch] = await db.insert(branches).values({
      tenantId: tenant!.id,
      businessId: business!.id,
      name: 'Head Office',
      code: 'HQ',
      isDefault: true,
      status: 'active',
      metadata: {},
    }).returning();

    console.log(`  ✓ Branch: ${branch!.name} (${branch!.id})`);

    // 4. Create admin role
    const [adminRole] = await db.insert(roles).values({
      tenantId: tenant!.id,
      businessId: business!.id,
      name: 'Admin',
      description: 'Full system administrator with all permissions',
    }).returning();

    console.log(`  ✓ Role: ${adminRole!.name} (${adminRole!.id})`);

    // 5. Create admin user with real bcrypt hash
    // Default password: Admin123! (CHANGE IN PRODUCTION)
    const passwordHash = await hash('Admin123!', 12);

    const [admin] = await db.insert(users).values({
      tenantId: tenant!.id,
      email: 'admin@xtechs.local',
      passwordHash,
      displayName: 'System Administrator',
      status: 'active',
    }).returning();

    console.log(`  ✓ User: ${admin!.email} (${admin!.id})`);

    // 6. Assign admin user to admin role in HQ branch
    await db.insert(userRoles).values({
      userId: admin!.id,
      roleId: adminRole!.id,
      branchId: branch!.id,
    });

    console.log(`  ✓ Assignment: ${admin!.email} → Admin @ ${branch!.name}`);

    console.log('\n✅ Seed complete!');
    console.log('\n📋 Summary:');
    console.log(`   Tenant ID:   ${tenant!.id}`);
    console.log(`   Business ID: ${business!.id}`);
    console.log(`   Branch ID:   ${branch!.id}`);
    console.log(`   Admin User:  ${admin!.email}`);
    console.log(`   Password:    Admin123! (CHANGE IN PRODUCTION)`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
