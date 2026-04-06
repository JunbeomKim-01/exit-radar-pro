import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function check() {
  const postCount = await prisma.post.count();
  const latestPosts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, sentiment: true, createdAt: true }
  });
  
  console.log(`Total Posts: ${postCount}`);
  console.log("Latest 5 Posts:");
  latestPosts.forEach(p => {
    console.log(`- [${p.createdAt.toISOString()}] ${p.title} (Sentiment: ${p.sentiment || 'NONE'})`);
  });
  
  const job = await prisma.crawlJob.findFirst({
    orderBy: { startedAt: 'desc' }
  });
  console.log(`Latest Job Status: ${job?.status}, postCount: ${job?.postCount}, error: ${job?.error || 'NONE'}`);
}

check().finally(() => prisma.$disconnect());
