/**
 * Market Reversal Routes — 전환 지표 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import { analyzeReversal } from "../services/reversal-engine";
import { createLogger } from "../logger";

const logger = createLogger("market-reversal");

export async function marketReversalRoutes(app: FastifyInstance) {
  // GET /market/reversal/summary — 현재 전환 요약
  app.get("/summary", async (_request, reply) => {
    // 가장 최근 신호 조회
    const latest = await prisma.reversalSignal.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return reply.send({
        success: true,
        data: null,
        message: "전환 신호가 아직 생성되지 않았습니다. /market/reversal/refresh를 호출하세요.",
      });
    }

    const coreScore = JSON.parse(latest.coreSignals).reduce((s: number, x: any) => s + x.score, 0);
    const supportScore = JSON.parse(latest.supportSignals).reduce((s: number, x: any) => s + x.score, 0);

    return reply.send({
      success: true,
      data: {
        date: latest.date,
        signalType: latest.signalType,
        score: latest.score,
        stage: latest.stage,
        coreSignalScore: coreScore,
        supportSignalScore: supportScore,
        confidence: latest.confidence,
        explanation: latest.explanation,
        riskTheme: latest.riskTheme,
        dominantDrivers: JSON.parse(latest.coreSignals)
          .filter((s: any) => s.triggered)
          .map((s: any) => s.name),
        updatedAt: latest.createdAt,
      },
    });
  });

  // GET /market/reversal/details — 상세 지표 + 차트 데이터
  app.get("/details", async (_request, reply) => {
    const latest = await prisma.reversalSignal.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return reply.send({ success: true, data: null });
    }

    // 차트용 시계열 데이터
    const chartBars = await prisma.marketIndicatorBar.findMany({
      orderBy: { date: "asc" },
      take: 60,
    });

    return reply.send({
      success: true,
      data: {
        signal: {
          ...latest,
          coreSignals: JSON.parse(latest.coreSignals),
          supportSignals: JSON.parse(latest.supportSignals),
        },
        features: {
          return5d: latest.return5d,
          return10d: latest.return10d,
          return20d: latest.return20d,
          vxnChange3d: latest.vxnChange3d,
          vxnVs20dma: latest.vxnVs20dma,
          hyOasChange5d: latest.hyOasChange5d,
          hyOasPercentile: latest.hyOasPercentile,
          dgs2Change5d: latest.dgs2Change5d,
          soxRelStr5d: latest.soxRelStr5d,
          volumeVs20dma: latest.volumeVs20dma,
        },
        chartData: chartBars,
      },
    });
  });

  // GET /market/reversal/cases — 과거 유사 사례
  app.get("/cases", async (request, reply) => {
    const { signalType, limit } = request.query as { signalType?: string; limit?: string };

    const signals = await prisma.reversalSignal.findMany({
      where: signalType ? { signalType } : undefined,
      orderBy: { date: "desc" },
      take: parseInt(limit || "20", 10),
    });

    return reply.send({
      success: true,
      data: signals.map((s) => ({
        date: s.date,
        signalType: s.signalType,
        score: s.score,
        stage: s.stage,
        return5d: s.return5d,
        return10d: s.return10d,
        return20d: s.return20d,
        explanation: s.explanation,
      })),
    });
  });

  // POST /market/reversal/refresh — 강제 재계산
  app.post("/refresh", async (_request, reply) => {
    try {
      logger.info("전환 지표 강제 재계산 시작");
      const result = await analyzeReversal();
      
      return reply.send({
        success: true,
        data: {
          signalType: result.signalType,
          score: result.score,
          stage: result.stage,
          explanation: result.explanation,
          confidence: result.confidence,
        },
        message: "전환 지표 재계산 완료",
      });
    } catch (err: any) {
      logger.error("전환 지표 재계산 실패:", err);
      return reply.status(500).send({
        success: false,
        error: err.message || "전환 지표 재계산 실패",
      });
    }
  });
}
