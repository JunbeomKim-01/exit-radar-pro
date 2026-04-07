/**
 * Market Reversal Routes — 전환 지표 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import { analyzeReversal, determineStrategicAction } from "../services/reversal-engine";
import { getIndicatorAnalysis, getMarketUnifiedAnalysis } from "../services/classifier-client";
import { createLogger } from "../logger";

const logger = createLogger("market-reversal");

// Simple in-memory cache for Unified AI Opinion
let aiOpinionCache: { marketDate: string; score: number; analysis: string } | null = null;

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
        strategicAction: determineStrategicAction(latest.signalType, latest.score),
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

    // 차트용 시계열 데이터 (최신 60개 추출 후 날짜순 정렬)
    const chartBars = await prisma.marketIndicatorBar.findMany({
      orderBy: { date: "desc" },
      take: 60,
    });
    chartBars.reverse(); // 차트 표시를 위해 오름차순으로 변경

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

  // GET /market/reversal/indicator-analysis — 지표별 AI 분석 의견
  app.get("/indicator-analysis", async (request, reply) => {
    const { name } = request.query as { name: string };
    if (!name) {
      return reply.status(400).send({ success: false, error: "지표 이름이 필요합니다." });
    }

    // 최신 지표 데이터 60개 조회
    const bars = await prisma.marketIndicatorBar.findMany({
      orderBy: { date: "desc" },
      take: 60,
    });
    bars.reverse(); // 날짜순 정렬

    // 요청된 지표의 히스토리 데이터 추출
    const history = bars.map((b: any) => {
      switch (name.toUpperCase()) {
        case "VXN": return b.vxnClose || 0;
        case "VIX": return b.vixClose || 0;
        case "YIELD CURVE": return b.yieldCurve || 0;
        case "HY OAS": return b.hyOas || 0;
        case "SOX": return b.soxClose || 0;
        case "DXY": return b.dxyClose || 0;
        case "VOLUME": return b.nasdaqVol || 0;
        case "WTI": return b.wtiClose || 0;
        case "DGS2": return b.dgs2 || 0;
        default: return 0;
      }
    });

    // 지표별 기본 설명 (매크로 전문가 페르소나 강화용)
    const descriptions: Record<string, string> = {
      "VXN": "나스닥 100 변동성 지수. 기술주 중심의 시장 공포와 변동성 수준을 나타냅니다.",
      "VIX": "S&P 500 변동성 지수. 광범위한 시장 리스크와 헤지 수요를 반영합니다.",
      "YIELD CURVE": "10년물-2년물 국채 금리차. 경기 침체 예고 지표이자 통화정책 기대를 반영합니다.",
      "HY OAS": "하이일드 채권 가산금리. 기업 신용 위험과 시장 유동성 상태를 측정합니다.",
      "SOX": "필라델피아 반도체 지수. 글로벌 기술 성장의 선행 지표이자 리스크 온/오프 척도입니다.",
      "DXY": "달러 인덱스. 글로벌 안전자산 선호도와 유동성 긴축/완화 여부를 나타냅니다.",
    };

    const analysis = await getIndicatorAnalysis(
      name,
      descriptions[name.toUpperCase()] || "시장의 주요 거시 경제 지표입니다.",
      history.filter(h => h !== 0)
    );

    return reply.send({
      success: true,
      data: analysis,
    });
  });

  // GET /market/reversal/unified-opinion — 시장 전체 통합 전략 오피니언
  app.get("/unified-opinion", async (request, reply) => {
    try {
      // 1. 현재 시장 요약 데이터 획득
      const summaryRes = await analyzeReversal();
      
      // 2. 캐시 확인 (시장 날짜와 점수가 동일하면 이전 분석 결과 재사용)
      if (aiOpinionCache && 
          aiOpinionCache.marketDate === summaryRes.date && 
          aiOpinionCache.score === summaryRes.score) {
        return reply.send({ success: true, data: { analysis: aiOpinionCache.analysis }, cached: true });
      }

      // 3. AI 분석 요청 (초소속 5초 보장을 위해 요약된 데이터만 전달)
      const analysis = await getMarketUnifiedAnalysis(summaryRes);
      
      if (analysis) {
        // 4. 캐시 업데이트
        aiOpinionCache = {
          marketDate: summaryRes.date,
          score: summaryRes.score,
          analysis: analysis.analysis
        };
      }

      return reply.send({
        success: true,
        data: analysis || { analysis: "전략 분석 결과를 생성할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        cached: false
      });
    } catch (err) {
      logger.error("통합 오피니언 생성 실패:", err);
      return reply.status(500).send({ success: false, error: "서버 오류발생" });
    }
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
          strategicAction: result.strategicAction,
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
