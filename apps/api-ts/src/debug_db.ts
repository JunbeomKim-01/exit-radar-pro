import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugDb() {
  console.log("🔍 [DB 진단 시작]");
  
  // 1. 전체 게시글 수
  const totalPosts = await prisma.post.count();
  console.log(`- 전체 게시물 수: ${totalPosts}`);

  // 2. 티커별 분포
  const postsByTicker = await prisma.post.groupBy({
    by: ['ticker'],
    _count: {
      _all: true
    }
  });

  console.log("\n📊 [티커별 게시물 분포]");
  if (postsByTicker.length === 0) {
    console.log("  (저장된 게시물이 없습니다)");
  } else {
    postsByTicker.forEach(group => {
      console.log(`  - ${group.ticker || "N/A"}: ${group._count._all}건`);
    });
  }

  // 3. 최근 5개 게시물 샘플
  const recentPosts = await prisma.post.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { ticker: true, title: true, createdAt: true }
  });

  console.log("\n🕒 [최근 5개 수집 샘플]");
  recentPosts.forEach((post, i) => {
    console.log(`  ${i+1}. [${post.ticker}] ${post.title} (${post.createdAt.toISOString()})`);
  });

  // 4. 워치리스트 확인
  const watchlist = await prisma.watchlist.findMany();
  console.log("\n👀 [현지 워치리스트 티커]");
  watchlist.forEach(w => console.log(`  - ${w.ticker}`));

  await prisma.$disconnect();
}

debugDb().catch(e => {
  console.error("❌ 진단 실패:", e);
  process.exit(1);
});
