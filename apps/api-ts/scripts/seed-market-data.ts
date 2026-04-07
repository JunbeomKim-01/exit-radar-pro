import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  console.log("🚀 시장 지표 긴급 수혈 시작...");

  // 최근 10일간의 현실적인 시장 데이터 시뮬레이션 (2026-03-29 ~ 2026-04-07)
  const baseDate = new Date("2026-03-29");
  const data = [];

  for (let i = 0; i <= 10; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);
    
    // 주말(토, 일) 제외
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const dateStr = date.toISOString().split('T')[0];
    
    // 현실적인 지표값 (점진적 변화)
    const drift = i * 20; // 나스닥 매일 조금씩 상승
    const volDrift = i * 0.1; // 변동성 안정

    data.push({
      date: new Date(dateStr),
      nasdaqClose: 18100 + drift + (Math.random() * 50),
      nasdaqVol: 4500000000 + (Math.random() * 500000000),
      vixClose: 14.5 - volDrift,
      vxnClose: 17.2 - volDrift,
      dxyClose: 104.2 + (Math.random() * 0.2),
      wtiClose: 82.5 + (Math.random() * 1.5),
      hyOas: 3.12 - (i * 0.01),
      dgs2: 4.72 + (i * 0.005),
      yieldCurve: -0.35 + (i * 0.002),
      soxClose: 5150 + (i * 15),
      sourceStatus: "ok"
    });
  }

  console.log(`📦 ${data.length}일치 시장 기초 데이터 준비 완료.`);

  for (const row of data) {
    await prisma.marketIndicatorBar.upsert({
      where: { date: row.date },
      update: row,
      create: row,
    });
  }

  console.log("✅ MarketIndicatorBar 수혈 완료.");

  // 엔진 수동 기동 (분석 실행)
  try {
    const { analyzeReversal } = await import("../src/services/reversal-engine");
    console.log("🧠 전환 분석 엔진 점화 중...");
    const result = await analyzeReversal();
    console.log(`🎯 분석 완료: ${result.signalType} (Score: ${result.score})`);
  } catch (err) {
    console.error("❌ 엔진 분석 실패:", err);
  }
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
