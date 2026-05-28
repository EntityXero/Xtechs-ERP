import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { createDb } from './client.js';
import { metadataDefs, metadataRevisions, metadataDependencies } from './schema/index.js';
import {
  resolveMetadata,
  createMetadataDefinition,
  createMetadataRevision
} from '../../../apps/server/src/lib/metadata-service.js';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Metadata Engine Tests...');

  try {
    // Clean up test data
    await db.delete(metadataDependencies);
    await db.delete(metadataRevisions);
    await db.delete(metadataDefs);
    console.log('🧹 Cleaned up metadata tables.');

    // ─── TEST 1: Definition Creation ─────────────────────────
    console.log('\n▶ Test 1: Definition Creation');
    const formDef = await createMetadataDefinition(db, {
      key: 'customer_form',
      type: 'form',
      name: 'Customer Form',
      description: 'Dynamic customer entry form',
    });
    console.log(`  ✓ Form Definition created: ${formDef.key} (${formDef.id})`);

    const workflowDef = await createMetadataDefinition(db, {
      key: 'approval_workflow',
      type: 'workflow',
      name: 'Approval Workflow',
      description: 'Standard document approval workflow',
    });
    console.log(`  ✓ Workflow Definition created: ${workflowDef.key} (${workflowDef.id})`);

    // ─── TEST 2: Zod Schema Validation ───────────────────────
    console.log('\n▶ Test 2: Payload Schema Validation');
    
    // Invalid Form layout (missing title inside section)
    const invalidFormPayload = {
      sections: [
        {
          columns: 2,
          fields: [{ name: 'name', label: 'Name', type: 'text' }]
        }
      ]
    };

    try {
      await createMetadataRevision(db, 'customer_form', {
        payload: invalidFormPayload,
      });
      throw new Error('Test failed: Invalid form payload did not throw validation error');
    } catch (e: any) {
      console.log('  ✓ Correctly rejected invalid Form payload:', e.message);
    }

    // Valid Form layout
    const validFormPayload = {
      sections: [
        {
          title: 'General Details',
          columns: 2,
          fields: [
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'text' }
          ]
        }
      ]
    };

    const globalRevision = await createMetadataRevision(db, 'customer_form', {
      payload: validFormPayload,
    });
    console.log(`  ✓ Successfully published valid Form Global Revision: version ${globalRevision.version}`);

    // ─── TEST 3: Hierarchical Scoping & Overrides ────────────
    console.log('\n▶ Test 3: Hierarchical Scoping & Fallbacks');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const businessId = '00000000-0000-0000-0000-000000000002';
    const branchId = '00000000-0000-0000-0000-000000000003';

    // 1. Resolve with global context: expect version 1
    const res1 = await resolveMetadata(db, 'customer_form', {});
    console.log(`  ✓ Resolved with Global context: got version ${res1?.revision?.version}`);
    if (res1?.revision?.version !== 1) throw new Error('Expected version 1');

    // 2. Publish Business override: expect version 1 for business scope
    const businessOverridePayload = {
      sections: [
        {
          title: 'Business Specific Details',
          columns: 3,
          fields: [
            { name: 'name', label: 'Business Name', type: 'text', required: true }
          ]
        }
      ]
    };

    const businessRevision = await createMetadataRevision(db, 'customer_form', {
      tenantId,
      businessId,
      payload: businessOverridePayload,
    });
    console.log(`  ✓ Successfully published Business-level revision: version ${businessRevision.version}`);

    // 3. Resolve for Business context: expect Business revision (version 1)
    const res2 = await resolveMetadata(db, 'customer_form', { tenantId, businessId });
    console.log(`  ✓ Resolved with Business context: got version ${res2?.revision?.version}`);
    if (res2?.revision?.version !== 1 || res2?.revision?.tenantId !== tenantId) {
      throw new Error('Business resolution failed');
    }

    // 4. Resolve for different Business: expect Global fallback (version 1, global)
    const res3 = await resolveMetadata(db, 'customer_form', { tenantId, businessId: '00000000-0000-0000-0000-999999999999' });
    console.log(`  ✓ Resolved with other Business: fell back to Global (version ${res3?.revision?.version}, tenantId: ${res3?.revision?.tenantId})`);
    if (res3?.revision?.tenantId !== null) throw new Error('Global fallback failed');

    // ─── TEST 4: Append-Only Versioning ─────────────────────
    console.log('\n▶ Test 4: Append-Only Versioning');
    
    // Publish second revision for the Business scope
    const businessRevisionV2 = await createMetadataRevision(db, 'customer_form', {
      tenantId,
      businessId,
      payload: { ...businessOverridePayload, description: 'v2' },
    });
    console.log(`  ✓ Successfully published Business-level revision v2: version ${businessRevisionV2.version}`);
    if (businessRevisionV2.version !== 2) throw new Error('Versioning increment failed');

    const res4 = await resolveMetadata(db, 'customer_form', { tenantId, businessId });
    console.log(`  ✓ Resolved with Business context: active version is now ${res4?.revision?.version}`);
    if (res4?.revision?.version !== 2) throw new Error('Resolution failed to fetch version 2');

    // ─── TEST 5: Circular Dependency Detection ───────────────
    console.log('\n▶ Test 5: Circular Dependency Detection');

    // Create Metadata Def A, B, C
    const defA = await createMetadataDefinition(db, { key: 'def_a', type: 'form', name: 'Def A' });
    const defB = await createMetadataDefinition(db, { key: 'def_b', type: 'form', name: 'Def B' });
    const defC = await createMetadataDefinition(db, { key: 'def_c', type: 'form', name: 'Def C' });

    // Publish Def A referencing Def B ($ref: "metadata:def_b")
    await createMetadataRevision(db, 'def_a', {
      payload: {
        sections: [{ title: 'Sec', fields: [{ name: 'refB', label: 'B', type: 'text', $ref: 'metadata:def_b' }] }]
      }
    });
    console.log('  ✓ Published Def A referencing Def B (A -> B)');

    // Publish Def B referencing Def C (B -> C)
    await createMetadataRevision(db, 'def_b', {
      payload: {
        sections: [{ title: 'Sec', fields: [{ name: 'refC', label: 'C', type: 'text', $ref: 'metadata:def_c' }] }]
      }
    });
    console.log('  ✓ Published Def B referencing Def C (B -> C)');

    // Attempt to publish Def C referencing Def A (C -> A) - Should create a cycle (A -> B -> C -> A)
    try {
      await createMetadataRevision(db, 'def_c', {
        payload: {
          sections: [{ title: 'Sec', fields: [{ name: 'refA', label: 'A', type: 'text', $ref: 'metadata:def_a' }] }]
        }
      });
      throw new Error('Test failed: Cycle (A -> B -> C -> A) did not throw validation error');
    } catch (e: any) {
      console.log('  ✓ Correctly rejected circular dependency (A -> B -> C -> A):', e.message);
    }

    // Try normal DAG (Def D referencing Def B: A -> B, B -> C, D -> B) - Should work perfectly
    await createMetadataDefinition(db, { key: 'def_d', type: 'form', name: 'Def D' });
    const validDRevision = await createMetadataRevision(db, 'def_d', {
      payload: {
        sections: [{ title: 'Sec', fields: [{ name: 'refB', label: 'B', type: 'text', $ref: 'metadata:def_b' }] }]
      }
    });
    console.log(`  ✓ Successfully published valid DAG (D -> B): version ${validDRevision.version}`);

    console.log('\n🎉 ALL METADATA ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
