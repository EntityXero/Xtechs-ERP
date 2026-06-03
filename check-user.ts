import { createDb } from './apps/server/src/db.ts'; // Wait, it's @xtechs/db
import { createDb } from '@xtechs/db';
import { users, userRoles, branches, roles } from '@xtechs/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from './apps/server/src/lib/auth.ts'; // need to test auth
import * as dotenv from 'dotenv';
dotenv.config({ path: './apps/server/.env' });

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp';
  console.log('Connecting to', dbUrl);
  const { db } = createDb(dbUrl);

  const email = 'admin@xtechs.local';
  console.log(`Looking up user: ${email}`);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.log('User not found.');
    process.exit(1);
  }

  console.log('User found:', {
    id: user.id,
    email: user.email,
    status: user.status,
    tenantId: user.tenantId,
  });

  const userBranches = await db
    .select({
      branchId: userRoles.branchId,
      branchName: branches.name,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(branches, eq(userRoles.branchId, branches.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id));

  console.log('User branches/roles:', userBranches);
  
  process.exit(0);
}

main().catch(console.error);
