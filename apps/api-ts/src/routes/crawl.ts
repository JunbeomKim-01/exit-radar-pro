/**
 * Crawl Routes — 수집 작업 관리 API
 */

import { FastifyInstance } from "fastify";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../server";
import { classifyBatch } from "../services/classifier-client";
import { createLogger } from "../logger";

const logger = createLogger("crawl-routes");

export async function crawlRoutes(app: FastifyInstance) {
  // POST /crawl/run — 수집 작업 시작
  app.post("/run", async (request, reply) => {
    const { ticker, maxCount } = request.body as {
      ticker?: string;
      maxCount?: number;
    };

    // CrawlJob 레코드 생성
    const job = await prisma.crawlJob.create({
      data: {
        status: "pending",
        ticker: ticker || null,
        postCount: 0,
      },
    });

    // 실제 수집기 실행 (비동기)
    const projectRoot = path.resolve(__dirname, "../../../../");
    const visitorId = (request.headers['x-visitor-id'] as string) || "default";
    
    // 세션 파일 존재 여부 확인 (Visitor ID 우선, 없으면 default)
    let sessionName = visitorId;
    let sessionPath = path.join(projectRoot, `sessions/${sessionName}.session.json`);
    
    if (!fs.existsSync(sessionPath)) {
      sessionName = "default";
      sessionPath = path.join(projectRoot, `sessions/${sessionName}.session.json`);
    }
    
    if (!fs.existsSync(sessionPath)) {
      await prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: "failed", error: "로그인 세션이 없습니다. Toss 증권 로그인을 먼저 완료해주세요." }
      });
      return reply.status(400).send({
        success: false,
        error: "로그인 세션이 필요합니다. Toss 증권 로그인을 먼저 완료해주세요.",
      });
    }

    const targetTicker = ticker || "005930";
    const targetCount = maxCount || 40;

    // 수집기 프로세스 실행 (spawn으로 모니터링)
    const child = spawn("npx", [
      "tsx", 
      "apps/scraper-ts/src/index.ts", 
      "scrape", 
      targetTicker, 
      targetCount.toString(), 
      job.id,
      sessionName
    ], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32' // 윈도우에서는 쉘을 통해 실행해야 npx 탐색 가능
    });

    // 스폰 실패 시 서버 크래시 방지용 에러 리스너
    child.on('error', async (err) => {
      logger.error(`수집기 프로세스 시작 실패 (Job: ${job.id}): ${err.message}`);
      await prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: "failed", error: `프로세스 시작 실패: ${err.message}` }
      });
    });

    child.unref(); // 백그라운드 분리

    // 즉시 종료 감지를 위한 미세 대기 및 상태 확인
    child.on('exit', async (code) => {
      if (code !== 0) {
        logger.error(`수집기 프로세스 비정상 종료 (Job: ${job.id}, ExitCode: ${code})`);
        await prisma.crawlJob.update({
          where: { id: job.id },
          data: { status: "failed", error: `수집기 프로세스가 종료되었습니다 (코드: ${code})` }
        });
      }
    });

    // 상태를 running으로 변경
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: { status: "running" }
    });

    return reply.status(201).send({
      success: true,
      data: {
        jobId: job.id,
        status: "running",
        message: `수집 작업이 시작되었습니다. (Ticker: ${targetTicker})`,
      },
    });
  });

  // GET /crawl/jobs — 수집 작업 목록 조회
  app.get("/jobs", async (request, reply) => {
    const { status, limit } = request.query as {
      status?: string;
      limit?: string;
    };

    const jobs = await prisma.crawlJob.findMany({
      where: status ? { status } : undefined,
      orderBy: { startedAt: "desc" },
      take: parseInt(limit || "20", 10),
    });

    return reply.send({
      success: true,
      data: jobs,
    });
  });

  // GET /crawl/jobs/:id — 특정 수집 작업 조회
  app.get("/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await prisma.crawlJob.findUnique({ where: { id } });

    if (!job) {
      return reply.status(404).send({
        success: false,
        error: "작업을 찾을 수 없습니다",
      });
    }

    return reply.send({
      success: true,
      data: job,
    });
  });

  // POST /crawl/save — 수집된 게시글 저장 (scraper에서 호출)
  app.post("/save", async (request, reply) => {
    const { jobId, posts, isLastChunk } = request.body as {
      jobId?: string;
      isLastChunk?: boolean;
      posts: Array<{
        postId: string;
        title: string;
        body: string;
        ticker: string | null;
        boardName: string;
        createdAt: string;
        authorHash: string;
        authorName?: string;
        url: string;
        comments?: Array<{
          body: string;
          authorHash: string;
          createdAt: string;
        }>;
        rawJson?: string;
      }>;
    };

    let savedCount = 0;
    const savedPosts: Array<{ id: string; title: string; body: string; ticker: string | null }> = [];

    for (const post of posts) {
      try {
        // 중복 체크 (URL 기반)
        const existing = await prisma.post.findFirst({
          where: { url: post.url },
        });

        if (existing) {
          logger.info(`중복 게시글 스킵: ${post.url}`);
          continue;
        }

        const created = await prisma.post.create({
          data: {
            source: "toss",
            ticker: post.ticker,
            title: post.title,
            body: post.body,
            authorHash: post.authorHash,
            authorName: post.authorName || "익명",
            createdAt: new Date(post.createdAt),
            url: post.url,
            rawJson: post.rawJson,
            comments: {
              create: (post.comments || []).map((c) => ({
                body: c.body,
                authorHash: c.authorHash,
                createdAt: new Date(c.createdAt),
              })),
            },
          },
        });

        savedCount++;
        savedPosts.push({
          id: created.id,
          title: created.title,
          body: created.body,
          ticker: created.ticker,
        });
      } catch (err) {
        logger.error(`게시글 저장 실패:`, err);
      }
    }

    // 저장된 게시글들을 일괄 분류 (배치 LLM 호출)
    if (savedPosts.length > 0) {
      classifyBatch(savedPosts.map(p => ({
        id: p.id,
        title: p.title,
        body: p.body,
        ticker: p.ticker || undefined,
      }))).catch((err) => {
        logger.error(`배치 분류 요청 실패:`, err);
      });
    }

    // CrawlJob 업데이트 및 AI 인사이트 즉각 재건 트리거
    if (jobId) {
      try {
        const updatedJob = await prisma.crawlJob.update({
          where: { id: jobId },
          data: {
            status: isLastChunk ? "completed" : "running",
            postCount: { increment: savedCount },
            completedAt: isLastChunk ? new Date() : undefined,
          },
        });

        // 수집 완료 시 AI 통찰 즉각 재건 (비동기)
        if (isLastChunk && updatedJob.ticker) {
          const { rebuildSentimentInsight } = await import("../services/sentiment-service");
          logger.info(`수집 완료: [${updatedJob.ticker}] AI 통찰 재건 시작...`);
          rebuildSentimentInsight(updatedJob.ticker).catch(err => {
            logger.error(`수집 후 AI 통찰 재건 실패 [${updatedJob.ticker}]:`, err);
          });
        }
      } catch (err) {
        logger.warn(`CrawlJob 업데이트 건너뜀 (ID: ${jobId} 찾을 수 없음)`);
      }
    }

    return reply.send({
      success: true,
      data: { savedCount, totalReceived: posts.length },
    });
  });
}
