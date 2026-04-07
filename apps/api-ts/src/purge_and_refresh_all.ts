import { PrismaClient } from "@prisma/client";
import { fetchInsiderTrades } from "./services/sec-insider";

const prisma = new PrismaClient();

async function main() {
  console.log("모든 종목 내부자 거래 데이터 정화 작전 개시...");
  
  // 1. 미국 주식 티커 목록 (정화 대상)
  const tickers = ['AAPL', 'TSLA', 'NVDA', 'AMZN', 'MSFT'];
  
  for (const ticker of tickers) {
    console.log(`\n----------------------------------------`);
    console.log(`[${ticker}] 정화 작업 중...`);
    
    try {
      // 진짜 보통주 데이터 수집
      const rawTrades = await fetchInsiderTrades(ticker);
      console.log(`  수집 완료: ${rawTrades.length}건`);
      
      // 기존 데이터 삭제
      const deleted = await prisma.insiderTrade.deleteMany({ where: { ticker } });
      console.log(`  기존 데이터 ${deleted.count}건 삭제 완료.`);
      
      if (rawTrades.length > 0) {
        // 정교한 보통주 데이터 삽입
        for (const t of rawTrades) {
          await prisma.insiderTrade.create({
            data: {
              ticker,
              insiderName: t.insiderName,
              role: t.role,
              side: t.side,
              shares: t.shares,
              pricePerShare: t.pricePerShare,
              transactionDate: new Date(t.transactionDate),
              filingDate: new Date(t.filingDate),
            }
          });
        }
        console.log(`  ${rawTrades.length}건 정화 완료.`);
      } else {
        console.log("  수집된 보통주 데이터가 없습니다.");
      }
    } catch (err) {
      console.error(`  [${ticker}] 정화 중 에러 발생:`, err);
    }
  }

  // 2. 비정상 티커 또는 수동 정리가 필요한 데이터 삭제
  console.log(`\n----------------------------------------`);
  console.log("비정상 데이터(쓰레기 데이터) 정리 중...");
  const garbageDeleted = await prisma.insiderTrade.deleteMany({
    where: {
      ticker: {
        in: ['US19860313001', 'A005930'] // SEC 스크레이퍼 범위 밖인 삼성전자 등 제외
      }
    }
  });
  console.log(`비정상 데이터 ${garbageDeleted.count}건 영구 삭제 완료.`);

  console.log("\n전 종목 데이터 정화 작전이 성공적으로 완료되었습니다.");
}

main()
  .catch(e => {
    console.error("정화 작전 중 치명적 에러 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
