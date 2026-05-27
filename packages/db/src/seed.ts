import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
import { createDb } from './client.js';
import { tenants, businesses, branches, users, roles } from './schema/index.js';

/**
 * Development seed script.
 * Creates a default tenant, business, branch, admin user, and admin role.
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

    // 5. Create admin user (password: admin123! — CHANGE IN PRODUCTION)
    // Using a placeholder hash — real hashing will be in the auth module
    const [admin] = await db.insert(users).values({
      tenantId: tenant!.id,
      email: 'admin@xtechs.local',
      passwordHash: '$placeholder_hash_replace_with_bcrypt',
      displayName: 'System Administrator',
      status: 'active',
    }).returning();

    console.log(`  ✓ User: ${admin!.email} (${admin!.id})`);

    console.log('\n✅ Seed complete!');
    console.log('\n📋 Summary:');
    console.log(`   Tenant ID:   ${tenant!.id}`);
    console.log(`   Business ID: ${business!.id}`);
    console.log(`   Branch ID:   ${branch!.id}`);
    console.log(`   Admin User:  ${admin!.email}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
