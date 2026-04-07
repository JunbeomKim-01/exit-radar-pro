/**
 * Radar Routes — EXIT Radar 핵심 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import { analyzeRisk } from "../services/risk-engine";
import { fetchDailyPrices } from "../services/alpha-vantage";
import { fetchInstitutionHoldings, resolveUnderlyingTicker } from "../services/sec-insider";
import { createLogger } from "../logger";

const logger = createLogger("radar-routes");

export async function radarRoutes(app: FastifyInstance) {
  // GET /radar/feed — 리스크 높은 순 피드
  app.get("/feed", async (request, reply) => {
    // 워치리스트 종목들의 최신 리스크 스냅샷 조회
    const watchlist = await prisma.watchlist.findMany();
    const tickers: string[] = watchlist.map((w: any) => w.ticker);

    if (tickers.length === 0) {
      return reply.send({ success: true, data: [] });
    }

    const snapshots = await Promise.all(
      tickers.map(async (ticker: string) => {
        const snapshot = await prisma.riskSnapshot.findFirst({
          where: { ticker },
          orderBy: { asOf: "desc" },
          include: { factors: true },
        });
        return snapshot;
      })
    );

    // null 제거 → 리스크 높은 순 정렬
    const feed = snapshots
      .filter((s: any) => s !== null)
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

    return reply.send({ success: true, data: feed });
  });

  // GET /radar/tickers/:ticker/summary — 종목 리스크 요약
  app.get("/tickers/:ticker/summary", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const snapshot = await prisma.riskSnapshot.findFirst({
      where: { ticker },
      orderBy: { asOf: "desc" },
      include: { factors: true },
    });

    if (!snapshot) {
      return reply.send({
        success: true,
        data: { ticker, score: 0, level: "Low", action: "보유", summary: "분석 데이터 없음", factors: [] },
      });
    }

    return reply.send({ success: true, data: snapshot });
  });

  // GET /radar/tickers/:ticker/signals — 리스크 시그널 목록
  app.get("/tickers/:ticker/signals", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const snapshot = await prisma.riskSnapshot.findFirst({
      where: { ticker },
      orderBy: { asOf: "desc" },
      include: { factors: true },
    });

    return reply.send({ success: true, data: snapshot?.factors || [] });
  });

  // GET /radar/tickers/:ticker/insiders — 내부자 거래
  app.get("/tickers/:ticker/insiders", async (request, reply) => {
    const { ticker: rawTicker } = request.params as { ticker: string };
    const { force } = request.query as { force?: string };
    const ticker = resolveUnderlyingTicker(rawTicker);

    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    
    // DB에서 가장 최신 갱신일 확인
    const lastRecord = await prisma.insiderTrade.findFirst({
      where: { ticker },
      orderBy: { fetchedAt: "desc" }
    });

    const isOld = !lastRecord || (Date.now() - lastRecord.fetchedAt.getTime() > ONE_WEEK);
    const shouldRefresh = force === "true" || isOld;

    if (shouldRefresh) {
      logger.info(`${ticker}: 내부자 거래 데이터 갱신 중 (Reason: ${force === "true" ? "Manual" : "Auto-7d"})`);
      try {
        const { fetchInsiderTrades } = await import("../services/sec-insider");
        const rawTrades = await fetchInsiderTrades(ticker);
        
        if (rawTrades.length > 0) {
          // 기존 데이터 삭제 로직 제거 (증분 업데이트 수행)
          // await prisma.insiderTrade.deleteMany({ where: { ticker } });
          
          const tradesToCreate = rawTrades
            .filter(t => t.shares >= 0)
            .map(t => ({
              ticker,
              insiderName: t.insiderName,
              role: t.role,
              side: t.side,
              shares: t.shares,
              pricePerShare: t.pricePerShare,
              transactionDate: new Date(t.transactionDate),
              filingDate: new Date(t.filingDate),
              fetchedAt: new Date(),
            }));

          logger.info(`${ticker}: DB 적재 준비 완료 (${tradesToCreate.length}건)`);

          if (tradesToCreate.length > 0) {
            await prisma.insiderTrade.createMany({
              data: tradesToCreate,
              skipDuplicates: true, // DB 레벨의 @@unique 제약조건과 연동
            });
            logger.info(`${ticker}: ${tradesToCreate.length}건 내부자 거래 데이터 증분 업데이트 완료`);
          }
        }
      } catch (err) {
        logger.error(`내부자 거래 데이터 수집 실패 (${ticker}):`, err);
      }
    }

    const trades = await prisma.insiderTrade.findMany({
      where: { ticker },
      orderBy: { transactionDate: "desc" },
      take: 20,
    });

    return reply.send({ success: true, data: trades });
  });

  // GET /radar/tickers/:ticker/institutions — 기관 보유
  app.get("/tickers/:ticker/institutions", async (request, reply) => {
    const { ticker: rawTicker } = request.params as { ticker: string };
    const { force } = request.query as { force?: string };
    const ticker = resolveUnderlyingTicker(rawTicker);

    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;

    // DB에서 가장 최신 갱신일 확인
    const lastRecord = await prisma.institutionHolding.findFirst({
      where: { ticker },
      orderBy: { fetchedAt: "desc" }
    });

    const isOld = !lastRecord || (Date.now() - lastRecord.fetchedAt.getTime() > ONE_MONTH);
    const shouldRefresh = force === "true" || isOld;

    if (shouldRefresh) {
      logger.info(`${ticker}: 기관 보유 데이터 갱신 중 (Reason: ${force === "true" ? "Manual" : "Auto-30d"})`);
      try {
        const rawHoldings = await fetchInstitutionHoldings(ticker);
        
        if (rawHoldings.length > 0) {
          // 기존 데이터 삭제 제거 (증분 업데이트)
          // await prisma.institutionHolding.deleteMany({ where: { ticker } });
          
          const holdingsToCreate = rawHoldings.map(h => ({
            ticker,
            institutionName: h.institutionName,
            shares: h.shares,
            changeShares: h.changeShares,
            changePercent: h.changePercent,
            reportDate: new Date(h.reportDate),
            fetchedAt: new Date(),
          }));

          if (holdingsToCreate.length > 0) {
            await prisma.institutionHolding.createMany({
              data: holdingsToCreate,
              skipDuplicates: true,
            });
            logger.info(`${ticker}: ${holdingsToCreate.length}건 기관 보유 데이터 증분 업데이트 완료`);
          }
        }
      } catch (err) {
        logger.error(`기관 보유 데이터 수집 실패 (${ticker}):`, err);
      }
    }

    const holdings = await prisma.institutionHolding.findMany({
      where: { ticker },
      orderBy: { reportDate: "desc" },
      take: 20,
    });

    return reply.send({ success: true, data: holdings });
  });

  // GET /radar/tickers/:ticker/politicians — 정치인 거래
  app.get("/tickers/:ticker/politicians", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { force } = request.query as { force?: string };

    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    
    const lastRecord = await (prisma as any).politicianTrade.findFirst({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { fetchedAt: "desc" }
    });

    const isOld = !lastRecord || (Date.now() - lastRecord.fetchedAt.getTime() > ONE_MONTH);
    const shouldRefresh = force === "true" || isOld;

    if (shouldRefresh) {
      logger.info(`${ticker}: 정치인 거래 데이터 수집 시도...`);
      try {
        const { CapitolTradesScraper } = await import("../../../scraper-ts/src/capitol-trades-scraper");
        const scraper = new CapitolTradesScraper();
        const trades = await scraper.fetchTrades(ticker.toUpperCase());
        
        if (trades && Array.isArray(trades) && trades.length > 0) {
          // 기존 데이터 삭제 로직 제거 (증분 업데이트)
          // await (prisma as any).politicianTrade.deleteMany({ where: { ticker: ticker.toUpperCase() } });
          
          const parseDate = (dStr: string) => {
            const d = new Date(dStr);
            return isNaN(d.getTime()) ? new Date() : d;
          };

          const tradesToCreate = trades.map(t => ({
            ticker: ticker.toUpperCase(),
            politicianName: t.politicianName || "Unknown",
            party: t.party || "I",
            chamber: t.chamber || "House",
            side: t.side === "BUY" ? "BUY" : "SELL",
            amountRange: t.amountRange || "Unknown",
            transactionDate: parseDate(t.transactionDate),
            filingDate: parseDate(t.filingDate),
            fetchedAt: new Date(),
          }));

          if (tradesToCreate.length > 0) {
            await (prisma as any).politicianTrade.createMany({
              data: tradesToCreate,
              skipDuplicates: true,
            });
            logger.info(`${ticker}: ${tradesToCreate.length}건 정치인 거래 데이터 증분 업데이트 완료`);
          }
        }
      } catch (err) {
        logger.error(`정치인 거래 데이터 수집 실패 (${ticker}):`, err);
      }
    }

    const trades = await (prisma as any).politicianTrade.findMany({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { transactionDate: "desc" },
      take: 30,
    });

    return reply.send({ success: true, data: trades });
  });

  // GET /radar/tickers/:ticker/full-report — 모든 종목 데이터 벌크 로드 (성능 최적화)
  app.get("/tickers/:ticker/full-report", async (request, reply) => {
    const { ticker: rawTicker } = request.params as { ticker: string };
    const { force } = request.query as { force?: string };
    const ticker = resolveUnderlyingTicker(rawTicker);

    // 모든 데이터를 비동기 병렬로 수급
    const [summary, signals, insiders, institutions, politicians] = await Promise.all([
      // 1. 요약 및 스냅샷
      prisma.riskSnapshot.findFirst({
        where: { ticker },
        orderBy: { asOf: "desc" },
        include: { factors: true },
      }),
      // 2. 리스크 시그널
      prisma.riskSnapshot.findFirst({
        where: { ticker },
        orderBy: { asOf: "desc" },
        include: { factors: true },
      }).then(s => s?.factors || []),
      // 3. 내부자 거래 (갱신 로직 포함 X - 캐시된 데이터만 반환)
      prisma.insiderTrade.findMany({
        where: { ticker },
        orderBy: { transactionDate: "desc" },
        take: 20,
      }),
      // 4. 기관 보유
      prisma.institutionHolding.findMany({
        where: { ticker },
        orderBy: { reportDate: "desc" },
        take: 20,
      }),
      // 5. 정치인 거래
      (prisma as any).politicianTrade.findMany({
        where: { ticker: ticker.toUpperCase() },
        orderBy: { transactionDate: "desc" },
        take: 30,
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        summary: summary || { ticker, score: 0, level: "Low", action: "보유", summary: "분석 데이터 없음", factors: [] },
        signals,
        insiders,
        institutions,
        politicians
      }
    });
  });

  // GET /radar/tickers/:ticker/price-history — 가격 히스토리
  app.get("/tickers/:ticker/price-history", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const bars = await fetchDailyPrices(ticker);
    return reply.send({ success: true, data: bars });
  });

  // POST /radar/tickers/:ticker/refresh — 수동 데이터 갱신
  app.post("/tickers/:ticker/refresh", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const stock = await prisma.stock.findFirst({ where: { code: ticker } });
    const name = stock?.name || ticker;

    // 비동기로 리스크 재분석
    analyzeRisk(ticker, name).catch(err => {
      logger.error(`리스크 갱신 실패 (${ticker}):`, err);
    });

    return reply.send({
      success: true,
      message: `${ticker} 리스크 분석이 백그라운드에서 진행됩니다.`,
    });
  });
}
