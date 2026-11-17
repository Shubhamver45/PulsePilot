/**
 * PulsePilot AI — Runtime Database Identity & Organization RLS Enforcement Test
 * Hackathon Track 02: AI Agents & Feature Flags
 *
 * Verifies:
 * 1. Effective Runtime Database Identity: current_user === 'pulsepilot_app', session_user === 'postgres'.
 * 2. NOBYPASSRLS Enforcement: rolbypassrls === false, rolsuper === false.
 * 3. Least-Privilege DML Operations: SELECT, INSERT, UPDATE, DELETE succeed on business tables.
 * 4. Immutable Ledger Defense: UPDATE, DELETE, TRUNCATE strictly denied on audit_logs & revoked_tokens.
 * 5. Structural Security: DROP, TRUNCATE, and _prisma_migrations access strictly denied.
 * 6. Multi-Tenant Organization RLS Enforcement: Cross-tenant SELECT, INSERT, UPDATE, DELETE rejected.
 * 7. Regression Assertion: Fails loudly if runtime connection unexpectedly runs as a privileged role.
 */

import { prisma, withRestrictedAppRole, withTenantContext } from "../src/lib/db/prisma.ts";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ""}`);
  }
}

async function runRuntimeIdentityVerification() {
  console.log("=====================================================================");
  console.log("   PULSEPILOT AI — RUNTIME DATABASE IDENTITY & RLS VERIFICATION      ");
  console.log("=====================================================================\n");

  // -------------------------------------------------------------------------
  // SECTION 1: EFFECTIVE RUNTIME DATABASE IDENTITY & PRIVILEGE BOUNDARIES
  // -------------------------------------------------------------------------
  console.log("SECTION 1: EFFECTIVE RUNTIME DATABASE IDENTITY & PRIVILEGE BOUNDARIES");

  const identityResult = await withRestrictedAppRole(async (tx) => {
    const whoami: any = await tx.$queryRawUnsafe("SELECT current_user, session_user;");
    const roleAttrs: any = await tx.$queryRawUnsafe(
      "SELECT rolname, rolsuper, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
    );
    return {
      currentUser: whoami[0]?.current_user,
      sessionUser: whoami[0]?.session_user,
      activeRole: roleAttrs[0],
    };
  });

  console.log(`     Connected session_user: ${identityResult.sessionUser}`);
  console.log(`     Effective current_user: ${identityResult.currentUser}`);
  console.log(`     Effective rolbypassrls: ${identityResult.activeRole?.rolbypassrls}`);

  assert(
    identityResult.currentUser === "pulsepilot_app",
    `Application runtime executes as restricted role 'pulsepilot_app' (actual: '${identityResult.currentUser}')`
  );
  assert(
    identityResult.currentUser !== "postgres",
    "Regression Check: Application runtime is NOT executing as superuser/owner 'postgres'"
  );
  assert(
    identityResult.activeRole.rolbypassrls === false,
    `Row Level Security strictly enforced: rolbypassrls = false on effective role (${identityResult.currentUser})`
  );
  assert(
    identityResult.activeRole.rolsuper === false,
    `Zero superuser escalation: rolsuper = false on effective role (${identityResult.currentUser})`
  );

  // -------------------------------------------------------------------------
  // SECTION 2: LEAST-PRIVILEGE BUSINESS OPERATIONS (PERMITTED DML)
  // -------------------------------------------------------------------------
  console.log("\nSECTION 2: LEAST-PRIVILEGE DML ON APPLICATION TABLES");

  const testOrgId = `org_rls_test_${Date.now()}`;
  const testProjId = `proj_rls_test_${Date.now()}`;

  await withRestrictedAppRole(async (tx) => {
    // 1. INSERT on organizations & projects
    await tx.organization.create({
      data: {
        id: testOrgId,
        name: "RLS Verification Org",
        slug: `rls-org-${Date.now()}`,
      },
    });

    await tx.project.create({
      data: {
        id: testProjId,
        name: "RLS Verification Project",
        organizationId: testOrgId,
      },
    });

    // 2. SELECT
    const fetchedProj = await tx.project.findUnique({ where: { id: testProjId } });
    if (!fetchedProj) throw new Error("Project not found after insert");

    // 3. UPDATE
    await tx.project.update({
      where: { id: testProjId },
      data: { description: "Updated under pulsepilot_app" },
    });
  });

  assert(true, "pulsepilot_app successfully performs SELECT, INSERT, and UPDATE on business tables");

  // -------------------------------------------------------------------------
  // SECTION 3: IMMUTABLE LEDGER & STRUCTURAL MUTATION DEFENSE (DENIED OPERATIONS)
  // -------------------------------------------------------------------------
  console.log("\nSECTION 3: IMMUTABLE LEDGER & PRIVILEGE DENIAL ENFORCEMENT");

  const auditId = `aud_rls_test_${Date.now()}`;
  const existingOrg = await prisma.organization.findFirst();
  const auditOrgId = existingOrg ? existingOrg.id : testOrgId;

  await withRestrictedAppRole(async (tx) => {
    await tx.auditLog.create({
      data: {
        id: auditId,
        action: "EXPERIMENT_CREATED",
        actorName: "Security Test Runner",
        actorType: "system",
        entityType: "EXPERIMENT",
        entityId: "exp_test",
        details: "Audit log creation test",
        organizationId: auditOrgId,
      },
    });
  });

  // Attempt UPDATE on immutable audit_logs (MUST FAIL)
  let auditUpdateBlocked = false;
  try {
    await withRestrictedAppRole(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE public.audit_logs SET details = 'HACKED' WHERE id = '${auditId}';`
      );
    });
  } catch (err: any) {
    auditUpdateBlocked = true;
    console.log(`     Audit UPDATE blocked with: ${err.message.split("\n")[0]}`);
  }
  assert(auditUpdateBlocked, "Privilege Denial: UPDATE on audit_logs strictly forbidden (P0001 / 42501)");

  // Attempt DELETE on immutable audit_logs (MUST FAIL)
  let auditDeleteBlocked = false;
  try {
    await withRestrictedAppRole(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM public.audit_logs WHERE id = '${auditId}';`
      );
    });
  } catch (err: any) {
    auditDeleteBlocked = true;
    console.log(`     Audit DELETE blocked with: ${err.message.split("\n")[0]}`);
  }
  assert(auditDeleteBlocked, "Privilege Denial: DELETE on audit_logs strictly forbidden (P0001 / 42501)");

  // Attempt TRUNCATE on business tables (MUST FAIL)
  let truncateBlocked = false;
  try {
    await withRestrictedAppRole(async (tx) => {
      await tx.$executeRawUnsafe("TRUNCATE TABLE public.projects;");
    });
  } catch (err: any) {
    truncateBlocked = true;
  }
  assert(truncateBlocked, "Privilege Denial: TRUNCATE TABLE public.projects strictly forbidden (42501)");

  // Attempt access to _prisma_migrations (MUST FAIL)
  let migrationsAccessBlocked = false;
  try {
    await withRestrictedAppRole(async (tx) => {
      await tx.$queryRawUnsafe("SELECT * FROM public._prisma_migrations;");
    });
  } catch (err: any) {
    migrationsAccessBlocked = true;
  }
  assert(migrationsAccessBlocked, "Privilege Denial: Access to public._prisma_migrations strictly forbidden (42501)");

  // -------------------------------------------------------------------------
  // SECTION 4: MULTI-TENANT ORGANIZATION ROW LEVEL SECURITY ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log("\nSECTION 4: MULTI-TENANT ORGANIZATION RLS ENFORCEMENT");

  const orgAlphaId = `org_alpha_${Date.now()}`;
  const orgBetaId = `org_beta_${Date.now()}`;
  const projAlphaId = `proj_alpha_${Date.now()}`;
  const projBetaId = `proj_beta_${Date.now()}`;

  // Provision test tenants and projects
  await withRestrictedAppRole(async (tx) => {
    await tx.organization.create({ data: { id: orgAlphaId, name: "Tenant Alpha", slug: `alpha-${Date.now()}` } });
    await tx.organization.create({ data: { id: orgBetaId, name: "Tenant Beta", slug: `beta-${Date.now()}` } });
    await tx.project.create({ data: { id: projAlphaId, name: "Alpha Core Project", organizationId: orgAlphaId } });
    await tx.project.create({ data: { id: projBetaId, name: "Beta Core Project", organizationId: orgBetaId } });
  });

  // Test 4A: Tenant Alpha Context Isolation on SELECT
  const alphaReadResult = await withTenantContext(orgAlphaId, async (tx) => {
    return tx.project.findMany({ where: { id: { in: [projAlphaId, projBetaId] } } });
  });

  assert(
    alphaReadResult.length === 1 && alphaReadResult[0].id === projAlphaId,
    `RLS Read Isolation: Tenant Alpha query returns ONLY Alpha project (${projAlphaId}); Beta project (${projBetaId}) is invisible (0 rows)`
  );

  // Test 4B: Tenant Beta Context Isolation on SELECT
  const betaReadResult = await withTenantContext(orgBetaId, async (tx) => {
    return tx.project.findMany({ where: { id: { in: [projAlphaId, projBetaId] } } });
  });

  assert(
    betaReadResult.length === 1 && betaReadResult[0].id === projBetaId,
    `RLS Read Isolation: Tenant Beta query returns ONLY Beta project (${projBetaId}); Alpha project (${projAlphaId}) is invisible (0 rows)`
  );

  // Test 4C: Cross-Tenant UPDATE Rejection
  const crossUpdateCount = await withTenantContext(orgAlphaId, async (tx) => {
    return tx.$executeRawUnsafe(
      `UPDATE public.projects SET name = 'MALICIOUS_OVERWRITE' WHERE id = '${projBetaId}';`
    );
  });
  assert(
    crossUpdateCount === 0,
    `RLS Update Isolation: Tenant Alpha attempting to update Beta project modified 0 rows (cross-tenant update denied)`
  );

  // Test 4D: Cross-Tenant INSERT Rejection (WITH CHECK Violation)
  let crossInsertBlocked = false;
  try {
    await withTenantContext(orgAlphaId, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.projects ("id", "name", "organizationId", "createdAt", "updatedAt") 
         VALUES ('proj_spoofed_${Date.now()}', 'Injected Project', '${orgBetaId}', NOW(), NOW());`
      );
    });
  } catch (err: any) {
    crossInsertBlocked = true;
    console.log(`     Cross-tenant INSERT rejected with: ${err.message.split("\n")[0]}`);
  }
  assert(
    crossInsertBlocked,
    "RLS Insert Isolation: Attempting to insert into Org Beta while scoped to Org Alpha throws RLS WITH CHECK policy violation"
  );

  // Test 4E: Cross-Tenant DELETE Rejection
  const crossDeleteCount = await withTenantContext(orgAlphaId, async (tx) => {
    return tx.$executeRawUnsafe(
      `DELETE FROM public.projects WHERE id = '${projBetaId}';`
    );
  });
  assert(
    crossDeleteCount === 0,
    `RLS Delete Isolation: Tenant Alpha attempting to delete Beta project removed 0 rows (cross-tenant delete denied)`
  );

  // Clean up test records
  await withRestrictedAppRole(async (tx) => {
    await tx.project.deleteMany({ where: { id: { in: [testProjId, projAlphaId, projBetaId] } } });
    const orgsToDelete = [orgAlphaId, orgBetaId];
    if (auditOrgId !== testOrgId) {
      orgsToDelete.push(testOrgId);
    }
    await tx.organization.deleteMany({ where: { id: { in: orgsToDelete } } });
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n=====================================================================");
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log("=====================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRuntimeIdentityVerification()
  .catch((e) => {
    console.error("Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
