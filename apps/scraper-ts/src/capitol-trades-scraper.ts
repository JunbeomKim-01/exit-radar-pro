import { chromium, type BrowserContext, type Page } from "playwright";
import { createLogger } from "./logger";

const logger = createLogger("capitol-trades-scraper");

export interface PoliticianTrade {
  politicianName: string;
  party: string;
  chamber: string;
  side: "BUY" | "SELL";
  amountRange: string;
  transactionDate: string;
  filingDate: string;
}

export class CapitolTradesScraper {
  /**
   * 브라우저 컨텍스트 생성
   */
  private async createBrowser(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    return {
      context,
      close: async () => {
        await context.close();
        await browser.close();
      },
    };
  }

  /**
   * 특정 티커의 정치인 거래 데이터를 수집합니다.
   */
  async fetchTrades(ticker: string): Promise<PoliticianTrade[]> {
    logger.info(`[Capitol Trades] ${ticker} 수집 시작...`);
    const { context, close } = await this.createBrowser();

    try {
      const page = await context.newPage();
      
      // 1. issuer ID 추출을 위해 검색 페이지 이동
      const searchUrl = `https://www.capitoltrades.com/issuers?search=${encodeURIComponent(ticker)}`;
      logger.info(`발행사 ID 검색 중: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      // issuers/ 가 포함된 첫 번째 링크를 찾아서 ID 추출
      const issuerId = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/issuers/"]'));
        if (links.length === 0) return null;
        
        // href에서 issuers/ 다음 부분을 가져옴
        const href = (links[0] as HTMLAnchorElement).href;
        const parts = href.split('/issuers/');
        if (parts.length < 2) return null;
        
        return parts[1].split('?')[0].split('#')[0];
      });

      if (!issuerId) {
        logger.warn(`${ticker} 에 대한 발행사 ID를 찾을 수 없습니다.`);
        return [];
      }

      logger.info(`발행사 ID 발견: ${issuerId}. 거래 데이터 페이지로 직접 이동...`);

      // 2. 해당 issuerId의 거래 페이지로 직접 이동 (180d 필터 포함)
      const tradesUrl = `https://www.capitoltrades.com/trades?issuer=${issuerId}&txDate=180d`;
      await page.goto(tradesUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      
      // 테이블 로딩 대기
      try {
        await page.waitForSelector('tbody tr', { timeout: 10000 });
      } catch (e) {
        logger.warn("거래 데이터 테이블을 찾을 수 없습니다 (데이터가 없을 수 있음).");
        return [];
      }

      // 3. 테이블 데이터 파싱 (검증된 셀렉터 사용)
      logger.info("거래 데이터 테이블 파싱 중...");
      const trades: PoliticianTrade[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 5) return null;

          // Politician Info
          const politicianName = row.querySelector('.politician-name a, .politician a')?.textContent?.trim() || "Unknown";
          const party = row.querySelector('.party')?.textContent?.trim() || "I";
          const chamber = row.querySelector('.chamber')?.textContent?.trim() || "House";
          
          // Transaction Details
          const sideText = row.querySelector('.tx-type')?.textContent?.trim().toUpperCase() || "";
          const side = sideText.includes('BUY') || sideText.includes('PURCHASE') ? 'BUY' : 'SELL';
          
          const amountRange = row.querySelector('.trade-size')?.textContent?.trim() || "Unknown";
          
          // Dates 추출 - 텍스트 패턴 매칭 사용
          const datePattern = /^\d{1,2}\s+\w+20\d{2}$|^\w+\s+20\d{2}$/;
          let transactionDateStr = "";
          let filingDateStr = "";
          
          cells.forEach(cell => {
            const text = cell.textContent?.trim() || "";
            if (datePattern.test(text)) {
              if (!transactionDateStr) {
                transactionDateStr = text;
              } else if (!filingDateStr) {
                filingDateStr = text;
              }
            }
          });

          return {
            politicianName,
            party: party.includes('Dem') ? 'D' : (party.includes('Rep') ? 'R' : 'I'),
            chamber: chamber.includes('House') ? 'House' : 'Senate',
            side,
            amountRange,
            transactionDate: transactionDateStr || new Date().toISOString(),
            filingDate: filingDateStr || new Date().toISOString()
          };
        }).filter(t => t !== null) as any[];
      });

      logger.info(`총 ${trades.length}건의 정치인 거래 데이터를 수집했습니다.`);
      return trades;

    } catch (err) {
      logger.error(`Capitol Trades 수집 실패:`, err);
      return [];
    } finally {
      await close();
    }
  }
}

// 직접 실행 테스트 (CLI)
if (require.main === module) {
  const ticker = process.argv[2] || "AAPL";
  const scraper = new CapitolTradesScraper();
  scraper.fetchTrades(ticker).then(data => {
    console.log(JSON.stringify(data, null, 2));
  });
}
