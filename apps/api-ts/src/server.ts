/**
 * Fastify API Server — Toss Community Sentiment Agent
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import axios from "axios";
import { exec } from "child_process";
import { PrismaClient } from "@prisma/client";
import { createLogger } from "./logger";

const logger = createLogger("server");

export const prisma = new PrismaClient();

export async function buildServer() {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
  });

  // ─── Health Check ───
  // ─── Health Check ───
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // ─── System Status Check ───
  app.get("/system/status", async () => {
    const result = {
      api: { status: "online", ping: 0 },
      database: { status: "offline", ping: 0 },
      classifier: { status: "offline", ping: 0 },
      timestamp: new Date().toISOString()
    };

    // 1. DB (Docker) Check
    const dbStart = Date.now();
    try {
      logger.info("Checking DB connection...");
      await prisma.$executeRawUnsafe('SELECT 1');
      result.database.status = "online";
      logger.info("DB online");
    } catch (err) {
      logger.warn("DB offline");
      result.database.status = "offline";
    }
    result.database.ping = Date.now() - dbStart;

    // 2. Classifier (Python) Check
    const pyStart = Date.now();
    try {
      logger.info("Checking Classifier status...");
      const classifierUrl = (process.env.CLASSIFIER_API_URL || "http://127.0.0.1:8001").replace("localhost", "127.0.0.1");
      const res = await axios.get(`${classifierUrl}/health`, { timeout: 2000 });
      if (res.status === 200) {
        result.classifier.status = "online";
        logger.info("Classifier online");
      }
    } catch (err) {
      logger.warn("Classifier offline");
      result.classifier.status = "offline";
    }
    result.classifier.ping = Date.now() - pyStart;

    // 3. Scraper Status (Simple Presence)
    // 최근 수집 작업이 있는지 확인
    const lastJob = await prisma.crawlJob.findFirst({
      orderBy: { startedAt: 'desc' },
      take: 1
    });
    
    (result as any).scraper = { 
      status: "online", 
      lastRun: lastJob?.startedAt.toISOString() || null 
    };

    return result;
  });

  // ─── Process Management ───
  // Classifier Start
  app.post("/system/process/start", async (request, reply) => {
    const { name } = request.body as { name: string };
    if (name === "classifier") {
      const workDir = "/Users/kimjunbeom/Documents/FM/apps/classifier-py";
      const pythonPath = ".venv/bin/python"; // .venv 상대경로 사용
      const scriptPath = "main.py";
      // 작업 디렉토리로 이동 후 실행해야 모듈 임포트 가능
      const cmd = `cd ${workDir} && nohup ${pythonPath} ${scriptPath} > /tmp/classifier_gui.log 2>&1 &`;
      
      logger.info(`Executing start command: ${cmd}`);
      exec(cmd, (error) => {
        if (error) {
          logger.error(`[EXEC ERROR] Classifier start failed: ${error}`);
        } else {
          logger.info(`[EXEC SUCCESS] Classifier command initiated`);
        }
      });
      
      return { success: true, message: "Classifier starting..." };
    }
    return reply.status(400).send({ success: false, message: "Unknown process name" });
  });

  // Process Kill (by Port)
  app.post("/system/process/stop", async (request, reply) => {
    const { name } = request.body as { name: string };
    let port = "";
    if (name === "classifier") port = "8001";
    if (name === "api") port = "3000";

    if (!port) return reply.status(400).send({ success: false, message: "Unknown process" });

    const cmd = `lsof -i :${port} | awk 'NR!=1 {print $2}' | xargs kill -9 || true`;
    exec(cmd, (error) => {
      if (error) logger.error(`Stop failed for ${name}: ${error}`);
    });

    return { success: true, message: `${name} stop command sent` };
  });

  // ─── Register Routes ───
  const { authRoutes } = await import("./routes/auth");
  const { crawlRoutes } = await import("./routes/crawl");
  const { postRoutes } = await import("./routes/posts");
  const { sentimentRoutes } = await import("./routes/sentiment");
  const { stockRoutes } = await import("./routes/stocks");
  const { portfolioRoutes } = await import("./routes/portfolio");

  app.register(authRoutes, { prefix: "/auth" });
  app.register(crawlRoutes, { prefix: "/crawl" });
  app.register(postRoutes, { prefix: "/posts" });
  app.register(sentimentRoutes, { prefix: "/sentiment" });
  app.register(stockRoutes, { prefix: "/stocks" });
  app.register(portfolioRoutes, { prefix: "/portfolio" });

  // ─── EXIT-Radar Routes ───
  const { watchlistRoutes } = await import("./routes/watchlist");
  const { radarRoutes } = await import("./routes/radar");
  const { alertRoutes } = await import("./routes/alerts");
  const { marketReversalRoutes } = await import("./routes/market-reversal");

  app.register(watchlistRoutes, { prefix: "/watchlist" });
  app.register(radarRoutes, { prefix: "/radar" });
  app.register(alertRoutes, { prefix: "/alerts" });
  app.register(marketReversalRoutes, { prefix: "/market/reversal" });

  return app;
}

export async function startServer() {
  const port = parseInt(process.env.API_PORT || "3000", 10);

  try {
    const app = await buildServer();
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`🚀 API 서버 시작: http://localhost:${port}`);
    logger.info(`📋 Health check: http://localhost:${port}/health`);
  } catch (err) {
    logger.error("서버 시작 실패:", err);
    process.exit(1);
  }
}
