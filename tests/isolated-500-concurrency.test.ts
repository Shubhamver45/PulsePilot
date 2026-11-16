import assert from "node:assert";
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifyAuditLogIntegrity } from "../src/lib/audit/audit-logger.ts";

const ISOLATED_DATABASE_URL = "postgresql://postgres:Chessislife%4045@db.czqhiuidekvozuoqdmyd.supabase.co:5432/pulsepilot_test_isolated";

const prisma = new PrismaClient({
  datasources: { db: { url: ISOLATED_DATABASE_URL } },
});

async function spawnWorker(workerId: string, count: number, startDelayMs = 0): Promise<{ workerId: string; results: any[]; errors: string[] }> {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  return new Promise((resolve, reject) => {
    const workerScript = `
      import { recordAuditLog } from "./src/lib/audit/audit-logger.ts";
      
      const id = "${workerId}";
      const count = ${count};
      const results = [];
      const errors = [];

      async function main() {
        if (${startDelayMs} > 0) {
          await new Promise(r => setTimeout(r, ${startDelayMs}));
        }
        
        const promises = Array.from({ length: count }, async (_, i) => {
          try {
            const rec = await recordAuditLog({
              action: "EXPERIMENT_CREATED",
              actor: { name: "Worker " + id, type: "agent" },
              entityType: "EXPERIMENT",
              entityId: "exp_500_" + id + "_" + i,
              details: "500-run concurrency " + id + " index " + i,
              metadata: { worker: id, index: i }
            });
            results.push({ id: rec.id, seq: rec.sequenceNumber, sig: rec.signature, prev: rec.previousSignature });
          } catch (err) {
            errors.push(err.message);
          }
        });

        await Promise.all(promises);
        console.log(JSON.stringify({ workerId: id, results, errors }));
      }
      main().catch(e => { console.error(e); process.exit(1); });
    `;

    const child = spawn("node", ["--experimental-strip-types", "--input-type=module", "-e", workerScript], {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: ISOLATED_DATABASE_URL,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker ${workerId} failed with code ${code}: ${stderr}`));
      } else {
        try {
          const lines = stdout.trim().split("\n");
          const lastLine = lines[lines.length - 1];
          resolve(JSON.parse(lastLine));
        } catch (e) {
          reject(new Error(`Failed to parse worker output: ${stdout}\nStderr: ${stderr}`));
        }
      }
    });
  });
}

async function run500ConcurrencySuite() {
  console.log("=====================================================================");
  console.log("500-WRITE HIGH-CONTENTION CONCURRENCY & RESILIENCE TEST");
  console.log("DATABASE: pulsepilot_test_isolated (Isolated Supabase instance)");
  console.log("=====================================================================\n");

  // Step 1: Ensure organization exists and clean table
  console.log("STEP 1: Setting up initial organization and clean audit ledger...");
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: "org_isolated_test",
        name: "Isolated Test Org",
        slug: "isolated-test",
      },
    });
  }

  // Clear existing logs
  await prisma.auditLog.deleteMany({});
  
  // Install immutable trigger on isolated DB
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'SECURITY ALERT: audit_logs is an append-only cryptographic ledger. UPDATE and DELETE operations are forbidden.';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();
  `);
  console.log("  ✅ Clean ledger initialized with immutable trigger active.\n");

  // Step 2: Rollback and retry injection under contention
  console.log("STEP 2: Testing transaction rollback under contention...");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO audit_logs (id, "organizationId", action, "entityType", "entityId", details, signature, "sequenceNumber", "createdAt")
        VALUES ('temp-rollback-test', '${org.id}', 'EXPERIMENT_CREATED'::"AuditAction", 'EXPERIMENT', 'exp_test', 'details', 'dummy_sig', 99999, NOW());
      `);
      throw new Error("Simulated transactional rollback");
    });
  } catch (err: any) {
    assert(err.message.includes("Simulated transactional rollback"), "Caught simulated transaction rollback");
  }
  const rollbackCheck = await prisma.auditLog.findUnique({ where: { id: "temp-rollback-test" } });
  assert(rollbackCheck === null, "Rolled-back transaction left 0 phantom records");
  console.log("  ✅ Rollback resilience verified: No dirty or phantom records remain.\n");

  // Step 3: Launching 5 independent Node.js processes writing 100 records each = 500 total concurrent writes
  console.log("STEP 3: Launching 5 independent Node.js worker processes (100 writes each = 500 total concurrent writes)...");
  const t0 = performance.now();
  const workers = await Promise.all([
    spawnWorker("Worker_Alpha", 100, 0),
    spawnWorker("Worker_Beta", 100, 50),
    spawnWorker("Worker_Gamma", 100, 100),
    spawnWorker("Worker_Delta", 100, 150),
    spawnWorker("Worker_Epsilon", 100, 200),
  ]);
  const t1 = performance.now();

  console.log(`- 500 concurrent operations completed in ${(t1 - t0).toFixed(2)} ms.`);
  let totalSuccessful = 0;
  let totalErrors = 0;
  for (const w of workers) {
    console.log(`- ${w.workerId}: ${w.results.length} succeeded, ${w.errors.length} failed`);
    totalSuccessful += w.results.length;
    totalErrors += w.errors.length;
    assert.strictEqual(w.errors.length, 0, `${w.workerId} encountered 0 unhandled errors`);
  }
  assert.strictEqual(totalSuccessful, 500, `Exactly 500 writes succeeded across all 5 workers`);
  console.log("  ✅ All 5 workers completed with 0 errors.\n");

  // Step 4: Verification of 500 records
  console.log("STEP 4: Querying all 500 persisted records and verifying cryptographic chain...");
  const records = await prisma.auditLog.findMany({
    orderBy: { sequenceNumber: "asc" },
  });

  assert.strictEqual(records.length, 500, `PostgreSQL contains exactly 500 records (got ${records.length})`);

  // Verify unique and continuous sequence numbers 1..500
  for (let i = 0; i < 500; i++) {
    const expected = i + 1;
    assert.strictEqual(records[i].sequenceNumber, expected, `Record at index ${i} has sequenceNumber ${expected} (no gaps)`);
  }
  console.log("  ✅ Verified sequence numbers 1 through 500 strictly unique with 0 gaps.");

  // Verify signature linking
  for (let i = 1; i < 500; i++) {
    assert.strictEqual(
      records[i].previousSignature,
      records[i - 1].signature,
      `Record #${records[i].sequenceNumber} previousSignature links to Record #${records[i - 1].sequenceNumber} signature`
    );
  }
  console.log("  ✅ Verified all 500 records strictly chain previousSignature to previous record signature.");

  // Map and verify cryptographic hashes
  const mappedLogs = records.map((log) => ({
    id: log.id,
    timestamp: log.createdAt.toISOString(),
    action: log.action as any,
    actor: {
      name: log.actorName || "system",
      type: (log.actorType as any) || "system",
    },
    entityType: log.entityType as any,
    entityId: log.entityId,
    details: log.details || "",
    signature: log.signature || undefined,
    previousSignature: log.previousSignature || undefined,
    sequenceNumber: log.sequenceNumber || undefined,
    previousState: log.previousState,
    newState: log.newState,
    metadata: log.metadata as Record<string, any> | undefined,
  }));

  const integrityReport = verifyAuditLogIntegrity([...mappedLogs].reverse());
  assert.strictEqual(integrityReport.valid, true, `Complete 500-record cryptographic chain passes verification with 0 errors`);
  assert.strictEqual(integrityReport.verifiedCount, 500, `Verified all 500 historical records from genesis to head`);
  console.log("  ✅ Cryptographic integrity report valid = true for all 500 records.\n");

  console.log("=====================================================================");
  console.log("500-WRITE HIGH-CONTENTION CONCURRENCY TEST: ALL CHECKS PASSED (0 FAILS)");
  console.log("=====================================================================\n");

  await prisma.$disconnect();
}

run500ConcurrencySuite().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
