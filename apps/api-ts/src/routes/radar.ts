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

    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    // DB에서 가장 최신 갱신일 확인
    const lastRecord = await prisma.insiderTrade.findFirst({
      where: { ticker },
      orderBy: { fetchedAt: "desc" }
    });

    const isOld = !lastRecord || (Date.now() - lastRecord.fetchedAt.getTime() > ONE_DAY);
    const shouldRefresh = force === "true" || isOld;

    if (shouldRefresh) {
      logger.info(`${ticker}: 내부자 거래 데이터 갱신 중 (Reason: ${force === "true" ? "Manual" : "Auto-24h"})`);
      try {
        const { fetchInsiderTrades } = await import("../services/sec-insider");
        const rawTrades = await fetchInsiderTrades(ticker);
        
        if (rawTrades.length > 0) {
          // 기존 데이터 삭제 (중복 방지 및 최신화)
          await prisma.insiderTrade.deleteMany({ where: { ticker } });
          
          for (const t of rawTrades) {
            if (t.shares >= 0) {
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
                  fetchedAt: new Date(),
                },
              });
            }
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

    const ONE_DAY = 24 * 60 * 60 * 1000;

    // DB에서 가장 최신 갱신일 확인
    const lastRecord = await prisma.institutionHolding.findFirst({
      where: { ticker },
      orderBy: { fetchedAt: "desc" }
    });

    const isOld = !lastRecord || (Date.now() - lastRecord.fetchedAt.getTime() > ONE_DAY);
    const shouldRefresh = force === "true" || isOld;

    if (shouldRefresh) {
      logger.info(`${ticker}: 기관 보유 데이터 갱신 중 (Reason: ${force === "true" ? "Manual" : "Auto-24h"})`);
      try {
        const rawHoldings = await fetchInstitutionHoldings(ticker);
        
        if (rawHoldings.length > 0) {
          // 기존 데이터 삭제
          await prisma.institutionHolding.deleteMany({ where: { ticker } });
          
          for (const h of rawHoldings) {
            await prisma.institutionHolding.create({
              data: {
                ticker,
                institutionName: h.institutionName,
                shares: h.shares,
                changeShares: h.changeShares,
                changePercent: h.changePercent,
                reportDate: new Date(h.reportDate),
                fetchedAt: new Date(),
              },
            });
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
