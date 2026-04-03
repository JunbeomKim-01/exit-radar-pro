import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const stocks = [
  { code: "005930", name: "삼성전자", market: "KOSPI" },
  { code: "000660", name: "SK하이닉스", market: "KOSPI" },
  { code: "373220", name: "LG에너지솔루션", market: "KOSPI" },
  { code: "207940", name: "삼성바이오로직스", market: "KOSPI" },
  { code: "005380", name: "현대차", market: "KOSPI" },
  { code: "005490", name: "POSCO홀딩스", market: "KOSPI" },
  { code: "000270", name: "기아", market: "KOSPI" },
  { code: "035420", name: "NAVER", market: "KOSPI" },
  { code: "006400", name: "삼성SDI", market: "KOSPI" },
  { code: "051910", name: "LG화학", market: "KOSPI" },
  { code: "035720", name: "카카오", market: "KOSPI" },
  { code: "068270", name: "셀트리온", market: "KOSPI" },
  { code: "105560", name: "KB금융", market: "KOSPI" },
  { code: "012330", name: "현대모비스", market: "KOSPI" },
  { code: "028260", name: "삼성물산", market: "KOSPI" },
  { code: "055550", name: "신한지주", market: "KOSPI" },
  { code: "003550", name: "LG", market: "KOSPI" },
  { code: "032830", name: "삼성생명", market: "KOSPI" },
  { code: "000810", name: "삼성화재", market: "KOSPI" },
  { code: "033780", name: "KT&G", market: "KOSPI" },
  { code: "015760", name: "한국전력", market: "KOSPI" },
  { code: "018260", name: "삼성에스디에스", market: "KOSPI" },
  { code: "017670", name: "SK텔레콤", market: "KOSPI" },
  { code: "011200", name: "HMM", market: "KOSPI" },
  { code: "011070", name: "LG이노텍", market: "KOSPI" },
  { code: "066570", name: "LG전자", market: "KOSPI" },
  { code: "034730", name: "SK", market: "KOSPI" },
  { code: "009150", name: "삼성전기", market: "KOSPI" },
  { code: "010950", name: "S-Oil", market: "KOSPI" },
  { code: "086790", name: "하나금융지주", market: "KOSPI" },
  { code: "034220", name: "LG디스플레이", market: "KOSPI" },
  { code: "000720", name: "현대건설", market: "KOSPI" },
  { code: "010130", name: "고려아연", market: "KOSPI" },
  { code: "047050", name: "포스코인터내셔널", market: "KOSPI" },
  { code: "259960", name: "크래프톤", market: "KOSPI" },
  { code: "402340", name: "SK스퀘어", market: "KOSPI" },
  { code: "326030", name: "SK바이오팜", market: "KOSPI" },
  { code: "247540", name: "에코프로비엠", market: "KOSDAQ" },
  { code: "086520", name: "에코프로", market: "KOSDAQ" },
  { code: "091990", name: "셀트리온헬스케어", market: "KOSDAQ" },
  { code: "066970", name: "엘앤에프", market: "KOSDAQ" },
  { code: "214150", name: "클래시스", market: "KOSDAQ" },
  { code: "028300", name: "HLB", market: "KOSDAQ" },
  { code: "293480", name: "카카오게임즈", market: "KOSDAQ" },
  { code: "058470", name: "리노공업", market: "KOSDAQ" },
  { code: "035900", name: "JYP Ent.", market: "KOSDAQ" },
  { code: "277810", name: "레인보우로보틱스", market: "KOSDAQ" },
  
  // US Stocks (NSQ/NYS)
  { code: "US19801212001", name: "Apple", market: "NSQ" },
  { code: "US20100629001", name: "Tesla", market: "NSQ" },
  { code: "US19990122001", name: "NVIDIA", market: "NSQ" },
  { code: "US19860313001", name: "Microsoft", market: "NSQ" },
  { code: "US19970515001", name: "Amazon", market: "NSQ" },
  { code: "US20040819002", name: "Alphabet A", market: "NSQ" },
  { code: "US20120518001", name: "Meta Platforms", market: "NSQ" }
];

async function main() {
  console.log("Seeding stocks...");
  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { code: stock.code },
      update: {},
      create: stock,
    });
  }
  console.log(`Seeded ${stocks.length} stocks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
