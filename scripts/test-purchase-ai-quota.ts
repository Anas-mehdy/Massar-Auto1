import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { extractSource, getAiQuotaStatus } from '../lib/services/purchaseDocumentImportService';
import { extractPurchaseFromPastedText } from '../lib/purchase-document-import';

// Exercise the real service with a fake DB boundary; no provider or database access.
async function main() {
  const originalQuery = prisma.$queryRaw;
  const originalTransaction = prisma.$transaction;
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let calls = 0;
  let locked = false;
  let cached = false;
  const document = extractPurchaseFromPastedText('شاحن | 2 | 10');
  const source = { id:'source', purchaseInvoiceId:'invoice', sourceType:'IMAGE', status:'UPLOADED', contentSha256:'test', pageCount:1, extractedData:null };
  const counters = {userUsed:3,shopUsed:3,userFailed:0,shopFailed:0,budgetCommittedUsd:0};
  const query = async (sql: {sql: string}) => {
    const text=sql.sql;
    if (text.includes('AS "userUsed"')) return [counters];
    if (text.includes('FROM "Shop"')) return [{countryCode:'TR'}];
    if (text.includes('FROM "PurchaseInvoice"')) return [{id:'invoice',status:'DRAFT'}];
    if (text.includes('"fileData"')) return [{fileData:Buffer.from([255,216,255]),mimeType:'image/jpeg',fileName:'test.jpg'}];
    if (text.includes('FROM "PurchaseImportExtractionAttempt"')) return [];
    if (text.includes('FROM "PurchaseImportSource"')) return [{...source,...(cached ? {status:'REVIEW_READY',extractedData:document} : {})}];
    throw new Error('Unexpected SQL in isolated test');
  };
  try {
    process.env.OPENAI_API_KEY='isolated-test-no-network';
    globalThis.fetch = async () => { calls++; throw new Error('Network forbidden in quota test'); };
    prisma.$queryRaw = query as typeof prisma.$queryRaw;
    prisma.$transaction = (async (run: (tx: unknown)=>Promise<unknown>) => run({$queryRaw:query,$executeRaw:async (sql:{sql:string})=>{
      assert.match(sql.sql,/pg_advisory_xact_lock/);
      assert.equal((sql.sql.match(/::integer/g) || []).length, 2);
      locked=true; return 1;
    }})) as typeof prisma.$transaction;
    const quota = await getAiQuotaStatus('shop','user');
    assert.equal(quota.user.limit,3);
    assert.equal(quota.user.remaining,0);
    await assert.rejects(()=>extractSource('shop','user','source','request-fourth-unique'),/حصة المستخدم اليومية/);
    assert.equal(locked,true);
    assert.equal(calls,0);
    cached=true;
    const saved = await extractSource('shop','user','source','request-reopen-saved');
    assert.equal(saved.reused,true);
    assert.equal(calls,0);
    console.log('PASS real quota service: 3 used -> 0 remaining; fourth rejected under lock before provider; cached result reusable at limit (mock DB)');
  } finally {
    prisma.$queryRaw=originalQuery; prisma.$transaction=originalTransaction; globalThis.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=originalKey;
  }
}
void main();
