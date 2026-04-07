import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const trades = await prisma.insiderTrade.findMany({
    where: { ticker: 'MSFT' },
    orderBy: { transactionDate: 'desc' }
  });
  
  console.log(`DB 내 MSFT 내부자 거래 (총 ${trades.length}건):`);
  console.log(JSON.stringify(trades, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
