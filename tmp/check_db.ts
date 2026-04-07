
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- MSFT Insider Trade DB Audit ---');
  const trades = await prisma.insiderTrade.findMany({
    where: { ticker: 'MSFT' },
    orderBy: { transactionDate: 'desc' },
  });
  
  if (trades.length === 0) {
    console.log('❌ Result: No insider trades found for MSFT in DB.');
  } else {
    console.log(`✅ Result: Found ${trades.length} trades for MSFT.`);
    console.log(JSON.stringify(trades.slice(0, 2), null, 2));
  }

  const allCount = await prisma.insiderTrade.count();
  console.log(`Total insider trades in DB: ${allCount}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
