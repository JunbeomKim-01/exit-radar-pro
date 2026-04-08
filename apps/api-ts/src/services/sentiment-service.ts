/**
 * Sentiment Service — 종목별 지능형 리포트 재건 및 정규화 관리
 */

import { prisma } from "../server";
import { summarizePosts } from "./classifier-client";
import { createLogger } from "../logger";

const logger = createLogger("sentiment-service");

/**
 * 특정 티커의 AI 감성 인사이트를 강제로 재건합니다.
 * (데이터 동기화 완료 후 혹은 명시적 새로고침 시 호출)
 */
export async function rebuildSentimentInsight(rawTicker: string) {
  const ticker = rawTicker.trim().toUpperCase();
  
  try {
    // 1. 최신 게시글 10개 조회 (정규화된 티커 기준)
    const posts = await prisma.post.findMany({
      where: { 
        ticker: {
          equals: ticker,
          mode: 'insensitive' // PostgreSQL 대소문자 무관 검색
        }
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { title: true, body: true },
    });

    if (posts.length === 0) {
      logger.warn(`rebuildSentimentInsight: [${ticker}] 분석할 데이터가 없습니다.`);
      return null;
    }

    // 2. AI 요약 생성 (LLM 호출)
    logger.info(`rebuildSentimentInsight: [${ticker}] AI 요약 재건 시작 (${posts.length}건)`);
    const insight = await summarizePosts(ticker, posts);

    if (insight) {
      // 3. 결과 캐싱 (Upsert)
      await prisma.sentimentInsight.upsert({
        where: { ticker },
        create: {
          ticker,
          summary: insight.summary,
          alertLevel: insight.alert_level,
          keyPoints: JSON.stringify(insight.key_points),
          computedAt: new Date(),
        },
        update: {
          summary: insight.summary,
          alertLevel: insight.alert_level,
          keyPoints: JSON.stringify(insight.key_points),
          computedAt: new Date(),
        }
      });
      logger.info(`rebuildSentimentInsight: [${ticker}] AI 통찰 갱신 완료`);
    }
    
    return insight;
  } catch (err) {
    logger.error(`rebuildSentimentInsight 실패 [${ticker}]:`, err);
    return null;
  }
}
