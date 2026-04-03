import { chromium } from "playwright";
import { SessionManager } from "./session-manager";
import { createLogger } from "./logger";

const logger = createLogger("portfolio-scraper");

export interface PortfolioItem {
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  returnAmount: number;
  returnRate: number;
  currency: string;
}

export interface PortfolioData {
  totalAssetValue: number;
  totalInvested: number;
  totalReturnAmount: number;
  totalReturnRate: number;
  currency: string;
  items: PortfolioItem[];
}

export async function fetchTossPortfolio(accountName: string = "default"): Promise<PortfolioData | null> {
  const sessionManager = new SessionManager();
  const session = await sessionManager.loadSession(accountName);

  if (!session) {
    logger.error("유효한 세션을 찾을 수 없습니다.");
    return null;
  }

  logger.info("Playwright 기반 브라우저 시작 (Headless)...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  if (session.cookies) await context.addCookies(session.cookies);
  if (session.localStorage) {
    await context.addInitScript((storage) => {
      for (const [key, value] of Object.entries(storage)) {
        try { (window as any).localStorage.setItem(key, value as string); } catch {}
      }
    }, session.localStorage);
  }

  const page = await context.newPage();
  let interceptedData: any = null;

  // API 인터셉터 설정: portfolio/sections/all 요청을 낚아챕니다.
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/v2/dashboard/asset/sections/all')) {
       try {
          const body = await response.json();
          if (body?.result?.sections) {
             interceptedData = body;
             logger.info("자산 섹션 API 인터셉트 완료.");
          }
       } catch (e) {}
    }
  });

  try {
    logger.info("토스 자산 페이지 접속 중...");
    // /account 접속하여 API 호출을 유도합니다.
    const sectionsPromise = page.waitForResponse(response => 
      response.url().includes('/api/v2/dashboard/asset/sections/all') && response.status() === 200,
      { timeout: 60000 }
    ).catch(() => null);

    await page.goto("https://www.tossinvest.com/account", { waitUntil: "domcontentloaded", timeout: 40_000 });
    
    // API 응답을 기다립니다.
    const response = await sectionsPromise;
    if (response) {
       const body = await response.json();
       if (body?.result?.sections) {
          interceptedData = body;
          logger.info("자산 섹션 API 인터셉트 완료.");
       }
    }
    
    await browser.close();

    if (!interceptedData) {
       logger.error("자산 정보를 가로채는 데 실패했습니다. (로그아웃 되었거나 경로 변경 가능성)");
       return null;
    }

    const sections: any[] = interceptedData.result.sections;
    const overview = sections.find(s => s.type === "SORTED_OVERVIEW");
    
    if (!overview || !overview.data || !overview.data.products) {
       logger.warn("보유 종목이 비어있습니다.");
       return { totalAssetValue: 0, totalInvested: 0, totalReturnAmount: 0, totalReturnRate: 0, currency: "USD", items: [] };
    }

    const items: PortfolioItem[] = [];
    let totalInvested = 0;
    let totalValue = 0;

    for (const prod of overview.data.products) {
       for (const item of (prod.items || [])) {
           const ticker = item.stockSymbol || item.stockCode || "UNKNOWN";
           const quantity = parseFloat(item.quantity || "0");
           const currentPrice = item.currentPrice?.usd || item.currentPrice?.krw || 0;
           const averagePrice = item.purchasePrice?.usd || item.purchasePrice?.krw || 0;
           
            const rawReturnRate = item.profitLossRate?.usd || item.profitLossRate?.krw || 0;
            // 토스 API가 0.05(5%) 형태와 5.0(5%) 형태를 혼용할 수 있으므로 절대값이 1보다 작으면 100을 곱함
            // (주의: 1% 미만의 수익률이 있을 수 있으나, 보통 API는 비율로 줌)
            // 검증 결과 토스 웹 API는 보통 5.23 같은 백분율을 줌. 하지만 "틀렸다"는 피드백이 있으므로 수동 계산 병행
            const calculatedReturnRate = (quantity * averagePrice) > 0 
                ? (((quantity * currentPrice) - (quantity * averagePrice)) / (quantity * averagePrice)) * 100
                : rawReturnRate;

            items.push({
                ticker,
                name: item.stockName || ticker,
                quantity,
                averagePrice,
                currentPrice,
                returnAmount: (item.evaluatedAmount?.usd || item.evaluatedAmount?.krw || 0) - (quantity * averagePrice),
                returnRate: calculatedReturnRate,
                currency: item.currency || "USD"
            });
           totalInvested += (quantity * averagePrice);
           totalValue += (quantity * currentPrice);
       }
    }

    return {
       totalAssetValue: totalValue,
       totalInvested,
       totalReturnAmount: totalValue - totalInvested,
       totalReturnRate: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
       currency: "USD",
       items
    };

  } catch (error: any) {
    logger.error(`브라우저 자동화 오류: ${error.message}`);
    await browser.close();
    return null;
  }
}

if (require.main === module) {
  require("dotenv").config({ path: "../../.env" });
  fetchTossPortfolio().then(data => {
      if (data) console.log(JSON.stringify(data));
      else console.log(JSON.stringify({ error: "Failed to fetch" }));
  });
}
