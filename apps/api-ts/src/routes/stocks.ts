import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import axios from "axios";

export async function stockRoutes(app: FastifyInstance) {
  // GET /stocks/search — 종목 검색 (이름 또는 코드)
  app.get("/search", async (request, reply) => {
    const { q } = request.query as { q?: string };

    if (!q || q.length < 1) {
      return reply.send({ success: true, data: [] });
    }

    // 1. 로컬 DB에서 먼저 검색
    const localStocks = await prisma.stock.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { name: 'asc' },
    });

    // 2. 토스 실시간 검색 API 호출 (미국 주식 등 발굴 목적)
    let externalStocks: any[] = [];
    try {
      const response = await axios.post("https://wts-info-api.tossinvest.com/api/v3/search-all/wts-auto-complete", {
        query: q,
        sections: [
          { type: "PRODUCT", option: { "addIntegratedSearchResult": true } }
        ]
      }, { timeout: 2000 });

      // 실제 응답 구조: response.data.result[].data.items
      const results = response.data?.result || [];
      const productSection = results.find((r: any) => r.type === "PRODUCT");
      const items = productSection?.data?.items || [];
      
      externalStocks = items.map((p: any) => {
        const currentPrice = p.base?.krw || p.base?.usd || 0;
        const prevClose = p.close?.krw || p.close?.usd || currentPrice;
        const change = currentPrice - prevClose;
        const changeRate = prevClose > 0 ? (change / prevClose) * 100 : 0;

        // 미국 주식 등 해외 종목은 p.base?.ticker(심볼)를 선호, 한국 주식은 p.productCode 사용
        const isUS = p.market === 'NASDAQ' || p.market === 'NYSE' || p.market === 'AMEX' || p.base?.currency === 'USD';
        const bestCode = (isUS && p.base?.ticker) ? p.base.ticker : (p.productCode || p.code);

        return {
          code: bestCode,
          name: p.productName || p.keyword,
          market: p.market,
          price: currentPrice,
          currency: p.base?.krw ? "KRW" : "USD",
          change,
          changeRate,
        };
      });
    } catch (err) {
      app.log.warn({ err }, "토스 검색 API 호출 실패");
    }


    // 3. 결과 병합 및 주가 정보 매핑
    const stockMap = new Map<string, any>();

    // 로컬 DB 종목 먼저 담기
    for (const s of localStocks) {
      stockMap.set(s.code, { ...s });
    }

    // 외부 검색 결과 병합 (최신 주가 정보 포함)
    for (const ext of externalStocks) {
      const existing = stockMap.get(ext.code);
      if (existing) {
        // 이미 있으면 주가 정보만 업데이트
        stockMap.set(ext.code, { ...existing, ...ext });
      } else {
        // 없으면 DB에 저장 시도 후 맵에 추가
        try {
          const newStock = await prisma.stock.upsert({
            where: { code: ext.code },
            update: {},
            create: {
              code: ext.code,
              name: ext.name,
              market: ext.market,
            },
          });
          stockMap.set(ext.code, { ...newStock, ...ext });
        } catch (dbErr) {
          app.log.error({ err: dbErr }, "Stock DB Sync Error");
          stockMap.set(ext.code, ext); // DB 저장 실패해도 결과엔 포함
        }
      }
    }

    return reply.send({
      success: true,
      data: Array.from(stockMap.values()).slice(0, 20),
    });
  });

  // GET /stocks — 자주 쓰이는 상위 종목 목록
  app.get("/", async (request, reply) => {
    const stocks = await prisma.stock.findMany({
      take: 50,
      orderBy: { name: 'asc' },
    });
    return reply.send({ success: true, data: stocks });
  });

  // GET /stocks/:ticker/politician-trades — 특정 종목의 정치인 거래 내역
  app.get("/:ticker/politician-trades", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    if (!ticker) {
      return reply.status(400).send({ success: false, message: "Ticker is required" });
    }

    try {
      // @ts-ignore - Prisma 클라이언트 갱신 전까지 타입 무시
      const trades = await (prisma as any).politicianTrade.findMany({
        where: { ticker: ticker.toUpperCase() },
        orderBy: { transactionDate: 'desc' },
        take: 50
      });

      return reply.send({
        success: true,
        data: trades
      });
    } catch (err) {
      app.log.error({ err }, "Politician trades fetch error");
      return reply.status(500).send({ success: false, message: "Failed to fetch politician trades" });
    }
  });
}

