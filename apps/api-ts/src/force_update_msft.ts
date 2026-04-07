import { PrismaClient } from "@prisma/client";
import { fetchInsiderTrades } from "./services/sec-insider";

const prisma = new PrismaClient();

async function main() {
  const ticker = 'MSFT';
  console.log(`${ticker} 진짜 데이터 수집 및 주입 시작...`);
  
  // 1. 진짜 데이터 스크래핑
  const rawTrades = await fetchInsiderTrades(ticker);
  console.log(`수집 완료: ${rawTrades.length}건`);
  
  if (rawTrades.length > 0) {
    // 2. 기존 더미 데이터 삭제
    const deleted = await prisma.insiderTrade.deleteMany({ where: { ticker } });
    console.log(`기존 데이터 ${deleted.count}건 삭제 완료.`);
    
    // 3. 진짜 데이터 삽입
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
    console.log(`${rawTrades.length}건의 진짜 데이터가 DB에 성공적으로 적재되었습니다.`);
  } else {
    console.warn("진짜 데이터를 수집하지 못했습니다.");
  }
}

main()
  .catch(e => {
    console.error("데이터 주입 중 에러 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
