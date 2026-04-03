/**
 * Watchlist Routes — 워치리스트 CRUD
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import { analyzeRisk } from "../services/risk-engine";
import { createLogger } from "../logger";

const logger = createLogger("watchlist-routes");

export async function watchlistRoutes(app: FastifyInstance) {
  // GET /watchlist — 워치리스트 조회
  app.get("/", async (request, reply) => {
    const items = await prisma.watchlist.findMany({
      include: { stock: true },
      orderBy: { addedAt: "desc" },
    });

    // 각 종목의 최신 리스크 스냅샷 포함
    const enriched = await Promise.all(
      items.map(async (item) => {
        const latestSnapshot = await prisma.riskSnapshot.findFirst({
          where: { ticker: item.ticker },
          orderBy: { asOf: "desc" },
        });
        return {
          ...item,
          risk: latestSnapshot
            ? { score: latestSnapshot.score, level: latestSnapshot.level, action: latestSnapshot.action }
            : null,
        };
      })
    );

    return reply.send({ success: true, data: enriched });
  });

  // POST /watchlist — 종목 추가
  app.post("/", async (request, reply) => {
    const { ticker, name } = request.body as { ticker: string; name?: string };

    if (!ticker) {
      return reply.status(400).send({ success: false, error: "ticker is required" });
    }

    // 중복 확인
    const existing = await prisma.watchlist.findUnique({ where: { ticker } });
    if (existing) {
      return reply.status(409).send({ success: false, error: "이미 워치리스트에 있습니다" });
    }

    // Stock 연결
    const stock = await prisma.stock.findFirst({ where: { code: ticker } });

    const item = await prisma.watchlist.create({
      data: {
        ticker,
        stockId: stock?.id,
      },
    });

    // 비동기로 리스크 분석 트리거
    const companyName = name || stock?.name || ticker;
    analyzeRisk(ticker, companyName).catch(err => {
      logger.error(`워치리스트 추가 후 리스크 분석 실패 (${ticker}):`, err);
    });

    return reply.status(201).send({
      success: true,
      data: item,
      message: `${ticker} 워치리스트 추가 완료. 리스크 분석이 백그라운드에서 진행됩니다.`,
    });
  });

  // DELETE /watchlist/:ticker — 종목 삭제
  app.delete("/:ticker", async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    try {
      await prisma.watchlist.delete({ where: { ticker } });
      return reply.send({ success: true, message: `${ticker} 삭제 완료` });
    } catch {
      return reply.status(404).send({ success: false, error: "워치리스트에 없는 종목입니다" });
    }
  });
}
