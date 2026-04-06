const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function check() {
  const job = await prisma.crawlJob.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, error: true, ticker: true }
  });
  console.log("LATEST JOB STATUS:", JSON.stringify(job, null, 2));
  await prisma.$disconnect();
}

check();
