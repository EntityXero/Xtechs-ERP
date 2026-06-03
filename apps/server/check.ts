import { createDb } from '@xtechs/db';
import { users } from '@xtechs/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://erp_dev:erp_dev_pass@localhost:5432/xtechs_erp';
  const { db } = createDb(dbUrl);

  const email = 'admin@xtechs.local';
  console.log(`Checking user: ${email}`);
  
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.log('User not found in DB!');
  } else {
    console.log('User found:', { id: user.id, email: user.email, status: user.status, hash: user.passwordHash });
  }

  const allUsers = await db.select({ email: users.email }).from(users);
  console.log('All users:', allUsers.map(u => u.email));

  process.exit(0);
}

main().catch(console.error);
