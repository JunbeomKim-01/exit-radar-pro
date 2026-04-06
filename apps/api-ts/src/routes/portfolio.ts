import { FastifyInstance } from "fastify";
import path from "path";
import { pathToFileURL } from "url";

export async function portfolioRoutes(app: FastifyInstance) {
  app.get("/sync", async (request, reply) => {
    try {
      console.log(`[Portfolio Route] Current process.env.SESSION_DIR: ${process.env.SESSION_DIR}`);
      const scraperPath = path.resolve(__dirname, "../../../scraper-ts/src/portfolio-scraper.ts");
      const scraperUrl = pathToFileURL(scraperPath).href;
      
      let fetchTossPortfolio;
      try {
         const scraperModule = await import(scraperUrl);
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
