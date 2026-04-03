/**
 * Risk Engine — 시그널 통합 → 리스크 점수/레벨/액션 결정
 *
 * FM 감성 데이터를 리스크 점수에 반영합니다.
 */

import { createLogger } from "../logger";
import { prisma } from "../server";
import { fetchDailyPrices, detectVolumeAnomaly, detectTrendBreak, type PriceBar } from "./alpha-vantage";
import { fetchInsiderTrades, resolveUnderlyingTicker } from "./sec-insider";

const logger = createLogger("risk-engine");

interface RiskResult {
  score: number;
  level: string;
  action: string;
  summary: string;
  factors: Array<{
    type: string;
    title: string;
    description: string;
    weight: number;
  }>;
}

/**
 * 종목의 전체 리스크를 분석하고 RiskSnapshot을 생성/업데이트합니다.
 */
export async function analyzeRisk(ticker: string, companyName: string): Promise<RiskResult> {
  const actualTicker = resolveUnderlyingTicker(ticker);
  const factors: RiskResult["factors"] = [];
  // 리스크 지수 초기화 (기본 시장 위험도 10점 부여)
  let totalScore = 10;
  factors.push({
    type: "market_baseline",
    title: "기본 시장 위험도",
    description: "주식 시장의 일반적인 변동성 및 거시 경제 리스크 반영",
    weight: 10,
  });

  // 1. 가격/거래량 분석
  const bars = await fetchDailyPrices(ticker);
  if (bars.length > 0) {
    const volumeAnomaly = detectVolumeAnomaly(bars);
    if (volumeAnomaly.detected) {
      const weight = Math.min(volumeAnomaly.ratio * 8, 25);
      factors.push({
        type: "volume_spike",
        title: "거래량 급등 감지",
        description: `현재 거래량이 20일 평균 대비 ${volumeAnomaly.ratio}배 (${volumeAnomaly.currentVolume.toLocaleString()} vs ${volumeAnomaly.averageVolume.toLocaleString()})`,
        weight,
      });
      totalScore += weight;
    }

    const trendBreak = detectTrendBreak(bars);
    if (trendBreak.detected) {
      const weight = trendBreak.sma200 > 0 && trendBreak.currentPrice < trendBreak.sma200 ? 25 : 15;
      factors.push({
        type: "trend_break",
        title: "추세 이탈 감지",
        description: trendBreak.description,
        weight,
      });
      totalScore += weight;
    }
  }

  // 2. 내부자 거래 분석
  const insiderTrades = await fetchInsiderTrades(actualTicker);
  const recentSells = insiderTrades.filter(t => t.side === "SELL");
  const recentBuys = insiderTrades.filter(t => t.side === "BUY");

  if (recentSells.length > recentBuys.length && recentSells.length >= 2) {
    const weight = Math.min(recentSells.length * 5, 20);
    factors.push({
      type: "insider_sell",
      title: "내부자 순매도 감지",
      description: `최근 매도 ${recentSells.length}건 vs 매수 ${recentBuys.length}건`,
      weight,
    });
    totalScore += weight;
  }

  // 3. 내부자 거래 DB 저장
  for (const trade of insiderTrades) {
    try {
      await prisma.insiderTrade.create({
        data: {
          ticker,
          insiderName: trade.insiderName,
          role: trade.role,
          side: trade.side,
          shares: trade.shares,
          pricePerShare: trade.pricePerShare,
          transactionDate: new Date(trade.transactionDate),
          filingDate: new Date(trade.filingDate),
        },
      });
    } catch { /* 중복 무시 */ }
  }

  // 4. FM 커뮤니티 감성 데이터 반영 (비례 배분 방식으로 고도화)
  try {
    const recentSentiments = await prisma.sentimentResult.findMany({
      where: {
        post: { ticker },
        createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      select: { label: true },
    });

    if (recentSentiments.length > 0) {
      const criticizeCount = recentSentiments.filter((s: { label: string }) => s.label === "criticize").length;
      const criticizeRatio = criticizeCount / recentSentiments.length;

      // 부정 여론이 조금이라도 있으면 점수에 반영 (최대 40점 가중치)
      if (criticizeRatio > 0.05) {
        const weight = Math.round(criticizeRatio * 40);
        factors.push({
          type: "sentiment_negative",
          title: "커뮤니티 부정 여론 감지",
          description: `최근 7일 게시글 비난 비율 ${(criticizeRatio * 100).toFixed(0)}% (${criticizeCount}/${recentSentiments.length})`,
          weight,
        });
        totalScore += weight;
      }
    }
  } catch (err) {
    logger.warn("감성 데이터 조회 실패:", err);
  }

  // 5. 점수 제한 및 레벨/액션 결정
  const score = Math.min(Math.round(totalScore), 100);
  const level = scoreToLevel(score);
  const action = scoreToAction(score);
  const summary = generateSummary(ticker, companyName, score, level, factors);

  // 6. RiskSnapshot 저장 (upsert)
  const stock = await prisma.stock.findFirst({ where: { code: ticker } });

  const snapshot = await prisma.riskSnapshot.create({
    data: {
      ticker,
      companyName,
      score,
      level,
      action,
      summary,
      stockId: stock?.id,
      factors: {
        create: factors.map(f => ({
          type: f.type,
          title: f.title,
          description: f.description,
          weight: f.weight,
        })),
      },
    },
  });

  // 7. 리스크가 높으면 Alert 생성
  if (score >= 50) {
    await prisma.alert.create({
      data: {
        ticker,
        title: `[${level}] ${companyName} 리스크 ${score}점`,
        body: summary,
        level: score >= 75 ? "danger" : "warning",
        score,
      },
    });
  }

  logger.info(`${ticker} 리스크 분석 완료: Score=${score}, Level=${level}, Factors=${factors.length}`);

  return { score, level, action, summary, factors };
}

function scoreToLevel(score: number): string {
  if (score >= 76) return "Critical";
  if (score >= 51) return "High";
  if (score >= 26) return "Medium";
  return "Low";
}

function scoreToAction(score: number): string {
  if (score >= 76) return "비중축소";
  if (score >= 51) return "일부익절";
  if (score >= 26) return "관망";
  return "보유";
}

function generateSummary(
  ticker: string,
  name: string,
  score: number,
  level: string,
  factors: RiskResult["factors"]
): string {
  if (factors.length === 0) {
    return `${name}(${ticker})에 대한 특별한 리스크 시그널이 감지되지 않았습니다. 현재 보유를 유지해도 괜찮은 상태입니다.`;
  }

  const factorSummary = factors.map(f => f.title).join(", ");
  return `${name}(${ticker}) 리스크 점수 ${score}점(${level}). 주요 시그널: ${factorSummary}. ${scoreToAction(score)}를 권장합니다.`;
}
