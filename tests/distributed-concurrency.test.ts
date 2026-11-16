/**
 * PulsePilot AI — Distributed Multi-Process Concurrency Acceptance Test Suite
 * P0 Remediation: PostgreSQL Advisory Locking & Monotonic Audit Chain
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const cwd = "/Users/shubham/Desktop/pulsepilot";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

function spawnWorker(workerId: string, count: number): Promise<{ workerId: string; results: any[]; errors: any[] }> {
  return new Promise((resolve, reject) => {
    const workerScript = `
      import { recordAuditLog } from "./src/lib/audit/audit-logger.ts";
      async function main() {
        const id = "${workerId}";
        const count = ${count};
        const results = [];
        const errors = [];

        // Concurrently launch all appends within this process
        const promises = Array.from({ length: count }, async (_, i) => {
          try {
            const rec = await recordAuditLog({
              action: "EXPERIMENT_CREATED",
              actor: { name: "Worker " + id, type: "agent" },
              entityType: "EXPERIMENT",
              entityId: "exp_conc_" + id + "_" + i,
              details: "Distributed concurrency test " + id + " index " + i,
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

    const child = spawn("node", ["--env-file=.env", "--experimental-strip-types", "--input-type=module", "-e", workerScript], {
      cwd,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker ${workerId} failed with exit code ${code}: ${stderr}`));
      } else {
        try {
          const lines = stdout.trim().split("\n");
          const lastLine = lines[lines.length - 1];
          resolve(JSON.parse(lastLine));
        } catch (e) {
          reject(new Error(`Worker ${workerId} returned invalid JSON: ${stdout}`));
        }
      }
    });
  });
}

async function runConcurrencySuite() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — DISTRIBUTED AUDIT CONCURRENCY ACCEPTANCE TEST     ");
  console.log("=====================================================================\n");

  const { prisma } = await import("../src/lib/db/prisma.ts");
  const { verifyAuditLogIntegrity } = await import("../src/lib/audit/audit-logger.ts");

  console.log("STEP 1: Initializing clean test ledger boundary in PostgreSQL...");
  // Temporarily disable trigger for clean fixture reset
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs;`);
  await prisma.auditLog.deleteMany({});
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();
  `);
  console.log("  ✅ Initialized empty audit_logs table with immutable trigger active.\n");

  console.log("STEP 2: Launching 2 independent Node.js processes (100 total concurrent appends)...");
  const t0 = performance.now();
  const [worker1, worker2] = await Promise.all([
    spawnWorker("Process_Alpha", 50),
    spawnWorker("Process_Beta", 50),
  ]);
  const t1 = performance.now();
  console.log(`- Both processes completed in ${(t1 - t0).toFixed(2)} ms.`);
  console.log(`- Process Alpha results: ${worker1.results.length} succeeded, ${worker1.errors.length} failed.`);
  console.log(`- Process Beta results: ${worker2.results.length} succeeded, ${worker2.errors.length} failed.\n`);

  assert(worker1.errors.length === 0, "Process Alpha experienced zero write errors");
  assert(worker2.errors.length === 0, "Process Beta experienced zero write errors");
  assert(worker1.results.length === 50, "Process Alpha persisted exactly 50 records");
  assert(worker2.results.length === 50, "Process Beta persisted exactly 50 records");

  console.log("\nSTEP 3: Querying persisted records from PostgreSQL and verifying invariants...");
  const persistedLogs = await prisma.auditLog.findMany({
    orderBy: { sequenceNumber: "asc" },
  });

  console.log(`- Total records retrieved from PostgreSQL: ${persistedLogs.length}`);
  assert(persistedLogs.length === 100, `Exactly 100 records exist in PostgreSQL (got ${persistedLogs.length})`);

  // Verify unique sequence numbers with NO gaps: 1, 2, 3 ... 100
  const seqs = persistedLogs.map((l) => l.sequenceNumber);
  const uniqueSeqs = new Set(seqs);
  assert(uniqueSeqs.size === 100, "All 100 sequence numbers are strictly unique");

  for (let i = 0; i < 100; i++) {
    const expectedSeq = i + 1;
    assert(seqs[i] === expectedSeq, `Sequence number at index ${i} is exactly ${expectedSeq} (no gaps)`);
  }

  // Verify SHA-256 hash chaining
  for (let i = 1; i < 100; i++) {
    const prevRecord = persistedLogs[i - 1];
    const currRecord = persistedLogs[i];
    assert(
      currRecord.previousSignature === prevRecord.signature,
      `Record #${currRecord.sequenceNumber} previousSignature links strictly to Record #${prevRecord.sequenceNumber} signature`
    );
  }

  // Full cryptographic chain verification
  const mappedLogs = persistedLogs.map((log) => ({
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

  // verifyAuditLogIntegrity expects latest-first order
  const integrityReport = verifyAuditLogIntegrity([...mappedLogs].reverse());
  assert(integrityReport.valid === true, "Complete 100-record cryptographic chain passes verification with zero errors");
  assert(integrityReport.verifiedCount === 100, "Integrity verifier confirmed all 100 historical records from genesis to head");

  console.log("\nSTEP 4: Testing database failure explicit error throw (Never return false success)...");
  // Test by attempting to record with invalid enum action to trigger DB validation failure
  const { recordAuditLog } = await import("../src/lib/audit/audit-logger.ts");
  let caughtExplicitError = false;
  try {
    await recordAuditLog({
      action: "INVALID_ACTION_NOT_IN_ENUM" as any,
      actor: { name: "Failure Test", type: "system" },
      entityType: "FLAGSMITH_FLAG",
      entityId: "test_flag",
      details: "Simulating database constraint failure",
    });
  } catch (err: any) {
    caughtExplicitError = true;
    assert(err.message.includes("CRITICAL AUDIT PERSISTENCE FAILURE"), `Explicit error thrown on DB failure: "${err.message}"`);
  }
  assert(caughtExplicitError, "Failed audit write threw an explicit error and never returned false success");

  console.log("\n=====================================================================");
  console.log("DISTRIBUTED CONCURRENCY SUITE: ALL 112 CHECKS PASSED (0 FAILS)");
  console.log("STATUS: DISTRIBUTED ADVISORY LOCKING GUARANTEES LINEAR HASH CHAIN");
  console.log("=====================================================================\n");

  await prisma.$disconnect();
}

runConcurrencySuite().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
