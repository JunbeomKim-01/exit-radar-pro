/**
 * Auth Routes — 세션 관련 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";
import { tossLoginService } from "../services/toss-login-service";

export async function authRoutes(app: FastifyInstance) {
  // GET /auth/status — 현재 세션 상태 조회
  app.get("/status", async (_request, reply) => {
    const sessions = await prisma.session.findMany({
      select: {
        accountName: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    const sessionStatuses = sessions.map((s: any) => ({
      accountName: s.accountName,
      isExpired: s.expiresAt ? new Date(s.expiresAt) < new Date() : false,
      expiresAt: s.expiresAt,
      updatedAt: s.updatedAt,
    }));

    return reply.send({
      success: true,
      data: {
        sessions: sessionStatuses,
        hasValidSession: sessionStatuses.some((s: any) => !s.isExpired),
      },
    });
  });

  // POST /auth/logout — 세션 삭제
  app.post("/logout", async (request, reply) => {
    const { accountName } = request.body as { accountName?: string };
    const name = accountName || "default";

    await prisma.session.deleteMany({
      where: { accountName: name },
    });

    return reply.send({
      success: true,
      data: { message: `세션 삭제 완료: ${name}` },
    });
  });

  // POST /auth/toss/login — 로그인 에이전트 실행 (Headless 브라우저 + 스크린샷 중계)
  app.post("/toss/login", async (request, reply) => {
    try {
      const visitorId = (request.headers['x-visitor-id'] as string) || "default";
      
      // TossLoginService를 통해 백그라운드 로그인 시작
      await tossLoginService.startLogin(visitorId);
      
      return { success: true, data: { status: "pending", message: "로그인 에이전트가 백그라운드에서 시작되었습니다." } };
    } catch (error) {
      console.error("[Auth] Login Start Error:", error);
      reply.status(500).send({ 
        success: false, 
        error: "Login Error", 
        message: String(error) 
      });
    }
  });

  // POST /auth/toss/login/phone — 휴대폰 번호 기반 로그인 에이전트 시작
  app.post("/toss/login/phone", async (request, reply) => {
    try {
      const visitorId = (request.headers['x-visitor-id'] as string) || (request.headers['X-Visitor-Id'] as string) || "default";
      const { name, birthday, phone } = request.body as { name: string, birthday: string, phone: string };

      if (!name || !birthday || !phone) {
        return reply.status(400).send({ success: false, error: "Bad Request", message: "이름, 생년월일, 전화번호가 모두 필요합니다." });
      }

      // TossLoginService를 통해 백그라운드 휴대폰 로그인 시작
      await tossLoginService.startPhoneLogin(visitorId, { name, birthday, phone });
      
      return { success: true, data: { status: "pending", message: "휴대폰 번호 로그인 에이전트가 시작되었습니다." } };
    } catch (error) {
      console.error("[Auth] Phone Login Start Error:", error);
      reply.status(500).send({ 
        success: false, 
        error: "Phone Login Error", 
        message: String(error) 
      });
    }
  });

  // GET /auth/toss/login/status — 로그인 상태 및 스크린샷 조회
  app.get("/toss/login/status", async (request, reply) => {
    const visitorId = (request.headers['x-visitor-id'] as string) || "default";
    const session = tossLoginService.getSession(visitorId);
    
    if (!session) {
      return reply.status(404).send({ success: false, error: "Not Found", message: "진행 중인 로그인 세션이 없습니다." });
    }

    return { 
      success: true, 
      data: {
        status: session.status,
        screenshot: session.screenshot, // base64 jpeg
        error: session.error
      }
    };
  });

  // POST /auth/toss/login/switch — 로그인 방식(탭) 전환
  app.post("/toss/login/switch", async (request, reply) => {
    const visitorId = (request.headers['x-visitor-id'] as string) || (request.headers['X-Visitor-Id'] as string) || "default";
    const { method } = request.body as { method: 'qr' | 'phone' };
    
    let success = false;
    if (method === 'qr') {
      success = await tossLoginService.triggerQRSwitch(visitorId);
    } else if (method === 'phone') {
      success = await tossLoginService.triggerPhoneSwitch(visitorId);
    }
    
    return { success, method };
  });

  // POST /auth/toss/session — 수동 세션 업로드 (Fallback)
  app.post("/toss/session", async (request, reply) => {
    try {
      const visitorId = (request.headers['x-visitor-id'] as string) || (request.headers['X-Visitor-Id'] as string) || "default";
      const { cookies, localStorage, savedAt } = request.body as any;
      
      if (!cookies || !Array.isArray(cookies)) {
        return reply.status(400).send({ success: false, error: "Invalid Data", message: "Cookies required" });
      }

      const { SessionManager } = await import("../services/toss-agent/session-manager");
      const sessionManager = new SessionManager();

      await sessionManager.saveSession({
        accountName: visitorId,
        cookies,
        localStorage,
        savedAt: savedAt || new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      return { success: true, data: { message: "세션이 수동으로 저장되었습니다." } };
    } catch (error) {
      console.error("[Auth] Manual Session Save Error:", error);
      reply.status(500).send({ success: false, error: "Save Error", message: String(error) });
    }
  });
}
