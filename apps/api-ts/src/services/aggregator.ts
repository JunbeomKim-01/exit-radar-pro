/**
 * Aggregator — 종목별 감성 비율 계산
 */

import { prisma } from "../server";
import { createLogger } from "../logger";

const logger = createLogger("aggregator");

interface RatioResult {
  ticker: string;
  windowType: string;
  supportRatio: number;
  criticizeRatio: number;
  neutralRatio: number;
  postCount: number;
  computedAt: Date;
}

/**
 * 시간 범위에 따른 기준 시각 계산
 */
function getWindowStart(windowType: string): Date {
  const now = Date.now();
  switch (windowType) {
    case "1h":
      return new Date(now - 1 * 60 * 60 * 1000);
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
}

/**
 * 종목별 감성 비율 계산 및 저장
 */
export async function computeRatio(
  ticker: string,
  windowType: string = "24h"
): Promise<RatioResult> {
  const windowStart = getWindowStart(windowType);

  // 해당 종목, 해당 기간의 분류 결과를 집계
  const results = await prisma.sentimentResult.findMany({
    where: {
      post: {
        ticker,
        createdAt: { gte: windowStart },
      },
      targetType: "post",
    },
    select: {
      label: true,
    },
  });

  const total = results.length;
  const counts = {
    support: 0,
    criticize: 0,
    neutral: 0,
  };

  for (const r of results) {
    if (r.label in counts) {
      counts[r.label as keyof typeof counts]++;
    }
  }

  const ratio: RatioResult = {
    ticker,
    windowType,
    supportRatio: total > 0 ? counts.support / total : 0,
    criticizeRatio: total > 0 ? counts.criticize / total : 0,
    neutralRatio: total > 0 ? counts.neutral / total : 0,
    postCount: total,
    computedAt: new Date(),
  };

  // 집계 결과 저장
  await prisma.sentimentAggregate.create({
    data: {
      ticker: ratio.ticker,
      windowType: ratio.windowType,
      supportRatio: ratio.supportRatio,
      criticizeRatio: ratio.criticizeRatio,
      neutralRatio: ratio.neutralRatio,
      postCount: ratio.postCount,
    },
  });

  logger.info(
    `비율 계산 완료: ${ticker} (${windowType}) — ` +
    `옹호 ${(ratio.supportRatio * 100).toFixed(1)}% / ` +
    `비난 ${(ratio.criticizeRatio * 100).toFixed(1)}% / ` +
    `중립 ${(ratio.neutralRatio * 100).toFixed(1)}% ` +
    `(${total}건)`
  );

  return ratio;
}

/**
 * 모든 종목에 대해 비율 일괄 계산 (스케줄러용)
 */
export async function computeAllRatios(
  windowType: string = "24h"
): Promise<RatioResult[]> {
  // 활성 종목 목록 조회
  const tickers = await prisma.post.findMany({
    where: {
      ticker: { not: null },
      createdAt: { gte: getWindowStart(windowType) },
    },
    select: { ticker: true },
    distinct: ["ticker"],
  });

  const results: RatioResult[] = [];

  for (const { ticker } of tickers) {
    if (ticker) {
      const ratio = await computeRatio(ticker, windowType);
      results.push(ratio);
    }
  }

  return results;
}
