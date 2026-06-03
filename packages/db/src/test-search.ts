import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

// Mock BullMQ Queue globally before importing service/worker
import { searchQueue, queueSearchJob } from '../../../apps/server/src/lib/search/queue.js';
const queuedJobs: any[] = [];
(searchQueue as any).add = async (name: string, data: any) => {
  queuedJobs.push(data);
  return { id: 'mock-search-job-id' };
};

const createMockJob = (data: any, id: string = 'mock-search-job-id') => ({
  id,
  name: 'search-index-job',
  data,
  moveToCompleted: async () => {},
  moveToFailed: async () => {},
  isActive: () => false,
  isCompleted: () => false,
  isFailed: () => false,
} as any);

import { createDb } from './client.js';
import {
  tenants,
  businesses,
  branches,
  users,
  searchIndexes,
  auditLogs,
} from './schema/index.js';
import { SearchService } from '../../../apps/server/src/lib/search-service.js';
import { SearchIndexerService } from '../../../apps/server/src/lib/search/indexer.js';
import { searchWorker } from '../../../apps/server/src/workers/search-worker.js';
import { eventBus } from '../../../apps/server/src/lib/automations/event-bus.js';
import { eq } from 'drizzle-orm';

async function runTests() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const { db, client } = createDb(databaseUrl);
  console.log('🧪 Starting Search Engine Validation Tests...');

  try {
    // 1. Clean up tables
    await db.delete(searchIndexes);
    await db.delete(auditLogs);
    await db.delete(users);
    await db.delete(branches);
    await db.delete(businesses);
    await db.delete(tenants);

    console.log('Cleaned up tables.');

    // 2. Setup Context Structures
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const businessId = '22222222-2222-2222-2222-222222222222';
    const branchA = '33333333-3333-3333-3333-333333333333';
    const branchB = '44444444-4444-4444-4444-444444444444';
    const userA = '55555555-5555-5555-5555-555555555555';

    await db.insert(tenants).values({ id: tenantId, name: 'Search Tenant', slug: 'search-tenant' });
    await db.insert(businesses).values({ id: businessId, tenantId, name: 'Acme Search Inc', legalName: 'Acme Search Inc LTD' });
    await db.insert(branches).values({ id: branchA, tenantId, businessId, name: 'HQ', code: 'HQ', isDefault: true });
    await db.insert(branches).values({ id: branchB, tenantId, businessId, name: 'Sub', code: 'SUB', isDefault: false });
    await db.insert(users).values({ id: userA, tenantId, email: 'usera@acme-search.local', passwordHash: 'hashed', displayName: 'User A' });

    console.log('Seeded base structural entities.');

    const contextHQ = { tenantId, businessId, branchId: branchA, tokenScope: 'branch', userId: userA };
    const contextSUB = { tenantId, businessId, branchId: branchB, tokenScope: 'branch', userId: userA };

    // Initialize Event Listeners
    SearchIndexerService.init();

    // ─── TEST 1: Event-driven Trigger & Queueing ──────────────────────
    console.log('\n▶ Test 1: Event-driven Trigger & Queueing');

    const documentPayload = {
      id: '99999999-9999-9999-9999-999999999991',
      type: 'invoice',
      documentNumber: 'INV-1001',
      status: 'draft',
      description: 'Consulting fees for cloud migration deployment',
      data: {
        amount: 8500,
        customerName: 'Delta Systems Inc',
        lineItems: [
          { description: 'Docker Swarm setup', price: 4000 },
          { description: 'Kubernetes refactoring workshop', price: 4500 }
        ]
      },
      createdBy: userA,
    };

    queuedJobs.length = 0;
    eventBus.emit('document_created', documentPayload, contextHQ);

    // Allow event loop ticks
    await new Promise((r) => setTimeout(r, 50));

    console.log(`  ✓ Jobs enqueued: ${queuedJobs.length}`);
    if (queuedJobs.length !== 1) {
      throw new Error('Expected 1 indexing job to be enqueued');
    }

    const enqueuedJobData = queuedJobs[0];
    if (enqueuedJobData.action !== 'index' || enqueuedJobData.entityId !== documentPayload.id) {
      throw new Error('Enqueued job payload properties do not match document details');
    }

    // ─── TEST 2: Worker Processing & Database Entry ──────────────────
    console.log('\n▶ Test 2: Worker Processing & Database Entry');

    await searchWorker.processJob(createMockJob(enqueuedJobData, 'search-job-1'));

    const searchRows = await db.select().from(searchIndexes);
    console.log(`  ✓ Records in search_indexes table: ${searchRows.length}`);
    if (searchRows.length !== 1) {
      throw new Error('Expected 1 record in search_indexes table');
    }

    const record = searchRows[0];
    if (record.title !== 'INVOICE INV-1001' || !record.description?.includes('draft')) {
      throw new Error('Record title or description is incorrect');
    }

    // ─── TEST 3: Full-Text Search Functionality ───────────────────────
    console.log('\n▶ Test 3: Full-Text Search Functionality');

    // Scenario A: Exact keyword search
    console.log('  Scenario A: Exact keyword search ("Kubernetes")');
    const resultsA = await SearchService.globalSearch(db, 'Kubernetes', contextHQ);
    console.log(`    - Found results: ${resultsA.length}`);
    if (resultsA.length !== 1 || resultsA[0].entityId !== documentPayload.id) {
      throw new Error('Expected 1 matching result containing "Kubernetes"');
    }
    console.log(`    - Result title: ${resultsA[0].title}`);

    // Scenario B: Stemming / Partial search
    console.log('  Scenario B: Stemming / Partial search ("consulting")');
    const resultsB = await SearchService.globalSearch(db, 'consulting', contextHQ);
    console.log(`    - Found results: ${resultsB.length}`);
    if (resultsB.length !== 1) {
      throw new Error('Expected 1 matching result for stemmed word "consulting"');
    }

    // Scenario C: Autocomplete prefix search
    console.log('  Scenario C: Autocomplete prefix search ("cloud migra")');
    const resultsC = await SearchService.globalSearch(db, 'cloud migra', contextHQ);
    console.log(`    - Found results: ${resultsC.length}`);
    if (resultsC.length !== 1) {
      throw new Error('Expected 1 matching result for typed prefix "cloud migra"');
    }

    // Scenario D: Query mismatch
    console.log('  Scenario D: Query mismatch ("nonexistentword")');
    const resultsD = await SearchService.globalSearch(db, 'nonexistentword', contextHQ);
    console.log(`    - Found results: ${resultsD.length}`);
    if (resultsD.length !== 0) {
      throw new Error('Expected 0 results for mismatched keyword');
    }

    // ─── TEST 4: Isolation & Scope Enforcements ──────────────────────
    console.log('\n▶ Test 4: Isolation & Scope Enforcements');

    // Query using sub branch context contextSUB
    console.log('  Scenario A: Query from SUB branch (Document is in HQ)');
    const resultsSub = await SearchService.globalSearch(db, 'Delta', contextSUB);
    console.log(`    - Found results in SUB branch: ${resultsSub.length}`);
    if (resultsSub.length !== 0) {
      throw new Error('Expected 0 results for document index due to branch isolation');
    }

    // Index a new document in SUB branch
    const subDocumentPayload = {
      id: '99999999-9999-9999-9999-999999999992',
      type: 'invoice',
      documentNumber: 'INV-SUB-01',
      status: 'posted',
      description: 'Delta Systems hardware delivery sub-branch',
      createdBy: userA,
    };

    queuedJobs.length = 0;
    eventBus.emit('document_created', subDocumentPayload, contextSUB);
    await new Promise((r) => setTimeout(r, 50));
    await searchWorker.processJob(createMockJob(queuedJobs[0], 'search-job-2'));

    console.log('  Scenario B: Query from SUB branch after indexing sub document');
    const resultsSub2 = await SearchService.globalSearch(db, 'Delta', contextSUB);
    console.log(`    - Found results in SUB branch: ${resultsSub2.length}`);
    if (resultsSub2.length !== 1 || resultsSub2[0].entityId !== subDocumentPayload.id) {
      throw new Error('Expected exactly 1 result in sub branch matching "Delta"');
    }

    // ─── TEST 5: Deleting Index ───────────────────────────────────────
    console.log('\n▶ Test 5: Deleting Index');

    queuedJobs.length = 0;
    // Simulate delete/archive
    await queueSearchJob({
      action: 'delete',
      entityType: 'invoice',
      entityId: documentPayload.id,
      context: contextHQ,
    });

    await searchWorker.processJob(createMockJob(queuedJobs[0], 'search-job-delete'));

    const searchRowsAfterDelete = await db
      .select()
      .from(searchIndexes)
      .where(eq(searchIndexes.entityId, documentPayload.id));
    
    console.log(`  ✓ Records remaining for deleted invoice: ${searchRowsAfterDelete.length}`);
    if (searchRowsAfterDelete.length !== 0) {
      throw new Error('Index record should be deleted');
    }

    console.log('\n🎉 ALL SEARCH ENGINE TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  } finally {
    await searchWorker.close();
    await client.end();
  }
}

runTests();
