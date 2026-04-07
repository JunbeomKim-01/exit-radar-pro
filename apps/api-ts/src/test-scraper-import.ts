import { SECForm4Scraper } from "./services/scrapers/secform4-scraper";

async function test(ticker: string = "AAPL") {
  console.log(`SECForm4Scraper (${ticker}) 실행 시도...`);
  const scraper = new SECForm4Scraper();
  try {
    const trades = await scraper.fetchTrades(ticker);
    console.log(`수집 결과: ${trades.length}건`);
    if (trades.length > 0) {
      console.log("최근 거래 예시:", JSON.stringify(trades[0], null, 2));
    }
  } catch (err) {
    console.error("실행 중 에러 발생:", err);
  }
}

const targetTicker = process.argv[2] || "AAPL";
test(targetTicker);
