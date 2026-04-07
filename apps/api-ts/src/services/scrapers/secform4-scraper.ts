import { chromium, type BrowserContext } from "playwright";
import { createLogger } from "../../logger";

const logger = createLogger("secform4-scraper");

export interface InsiderTrade {
  insiderName: string;
  insiderTitle: string;
  side: "BUY" | "SELL";
  transactionDate: string;
  sharesTraded: string;
  averagePrice: string;
  totalAmount: string;
  sharesOwned: string;
  filingUrl: string;
}

export class SECForm4Scraper {
  /**
   * 브라우저 컨텍스트 생성
   */
  private async createBrowser(): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
    const browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
   * secform4.com에서 특정 티커의 내부자 거래 데이터를 수집합니다.
   * 사용자의 요청에 따라 검색창을 이용하는 방식을 사용합니다.
   */
  async fetchTrades(ticker: string): Promise<InsiderTrade[]> {
    logger.info(`[SECForm4] ${ticker} 내부자 거래 수집 시작...`);
    const { context, close } = await this.createBrowser();

    try {
      const page = await context.newPage();
      
      // 1. 메인 페이지 이동
      logger.info("메인 페이지 접속 중...");
      await page.goto("https://www.secform4.com/", { waitUntil: "domcontentloaded", timeout: 30000 });

      // 2. 검색창 입력 및 버튼 클릭 (사용자 요구사항)
      logger.info(`.jml-search-box 에 ${ticker} 입력 및 검색 실행...`);
      await page.waitForSelector(".jml-search-box", { timeout: 10000 });
      await page.fill(".jml-search-box", ticker);
      await page.click(".jml-search-button");

      // 3. 결과 페이지 로딩 대기
      try {
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });
      } catch (err) {
        logger.info("페이지 전환 대기 중 타임아웃 발생했으나 계속 진행합니다.");
      }

      // 테이블이 있는지 확인
      const tableSelector = "#filing_table";
      try {
        await page.waitForSelector(tableSelector, { timeout: 10000 });
        logger.info("거래 데이터 테이블 발견.");
      } catch (err) {
        // 만약 검색 결과 리스트 페이지라면, 첫 번째 결과 클릭 시도
        const resultLink = `a[href*="/insider-trading/"]:has-text("${ticker}")`;
        const linkExists = await page.$(resultLink);
        if (linkExists) {
          logger.info(`검색 결과에서 ${ticker} 링크 클릭...`);
          await page.click(resultLink);
          await page.waitForSelector(tableSelector, { timeout: 10000 });
        } else {
          logger.warn(`${ticker} 에 대한 거래 테이블을 찾을 수 없습니다.`);
          return [];
        }
      }

      // 4. 테이블 데이터 파싱 (단순 보통주 #filing_table만 포함)
      logger.info("내부자 거래 테이블 파싱 중...");
      const trades: InsiderTrade[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("#filing_table tbody tr"));
        
        return rows.map(row => {
          // @ts-ignore
          const cells = Array.from(row.querySelectorAll("td")) as any[];
          if (cells.length < 8) return null;

          // Column Mapping based on visual audit:
          // 0: Transaction Date + Side
          // 4: Insider + Title
          // 5: Shares Traded
          // 6: Average Price
          // 7: Total Amount
          
          const firstCell = cells[0];
          const dateText = firstCell.childNodes[0]?.textContent?.trim() || "";
          const typeText = firstCell.childNodes[2]?.textContent?.trim().toUpperCase() || "";
          const side = typeText.includes("SALE") ? "SELL" : "BUY";

          // Column 5: Insider + Title
          const insiderLink = cells[4].querySelector("a");
          const insiderName = insiderLink?.textContent?.trim() || "Unknown";
          const insiderTitle = cells[4].querySelector(".pos")?.textContent?.trim() || "Unknown";

          // Other Columns
          const sharesTraded = cells[5].textContent?.trim() || "0";
          const averagePrice = cells[6].textContent?.trim() || "$0";
          const totalAmount = cells[7].textContent?.trim() || "$0";
          const sharesOwned = cells[8].textContent?.trim() || "0";
          
          const filingUrl = cells[9]?.querySelector("a")?.href || "";

          return {
            insiderName,
            insiderTitle,
            side,
            transactionDate: dateText,
            sharesTraded,
            averagePrice,
            totalAmount,
            sharesOwned,
            filingUrl
          };
        }).filter(t => t !== null) as InsiderTrade[];
      });

      logger.info(`총 ${trades.length}건의 내부자 거래 데이터를 수집했습니다.`);
      return trades;

    } catch (err) {
      logger.error(`SECForm4 수집 실패:`, err);
      return [];
    } finally {
      await close();
    }
  }
}
