import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.post.groupBy({
    by: ['ticker'],
    _count: { _all: true }
  });
  console.log('--- Post Counts Per Ticker ---');
  counts.forEach(c => {
    console.log(`- ${c.ticker}: ${c._count._all} posts`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
