import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const insights = await prisma.sentimentInsight.findMany();
  console.log('--- Sentiment Insight Cache Status ---');
  console.log(`Total Cached: ${insights.length}`);
  insights.forEach(it => {
    console.log(`- ${it.ticker}: Cached At ${it.createdAt.toISOString()} (Expires In ~${Math.round((it.expiresAt.getTime() - Date.now())/60000)}m)`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
