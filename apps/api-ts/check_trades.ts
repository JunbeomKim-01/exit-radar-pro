import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const trades = await prisma.insiderTrade.groupBy({
    by: ['ticker'],
    _count: { ticker: true }
  });
  console.log("DB Insider Trade Summary:", JSON.stringify(trades, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
