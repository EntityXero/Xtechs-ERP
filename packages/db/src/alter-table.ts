import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

async function run() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  console.log('Running raw SQL alters...');
  try {
    await sql`ALTER TABLE stock_balances RENAME COLUMN qty TO on_hand;`;
    console.log('✓ Renamed column qty to on_hand');
  } catch (err: any) {
    console.log('qty to on_hand might have already been renamed or failed:', err.message);
  }

  try {
    await sql`ALTER TABLE stock_balances ADD COLUMN reserved numeric(18, 4) NOT NULL DEFAULT '0.0000';`;
    console.log('✓ Added column reserved');
  } catch (err: any) {
    console.log('reserved column might already exist or failed:', err.message);
  }

  try {
    await sql`ALTER TABLE stock_balances ADD COLUMN available numeric(18, 4) NOT NULL DEFAULT '0.0000';`;
    console.log('✓ Added column available');
  } catch (err: any) {
    console.log('available column might already exist or failed:', err.message);
  }

  await sql.end();
  console.log('Done!');
}

run();
