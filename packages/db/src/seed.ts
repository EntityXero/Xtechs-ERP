import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { hash } from 'bcryptjs';
import { createDb } from './client.js';
import { tenants, businesses, branches, users, roles, userRoles, permissions, rolePermissions } from './schema/index.js';
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

    // Helper to get or create permission
    const getOrCreatePermission = async (
      resource: string,
      action: string,
      effect: 'allow' | 'deny',
      description?: string
    ) => {
      const [existing] = await db
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.resource, resource),
            eq(permissions.action, action),
            eq(permissions.effect, effect)
          )
        )
        .limit(1);

      if (existing) return existing;

      const [created] = await db
        .insert(permissions)
        .values({ resource, action, effect, description })
        .returning();
      return created!;
    };

    // Helper to assign permission to role
    const assignPermissionToRole = async (roleId: string, permissionId: string) => {
      const [existing] = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.permissionId, permissionId)
          )
        )
        .limit(1);

      if (existing) return existing;

      const [created] = await db
        .insert(rolePermissions)
        .values({ roleId, permissionId })
        .returning();
      return created!;
    };

    // Check if already seeded
    const [existingTenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, 'xtechs'))
      .limit(1);

    let tenantId: string;
    let businessId: string;
    let branchId: string;
    let adminRoleId: string;
    let adminUserEmail = 'admin@xtechs.local';

    if (existingTenant) {
      console.log('⚡ Tenant already exists. Checking roles and seeding permissions...');
      tenantId = existingTenant.id;

      const [existingBusiness] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.tenantId, tenantId))
        .limit(1);
      businessId = existingBusiness!.id;

      const [existingBranch] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.businessId, businessId))
        .limit(1);
      branchId = existingBranch!.id;

      const [existingAdminRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.businessId, businessId), eq(roles.name, 'Admin')))
        .limit(1);
      adminRoleId = existingAdminRole!.id;
    } else {
      // 1. Create default tenant
      const [tenant] = await db.insert(tenants).values({
        name: 'Xtechs',
        slug: 'xtechs',
        status: 'active',
        metadata: {},
      }).returning();
      tenantId = tenant!.id;
      console.log(`  ✓ Tenant: ${tenant!.name} (${tenant!.id})`);

      // 2. Create default business
      const [business] = await db.insert(businesses).values({
        tenantId,
        name: 'Xtechs Pvt Ltd',
        legalName: 'Xtechs Private Limited',
        status: 'active',
        metadata: {},
      }).returning();
      businessId = business!.id;
      console.log(`  ✓ Business: ${business!.name} (${business!.id})`);

      // 3. Create default branch
      const [branch] = await db.insert(branches).values({
        tenantId,
        businessId,
        name: 'Head Office',
        code: 'HQ',
        isDefault: true,
        status: 'active',
        metadata: {},
      }).returning();
      branchId = branch!.id;
      console.log(`  ✓ Branch: ${branch!.name} (${branch!.id})`);

      // 4. Create admin role
      const [adminRole] = await db.insert(roles).values({
        tenantId,
        businessId,
        name: 'Admin',
        description: 'Full system administrator with all permissions',
      }).returning();
      adminRoleId = adminRole!.id;
      console.log(`  ✓ Role: ${adminRole!.name} (${adminRole!.id})`);

      // 5. Create admin user with real bcrypt hash
      const passwordHash = await hash('Admin123!', 12);
      const [admin] = await db.insert(users).values({
        tenantId,
        email: adminUserEmail,
        passwordHash,
        displayName: 'System Administrator',
        status: 'active',
      }).returning();
      console.log(`  ✓ User: ${admin!.email} (${admin!.id})`);

      // 6. Assign admin user to admin role in HQ branch
      await db.insert(userRoles).values({
        userId: admin!.id,
        roleId: adminRoleId,
        branchId,
      });
      console.log(`  ✓ Assignment: ${admin!.email} → Admin @ Head Office`);
    }

    // 7. Seed permissions and assignments
    console.log('🌱 Seeding permissions...');
    const wildcardPerm = await getOrCreatePermission('*', '*', 'allow', 'Wildcard permission');
    await assignPermissionToRole(adminRoleId, wildcardPerm.id);
    console.log('  ✓ Seeded wildcard permission assigned to Admin role');

    const defaultPerms = [
      { resource: 'user', action: 'create', description: 'Create user' },
      { resource: 'user', action: 'read', description: 'Read user' },
      { resource: 'user', action: 'update', description: 'Update user' },
      { resource: 'user', action: 'delete', description: 'Delete user' },
      { resource: 'role', action: 'create', description: 'Create role' },
      { resource: 'role', action: 'read', description: 'Read role' },
      { resource: 'role', action: 'update', description: 'Update role' },
      { resource: 'role', action: 'delete', description: 'Delete role' },
      { resource: 'permission', action: 'create', description: 'Create permission' },
      { resource: 'permission', action: 'read', description: 'Read permission' },
      { resource: 'permission', action: 'update', description: 'Update permission' },
      { resource: 'permission', action: 'delete', description: 'Delete permission' },
      { resource: 'branch', action: 'create', description: 'Create branch' },
      { resource: 'branch', action: 'read', description: 'Read branch' },
      { resource: 'branch', action: 'update', description: 'Update branch' },
      { resource: 'branch', action: 'delete', description: 'Delete branch' },
    ];

    for (const p of defaultPerms) {
      await getOrCreatePermission(p.resource, p.action, 'allow', p.description);
    }
    console.log(`  ✓ Seeded ${defaultPerms.length} resource permissions`);

    console.log('\n✅ Seed complete!');
    console.log('\n📋 Summary:');
    console.log(`   Tenant ID:   ${tenantId}`);
    console.log(`   Business ID: ${businessId}`);
    console.log(`   Branch ID:   ${branchId}`);
    console.log(`   Admin User:  ${adminUserEmail}`);
    console.log(`   Password:    Admin123! (CHANGE IN PRODUCTION)`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
