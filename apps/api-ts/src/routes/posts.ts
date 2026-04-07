/**
 * Post Routes — 게시글 조회 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";

export async function postRoutes(app: FastifyInstance) {
  // GET /posts — 게시글 목록 조회
  app.get("/", async (request, reply) => {
    const { ticker, from, to, limit, offset } = request.query as {
      ticker?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };

    const where: any = {};

    // Strict Ticker Filtering: ensures only posts for the selected ticker are returned
    if (ticker && ticker.trim() !== '') {
      where.ticker = ticker.trim().toUpperCase();
    }
    
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        sentimentResults: {
          select: {
            label: true,
            confidence: true,
            rationale: true,
          },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit || "50", 10),
      skip: parseInt(offset || "0", 10),
    });

    const total = await prisma.post.count({ where });

    return reply.send({
      success: true,
      data: {
        posts,
        pagination: {
          total,
          limit: parseInt(limit || "50", 10),
          offset: parseInt(offset || "0", 10),
        },
      },
    });
  });

  // GET /posts/:id — 게시글 상세 조회
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
        sentimentResults: true,
      },
    });

    if (!post) {
      return reply.status(404).send({
        success: false,
        error: "게시글을 찾을 수 없습니다",
      });
    }

    return reply.send({
      success: true,
      data: post,
    });
  });
}
