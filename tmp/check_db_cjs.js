
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- [CJS] MSFT Insider Trade DB Audit ---');
  try {
    const trades = await prisma.insiderTrade.findMany({
      where: { ticker: 'MSFT' },
      orderBy: { transactionDate: 'desc' },
    });
    
    if (trades.length === 0) {
      console.log('❌ Result: No insider trades found for MSFT.');
    } else {
      console.log(`✅ Result: Found ${trades.length} trades for MSFT.`);
      console.log(JSON.stringify(trades.slice(0, 2), null, 2));
    }
    
    const count = await prisma.insiderTrade.count();
    console.log(`Global Count: ${count}`);
  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
