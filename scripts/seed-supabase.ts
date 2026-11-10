import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding live Supabase database...");

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { slug: "acme-growth" },
    update: {},
    create: {
      id: "org_acme_growth",
      name: "Acme Growth Corp",
      slug: "acme-growth",
    },
  });
  console.log("✅ Organization created:", org.name);

  // 2. Demo Users
  const users = [
    {
      id: "user_sarah_lin",
      email: "sarah@pulsepilot.ai",
      fullName: "Sarah Lin",
      role: "ADMIN" as const,
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      organizationId: org.id,
    },
    {
      id: "user_marcus_vance",
      email: "marcus@pulsepilot.ai",
      fullName: "Marcus Vance",
      role: "EDITOR" as const,
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
      organizationId: org.id,
    },
    {
      id: "user_elena_rostova",
      email: "elena@pulsepilot.ai",
      fullName: "Elena Rostova",
      role: "VIEWER" as const,
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
      organizationId: org.id,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }
  console.log("✅ Demo users created (Sarah Lin, Marcus Vance, Elena Rostova)");

  // 3. Project
  const project = await prisma.project.upsert({
    where: { id: "proj_pulsepilot_main" },
    update: {},
    create: {
      id: "proj_pulsepilot_main",
      name: "PulsePilot E-Commerce",
      description: "Autonomous experimentation workspace linked to Flagsmith",
      organizationId: org.id,
      flagsmithProjectId: "53867",
      flagsmithEnvironmentKey: "4Y72D2n57QaWFq7TU4sNsz",
      flagsmithServerKey: "ser.WfzY3pJshTQofYbAtWGSkR",
    },
  });
  console.log("✅ Project created:", project.name);

  // 4. Default Experiment: checkout_experience
  const experiment = await prisma.experiment.upsert({
    where: { flagsmithFeatureName: "checkout_experience" },
    update: {},
    create: {
      id: "exp_checkout_experience",
      projectId: project.id,
      title: "Checkout Funnel: 1-Page Layout vs 3-Step Wizard",
      hypothesis: "Collapsing the multi-step checkout into a single responsive view will eliminate friction and increase checkout completion by at least +12%.",
      description: "Multivariate testing of checkout user journeys on desktop and mobile web.",
      flagsmithFeatureName: "checkout_experience",
      status: "RUNNING",
      primaryMetric: "checkout_completed",
      guardrailMetrics: ["payment_failure_rate", "page_bounce_rate"],
      sampleSizeTarget: 5000,
      variants: {
        create: [
          {
            key: "control",
            name: "Multi-Step Wizard",
            isControl: true,
            trafficAllocation: 34,
            featureValue: { layout: "multi-step", steps: 3, express_checkout: false },
          },
          {
            key: "variant_a",
            name: "Single-Page Layout",
            isControl: false,
            trafficAllocation: 33,
            featureValue: { layout: "single-page", steps: 1, express_checkout: false },
          },
          {
            key: "variant_b",
            name: "1-Click Express",
            isControl: false,
            trafficAllocation: 33,
            featureValue: { layout: "express", steps: 1, express_checkout: true },
          },
        ],
      },
    },
  });
  console.log("✅ Experiment created:", experiment.title);

  console.log("🎉 Supabase database seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
