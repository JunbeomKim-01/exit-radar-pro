import { FastifyInstance } from "fastify";
import path from "path";

export async function portfolioRoutes(app: FastifyInstance) {
  app.get("/sync", async (request, reply) => {
    try {
      console.log(`[Portfolio Route] Current process.env.SESSION_DIR: ${process.env.SESSION_DIR}`);
      // exec spawn ENOENT 에러 회피를 위해 스크래퍼 모듈을 직접 동적 임포트하여 함수 호출
      // (scraper-ts 프로젝트 내의 모듈을 참조)
      const scraperPath = path.resolve(__dirname, "../../../scraper-ts/src/portfolio-scraper.ts");
      
      // Node.js 환경에서 ts 파일을 브릿징하여 import (tsx가 이미 전역 로더로 깔려있거나, 
      // 이 파일 자체가 tsx로 런타임에 실행 중이므로 import가 가능합니다.)
      let fetchTossPortfolio;
      try {
         const scraperModule = await import(scraperPath);
         fetchTossPortfolio = scraperModule.fetchTossPortfolio;
      } catch(e) {
         return reply.status(500).send({ success: false, error: "Scraper Module Import Error", message: String(e) });
      }

      const visitorId = (request.headers['x-visitor-id'] as string) || "default";
      const result = await fetchTossPortfolio(visitorId);

      if (result) {
        return { success: true, data: result };
      }

      // 세션이 없거나 스크래핑에 실패한 경우 401 에러를 반환하여 프론트엔드에서 로그인을 유도하게 함
      return reply.status(401).send({ 
         success: false, 
         error: "Session Required", 
         message: "토스증권 세션이 만료되었거나 존재하지 않습니다. 로그인이 필요합니다." 
      });

    } catch (error) {
      console.error("Portfolio Scraper Error:", error);
      reply.status(500).send({ success: false, error: "Failed to scrape portfolio", message: String(error) });
    }
  });

  app.post("/confirm-login", async (request, reply) => {
    const accountName = (request.headers['x-visitor-id'] as string) || "default";
    try {
      // login-agent에서 triggerLoginClick 함수 가져오기
      const { triggerLoginClick } = await import("../services/toss-agent/login-agent");
      const success = await triggerLoginClick(accountName);
      
      if (success) {
        return { success: true, message: "로그인 버튼 클릭 요청을 원격 브라우저에 전송했습니다." };
      } else {
        return reply.status(400).send({ 
          success: false, 
          message: "로그인 버튼을 찾지 못했거나 활성화된 세션이 없습니다. 페이지를 확인해 주세요." 
        });
      }
    } catch (error) {
      reply.status(500).send({ success: false, message: String(error) });
    }
  });
}
