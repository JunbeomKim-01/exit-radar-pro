import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 데이터 정화 작전 시작 (Purifying Stale/Dirty Data)...');

  try {
    // 1. Insider Trading 정화 (보통주 필터링 전 데이터 제거)
    console.log('--- [InsiderTrade] 테이블 비우는 중...');
    const deletedInsiders = await prisma.insiderTrade.deleteMany({});
    console.log(`✅ ${deletedInsiders.count}건의 내부자 거래 데이터 삭제 완료.`);

    // 2. Community Data 정화 (날짜 지연 데이터 제거)
    console.log('--- [Post, Comment, Sentiment] 관련 테이블 비우는 중...');
    const deletedPosts = await prisma.post.deleteMany({});
    const deletedAggs = await prisma.sentimentAggregate.deleteMany({});
    const deletedInsights = await prisma.sentimentInsight.deleteMany({});
    
    console.log(`✅ ${deletedPosts.count}건의 게시물 데이터 삭제 완료.`);
    console.log(`✅ ${deletedAggs.count}건의 투심 지표 데이터 삭제 완료.`);
    console.log(`✅ ${deletedInsights.count}건의 분석 인사이트 데이터 삭제 완료.`);

    console.log('\n✨ [Mission Accomplished] 모든 오염된 데이터가 소거되었습니다.');
  } catch (error) {
    console.error('❌ 정화 작전 중 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
