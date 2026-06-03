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
  console.log('Running attachments table creation SQL...');

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "tenant_id" uuid NOT NULL,
        "business_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "entity_type" varchar(100) NOT NULL,
        "entity_id" uuid NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "original_name" varchar(255) NOT NULL,
        "file_size" integer NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "storage_provider" varchar(50) DEFAULT 'local' NOT NULL,
        "storage_path" varchar(512) NOT NULL,
        "sha256_checksum" varchar(64) NOT NULL,
        "uploaded_by" uuid NOT NULL,
        "deleted_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `;
    console.log('✓ Created attachments table if not exists');
  } catch (err: any) {
    console.error('Failed to create attachments table:', err.message);
  }

  try {
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_attachments_scope" ON "attachments" USING btree ("tenant_id","business_id","branch_id");
    `;
    console.log('✓ Created index idx_attachments_scope');
  } catch (err: any) {
    console.error('Failed to create scope index:', err.message);
  }

  try {
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_attachments_entity" ON "attachments" USING btree ("entity_type","entity_id");
    `;
    console.log('✓ Created index idx_attachments_entity');
  } catch (err: any) {
    console.error('Failed to create entity index:', err.message);
  }

  await sql.end();
  console.log('Done!');
}

run();
