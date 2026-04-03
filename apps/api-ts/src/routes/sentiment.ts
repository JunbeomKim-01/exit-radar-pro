/**
 * Sentiment Routes — 감성 분석 결과 조회 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import { computeRatio } from "../services/aggregator";
import { summarizePosts } from "../services/classifier-client";

export async function sentimentRoutes(app: FastifyInstance) {
  // GET /sentiment/ratio — 종목별 감성 비율 조회
  app.get("/ratio", async (request, reply) => {
    const { ticker, range } = request.query as {
      ticker?: string;
      range?: string; // "1h" | "24h" | "7d"
    };

    if (!ticker) {
      return reply.status(400).send({
        success: false,
        error: "ticker 파라미터가 필요합니다",
      });
    }

    const windowType = range || "24h";

    // 캐시된 집계 조회
    const cached = await prisma.sentimentAggregate.findFirst({
      where: {
        ticker,
        windowType,
      },
      orderBy: { computedAt: "desc" },
    });

    // 캐시가 5분 이내면 반환
    if (cached && Date.now() - cached.computedAt.getTime() < 5 * 60 * 1000) {
      return reply.send({
        success: true,
        data: {
          ticker,
          windowType,
          supportRatio: cached.supportRatio,
          criticizeRatio: cached.criticizeRatio,
          neutralRatio: cached.neutralRatio,
          postCount: cached.postCount,
          computedAt: cached.computedAt,
          cached: true,
        },
      });
    }

    // 실시간 재계산
    const ratio = await computeRatio(ticker, windowType);

    return reply.send({
      success: true,
      data: {
        ...ratio,
        cached: false,
      },
    });
  });

  // GET /sentiment/timeline — 종목별 감성 타임라인
  app.get("/timeline", async (request, reply) => {
    const { ticker, days } = request.query as {
      ticker?: string;
      days?: string;
    };

    if (!ticker) {
      return reply.status(400).send({
        success: false,
        error: "ticker 파라미터가 필요합니다",
      });
    }

    const dayCount = parseInt(days || "7", 10);
    const since = new Date(Date.now() - dayCount * 24 * 60 * 60 * 1000);

    const aggregates = await prisma.sentimentAggregate.findMany({
      where: {
        ticker,
        computedAt: { gte: since },
      },
      orderBy: { computedAt: "asc" },
    });

    return reply.send({
      success: true,
      data: {
        ticker,
        timeline: aggregates,
      },
    });
  });

  // POST /classify/retry/:targetId — 재분류 요청
  app.post("/classify/retry/:targetId", async (request, reply) => {
    const { targetId } = request.params as { targetId: string };

    // 기존 분류 결과 삭제
    await prisma.sentimentResult.deleteMany({
      where: { targetId },
    });

    // 재분류는 crawl/save와 같은 흐름으로 처리
    return reply.send({
      success: true,
      data: {
        message: `재분류 예약됨: ${targetId}`,
      },
    });
  });

  // GET /sentiment/insight — AI 감성 요약 및 인사이트 조회
  app.get("/insight", async (request, reply) => {
    const { ticker } = request.query as { ticker?: string };

    if (!ticker) {
      return reply.status(400).send({
        success: false,
        error: "ticker 파라미터가 필요합니다",
      });
    }

    // 최근 게시글 15개 조회 (대소문자 구분 없이)
    const posts = await prisma.post.findMany({
      where: { 
        ticker: {
          equals: ticker,
          mode: 'insensitive'
        }
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { title: true, body: true },
    });

    if (posts.length === 0) {
      return reply.send({
        success: true,
        data: {
          summary: "현재 해당 종목에 대한 최신 커뮤니티 데이터가 존재하지 않습니다. 상단 [START SYNC] 버튼을 눌러 분석을 위한 데이터를 수집해 주세요.",
          alert_level: "info",
          key_points: ["실시간 데이터 수집 필요", "과거 분석 이력 없음"],
        },
      });
    }

    // AI 요약 생성
    const insight = await summarizePosts(ticker, posts);

    return reply.send({
      success: true,
      data: insight || {
        summary: "현재는 AI 요약 기능을 일시적으로 사용할 수 없습니다.",
        alert_level: "info",
        key_points: [],
      },
    });
  });
}
